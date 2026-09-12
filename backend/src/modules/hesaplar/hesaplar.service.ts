import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ModuleAccess,
  RecurrenceInterval,
  ServiceAccount,
  ServiceAccountCategory,
  ServiceAccountGrant,
  ServiceAccountList,
  ServiceAccountLoginMethod,
} from "@projelio/shared";
import {
  RECURRENCE_INTERVALS,
  SERVICE_ACCOUNT_CATEGORIES,
  SERVICE_ACCOUNT_LOGIN_METHODS,
  safeExternalUrl,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { optionalOneOf, paraBirimiDogrula, requireAmount, requireOneOf } from "../../common/validation/input";
import { ModuleMembersService } from "../module-members/module-members.service";
import { ButceErisimService } from "../budget/butce-erisim.service";
import { hesapErisimKarari, paylasimGecerliMi } from "./hesap-erisim";
import { abonelikKarari } from "./hesap-abonelik";
import { hesapKimlikCrypto } from "./hesap-kripto";

/**
 * Hesaplar modülü — üye olunan hesapların listesi.
 *
 * SIR BU SERVİSTEN ÇIKMAZ: giriş bilgilerinin şifreli sütunları
 * HesapKimlikService'te okunuyor, burada yalnızca "kaç giriş kaydı var"
 * sayılıyor. Sınır 076'da sosyal medya için kurulan sınırın aynısı ve aynı
 * gerekçeyle: hesabı okuyan kod yolu çok, sır okuyan kod yolu tek olmalı.
 *
 * PARA DA BU SERVİSTE TUTULMAZ: ücretli abonelik, defterdeki (104) düzenli
 * ödeme satırına bağlanıyor. Modülün kendi para tablosu olsaydı aynı 40
 * doları iki yerde sayan ikinci bir defter doğardı — kaldırılan
 * fm_gelir_gider modülünün hatası.
 *
 * Bkz. database/migrations/106_hesaplar_modulu.sql
 */

export const HESAPLAR_MODULE_KEY = "hesaplar";

export type HesapKapsami = { organizationId: string; departmentId?: string } | { jobId: string };

export interface HesapGirdisi {
  name?: string;
  category?: string;
  url?: string;
  loginMethod?: string;
  plan?: string;
  ownerUserId?: string | null;
  note?: string;
  isPaid?: boolean;
  amount?: number | null;
  currency?: string;
  billingInterval?: string | null;
  nextDueDate?: string | null;
}

/**
 * Hesap satırının okunan alanları — şifreli sütunlar BU LİSTEDE YOK.
 *
 * Düzenli ödemenin vadesi de okunuyor: hesap satırındaki tarih kullanıcının
 * YAZDIĞI tarih, defterdeki tarih ise cron ilerledikçe güncellenen GERÇEK
 * vade. Ekranda gösterilmesi gereken ikincisi (bkz. map).
 */
const HESAP_SECIM =
  "id, organization_id, job_id, department_id, name, category, url, login_method, plan, owner_user_id, note, " +
  "is_paid, amount, currency, billing_interval, next_due_date, recurring_payment_id, created_by, created_at, updated_at, " +
  "recurring_payments(next_due_date, active)";

/**
 * Defterdeki düzenli ödemenin canlı vadesi.
 *
 * Gömülü kayıt PostgREST'te tek nesne olarak dönüyor (tekil yabancı anahtar),
 * ama ilişki bir gün çok-bire dönerse DİZİ gelir ve `?.next_due_date` sessizce
 * undefined olurdu — yani ekranda eskimiş tarih görünürdü. İki biçim de
 * okunuyor.
 */
function defterVadesi(row: any): string | null {
  const gomulu = row.recurring_payments;
  if (!gomulu) return null;
  return (Array.isArray(gomulu) ? gomulu[0]?.next_due_date : gomulu.next_due_date) ?? null;
}

function metin(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class HesaplarService {
  private supabase: SupabaseService;
  private moduleMembers: ModuleMembersService;
  private butceErisim: ButceErisimService;

  constructor(
    supabase: SupabaseService,
    moduleMembers: ModuleMembersService,
    butceErisim: ButceErisimService
  ) {
    this.supabase = supabase;
    this.moduleMembers = moduleMembers;
    this.butceErisim = butceErisim;
  }

  // ============================================================ Kapsam ve yetki

  async erisim(kapsam: HesapKapsami, userId?: string): Promise<ModuleAccess> {
    if ("jobId" in kapsam) {
      return this.moduleMembers.resolveJobAccess(kapsam.jobId, HESAPLAR_MODULE_KEY, userId);
    }
    return this.moduleMembers.resolveOrganizationAccess(
      kapsam.organizationId,
      HESAPLAR_MODULE_KEY,
      userId,
      kapsam.departmentId
    );
  }

  /** Satırdan kapsamı çıkarır — yetki her zaman kaydın kendisinden çözülür. */
  kapsamiCoz(row: { organization_id?: string | null; job_id?: string | null; department_id?: string | null }): HesapKapsami {
    if (row.job_id) return { jobId: row.job_id };
    return { organizationId: row.organization_id as string, departmentId: row.department_id ?? undefined };
  }

  /**
   * Abonelik giderinin gideceği kasa.
   *
   * Kullanıcıya SORULMUYOR: modül bir departmanın altında ya da bir işin
   * içinde açılıyor ve o kapsam, paranın sahibi olan kademenin kendisi. Seçim
   * sunmak, aynı aboneliği yanlış kasaya yazma imkânı açmak olurdu — üstelik
   * toplamlar kademe kademe yukarı çıktığı için şirket rakamı ikisinde de aynı
   * görünür ve hata fark edilmezdi.
   *
   * Departmansız (organizasyon geneli) açılmış bir modülde kasa yok: gider
   * yazılamaz ve kullanıcıya bunun sebebi söylenir.
   */
  private kasa(kapsam: HesapKapsami): { scopeType: "department" | "job"; scopeId: string } | null {
    if ("jobId" in kapsam) return { scopeType: "job", scopeId: kapsam.jobId };
    if (kapsam.departmentId) return { scopeType: "department", scopeId: kapsam.departmentId };
    return null;
  }

  // ============================================================ Liste

  async liste(kapsam: HesapKapsami, userId: string): Promise<ServiceAccountList> {
    const access = await this.erisim(kapsam, userId);
    if (!access.canRead) throw new ForbiddenException("Bu modülü görme yetkiniz yok");

    let sorgu = this.supabase.client.from("service_accounts").select(HESAP_SECIM);
    if ("jobId" in kapsam) sorgu = sorgu.eq("job_id", kapsam.jobId);
    else {
      sorgu = sorgu.eq("organization_id", kapsam.organizationId);
      // Departman süzgeci: modül departman altında açıldığında yalnızca o
      // departmanın hesapları görünür. Departmansız açılışta (kurulum
      // sihirbazından gelen eski kayıtlar) şirketin tamamı görünür.
      if (kapsam.departmentId) sorgu = sorgu.eq("department_id", kapsam.departmentId);
    }

    const { data, error } = await sorgu.order("name", { ascending: true }).limit(LISTE_TAVANI);
    if (error) throw error;
    const satirlar = data ?? [];

    const [sayimlar, paylasimlar, isimler, kasaBilgisi] = await Promise.all([
      this.kimlikSayimlari(satirlar.map((r: any) => r.id)),
      this.paylasimlariTopla(kapsam, userId, access.canManageTeam),
      this.kullaniciAdlari(satirlar.map((r: any) => r.owner_user_id)),
      this.kasaBilgisi(kapsam, userId),
    ]);

    const accounts = satirlar.map((row: any) => {
      const karar = hesapErisimKarari({
        canReadModule: access.canRead,
        isAdmin: access.canManageTeam,
        isCreator: row.created_by === userId,
        hasAccountGrant: paylasimlar.kendiHesaplari.has(row.id),
        hasScopeGrant: paylasimlar.kendiKapsami,
      });
      return this.map(row, {
        ownerName: row.owner_user_id ? isimler.get(row.owner_user_id) : undefined,
        credentialCount: sayimlar.get(row.id) ?? 0,
        canReveal: karar.canReveal,
        revealReason: karar.reason,
        grantCount: access.canManageTeam ? (paylasimlar.sayimlar.get(row.id) ?? 0) : undefined,
        budgetScopeName: row.recurring_payment_id ? kasaBilgisi.ad : undefined,
        budgetScopeType: this.kasa(kapsam)?.scopeType,
      });
    });

    return {
      accounts,
      canManage: access.canManageTeam,
      canCreate: access.canWrite,
      scopeGrants: access.canManageTeam ? paylasimlar.kapsamPaylasimlari : [],
      budgetScopeName: kasaBilgisi.ad,
      canManageBudget: kasaBilgisi.canManage,
      cryptoReady: hesapKimlikCrypto.isConfigured(),
    };
  }

  /**
   * Hesap başına giriş kaydı sayısı.
   *
   * SAYI SIR DEĞİL: "bu hesabın şifresi girilmiş" bilgisi, şifrenin kendisine
   * dair hiçbir şey söylemez ve listenin en çok işe yarayan sütunu — eksik
   * kalmış hesaplar ancak böyle görülüyor.
   */
  private async kimlikSayimlari(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const { data } = await this.supabase.client
      .from("service_account_credentials")
      .select("account_id")
      .in("account_id", ids);
    const sayim = new Map<string, number>();
    for (const row of data ?? []) sayim.set(row.account_id, (sayim.get(row.account_id) ?? 0) + 1);
    return sayim;
  }

  private async kullaniciAdlari(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const tekil = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
    if (tekil.length === 0) return new Map();
    const { data } = await this.supabase.client.from("users").select("id, full_name, email").in("id", tekil);
    return new Map((data ?? []).map((u: any) => [u.id, (u.full_name || u.email) as string]));
  }

  private async kasaBilgisi(kapsam: HesapKapsami, userId: string): Promise<{ ad?: string; canManage: boolean }> {
    const kasa = this.kasa(kapsam);
    if (!kasa) return { canManage: false };
    const [ad, yetki] = await Promise.all([
      this.butceErisim.kademeAdi(kasa.scopeType, kasa.scopeId).catch(() => undefined),
      this.butceErisim.yetki(kasa.scopeType, kasa.scopeId, userId).catch(() => null),
    ]);
    return { ad, canManage: Boolean(yetki?.canManage) };
  }

  // ============================================================ Yazma

  async ekle(kapsam: HesapKapsami, girdi: HesapGirdisi, userId: string): Promise<ServiceAccount> {
    const access = await this.erisim(kapsam, userId);
    if (!access.canWrite) throw new ForbiddenException("Bu modüle hesap ekleme yetkiniz yok");

    const ad = metin(girdi.name);
    if (!ad) throw new BadRequestException("Hesap adı gerekli");

    const { data, error } = await this.supabase.client
      .from("service_accounts")
      .insert({
        organization_id: "jobId" in kapsam ? null : kapsam.organizationId,
        job_id: "jobId" in kapsam ? kapsam.jobId : null,
        department_id: "jobId" in kapsam ? null : (kapsam.departmentId ?? null),
        name: ad,
        ...this.abonelikAlanlari(girdi),
        created_by: userId,
        updated_by: userId,
      })
      .select(HESAP_SECIM)
      .single();
    if (error) throw error;

    const hesap = await this.aboneligiEsitle(data, kapsam, userId, true);
    // Ekleyen kişi kaydın sahibidir: yeniden sorgulamadan tam yetkiyle dönüyoruz.
    return this.map(hesap, {
      credentialCount: 0,
      canReveal: true,
      revealReason: access.canManageTeam ? "admin" : "creator",
      grantCount: access.canManageTeam ? 0 : undefined,
    });
  }

  async guncelle(id: string, girdi: HesapGirdisi, userId: string): Promise<ServiceAccount> {
    const { row, access, karar } = await this.satirVeYetki(id, userId);
    if (!karar.canEdit) {
      throw new ForbiddenException("Bu hesabı yalnızca yöneticiler ve kaydı giren kişi düzenleyebilir");
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: userId };
    if (girdi.name !== undefined) {
      const ad = metin(girdi.name);
      if (!ad) throw new BadRequestException("Hesap adı gerekli");
      patch.name = ad;
    }
    Object.assign(patch, this.abonelikAlanlari(girdi, row));

    const { data, error } = await this.supabase.client
      .from("service_accounts")
      .update(patch)
      .eq("id", id)
      .select(HESAP_SECIM)
      .single();
    if (error) throw error;

    const kapsam = this.kapsamiCoz(row);
    // Vade yalnızca kullanıcı gerçekten değiştirdiyse deftere yazılıyor.
    const vadeDegisti =
      girdi.nextDueDate !== undefined && (girdi.nextDueDate?.slice(0, 10) ?? null) !== (row.next_due_date ?? null);
    const guncel = await this.aboneligiEsitle(data, kapsam, userId, vadeDegisti);
    const isimler = await this.kullaniciAdlari([guncel.owner_user_id]);
    const kasaAdi = guncel.recurring_payment_id ? (await this.kasaBilgisi(kapsam, userId)).ad : undefined;
    return this.map(guncel, {
      ownerName: guncel.owner_user_id ? isimler.get(guncel.owner_user_id) : undefined,
      credentialCount: (await this.kimlikSayimlari([id])).get(id) ?? 0,
      canReveal: karar.canReveal,
      revealReason: karar.reason,
      // Paylaşım sayısı listede dönüyor; tek kaydın güncellenmesinde ayrıca
      // sorgulanmıyor — ekran zaten listeyi yeniliyor.
      grantCount: access.canManageTeam ? (await this.paylasimSayisi(id)) : undefined,
      budgetScopeName: kasaAdi,
      budgetScopeType: this.kasa(kapsam)?.scopeType,
    });
  }

  /**
   * Hesabı siler.
   *
   * ARŞİVLEME DEĞİL SİLME (076'daki gerekçe): kaydın değeri taşıdığı sırdır ve
   * "artık kullanılmayan" bir sırrın veritabanında durması yalnızca risktir.
   * Giriş bilgileri, paylaşımlar ve denetim izi cascade ile gider.
   *
   * Kasadaki düzenli ödeme ise PASİFLEŞTİRİLİR, silinmez: geçmiş aylarda
   * gerçekten ödenmiş tutarlar defterde duruyor ve o satıra bağlı.
   */
  async sil(id: string, userId: string): Promise<{ ok: true }> {
    const { row, karar } = await this.satirVeYetki(id, userId);
    if (!karar.canEdit) {
      throw new ForbiddenException("Bu hesabı yalnızca yöneticiler ve kaydı giren kişi silebilir");
    }

    if (row.recurring_payment_id) {
      await this.supabase.client
        .from("recurring_payments")
        .update({ active: false })
        .eq("id", row.recurring_payment_id);
    }

    const { error } = await this.supabase.client.from("service_accounts").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  }

  /** Doğrulanmış abonelik ve hesap alanları — ekle/güncelle ortak. */
  private abonelikAlanlari(girdi: HesapGirdisi, mevcut?: any): Record<string, unknown> {
    const alanlar: Record<string, unknown> = {};

    if (girdi.category !== undefined) {
      alanlar.category = requireOneOf(girdi.category || "diger", SERVICE_ACCOUNT_CATEGORIES, "Kategori");
    }
    if (girdi.loginMethod !== undefined) {
      alanlar.login_method = requireOneOf(
        girdi.loginMethod || "password",
        SERVICE_ACCOUNT_LOGIN_METHODS,
        "Giriş yöntemi"
      );
    }
    if (girdi.url !== undefined) {
      // Kullanıcı girdisi: `javascript:` yazılabilir ve düğme onu tıklanabilir
      // yapardı (bkz. safeExternalUrl). Geçersizse boş bırakılıyor, kayıt
      // reddedilmiyor — adres hesabın asıl bilgisi değil.
      alanlar.url = girdi.url ? safeExternalUrl(girdi.url) : null;
    }
    if (girdi.plan !== undefined) alanlar.plan = metin(girdi.plan);
    if (girdi.note !== undefined) alanlar.note = metin(girdi.note);
    if (girdi.ownerUserId !== undefined) alanlar.owner_user_id = girdi.ownerUserId || null;

    if (girdi.isPaid !== undefined) alanlar.is_paid = Boolean(girdi.isPaid);
    if (girdi.currency !== undefined) alanlar.currency = paraBirimiDogrula(girdi.currency);
    if (girdi.amount !== undefined) {
      alanlar.amount = girdi.amount === null || girdi.amount === undefined ? null : requireAmount(girdi.amount);
    }
    if (girdi.billingInterval !== undefined) {
      alanlar.billing_interval = girdi.billingInterval
        ? optionalOneOf(girdi.billingInterval, RECURRENCE_INTERVALS, "Ödeme aralığı")
        : null;
    }
    if (girdi.nextDueDate !== undefined) {
      alanlar.next_due_date = girdi.nextDueDate ? girdi.nextDueDate.slice(0, 10) : null;
    }

    // Ücretli işaretlenip tutarı/aralığı hiç girilmemişse veritabanı kısıtı
    // (service_accounts_paid_fields) zaten reddeder; buradaki kontrol hatayı
    // anlaşılır bir cümleye çeviriyor.
    const paid = alanlar.is_paid ?? mevcut?.is_paid ?? false;
    const amount = "amount" in alanlar ? alanlar.amount : mevcut?.amount;
    const interval = "billing_interval" in alanlar ? alanlar.billing_interval : mevcut?.billing_interval;
    if (paid && (amount === null || amount === undefined || !interval)) {
      throw new BadRequestException("Ücretli abonelik için tutar ve ödeme aralığı gerekli");
    }

    return alanlar;
  }

  /**
   * Aboneliği kasadaki düzenli gider satırıyla eşitler.
   *
   * KARAR SAF FONKSİYONDA (hesap-abonelik.ts): üç hâli var ve yanlışı pahalı.
   *
   * BÜTÇE YETKİSİ ŞART: modül yöneticisi olmak, departmanın defterine kayıt
   * girme hakkı vermez — o karar bütçenin kendi kuralında (butce-erisim.ts) ve
   * ikinci bir yetki kaynağı açmıyoruz. Yetkisi olmayan kullanıcı hesabı
   * ücretsiz olarak kaydedebilir; aboneliği işaretlemek için bütçeyi
   * yönetebilen birine ihtiyacı var.
   */
  private async aboneligiEsitle(
    row: any,
    kapsam: HesapKapsami,
    userId: string,
    vadeDegisti: boolean
  ): Promise<any> {
    const karar = this.abonelikKararini(row, vadeDegisti);
    if (karar.eylem === "yok") return row;

    if (karar.eylem === "pasiflestir") {
      // BAĞ KORUNUYOR, yalnızca satır pasifleşiyor. Bağı koparmak iki şeyi
      // birden bozardı: defterdeki geçmiş ödemelerin hangi hesaba ait olduğu
      // bilgisi kopardı ve kullanıcı aboneliği yeniden işaretlediğinde İKİNCİ
      // bir düzenli ödeme satırı açılırdı. Bu hâlde yeniden işaretlemek aynı
      // satırı canlandırıyor (bkz. abonelikKarari > "guncelle").
      const { error } = await this.supabase.client
        .from("recurring_payments")
        .update({ active: false })
        .eq("id", row.recurring_payment_id);
      if (error) throw error;
      return row;
    }

    const kasa = this.kasa(kapsam);
    if (!kasa) {
      throw new BadRequestException(
        "Abonelik gideri için bir kasa gerekiyor. Bu modül bir departman ya da iş altında açılmalı."
      );
    }
    const yetki = await this.butceErisim.yetki(kasa.scopeType, kasa.scopeId, userId);
    if (!yetki.canManage) {
      throw new ForbiddenException(
        "Aboneliği kasaya işlemek için bütçe yetkisi gerekiyor. Hesabı ücretsiz olarak kaydedebilir ya da bütçe yetkisi olan birinden yardım isteyebilirsiniz."
      );
    }

    if (karar.eylem === "guncelle") {
      const { error } = await this.supabase.client
        .from("recurring_payments")
        .update(karar.satir)
        .eq("id", row.recurring_payment_id);
      if (error) throw error;
      return row;
    }

    const { data: odeme, error } = await this.supabase.client
      .from("recurring_payments")
      .insert({
        [kasa.scopeType === "job" ? "job_id" : "department_id"]: kasa.scopeId,
        // Defter sahibi kaydı GİREN değil, paranın sahibi olan kademenin
        // sahibidir (bkz. migration 100 ve butce-kademe.service.ts).
        owner_id: await this.defterSahibi(kasa),
        reminder_days_before: 1,
        ...karar.satir,
      })
      .select("id")
      .single();
    if (error) throw error;

    const { data } = await this.supabase.client
      .from("service_accounts")
      .update({ recurring_payment_id: odeme.id })
      .eq("id", row.id)
      .select(HESAP_SECIM)
      .single();
    return data ?? row;
  }

  /**
   * Saf kararı çağırır ve hatasını 400'e çevirir.
   *
   * Buraya düşen bir hata normalde IMKÂNSIZ (alanlar hem abonelikAlanlari'nda
   * hem veritabanı kısıtında doğrulanıyor) — ama düşerse kullanıcı 500 değil
   * ne yapacağını söyleyen bir cümle görmeli.
   */
  private abonelikKararini(row: any, vadeDegisti: boolean) {
    try {
      return abonelikKarari(
        {
          isPaid: row.is_paid,
          amount: row.amount === null || row.amount === undefined ? null : Number(row.amount),
          currency: row.currency,
          billingInterval: row.billing_interval as RecurrenceInterval | null,
          nextDueDate: row.next_due_date,
          name: row.name,
          plan: row.plan,
          category: row.category,
          mevcutId: row.recurring_payment_id,
        },
        { vadeDegisti }
      );
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  private async defterSahibi(kasa: { scopeType: "department" | "job"; scopeId: string }): Promise<string | null> {
    if (kasa.scopeType === "job") {
      const { data } = await this.supabase.client.from("jobs").select("owner_id").eq("id", kasa.scopeId).maybeSingle();
      return data?.owner_id ?? null;
    }
    const { data: dept } = await this.supabase.client
      .from("departments")
      .select("organization_id")
      .eq("id", kasa.scopeId)
      .maybeSingle();
    if (!dept?.organization_id) return null;
    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", dept.organization_id)
      .maybeSingle();
    return org?.owner_id ?? null;
  }

  // ============================================================ Paylaşım

  /**
   * Bir kişiye hesap açar: tek hesap ya da kapsamın TAMAMI.
   *
   * Hedef kişi modülü OKUYABİLMELİ. Gerekçesi 076'daki ile aynı: paylaşım
   * listesi, ekip listesinden ayrı ikinci bir yetki kaynağı olmasın. Modülü
   * hiç göremeyen birine sır açmak, kendisinin de göremeyeceği bir izin
   * vermek olurdu — hesaplar ekranı ona hiç açılmıyor.
   */
  async paylas(
    kapsam: HesapKapsami,
    girdi: { userId?: string; accountId?: string | null; expiresAt?: string | null },
    isteyen: string
  ): Promise<ServiceAccountGrant> {
    const access = await this.erisim(kapsam, isteyen);
    if (!access.canManageTeam) {
      throw new ForbiddenException("Hesap paylaşımını yalnızca modül yöneticileri yapabilir");
    }
    if (!girdi.userId) throw new BadRequestException("Kişi seçin");

    const hedefErisim = await this.erisim(kapsam, girdi.userId);
    if (!hedefErisim.canRead) {
      throw new BadRequestException(
        "Bu kişi Hesaplar modülünü görmüyor. Önce modül ekibine ekleyin, sonra paylaşın."
      );
    }

    // Hesap kimliği verildiyse o hesabın gerçekten BU kapsamda olduğu
    // doğrulanıyor: kimlik istemciden geliyor ve başka bir şirketin hesabını
    // kendi ekibine paylaşmak mümkün olmamalı.
    if (girdi.accountId) {
      const { row } = await this.satir(girdi.accountId);
      // Alan alan karşılaştırılıyor: JSON.stringify ile bakmak, alan sırası ya
      // da `undefined`/eksik alan farkında sessizce "eşit değil" derdi.
      if (!this.kapsamaAitMi(row, kapsam)) {
        throw new BadRequestException("Hesap bu modüle ait değil");
      }
    }

    const hedef = girdi.accountId
      ? { account_id: girdi.accountId, organization_id: null, department_id: null, job_id: null }
      : {
          account_id: null,
          organization_id: "jobId" in kapsam ? null : kapsam.organizationId,
          department_id: "jobId" in kapsam ? null : (kapsam.departmentId ?? null),
          job_id: "jobId" in kapsam ? kapsam.jobId : null,
        };

    // Aynı kişiye ikinci satır açılmıyor: paylaşım geri alınıp yeniden
    // verildiğinde aynı satır TAZELENİYOR. upsert kullanılamıyor çünkü kapsam
    // izninin tekilliği bir İFADE indeksi (coalesce'lı, bkz. 106) ve PostgREST
    // onConflict'e ifade indeksi verilemiyor. Bu yüzden mevcut satır önce
    // aranıyor; tekil indeksler yine son savunma olarak yerinde duruyor.
    const alanlar = {
      ...hedef,
      user_id: girdi.userId,
      granted_by: isteyen,
      granted_at: new Date().toISOString(),
      expires_at: girdi.expiresAt || null,
      revoked_at: null,
      revoked_by: null,
    };

    const mevcut = girdi.accountId
      ? await this.hesapPaylasimSatiri(girdi.accountId, girdi.userId)
      : await this.kapsamPaylasimSatiri(kapsam, girdi.userId);

    const { data, error } = mevcut
      ? await this.supabase.client
          .from("service_account_grants")
          .update(alanlar)
          .eq("id", mevcut)
          .select("*")
          .single()
      : await this.supabase.client.from("service_account_grants").insert(alanlar).select("*").single();
    if (error) throw error;

    const isimler = await this.kullaniciAdlari([data.user_id, data.granted_by]);
    return this.paylasimiMap(data, isimler);
  }

  async paylasimlar(kapsam: HesapKapsami, accountId: string | undefined, isteyen: string): Promise<ServiceAccountGrant[]> {
    const access = await this.erisim(kapsam, isteyen);
    if (!access.canManageTeam) {
      throw new ForbiddenException("Paylaşımları yalnızca modül yöneticileri görebilir");
    }

    let sorgu = this.supabase.client.from("service_account_grants").select("*, service_accounts(name)");
    if (accountId) sorgu = sorgu.eq("account_id", accountId);
    else sorgu = this.kapsamSuzgeci(sorgu.is("account_id", null), kapsam);

    const { data, error } = await sorgu.order("granted_at", { ascending: true }).limit(LISTE_TAVANI);
    if (error) throw error;

    const satirlar = data ?? [];
    const isimler = await this.kullaniciAdlari(satirlar.flatMap((g: any) => [g.user_id, g.granted_by]));
    return satirlar.map((g: any) => this.paylasimiMap(g, isimler));
  }

  async paylasimiKaldir(grantId: string, isteyen: string): Promise<{ ok: true }> {
    const { data: grant } = await this.supabase.client
      .from("service_account_grants")
      .select("id, account_id, organization_id, department_id, job_id")
      .eq("id", grantId)
      .maybeSingle();
    if (!grant) throw new NotFoundException("Paylaşım bulunamadı");

    const kapsam = grant.account_id
      ? this.kapsamiCoz((await this.satir(grant.account_id)).row)
      : this.kapsamiCoz(grant);
    const access = await this.erisim(kapsam, isteyen);
    if (!access.canManageTeam) {
      throw new ForbiddenException("Paylaşımı yalnızca modül yöneticileri kaldırabilir");
    }

    // Satır SİLİNMEZ: kimin ne zaman erişebildiği geçmişi kalsın.
    const { error } = await this.supabase.client
      .from("service_account_grants")
      .update({ revoked_at: new Date().toISOString(), revoked_by: isteyen })
      .eq("id", grantId);
    if (error) throw error;
    return { ok: true };
  }

  private kapsamSuzgeci(sorgu: any, kapsam: HesapKapsami): any {
    if ("jobId" in kapsam) return sorgu.eq("job_id", kapsam.jobId);
    let q = sorgu.eq("organization_id", kapsam.organizationId);
    q = kapsam.departmentId ? q.eq("department_id", kapsam.departmentId) : q.is("department_id", null);
    return q;
  }

  /**
   * Kullanıcının bu kapsamdaki paylaşımları + yöneticiye sayımlar.
   *
   * TEK SORGUDA: satır başına "bu kişinin izni var mı" sormak, 40 hesaplı bir
   * listede 40 sorgu demekti (sosyal medyada bu yüzden izin sorgusu
   * gerektiğinde yapılıyor, bkz. SocialCredentialsService.list).
   */
  private async paylasimlariTopla(
    kapsam: HesapKapsami,
    userId: string,
    yonetici: boolean
  ): Promise<{
    kendiHesaplari: Set<string>;
    kendiKapsami: boolean;
    sayimlar: Map<string, number>;
    kapsamPaylasimlari: ServiceAccountGrant[];
  }> {
    const kendiHesaplari = new Set<string>();
    let kendiKapsami = false;
    const sayimlar = new Map<string, number>();
    const kapsamPaylasimlari: ServiceAccountGrant[] = [];

    // Yönetici zaten her şeyi görüyor; kendi izinlerini sorgulamak sonucu
    // değiştirmez. Yönetici DEĞİLSE de yalnızca kendi satırları okunur.
    const { data } = yonetici
      ? await this.kapsamSuzgeciTum(kapsam)
      : await this.supabase.client
          .from("service_account_grants")
          .select("*")
          .eq("user_id", userId)
          .is("revoked_at", null);

    const isimIhtiyaci: string[] = [];
    for (const g of data ?? []) {
      if (!paylasimGecerliMi(g)) continue;
      if (g.account_id) {
        if (g.user_id === userId) kendiHesaplari.add(g.account_id);
        sayimlar.set(g.account_id, (sayimlar.get(g.account_id) ?? 0) + 1);
        continue;
      }
      // Kapsam izni: yalnızca BU kapsama ait olanlar sayılır — kullanıcının
      // başka bir şirketteki izni buraya karışmasın.
      if (!this.kapsamaAitMi(g, kapsam)) continue;
      if (g.user_id === userId) kendiKapsami = true;
      kapsamPaylasimlari.push(g as any);
      isimIhtiyaci.push(g.user_id, g.granted_by);
    }

    const isimler = await this.kullaniciAdlari(isimIhtiyaci);
    return {
      kendiHesaplari,
      kendiKapsami,
      sayimlar,
      kapsamPaylasimlari: kapsamPaylasimlari.map((g: any) => this.paylasimiMap(g, isimler)),
    };
  }

  /**
   * Yöneticinin gördüğü tüm paylaşımlar: kapsam izinleri + bu kapsamdaki hesap izinleri.
   *
   * İKİ SORGU, tek `or` değil: hesap izninde kapsam sütunları BOŞ (kapsam,
   * hesabın kendisinden geliyor) ve tek sorguda süzmek için gömülü tabloya
   * `!inner` ile filtre uygulamak gerekiyordu — o filtre kapsam izinlerini de
   * eler, yani "tümü" paylaşımları listeden düşerdi.
   */
  private async kapsamSuzgeciTum(kapsam: HesapKapsami): Promise<{ data: any[] }> {
    const alan = "jobId" in kapsam ? "job_id" : "organization_id";
    const deger = "jobId" in kapsam ? kapsam.jobId : kapsam.organizationId;

    const [hesapIzinleri, kapsamIzinleri] = await Promise.all([
      this.supabase.client
        .from("service_account_grants")
        .select("*, service_accounts!inner(name, organization_id, job_id, department_id)")
        .eq(`service_accounts.${alan}`, deger)
        .is("revoked_at", null)
        .limit(LISTE_TAVANI),
      this.kapsamSuzgeci(
        this.supabase.client.from("service_account_grants").select("*").is("account_id", null),
        kapsam
      )
        .is("revoked_at", null)
        .limit(LISTE_TAVANI),
    ]);

    return { data: [...(hesapIzinleri.data ?? []), ...(kapsamIzinleri.data ?? [])] };
  }

  private async paylasimSayisi(accountId: string): Promise<number> {
    const { data } = await this.supabase.client
      .from("service_account_grants")
      .select("revoked_at, expires_at")
      .eq("account_id", accountId)
      .is("revoked_at", null);
    return (data ?? []).filter((g: any) => paylasimGecerliMi(g)).length;
  }

  private async hesapPaylasimSatiri(accountId: string, userId: string): Promise<string | null> {
    const { data } = await this.supabase.client
      .from("service_account_grants")
      .select("id")
      .eq("account_id", accountId)
      .eq("user_id", userId)
      .maybeSingle();
    return data?.id ?? null;
  }

  private async kapsamPaylasimSatiri(kapsam: HesapKapsami, userId: string): Promise<string | null> {
    const { data } = await this.kapsamSuzgeci(
      this.supabase.client
        .from("service_account_grants")
        .select("id")
        .is("account_id", null)
        .eq("user_id", userId),
      kapsam
    ).maybeSingle();
    return data?.id ?? null;
  }

  /**
   * Satır bu kapsama mı ait?
   *
   * Hem hesap hem paylaşım satırlarında çalışıyor: ikisinde de kapsam aynı üç
   * sütunla yazılı (organization_id / department_id / job_id).
   */
  private kapsamaAitMi(g: any, kapsam: HesapKapsami): boolean {
    if ("jobId" in kapsam) return g.job_id === kapsam.jobId;
    if (g.organization_id !== kapsam.organizationId) return false;
    return (g.department_id ?? null) === (kapsam.departmentId ?? null);
  }

  private paylasimiMap(g: any, isimler: Map<string, string>): ServiceAccountGrant {
    return {
      id: g.id,
      userId: g.user_id,
      userName: isimler.get(g.user_id),
      accountId: g.account_id ?? undefined,
      accountName: g.service_accounts?.name ?? undefined,
      grantedBy: g.granted_by ?? undefined,
      grantedByName: g.granted_by ? isimler.get(g.granted_by) : undefined,
      grantedAt: g.granted_at,
      expiresAt: g.expires_at ?? undefined,
      revokedAt: g.revoked_at ?? undefined,
      active: paylasimGecerliMi(g),
    };
  }

  // ============================================================ Ortak

  /** Hesap satırı + kullanıcının o hesaptaki kararı. */
  async satirVeYetki(
    id: string,
    userId: string
  ): Promise<{ row: any; access: ModuleAccess; karar: ReturnType<typeof hesapErisimKarari> }> {
    const { row } = await this.satir(id);
    const kapsam = this.kapsamiCoz(row);
    const access = await this.erisim(kapsam, userId);
    if (!access.canRead) throw new ForbiddenException("Bu modülü görme yetkiniz yok");

    const karar = hesapErisimKarari({
      canReadModule: access.canRead,
      isAdmin: access.canManageTeam,
      isCreator: row.created_by === userId,
      // İzin sorgusu yalnızca gerektiğinde: yönetici ve kaydı giren için
      // sonucu değiştirmez.
      hasAccountGrant:
        access.canManageTeam || row.created_by === userId ? false : await this.hesapIzniVar(id, userId),
      hasScopeGrant:
        access.canManageTeam || row.created_by === userId ? false : await this.kapsamIzniVar(kapsam, userId),
    });
    return { row, access, karar };
  }

  private async satir(id: string): Promise<{ row: any }> {
    const { data, error } = await this.supabase.client
      .from("service_accounts")
      .select(HESAP_SECIM)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Hesap bulunamadı");
    return { row: data };
  }

  private async hesapIzniVar(accountId: string, userId: string): Promise<boolean> {
    const { data } = await this.supabase.client
      .from("service_account_grants")
      .select("revoked_at, expires_at")
      .eq("account_id", accountId)
      .eq("user_id", userId)
      .maybeSingle();
    return Boolean(data) && paylasimGecerliMi(data as any);
  }

  private async kapsamIzniVar(kapsam: HesapKapsami, userId: string): Promise<boolean> {
    const { data } = await this.kapsamSuzgeci(
      this.supabase.client
        .from("service_account_grants")
        .select("revoked_at, expires_at")
        .is("account_id", null)
        .eq("user_id", userId),
      kapsam
    ).maybeSingle();
    return Boolean(data) && paylasimGecerliMi(data as any);
  }

  private map(
    row: any,
    ek: {
      ownerName?: string;
      credentialCount: number;
      canReveal: boolean;
      revealReason?: ServiceAccount["revealReason"];
      grantCount?: number;
      budgetScopeName?: string;
      budgetScopeType?: "department" | "job";
    }
  ): ServiceAccount {
    return {
      id: row.id,
      organizationId: row.organization_id ?? undefined,
      jobId: row.job_id ?? undefined,
      departmentId: row.department_id ?? undefined,
      name: row.name,
      category: row.category as ServiceAccountCategory,
      url: row.url ?? undefined,
      loginMethod: row.login_method as ServiceAccountLoginMethod,
      plan: row.plan ?? undefined,
      ownerUserId: row.owner_user_id ?? undefined,
      ownerName: ek.ownerName,
      note: row.note ?? undefined,
      isPaid: Boolean(row.is_paid),
      amount: row.amount === null || row.amount === undefined ? undefined : Number(row.amount),
      currency: row.currency || "TRY",
      billingInterval: (row.billing_interval as RecurrenceInterval) ?? undefined,
      // Defterdeki canlı vade varsa o gösteriliyor: cron ilerlettikçe hesap
      // satırındaki tarih eskiyor ve kullanıcı geçmiş bir tarih görürdü.
      nextDueDate: defterVadesi(row) ?? row.next_due_date ?? undefined,
      recurringPaymentId: row.recurring_payment_id ?? undefined,
      budgetScopeType: ek.budgetScopeType,
      budgetScopeName: ek.budgetScopeName,
      credentialCount: ek.credentialCount,
      canReveal: ek.canReveal,
      revealReason: ek.revealReason,
      grantCount: ek.grantCount,
      createdBy: row.created_by ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
    };
  }
}
