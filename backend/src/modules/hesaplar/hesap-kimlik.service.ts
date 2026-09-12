import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ServiceCredential,
  ServiceCredentialSecret,
  ServiceCredentialView,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { HesaplarService } from "./hesaplar.service";
import { HesapKilitService } from "./hesap-kilit.service";
import { hesapErisimKarari } from "./hesap-erisim";
import { hesapKimlikCrypto } from "./hesap-kripto";

/**
 * Hesapların giriş bilgileri (kullanıcı adı + şifre + not + 2FA sırrı).
 *
 * KURAL: `service_account_credentials` tablosunu başka hiçbir servis okumaz.
 * Sır yalnızca `goster()` çağrısından çıkar; liste uçları sırrı DÖNMEZ,
 * yalnızca "böyle bir kayıt var" bilgisini döner. 076'da sosyal medya için
 * kurulan sınırın aynısı ve aynı gerekçeyle.
 *
 * İKİ KAPI VAR VE İKİSİ DE GEÇİLMELİ:
 *   1. YETKİ — bu kullanıcı bu sırrı görebilir mi (hesap-erisim.ts)
 *   2. KİLİT — kimliğini şimdi yeniden kanıtladı mı (hesap-kilit.service.ts)
 * İkisi ayrı şeyler: yetki "kim", kilit "şu an". Yalnızca birincisi olsaydı
 * açık kalmış bir ekran tüm kasayı açardı.
 *
 * Şifreleme common/crypto/token-crypto.ts'te; anahtar HESAP_KIMLIK_ENC_KEY —
 * sosyal medyanın ve jetonların anahtarlarından BİLEREK ayrı.
 */

export interface HesapKimlikGirdisi {
  label?: string;
  username?: string;
  password?: string;
  note?: string;
  totp?: string;
}

interface KimlikSatiri {
  id: string;
  account_id: string;
  label: string;
  username_enc: string | null;
  password_enc: string | null;
  note_enc: string | null;
  totp_enc: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
  password_changed_at: string;
}

function metin(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class HesapKimlikService {
  private supabase: SupabaseService;
  private hesaplar: HesaplarService;
  private kilit: HesapKilitService;

  constructor(supabase: SupabaseService, hesaplar: HesaplarService, kilit: HesapKilitService) {
    this.supabase = supabase;
    this.hesaplar = hesaplar;
    this.kilit = kilit;
  }

  // ============================================================ Okuma

  /** Bir hesabın giriş kayıtları — sırsız. */
  async liste(accountId: string, userId: string): Promise<ServiceCredential[]> {
    const { row, access, karar } = await this.hesaplar.satirVeYetki(accountId, userId);

    const { data, error } = await this.supabase.client
      .from("service_account_credentials")
      .select("*")
      .eq("account_id", row.id)
      .order("created_at", { ascending: true })
      .limit(LISTE_TAVANI);
    if (error) throw error;

    const satirlar = (data ?? []) as KimlikSatiri[];
    const isimler = await this.kullaniciAdlari(satirlar.map((r) => r.created_by));

    return satirlar.map((satir) => {
      // Karar hesap düzeyinde çözülmüş; tek fark "kaydı giren kişi", o da
      // satır başına değişiyor.
      const satirKarari = hesapErisimKarari({
        canReadModule: true,
        isAdmin: access.canManageTeam,
        isCreator: satir.created_by === userId,
        hasAccountGrant: karar.reason === "account_grant",
        hasScopeGrant: karar.reason === "scope_grant",
      });
      return this.map(satir, satirKarari, satir.created_by ? isimler.get(satir.created_by) : undefined);
    });
  }

  /**
   * Sırrı çözüp döner — ve gösterildiğini kaydeder.
   *
   * Denetim kaydı yazılamıyorsa sır da dönmez: "kimin gördüğü" bilinmeyen bir
   * gösterim, izin sisteminin sağladığı güvenceyi boşa çıkarır (076'daki aynı
   * karar).
   */
  async goster(id: string, userId: string, kilitJetonu?: string): Promise<ServiceCredentialSecret> {
    const satir = await this.satir(id);
    const { access, karar } = await this.hesaplar.satirVeYetki(satir.account_id, userId);

    const satirKarari = hesapErisimKarari({
      canReadModule: true,
      isAdmin: access.canManageTeam,
      isCreator: satir.created_by === userId,
      hasAccountGrant: karar.reason === "account_grant",
      hasScopeGrant: karar.reason === "scope_grant",
    });
    if (!satirKarari.canReveal || !satirKarari.reason) {
      throw new ForbiddenException(
        "Bu hesabın giriş bilgilerini görme yetkiniz yok. Modül yöneticisinden paylaşım isteyebilirsiniz."
      );
    }

    // KİLİT YETKİDEN SONRA: yetkisi olmayan birine "önce kilidi aç" demek,
    // olmayan bir kapının önünde bekletmek olurdu.
    const yontem = this.kilit.dogrula(kilitJetonu, userId);

    const { error: logError } = await this.supabase.client.from("service_credential_views").insert({
      credential_id: satir.id,
      user_id: userId,
      reason: satirKarari.reason,
      unlock_method: yontem,
    });
    if (logError) throw logError;

    try {
      return {
        id: satir.id,
        username: satir.username_enc ? hesapKimlikCrypto.decrypt(satir.username_enc) : undefined,
        password: satir.password_enc ? hesapKimlikCrypto.decrypt(satir.password_enc) : undefined,
        note: satir.note_enc ? hesapKimlikCrypto.decrypt(satir.note_enc) : undefined,
        totp: satir.totp_enc ? hesapKimlikCrypto.decrypt(satir.totp_enc) : undefined,
        reason: satirKarari.reason,
      };
    } catch {
      // Anahtar değişmiş ya da satır kurcalanmış. Hata metnine şifreli değer
      // KOYULMUYOR; kullanıcıya yapılabilecek tek şey söyleniyor.
      throw new BadRequestException(
        "Bilgiler çözülemedi. Sunucudaki şifreleme anahtarı değişmiş olabilir; kaydı yeniden girin."
      );
    }
  }

  // ============================================================ Yazma

  async ekle(accountId: string, girdi: HesapKimlikGirdisi, userId: string): Promise<ServiceCredential> {
    const { row, access } = await this.hesaplar.satirVeYetki(accountId, userId);
    if (!access.canWrite) throw new ForbiddenException("Bu modüle giriş bilgisi ekleme yetkiniz yok");
    this.anahtariDogrula();

    // Şifre ZORUNLU DEĞİL: geçiş anahtarı ya da SSO ile girilen hesaplarda
    // şifre yok, kayıt "bu hesaba şu kullanıcıyla giriliyor" bilgisini ve
    // kurtarma notlarını taşıyor. En az bir alanın dolu olması yeterli —
    // tamamen boş kayıt yalnızca listeyi kirletir.
    if (!girdi.password?.trim() && !girdi.username?.trim() && !girdi.note?.trim() && !girdi.totp?.trim()) {
      throw new BadRequestException("En az bir bilgi girin (kullanıcı adı, şifre ya da not)");
    }

    const { data, error } = await this.supabase.client
      .from("service_account_credentials")
      .insert({
        account_id: row.id,
        label: metin(girdi.label) ?? "Ana giriş",
        username_enc: this.sifrele(girdi.username),
        password_enc: this.sifrele(girdi.password),
        note_enc: this.sifrele(girdi.note),
        totp_enc: this.sifrele(girdi.totp),
        created_by: userId,
        updated_by: userId,
      })
      .select("*")
      .single();
    if (error) throw error;

    return this.map(data as KimlikSatiri, {
      canReveal: true,
      reason: access.canManageTeam ? "admin" : "creator",
      canEdit: true,
    });
  }

  async guncelle(id: string, girdi: HesapKimlikGirdisi, userId: string): Promise<ServiceCredential> {
    const satir = await this.satir(id);
    const { access } = await this.hesaplar.satirVeYetki(satir.account_id, userId);

    const karar = hesapErisimKarari({
      canReadModule: true,
      isAdmin: access.canManageTeam,
      isCreator: satir.created_by === userId,
      // Paylaşım görmeye yeter, DEĞİŞTİRMEYE yetmez.
      hasAccountGrant: false,
      hasScopeGrant: false,
    });
    if (!karar.canEdit) {
      throw new ForbiddenException("Bu kaydı yalnızca yöneticiler ve bilgiyi giren kişi düzenleyebilir");
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: userId };
    if (girdi.label !== undefined) patch.label = metin(girdi.label) ?? "Ana giriş";
    for (const [alan, deger] of [
      ["username_enc", girdi.username],
      ["note_enc", girdi.note],
      ["totp_enc", girdi.totp],
    ] as const) {
      if (deger !== undefined) {
        this.anahtariDogrula();
        patch[alan] = this.sifrele(deger);
      }
    }
    // BOŞ ŞİFRE "değiştirme" değil "dokunma" demek: form şifreyi hiçbir zaman
    // dolu getirmiyor (sır listede dönmüyor), boş gönderim olağan. Şifreyi
    // gerçekten silmek isteyen kayıt siler.
    if (girdi.password?.trim()) {
      this.anahtariDogrula();
      patch.password_enc = hesapKimlikCrypto.encrypt(girdi.password.trim());
      patch.password_changed_at = new Date().toISOString();
    }

    const { data, error } = await this.supabase.client
      .from("service_account_credentials")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    const guncel = data as KimlikSatiri;
    const isimler = await this.kullaniciAdlari([guncel.created_by]);
    return this.map(guncel, karar, guncel.created_by ? isimler.get(guncel.created_by) : undefined);
  }

  async sil(id: string, userId: string): Promise<{ ok: true }> {
    const satir = await this.satir(id);
    const { access } = await this.hesaplar.satirVeYetki(satir.account_id, userId);
    const karar = hesapErisimKarari({
      canReadModule: true,
      isAdmin: access.canManageTeam,
      isCreator: satir.created_by === userId,
      hasAccountGrant: false,
      hasScopeGrant: false,
    });
    if (!karar.canEdit) {
      throw new ForbiddenException("Bu kaydı yalnızca yöneticiler ve bilgiyi giren kişi silebilir");
    }

    // Arşivleme değil silme: sırrın "eski hâli" diye bir işi yok, veritabanında
    // durması yalnızca risktir. Denetim izi cascade ile gider.
    const { error } = await this.supabase.client.from("service_account_credentials").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  }

  // ============================================================ Denetim izi

  /** Sırrın gösterildiği anlar — "en son kim gördü" sorusunun cevabı. */
  async gosterimler(accountId: string, userId: string, limit = 50): Promise<ServiceCredentialView[]> {
    const { row, access } = await this.hesaplar.satirVeYetki(accountId, userId);
    if (!access.canManageTeam) {
      throw new ForbiddenException("Denetim izini yalnızca modül yöneticileri görebilir");
    }

    const { data: kimlikler } = await this.supabase.client
      .from("service_account_credentials")
      .select("id, label")
      .eq("account_id", row.id);
    const etiketler = new Map((kimlikler ?? []).map((k: any) => [k.id, k.label as string]));
    if (etiketler.size === 0) return [];

    const { data, error } = await this.supabase.client
      .from("service_credential_views")
      .select("*")
      .in("credential_id", Array.from(etiketler.keys()))
      .order("viewed_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const satirlar = data ?? [];
    const isimler = await this.kullaniciAdlari(satirlar.map((v: any) => v.user_id));
    return satirlar.map((v: any) => ({
      id: v.id,
      credentialId: v.credential_id,
      credentialLabel: etiketler.get(v.credential_id),
      userId: v.user_id ?? undefined,
      userName: v.user_id ? isimler.get(v.user_id) : undefined,
      reason: v.reason,
      unlockMethod: v.unlock_method ?? "password",
      viewedAt: v.viewed_at,
    }));
  }

  // ============================================================ Yardımcılar

  private async satir(id: string): Promise<KimlikSatiri> {
    const { data, error } = await this.supabase.client
      .from("service_account_credentials")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Kayıt bulunamadı");
    return data as KimlikSatiri;
  }

  private async kullaniciAdlari(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const tekil = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
    if (tekil.length === 0) return new Map();
    const { data } = await this.supabase.client.from("users").select("id, full_name, email").in("id", tekil);
    return new Map((data ?? []).map((u: any) => [u.id, (u.full_name || u.email) as string]));
  }

  private sifrele(value?: string): string | null {
    const temiz = metin(value);
    return temiz ? hesapKimlikCrypto.encrypt(temiz) : null;
  }

  /**
   * Anahtar yoksa kaydı düz metin yazmaktansa hiç yazmıyoruz.
   *
   * Hata çalışma anında değil kurulum anında görülsün diye mesaj yapılacak işi
   * söylüyor; ortam değişkeninin DEĞERİ mesaja girmiyor.
   */
  private anahtariDogrula(): void {
    if (!hesapKimlikCrypto.isConfigured()) {
      throw new BadRequestException(
        "Şifre saklama kapalı: sunucuda HESAP_KIMLIK_ENC_KEY tanımlı değil. Sistem yöneticinize bildirin."
      );
    }
  }

  /**
   * Sırsız görünüm.
   *
   * Şifrenin UZUNLUĞU bile dönmüyor: şifreli metnin uzunluğu düz metne dair
   * ipucu verir, "böyle bir kayıt var" bilgisi ise vermez (076'daki aynı not).
   */
  private map(
    satir: KimlikSatiri,
    karar: { canReveal: boolean; reason?: ServiceCredential["revealReason"]; canEdit: boolean },
    createdByName?: string
  ): ServiceCredential {
    return {
      id: satir.id,
      accountId: satir.account_id,
      label: satir.label,
      hasPassword: Boolean(satir.password_enc),
      hasNote: Boolean(satir.note_enc),
      hasTotp: Boolean(satir.totp_enc),
      createdBy: satir.created_by ?? undefined,
      createdByName,
      createdAt: satir.created_at,
      updatedAt: satir.updated_at ?? undefined,
      passwordChangedAt: satir.password_changed_at,
      canReveal: karar.canReveal,
      revealReason: karar.reason,
      canEdit: karar.canEdit,
    };
  }
}
