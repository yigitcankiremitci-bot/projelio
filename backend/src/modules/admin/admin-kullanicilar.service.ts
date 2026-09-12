import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  adminKullaniciDurumu,
  gunlukEtkinligiDoldur,
  type AdminKrediHareketi,
  type AdminKullaniciDetayi,
  type AdminKullaniciIslemi,
  type AdminKullaniciSatiri,
  type UserRole,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { AccountDeletionService, anonimlestirilmisMi } from "../users/account-deletion.service";
import { AiCreditsService } from "../ai-assistant/ai-credits.service";
import { HesapDurumuService } from "../../common/hesap-durumu/hesap-durumu.service";
import { utcMs } from "../../common/hesap-durumu/oturum-engeli";
import { demoKullanicisiMi } from "../../common/demo-hesap";

/**
 * Admin paneli kullanıcı yönetimi: liste, detay, askı, oturum iptali, rol,
 * kredi ve silme.
 *
 * KURAL KOPYALANMIYOR: silme AccountDeletionService'ten, kredi AiCreditsService'ten
 * geçiyor. Burada yalnızca yöneticiye özgü olan var (askı, oturum iptali, rol,
 * işlem kaydı). Silmeyi burada yeniden yazmak, sahiplik engellerini ve kişisel
 * veri listesini iki yerde tutmak demekti.
 *
 * YÖNETİCİ KENDİNE DOKUNAMAZ: kendini askıya alan ya da rolünü düşüren yönetici
 * paneli kaybeder ve geri dönmenin tek yolu SSH'tır.
 */

/** Liste ucunun tavanı. Bugün yüzlerce kullanıcı var; tavana dayanırsa sayfalama gerek. */
const KULLANICI_TAVANI = 2000;

const TEMEL_SUTUNLAR =
  "id, full_name, email, username, avatar_url, role, account_type, created_at, email_verified_at, deleted_at, password_hash";
const ASKI_SUTUNLARI = ", banned_at, ban_reason";

type IslemTuru =
  | "askiya_al"
  | "askiyi_kaldir"
  | "oturumlari_kapat"
  | "rol_degistir"
  | "eposta_dogrula"
  | "kredi_yukle"
  | "kredi_dus"
  | "kredi_geri_al"
  | "silme_planla"
  | "silmeyi_iptal_et"
  | "hemen_sil";

@Injectable()
export class AdminKullanicilarService {
  private readonly logger = new Logger(AdminKullanicilarService.name);

  constructor(
    private supabase: SupabaseService,
    private accountDeletion: AccountDeletionService,
    private credits: AiCreditsService,
    private hesapDurumu: HesapDurumuService
  ) {}

  // ============================================================ Okuma

  async liste(): Promise<{ kullanicilar: AdminKullaniciSatiri[]; migrationEksik: boolean }> {
    const { satirlar, migrationEksik } = await this.kullaniciSatirlari((q) =>
      q.order("created_at", { ascending: false }).limit(KULLANICI_TAVANI)
    );

    const [bakiyeler, abonelikler, etkinlikler] = await Promise.all([
      this.supabase.client.from("ai_credit_balances").select("user_id, balance, lifetime_purchased, lifetime_spent"),
      this.supabase.client
        .from("subscriptions")
        .select("user_id, plan_key, status, period, created_at")
        .eq("scope", "user")
        .in("status", ["trialing", "active", "past_due", "canceled"])
        .order("created_at", { ascending: true }),
      this.supabase.client.rpc("admin_kullanici_etkinlik_ozeti"),
    ]);
    if (bakiyeler.error) throw bakiyeler.error;
    // Etkinlik (migration 109) yoksa da liste açılsın; süre sütunları boş kalır.
    if (etkinlikler.error) this.logger.warn(`Etkinlik özeti okunamadı: ${etkinlikler.error.message}`);
    const etkinlikMap = new Map(((etkinlikler.data as any[]) ?? []).map((r) => [r.user_id, r]));
    // Abonelik tablosu (migration 092) yoksa liste yine açılsın; sütun boş kalır.
    if (abonelikler.error) this.logger.warn(`Abonelikler okunamadı: ${abonelikler.error.message}`);

    const bakiyeMap = new Map((bakiyeler.data ?? []).map((r: any) => [r.user_id, r]));
    // Artan sırayla okunduğu için aynı kullanıcının EN YENİ satırı üste yazılır
    // (billing.service aktifAbonelik ile aynı: iki satır varsa yenisi geçerli).
    const abonelikMap = new Map<string, any>();
    for (const r of abonelikler.data ?? []) abonelikMap.set((r as any).user_id, r);

    return {
      kullanicilar: satirlar.map((row) =>
        this.satiriCevir(row, bakiyeMap.get(row.id), abonelikMap.get(row.id), etkinlikMap.get(row.id))
      ),
      migrationEksik,
    };
  }

  async detay(userId: string): Promise<AdminKullaniciDetayi> {
    const { satirlar, migrationEksik } = await this.kullaniciSatirlari((q) => q.eq("id", userId).limit(1));
    const row = satirlar[0];
    if (!row) throw new BadRequestException("Kullanıcı bulunamadı.");

    const [bakiye, abonelik, isler, orglar, gruplar, hareketler, sonKullanim, islemler, etkinlik] = await Promise.all([
      this.supabase.client
        .from("ai_credit_balances")
        .select("user_id, balance, lifetime_purchased, lifetime_spent")
        .eq("user_id", userId)
        .maybeSingle(),
      this.supabase.client
        .from("subscriptions")
        .select("user_id, plan_key, status, period")
        .eq("user_id", userId)
        .eq("scope", "user")
        .in("status", ["trialing", "active", "past_due", "canceled"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      this.sayi("jobs", "owner_id", userId),
      this.sayi("organizations", "owner_id", userId),
      this.sayi("groups", "owner_id", userId),
      this.krediHareketleri(userId, migrationEksik),
      this.supabase.client
        .from("ai_credit_transactions")
        .select("created_at")
        .eq("user_id", userId)
        .eq("type", "usage")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      migrationEksik ? Promise.resolve([]) : this.islemKaydi(userId),
      this.etkinlikDetayi(userId),
    ]);

    const kullanici = this.satiriCevir(row, bakiye.data, abonelik.error ? null : abonelik.data, etkinlik.ozet);

    // Silinmiş hesapta önizleme anlamsız; diğerlerinde hata detayı düşürmesin.
    let silmeOnizleme: AdminKullaniciDetayi["silmeOnizleme"] = null;
    if (!kullanici.anonimlestirildi) {
      silmeOnizleme = await this.accountDeletion.previewDeletion(userId).catch((e) => {
        this.logger.warn(`Silme önizlemesi alınamadı (${userId}): ${(e as Error).message}`);
        return null;
      });
    }

    return {
      kullanici,
      sayilar: { sahipOlunanIs: isler, sahipOlunanOrganizasyon: orglar, sahipOlunanGrup: gruplar },
      sonAiKullanimi: (sonKullanim.data as any)?.created_at ?? undefined,
      krediHareketleri: hareketler,
      islemler,
      silmeOnizleme,
      gunlukEtkinlik: gunlukEtkinligiDoldur(etkinlik.gunler, istanbulGunu()),
      migrationEksik,
    };
  }

  // ============================================================ Hesap işlemleri

  async askiyaAl(adminId: string, userId: string, sebep: string | undefined): Promise<void> {
    await this.hedefiDogrula(adminId, userId, "askıya alma");
    const simdi = new Date().toISOString();
    const temizSebep = sebep?.trim().slice(0, 500) || null;
    // Askı oturumları da kapatır: kaldırıldığında eski jetonlar geri gelmesin,
    // kişi yeniden giriş yapsın.
    const { error } = await this.supabase.client
      .from("users")
      .update({ banned_at: simdi, ban_reason: temizSebep, banned_by: adminId, sessions_revoked_at: simdi })
      .eq("id", userId);
    if (error) throw this.migrationHatasi(error);
    this.hesapDurumu.guncelle(userId, { bannedAt: Date.parse(simdi), sessionsRevokedAt: Date.parse(simdi) });
    await this.kaydet(adminId, userId, "askiya_al", { sebep: temizSebep });
  }

  async askiyiKaldir(adminId: string, userId: string): Promise<void> {
    await this.hedefiDogrula(adminId, userId, "askıyı kaldırma");
    const { data, error } = await this.supabase.client
      .from("users")
      .update({ banned_at: null, ban_reason: null, banned_by: null })
      .eq("id", userId)
      .select("sessions_revoked_at")
      .maybeSingle();
    if (error) throw this.migrationHatasi(error);
    // sessions_revoked_at KALIR: askı sırasındaki jetonlar geçersiz kalmalı.
    this.hesapDurumu.guncelle(userId, { bannedAt: null, sessionsRevokedAt: utcMs((data as any)?.sessions_revoked_at) });
    await this.kaydet(adminId, userId, "askiyi_kaldir");
  }

  async oturumlariKapat(adminId: string, userId: string): Promise<void> {
    await this.hedefiDogrula(adminId, userId, "oturum kapatma");
    await this.oturumlariIptalEt(userId);
    await this.kaydet(adminId, userId, "oturumlari_kapat");
  }

  /**
   * Rol jetonun İÇİNDE taşınıyor ve /auth/refresh onu olduğu gibi aktarıyor
   * (auth.controller.ts). Oturumlar kapatılmazsa yetkisi alınan yönetici,
   * jetonu yaşadıkça yönetici kalırdı. Bu yüzden rol değişikliği her zaman
   * oturumları da kapatır.
   */
  async rolDegistir(adminId: string, userId: string, rol: UserRole): Promise<void> {
    if (rol !== "admin" && rol !== "freelancer") throw new BadRequestException("Geçersiz rol.");
    await this.hedefiDogrula(adminId, userId, "rol değiştirme");
    const { data: once } = await this.supabase.client.from("users").select("role").eq("id", userId).maybeSingle();
    const { error } = await this.supabase.client.from("users").update({ role: rol }).eq("id", userId);
    if (error) throw error;
    await this.oturumlariIptalEt(userId);
    await this.kaydet(adminId, userId, "rol_degistir", { once: (once as any)?.role, sonra: rol });
  }

  async epostayiDogrula(adminId: string, userId: string): Promise<void> {
    await this.hedefiDogrula(adminId, userId, "e-posta doğrulama");
    const { error } = await this.supabase.client
      .from("users")
      .update({ email_verified_at: new Date().toISOString() })
      .eq("id", userId)
      .is("email_verified_at", null);
    if (error) throw error;
    await this.kaydet(adminId, userId, "eposta_dogrula");
  }

  // ============================================================ Kredi

  async krediYukle(adminId: string, userId: string, miktar: number, aciklama?: string) {
    await this.hedefiDogrula(adminId, userId, "kredi yükleme", { kendineIzinVer: true });
    const bakiye = await this.credits.grant(userId, miktar, "topup", aciklama?.trim() || "Yönetici tarafından yüklendi", adminId);
    await this.kaydet(adminId, userId, "kredi_yukle", { miktar, aciklama });
    return bakiye;
  }

  async krediDus(adminId: string, userId: string, miktar: number, aciklama?: string) {
    await this.hedefiDogrula(adminId, userId, "kredi düşme", { kendineIzinVer: true });
    const bakiye = await this.credits.deduct(userId, miktar, aciklama?.trim() || "Yönetici tarafından düşüldü", adminId);
    await this.kaydet(adminId, userId, "kredi_dus", { miktar, aciklama });
    return bakiye;
  }

  async krediGeriAl(adminId: string, userId: string, hareketId: string, aciklama?: string) {
    await this.hedefiDogrula(adminId, userId, "kredi geri alma", { kendineIzinVer: true });
    const bakiye = await this.credits.reverse(userId, hareketId, aciklama?.trim() || "Yönetici tarafından geri alındı", adminId);
    await this.kaydet(adminId, userId, "kredi_geri_al", { hareketId, aciklama });
    return bakiye;
  }

  // ============================================================ Silme

  async silmePlanla(adminId: string, userId: string) {
    await this.hedefiDogrula(adminId, userId, "hesap silme");
    const sonuc = await this.accountDeletion.adminSilmeTalebi(userId);
    // Oturumlar kapanır: kullanıcının kendi silmesinde istemci zaten çıkış yapıyor,
    // burada ise kişi hâlâ içeride. Giriş yaparsa talep iptal olur (bkz. AuthService).
    await this.oturumlariIptalEt(userId);
    await this.kaydet(adminId, userId, "silme_planla", { purgeAt: sonuc.purgeAt });
    return sonuc;
  }

  async silmeyiIptalEt(adminId: string, userId: string): Promise<void> {
    await this.hedefiDogrula(adminId, userId, "silme iptali");
    const { data } = await this.supabase.client.from("users").select("email, deleted_at").eq("id", userId).maybeSingle();
    if (anonimlestirilmisMi((data as any)?.email)) {
      throw new BadRequestException("Kalıcı olarak silinmiş bir hesap geri getirilemez.");
    }
    if (!(data as any)?.deleted_at) throw new BadRequestException("Bu hesabın bekleyen bir silme talebi yok.");
    await this.accountDeletion.restoreAccount(userId);
    await this.kaydet(adminId, userId, "silmeyi_iptal_et");
  }

  /** GERİ ALINAMAZ. Arayüz e-postanın elle yazılmasını istiyor; burada da doğrulanıyor. */
  async hemenSil(adminId: string, userId: string, onayEposta: string | undefined): Promise<void> {
    await this.hedefiDogrula(adminId, userId, "hesap silme");
    const { data } = await this.supabase.client.from("users").select("email").eq("id", userId).maybeSingle();
    const eposta = (data as any)?.email as string | undefined;
    if (!eposta || (onayEposta ?? "").trim().toLowerCase() !== eposta.toLowerCase()) {
      throw new BadRequestException("Onay için hesabın e-posta adresini aynen yazmalısın.");
    }
    // Kayıt SİLMEDEN ÖNCE yazılıyor: silme yarıda kalırsa da iz kalsın. Kişi
    // anonimleştirileceği için e-posta kayda eklenmiyor — kayıt kişisel veri
    // taşımaya devam ederse silme silme olmaz.
    await this.kaydet(adminId, userId, "hemen_sil");
    await this.oturumlariIptalEt(userId);
    await this.accountDeletion.adminHemenSil(userId);
  }

  // ============================================================ Yardımcılar

  private async hedefiDogrula(
    adminId: string,
    userId: string,
    islem: string,
    secenek: { kendineIzinVer?: boolean } = {}
  ): Promise<void> {
    if (!secenek.kendineIzinVer && adminId === userId) {
      throw new BadRequestException(`Kendi hesabında ${islem} yapamazsın.`);
    }
    // Demo hesabı herkese açık ve ortak: askıya almak ya da silmek ziyaretçileri
    // kapıda bırakır. Kredi işlemleri serbest (demo kendi kotasıyla çalışıyor).
    if (!secenek.kendineIzinVer && demoKullanicisiMi(userId)) {
      throw new BadRequestException("Demo hesabında bu işlem yapılamaz.");
    }
    const { data, error } = await this.supabase.client.from("users").select("id").eq("id", userId).maybeSingle();
    if (error) throw error;
    if (!data) throw new BadRequestException("Kullanıcı bulunamadı.");
  }

  private async oturumlariIptalEt(userId: string): Promise<void> {
    const simdi = new Date().toISOString();
    const { data, error } = await this.supabase.client
      .from("users")
      .update({ sessions_revoked_at: simdi })
      .eq("id", userId)
      .select("banned_at")
      .maybeSingle();
    if (error) throw this.migrationHatasi(error);
    this.hesapDurumu.guncelle(userId, { bannedAt: utcMs((data as any)?.banned_at), sessionsRevokedAt: Date.parse(simdi) });
  }

  /** İşlem kaydı. Yazılamazsa işlem geri alınmaz — iş zaten yapıldı; ama log'a düşer. */
  private async kaydet(adminId: string, userId: string, action: IslemTuru, detail?: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.client
      .from("admin_user_actions")
      .insert({ target_user_id: userId, admin_user_id: adminId, action, detail: detail ?? null });
    if (error) this.logger.error(`Yönetici işlemi kaydedilemedi (${action}, ${userId}): ${error.message}`);
    this.logger.log(`Yönetici işlemi: ${action} · hedef ${userId} · yönetici ${adminId}`);
  }

  /**
   * Kullanıcı satırlarını okur. Migration 108 uygulanmadıysa askı sütunları yok:
   * liste yine açılsın (panel boş kalmasın), eksiklik ekranda uyarı olarak görünsün.
   */
  private async kullaniciSatirlari(sorgu: (q: any) => any): Promise<{ satirlar: any[]; migrationEksik: boolean }> {
    const tam = await sorgu(this.supabase.client.from("users").select(TEMEL_SUTUNLAR + ASKI_SUTUNLARI));
    if (!tam.error) return { satirlar: tam.data ?? [], migrationEksik: false };
    if (!sutunYokHatasi(tam.error)) throw tam.error;

    const temel = await sorgu(this.supabase.client.from("users").select(TEMEL_SUTUNLAR));
    if (temel.error) throw temel.error;
    return { satirlar: temel.data ?? [], migrationEksik: true };
  }

  private satiriCevir(row: any, bakiye: any, abonelik: any, etkinlik?: any): AdminKullaniciSatiri {
    const anonimlestirildi = anonimlestirilmisMi(row.email);
    const alanlar = {
      anonimlestirildi,
      deletedAt: row.deleted_at ?? undefined,
      bannedAt: row.banned_at ?? undefined,
      emailVerifiedAt: row.email_verified_at ?? undefined,
    };
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      username: row.username,
      avatarUrl: row.avatar_url ?? undefined,
      role: row.role,
      accountType: row.account_type,
      createdAt: row.created_at,
      ...alanlar,
      banReason: row.ban_reason ?? undefined,
      // Hash'in kendisi asla dışarı çıkmıyor, yalnızca var olup olmadığı.
      sifreliGiris: Boolean(row.password_hash),
      durum: adminKullaniciDurumu(alanlar),
      kredi: {
        balance: Number(bakiye?.balance ?? 0),
        lifetimePurchased: Number(bakiye?.lifetime_purchased ?? 0),
        lifetimeSpent: Number(bakiye?.lifetime_spent ?? 0),
      },
      abonelik: abonelik ? { planKey: abonelik.plan_key, status: abonelik.status, period: abonelik.period } : undefined,
      etkinlik: etkinlik
        ? {
            ilkGorulme: etkinlik.first_seen_at,
            sonGorulme: etkinlik.last_seen_at,
            toplamSaniye: Number(etkinlik.total_seconds ?? 0),
            son7GunSaniye: Number(etkinlik.seconds_7d ?? 0),
            son30GunSaniye: Number(etkinlik.seconds_30d ?? 0),
            son30GundeAktifGun: Number(etkinlik.active_days_30d ?? 0),
          }
        : undefined,
    };
  }

  /**
   * Tek kullanıcının etkinliği: özet satırı + son 30 günün günleri. Liste ucundaki
   * özet fonksiyonu herkesi topladığı için burada aynı hesap tek kişiye yapılıyor.
   */
  private async etkinlikDetayi(userId: string): Promise<{ ozet: any | null; gunler: { gun: string; saniye: number }[] }> {
    const bugun = istanbulGunu();
    const esik = gunEkle(bugun, -29);
    const [durum, gunler] = await Promise.all([
      this.supabase.client
        .from("user_activity_state")
        .select("first_seen_at, last_seen_at, total_seconds")
        .eq("user_id", userId)
        .maybeSingle(),
      this.supabase.client
        .from("user_activity_days")
        .select("day, active_seconds")
        .eq("user_id", userId)
        .gte("day", esik)
        .order("day"),
    ]);
    if (durum.error || gunler.error) {
      // Migration 109 yoksa tablolar yok: detay yine açılsın.
      return { ozet: null, gunler: [] };
    }
    const gunListesi = (gunler.data ?? []).map((g: any) => ({ gun: g.day as string, saniye: Number(g.active_seconds) }));
    if (!durum.data) return { ozet: null, gunler: gunListesi };
    const yediGunEsigi = gunEkle(bugun, -6);
    return {
      ozet: {
        ...durum.data,
        seconds_7d: gunListesi.filter((g) => g.gun >= yediGunEsigi).reduce((a, g) => a + g.saniye, 0),
        seconds_30d: gunListesi.reduce((a, g) => a + g.saniye, 0),
        active_days_30d: gunListesi.filter((g) => g.saniye > 0).length,
      },
      gunler: gunListesi,
    };
  }

  private async sayi(tablo: string, sutun: string, deger: string): Promise<number> {
    const { count } = await this.supabase.client
      .from(tablo)
      .select("id", { count: "exact", head: true })
      .eq(sutun, deger);
    return count ?? 0;
  }

  private async krediHareketleri(userId: string, migrationEksik: boolean): Promise<AdminKrediHareketi[]> {
    const sutunlar = "id, type, credits, balance_after, description, model, created_at" + (migrationEksik ? "" : ", reverses_transaction_id");
    const { data, error } = await this.supabase.client
      .from("ai_credit_transactions")
      .select(sutunlar)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const satirlar = (data ?? []) as any[];
    // Geri alma satırı her zaman orijinalden SONRA yazıldığı için ikisi de bu
    // 100 satırın içinde olmayabilir; eski bir yüklemenin geri alındığı bilgisi
    // ayrıca sorulur, yoksa düğme "geri al" gösterip sunucudan ret alırdı.
    const geriAlinanlar = new Set<string>(satirlar.map((r) => r.reverses_transaction_id).filter(Boolean));
    const adaylar = satirlar.filter((r) => Number(r.credits) > 0 && !geriAlinanlar.has(r.id)).map((r) => r.id);
    if (!migrationEksik && adaylar.length) {
      const { data: ters } = await this.supabase.client
        .from("ai_credit_transactions")
        .select("reverses_transaction_id")
        .in("reverses_transaction_id", adaylar);
      for (const r of ters ?? []) geriAlinanlar.add((r as any).reverses_transaction_id);
    }

    return satirlar.map((r) => ({
      id: r.id,
      type: r.type,
      credits: Number(r.credits),
      balanceAfter: Number(r.balance_after),
      description: r.description ?? undefined,
      model: r.model ?? undefined,
      createdAt: r.created_at,
      reversesTransactionId: r.reverses_transaction_id ?? undefined,
      // Migration yoksa geri alma zaten çalışmaz; "geri alınmış" saymak düğmeyi gizler.
      geriAlindi: migrationEksik || geriAlinanlar.has(r.id),
    }));
  }

  private async islemKaydi(userId: string): Promise<AdminKullaniciIslemi[]> {
    const { data, error } = await this.supabase.client
      .from("admin_user_actions")
      .select("id, action, detail, created_at, admin:users!admin_user_actions_admin_user_id_fkey(full_name)")
      .eq("target_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      this.logger.warn(`İşlem kaydı okunamadı (${userId}): ${error.message}`);
      return [];
    }
    return (data ?? []).map((r: any) => ({
      id: r.id,
      action: r.action,
      detail: r.detail ?? undefined,
      adminName: r.admin?.full_name ?? undefined,
      createdAt: r.created_at,
    }));
  }

  private migrationHatasi(error: any): Error {
    if (sutunYokHatasi(error)) {
      return new BadRequestException("Bu özellik için veritabanı güncellemesi (migration 108) henüz uygulanmamış.");
    }
    return error;
  }
}

/** PostgreSQL 42703 (sütun yok) ya da PostgREST'in şema önbelleğinde bulunamayan sütun. */
function sutunYokHatasi(error: any): boolean {
  return error?.code === "42703" || error?.code === "PGRST204" || /column .* does not exist/i.test(error?.message ?? "");
}

/**
 * Europe/Istanbul günü, "YYYY-MM-DD". Etkinlik günleri veritabanında bu saat
 * diliminde yazılıyor (migration 109); sunucu süreci UTC'de çalıştığı için
 * `new Date().toISOString()` gece 00:00–03:00 arası bir önceki günü verirdi.
 */
function istanbulGunu(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

function gunEkle(gun: string, fark: number): string {
  const [y, m, d] = gun.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + fark)).toISOString().slice(0, 10);
}
