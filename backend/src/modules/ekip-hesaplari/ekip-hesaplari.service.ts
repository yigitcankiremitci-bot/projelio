import { randomBytes } from "crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { DepartmentMemberRole, EkipHesabi, EkipHesabiGirdisi, EkipHesabiSecenekleri, Locale } from "@projelio/shared";
import { kullaniciAdiOner } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { hashPassword } from "../../common/password.util";
import { istekDili } from "../../common/i18n";
import { isProduction } from "../../common/config/env";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { UsersService, normalizeEmail, normalizeUsername } from "../users/users.service";
import { EmailService } from "../auth/email.service";
import { GirisBaglantisiService } from "../auth/giris-baglantisi.service";
import { atanabilirDepartmanlar, girdiyiDogrula, tekilModuller } from "./ekip-hesabi-kurallari";
import { ekipHesabiEpostasi } from "./ekip-hesabi-eposta";

/** Modülün kendi anahtarı — seçeneklerde listelenmez (bkz. secenekler). */
const MODUL_ANAHTARI = "ekip_hesaplari";

/**
 * Ekip Hesapları (bkz. migration 130).
 *
 * Yönetici formu doldurur; hesap, kadro kaydı ve modül atamaları TEK işlemde
 * açılır ve çalışana içeri doğrudan sokan bir bağlantı gider. Mevcut davet
 * akışının (kişi kendisi kayıt olur, sonra daveti kabul eder) yerine değil
 * YANINA geldi: hesabı zaten olan biri hâlâ kadro davetiyle eklenir.
 *
 * Kadro ve modül kayıtları mevcut tablolara (department_members,
 * module_members) yazılıyor — ikinci bir yetki modeli yok. Böylece açılan
 * hesap, davetle gelmiş bir çalışandan hiçbir şekilde ayrışmaz; yönetici
 * sonradan departmanın Ekip sekmesinden rolünü değiştirebilir ya da çıkarabilir.
 */
@Injectable()
export class EkipHesaplariService {
  private readonly logger = new Logger(EkipHesaplariService.name);

  constructor(
    private supabase: SupabaseService,
    private usersService: UsersService,
    private emailService: EmailService,
    private girisBaglantisi: GirisBaglantisiService
  ) {}

  // ------------------------------------------------------------- Yetki + seçenekler

  /**
   * Formun departman/modül seçenekleri. Aynı zamanda YETKİ KAPISI: hiçbir
   * departmana hesap açamayan kişi burada 403 alır; oluşturma ve liste de
   * buradan geçiyor ki kural tek yerde dursun.
   */
  async secenekler(organizationId: string, userId: string): Promise<EkipHesabiSecenekleri> {
    const { data: org, error: orgError } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", organizationId)
      .maybeSingle();
    if (orgError) throw orgError;
    if (!org) throw new NotFoundException("Organizasyon bulunamadı");
    const sahipMi = org.owner_id === userId;

    const { data: deptRows, error: deptError } = await this.supabase.client
      .from("departments")
      .select("id, name, catalog_key, sort_order")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true });
    if (deptError) throw deptError;
    const departmanlar = deptRows ?? [];

    let yonettigi: string[] = [];
    if (!sahipMi && departmanlar.length) {
      const { data: yonetici } = await this.supabase.client
        .from("department_members")
        .select("department_id")
        .eq("user_id", userId)
        .eq("role", "manager")
        .eq("status", "approved")
        .in(
          "department_id",
          departmanlar.map((d: any) => d.id)
        );
      yonettigi = (yonetici ?? []).map((r: any) => r.department_id);
    }

    const izinli = new Set(
      atanabilirDepartmanlar(
        departmanlar.map((d: any) => d.id),
        { sahipMi, yonettigiDepartmanlar: yonettigi }
      )
    );
    if (izinli.size === 0 && !sahipMi) {
      throw new ForbiddenException("Ekip hesabı açmak için şirket sahibi ya da bir departmanın yöneticisi olmalısın.");
    }

    const moduller = await this.departmanModulleri(organizationId);
    return {
      sahipMi,
      departmanlar: departmanlar
        .filter((d: any) => izinli.has(d.id))
        .map((d: any) => ({
          id: d.id,
          name: d.name,
          moduller: d.catalog_key ? moduller.get(d.catalog_key) ?? [] : [],
        })),
    };
  }

  /**
   * Şirkette AÇIK olan modüller, katalog departman anahtarına göre.
   *
   * Bir modül birden fazla departmanda görünebilir (module_catalog_departments,
   * bkz. 046); birincil departmanı module_catalog.department_key'de. Özel
   * departmanların (catalog_key boş) kataloğa bağlı modülü yok.
   */
  private async departmanModulleri(organizationId: string): Promise<Map<string, { key: string; name: string }[]>> {
    const { data: acik, error } = await this.supabase.client
      .from("organization_modules")
      .select("module_key")
      .eq("organization_id", organizationId);
    if (error) throw error;
    const anahtarlar = (acik ?? []).map((r: any) => r.module_key).filter((k: string) => k !== MODUL_ANAHTARI);
    const sonuc = new Map<string, { key: string; name: string }[]>();
    if (!anahtarlar.length) return sonuc;

    const [{ data: katalog }, { data: ekDepartmanlar }] = await Promise.all([
      this.supabase.client
        .from("module_catalog")
        .select("key, name, department_key, sort_order")
        .in("key", anahtarlar)
        .order("sort_order", { ascending: true }),
      this.supabase.client.from("module_catalog_departments").select("module_key, department_key").in("module_key", anahtarlar),
    ]);

    const ekle = (departmanAnahtari: string | null, modul: { key: string; name: string }) => {
      if (!departmanAnahtari) return;
      const liste = sonuc.get(departmanAnahtari) ?? [];
      if (!liste.some((m) => m.key === modul.key)) liste.push(modul);
      sonuc.set(departmanAnahtari, liste);
    };
    const adlar = new Map<string, string>();
    for (const m of katalog ?? []) {
      adlar.set(m.key, m.name);
      ekle(m.department_key, { key: m.key, name: m.name });
    }
    for (const r of ekDepartmanlar ?? []) {
      const ad = adlar.get(r.module_key);
      if (ad) ekle(r.department_key, { key: r.module_key, name: ad });
    }
    return sonuc;
  }

  // ------------------------------------------------------------- Liste

  async liste(organizationId: string, userId: string): Promise<EkipHesabi[]> {
    const secenekler = await this.secenekler(organizationId, userId);

    let sorgu = this.supabase.client
      .from("ekip_hesaplari")
      .select(
        "id, user_id, created_at, davet_gonderildi_at, ilk_giris_at, " +
          "kisi:users!ekip_hesaplari_user_id_fkey(full_name, username, email, title), " +
          "acan:users!ekip_hesaplari_created_by_fkey(full_name)"
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    // Departman yöneticisi yalnızca kendi açtıklarını görür: şirketin tüm
    // hesap listesi (kim ne zaman eklendi) sahibin bilgisi.
    if (!secenekler.sahipMi) sorgu = sorgu.eq("created_by", userId);
    const { data, error } = await sorgu;
    if (error) throw error;
    const satirlar = (data ?? []) as any[];
    if (!satirlar.length) return [];

    const { data: tumDepartmanlar } = await this.supabase.client
      .from("departments")
      .select("id, name")
      .eq("organization_id", organizationId);
    const departmanAdi = new Map((tumDepartmanlar ?? []).map((d: any) => [d.id, d.name as string]));

    const { data: kadro } = await this.supabase.client
      .from("department_members")
      .select("user_id, department_id, role")
      .in(
        "user_id",
        satirlar.map((s) => s.user_id)
      )
      .in("department_id", [...departmanAdi.keys()])
      .in("status", ["approved", "leave_pending"]);
    const kadroByUser = new Map<string, EkipHesabi["departmanlar"]>();
    for (const k of kadro ?? []) {
      const liste = kadroByUser.get(k.user_id) ?? [];
      liste.push({ id: k.department_id, name: departmanAdi.get(k.department_id) ?? "", role: k.role as DepartmentMemberRole });
      kadroByUser.set(k.user_id, liste);
    }

    return satirlar.map((s) => ({
      id: s.id,
      userId: s.user_id,
      fullName: s.kisi?.full_name ?? "",
      username: s.kisi?.username ?? "",
      email: s.kisi?.email ?? "",
      title: s.kisi?.title ?? undefined,
      departmanlar: kadroByUser.get(s.user_id) ?? [],
      createdByName: s.acan?.full_name ?? undefined,
      createdAt: s.created_at,
      davetGonderildiAt: s.davet_gonderildi_at ?? undefined,
      ilkGirisAt: s.ilk_giris_at ?? undefined,
    }));
  }

  /** Form yazarken "bu kullanıcı adı boş mu" — kullanıcı adı zaten herkese görünür bir tanımlayıcı. */
  async kullaniciAdiUygunMu(organizationId: string, userId: string, username: string): Promise<{ uygun: boolean }> {
    await this.secenekler(organizationId, userId);
    if (typeof username !== "string" || !username.trim()) return { uygun: false };
    return { uygun: !(await this.usersService.isUsernameTaken(username)) };
  }

  // ------------------------------------------------------------- Oluşturma

  async olustur(
    organizationId: string,
    girdi: EkipHesabiGirdisi,
    userId: string
  ): Promise<{ hesap: EkipHesabi; epostaGonderildi: boolean }> {
    const secenekler = await this.secenekler(organizationId, userId);
    const hata = girdiyiDogrula(girdi, secenekler);
    if (hata) throw new BadRequestException(hata);

    const email = normalizeEmail(girdi.email);
    const username = normalizeUsername(girdi.username);

    // Yönetici oturum açmış, şirketin sahibi/yöneticisi olan biri: bu adresin
    // kayıtlı olduğunu söylemek kayıt ekranındaki gibi bir sızıntı değil — zaten
    // kadro daveti de aynı bilgiyi veriyor. Söylemezsek neden hesap
    // açılamadığını anlayamaz.
    if (await this.usersService.findByEmail(email)) {
      throw new ConflictException(
        "Bu e-posta adresiyle zaten bir Projelio hesabı var. Kişiyi departmanın Ekip sekmesinden kadroya davet edebilirsin."
      );
    }
    if (await this.usersService.isUsernameTaken(username)) {
      throw new ConflictException("Bu kullanıcı adı zaten alınmış, başka bir tane dene.");
    }

    const dil: Locale = girdi.locale === "en" ? "en" : "tr";
    const sifreDegistirmeli = girdi.sifreDegistirmeli !== false;
    const title = girdi.title?.trim() || null;

    const yeni = await this.usersService.create({
      fullName: girdi.fullName.trim(),
      email,
      passwordHash: await hashPassword(girdi.password),
      username,
      locale: dil,
    });

    // Buradan sonra bir adım düşerse hesap YARIM kalmamalı: kadrosuz, modülsüz
    // ama giriş yapılabilen bir hesap, yöneticinin listesinde de görünmeyeceği
    // için kimsenin fark etmediği bir hayalet olurdu. Kullanıcı silinince
    // kadro/modül/bağlantı satırları da cascade ile gider.
    try {
      const { error: profilHatasi } = await this.supabase.client
        .from("users")
        .update({
          // Çalışan hesabı: kurulum sihirbazı (hesap tipi, şirket kurma) onun
          // için anlamsız — şirketi zaten var.
          account_type: "employee",
          onboarding_completed_at: new Date().toISOString(),
          title,
          phone: girdi.phone?.trim() || null,
          sifre_degistirmeli: sifreDegistirmeli,
        })
        .eq("id", yeni.id);
      if (profilHatasi) throw profilHatasi;

      const { error: kadroHatasi } = await this.supabase.client.from("department_members").insert(
        girdi.departmanlar.map((d) => ({
          department_id: d.departmentId,
          user_id: yeni.id,
          role: d.role,
          title,
          // Davet değil: hesabı açan yönetici kişiyi zaten kadroya aldı,
          // onaylayacak bir şey yok.
          status: "approved",
          invited_by: userId,
        }))
      );
      if (kadroHatasi) throw kadroHatasi;

      const moduller = tekilModuller(girdi.moduller);
      if (moduller.length) {
        const { error: modulHatasi } = await this.supabase.client.from("module_members").insert(
          moduller.map((m) => ({
            organization_id: organizationId,
            department_id: m.departmentId,
            module_key: m.moduleKey,
            user_id: yeni.id,
            role: "employee",
            status: "approved",
            assigned_by: userId,
          }))
        );
        if (modulHatasi) throw modulHatasi;
      }

      const { error: kayitHatasi } = await this.supabase.client.from("ekip_hesaplari").insert({
        organization_id: organizationId,
        user_id: yeni.id,
        created_by: userId,
        karsilama_notu: girdi.karsilamaNotu?.trim() || null,
      });
      if (kayitHatasi) throw kayitHatasi;
    } catch (err) {
      this.logger.error(`Ekip hesabı yarım kaldı, geri alınıyor (${yeni.id}): ${(err as any)?.message ?? err}`);
      await this.supabase.client.from("users").delete().eq("id", yeni.id);
      throw err;
    }

    const epostaGonderildi = await this.baglantiGonder(organizationId, yeni.id, userId, {
      not: girdi.karsilamaNotu,
      sifreDegistirmeli,
      dil,
    });

    const hesap = (await this.liste(organizationId, userId)).find((h) => h.userId === yeni.id);
    if (!hesap) throw new NotFoundException("Hesap açıldı ama listede bulunamadı");
    return { hesap, epostaGonderildi };
  }

  /**
   * Lio'nun hesap açması (bkz. ai-assistant.tools.ts > create_team_account).
   *
   * ŞİFRE MODELE HİÇ UĞRAMAZ: burada rastgele üretilir, kimseye gösterilmez
   * ve kişi ilk girişte kendi şifresini belirlemek ZORUNDADIR. Şifreyi Lio'ya
   * yazdırmak onu sohbet geçmişine, sağlayıcı loglarına ve özetlenen bağlama
   * bırakmak olurdu (Hesaplar modülündeki ilkeyle aynı). Kişi e-postadaki
   * bağlantıyla girdiği için yöneticinin şifreyi bilmesine gerek yok.
   *
   * Kullanıcı adı verilmezse addan önerilir; alınmışsa sonuna sayı eklenir —
   * sohbette "şu ad alınmış, başka öner" turu Lio Bakiyesi harcatırdı.
   */
  async lioIleOlustur(
    organizationId: string,
    girdi: Omit<EkipHesabiGirdisi, "password" | "sifreDegistirmeli" | "username"> & { username?: string },
    userId: string
  ): Promise<{ hesap: EkipHesabi; epostaGonderildi: boolean }> {
    let username = girdi.username?.trim();
    if (!username) {
      const temel = kullaniciAdiOner(girdi.fullName ?? "") || "kullanici";
      username = temel;
      for (let i = 2; i <= 20 && (await this.usersService.isUsernameTaken(username)); i++) {
        username = `${temel.slice(0, 27)}${i}`;
      }
    }
    return this.olustur(
      organizationId,
      {
        ...girdi,
        username,
        departmanlar: girdi.departmanlar ?? [],
        moduller: girdi.moduller ?? [],
        password: randomBytes(24).toString("base64url"),
        sifreDegistirmeli: true,
      },
      userId
    );
  }

  /**
   * Giriş bağlantısını YENİDEN gönderir (e-posta ulaşmadı, süresi doldu).
   *
   * Yalnızca kişi henüz hiç girmemişken: sonrasında hesap kişinin kendisinin
   * ve yöneticinin onun adına şifresiz giriş bağlantısı üretebilmesi, hesaba
   * sınırsız bir arka kapı demek olurdu. Kişi şifresini unutursa giriş
   * ekranındaki "Şifremi unuttum" var.
   */
  async baglantiyiYenidenGonder(id: string, userId: string): Promise<{ epostaGonderildi: boolean }> {
    const { data: kayit, error } = await this.supabase.client
      .from("ekip_hesaplari")
      .select("organization_id, user_id, created_by, ilk_giris_at, karsilama_notu")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!kayit) throw new NotFoundException("Hesap kaydı bulunamadı");

    const secenekler = await this.secenekler(kayit.organization_id, userId);
    if (!secenekler.sahipMi && kayit.created_by !== userId) {
      throw new ForbiddenException("Bu hesabı sen açmadın; bağlantıyı şirket sahibi ya da hesabı açan kişi gönderebilir.");
    }
    if (kayit.ilk_giris_at) {
      throw new BadRequestException(
        "Bu kişi hesabına zaten girdi. Şifresini unuttuysa giriş ekranındaki “Şifremi unuttum”u kullanabilir."
      );
    }

    const kisi = await this.usersService.findById(kayit.user_id);
    if (!kisi || kisi.deletedAt) throw new NotFoundException("Hesap bulunamadı");
    const epostaGonderildi = await this.baglantiGonder(kayit.organization_id, kayit.user_id, userId, {
      not: kayit.karsilama_notu,
      sifreDegistirmeli: kisi.sifreDegistirmeli === true,
      dil: istekDili(kisi.locale),
    });
    return { epostaGonderildi };
  }

  /**
   * Bağlantıyı üretip e-postayı gönderir. HATA FIRLATMAZ: hesap açılmışsa
   * e-postanın gitmemesi onu geri almaz — yönetici listeden yeniden gönderir.
   */
  private async baglantiGonder(
    organizationId: string,
    kisiId: string,
    yoneticiId: string,
    secim: { not?: string | null; sifreDegistirmeli: boolean; dil: Locale }
  ): Promise<boolean> {
    try {
      const [kisi, yonetici, { data: org }, { data: kadro }] = await Promise.all([
        this.usersService.findById(kisiId),
        this.usersService.findById(yoneticiId),
        this.supabase.client.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
        this.supabase.client
          .from("department_members")
          .select("departments!inner(name, organization_id)")
          .eq("user_id", kisiId)
          .eq("status", "approved")
          .eq("departments.organization_id", organizationId),
      ]);
      if (!kisi) return false;

      const girisUrl = await this.girisBaglantisi.olustur(kisiId, yoneticiId);
      const mail = ekipHesabiEpostasi({
        alici: { ad: kisi.fullName, kullaniciAdi: kisi.username, eposta: kisi.email },
        yoneticiAdi: yonetici?.fullName ?? "Yöneticin",
        sirketAdi: org?.name ?? "Projelio",
        departmanlar: (kadro ?? []).map((k: any) => k.departments?.name).filter(Boolean),
        girisUrl,
        sifreDegistirmeli: secim.sifreDegistirmeli,
        not: secim.not,
        dil: secim.dil,
      });
      const gitti = await this.emailService.sendPrepared(kisi.email, mail);
      // Yerelde e-posta sağlayıcısı yok: akışı denemenin tek yolu bağlantıyı
      // logdan almak. Üretimde YAZILMAZ — bu bağlantı hesabı açan anahtar
      // (gerekçe: EmailService.logUndeliverable).
      if (!gitti && !isProduction()) this.logger.warn(`Giriş bağlantısı (yalnızca geliştirme): ${girisUrl}`);
      if (gitti) {
        await this.supabase.client
          .from("ekip_hesaplari")
          .update({ davet_gonderildi_at: new Date().toISOString() })
          .eq("organization_id", organizationId)
          .eq("user_id", kisiId);
      }
      return gitti;
    } catch (err) {
      this.logger.warn(`Ekip hesabı e-postası gönderilemedi (${kisiId}): ${(err as any)?.message ?? err}`);
      return false;
    }
  }
}
