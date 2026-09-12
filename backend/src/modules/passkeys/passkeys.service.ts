import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { verifyPassword } from "../../common/password.util";
import { LoginAttemptService } from "../auth/login-attempt.service";
import { assertPasskeyEnrollment, type ReauthSession } from "../auth/account-reauth";
import { randomBytes } from "node:crypto";
import type { Passkey, PasskeyAuthOptions, PasskeyRegistrationOptions } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { getCorsOrigins, getWebAppUrl } from "../../common/config/env";
import {
  DESTEKLENEN_ALGORITMALAR,
  b64url,
  imzayiDogrula,
  kaydiDogrula,
  rpIdCikar,
} from "../../common/webauthn/webauthn";

/**
 * Geçiş anahtarları (WebAuthn) — kullanıcının cihazları.
 *
 * NEDEN AYRI MODÜL: kayıt KULLANICIYA ait, Hesaplar modülüne değil. Bugün tek
 * kullanımı hesap sırlarının kilidini açmak, ama aynı cihaz ileride girişte de
 * kullanılabilir; o gün bu servisin yeri değişmesin diye baştan burada.
 *
 * Doğrulamanın kendisi saf fonksiyonlarda (common/webauthn/): veritabanı
 * gerektirmeden test ediliyor ve bu servis yalnızca "gerçekleri toplayıp
 * kararı ona sormak" işini yapıyor — module-access.ts ile aynı desen.
 */

/** Meydan okumanın ömrü. Kullanıcının biyometriye dokunması için bol bol yeter. */
const CHALLENGE_SANIYE = 120;

@Injectable()
export class PasskeysService {
  private supabase: SupabaseService;
  private kayitDenemeleri = new LoginAttemptService();

  constructor(supabase: SupabaseService) {
    this.supabase = supabase;
  }

  // ============================================================ Yapılandırma

  /**
   * Doğrulamanın kabul edeceği adresler.
   *
   * WEB_APP_URL her zaman listede: kullanıcı uygulamayı oradan açıyor.
   * CORS_ORIGINS de ekleniyor çünkü aynı kurulumda ikinci bir adres olabiliyor
   * (önizleme dağıtımı, eski alan adı). Liste KAPALI kalıyor — "her origin"
   * demek, başka bir sitede toplanan imzayı kabul etmek olurdu.
   */
  private izinliOriginler(): string[] {
    const hepsi = [getWebAppUrl().toLowerCase(), ...getCorsOrigins()];
    return Array.from(new Set(hepsi.filter(Boolean)));
  }

  /**
   * RP ID: geçiş anahtarının bağlı olduğu alan adı.
   *
   * WEB_APP_URL'den türetiliyor; WEBAUTHN_RP_ID ile ezilebilir (ör. tek
   * anahtar app.projelio.app ve projelio.app'ta birden geçerli olsun diye
   * "projelio.app" yazılabilir). Yanlış değerin belirtisi "cihaz hiç
   * açılmıyor" olduğu için varsayılan bilerek türetilmiş.
   */
  private rpId(): string {
    return process.env.WEBAUTHN_RP_ID?.trim() || rpIdCikar(getWebAppUrl());
  }

  // ============================================================ Meydan okuma

  private async challengeUret(userId: string, purpose: "register" | "unlock"): Promise<string> {
    const challenge = b64url(randomBytes(32));
    const { error } = await this.supabase.client.from("webauthn_challenges").insert({
      user_id: userId,
      challenge,
      purpose,
      expires_at: new Date(Date.now() + CHALLENGE_SANIYE * 1000).toISOString(),
    });
    if (error) throw error;
    return challenge;
  }

  /**
   * Meydan okumayı harcar: bir kez kullanılır.
   *
   * `used_at` DOLDURULARAK harcanıyor, satır silinmiyor: aynı yanıtın ikinci
   * kez oynatılması "böyle bir istek yok" değil "bu istek kullanılmış" hatası
   * vermeli. Süresi geçmiş satırlar aynı çağrıda temizleniyor — ayrı bir cron
   * kurmak, tek amacı çöp toplamak olan bir zamanlanmış iş demekti.
   */
  private async challengeHarca(userId: string, purpose: "register" | "unlock", challenge: string): Promise<void> {
    const simdi = new Date().toISOString();
    const { data, error } = await this.supabase.client
      .from("webauthn_challenges")
      .update({ used_at: simdi })
      .eq("user_id", userId)
      .eq("purpose", purpose)
      .eq("challenge", challenge)
      .is("used_at", null)
      .gt("expires_at", simdi)
      .select("id");
    if (error) throw error;
    if (!data?.length) {
      throw new BadRequestException("Doğrulama isteğinin süresi geçti. Lütfen yeniden deneyin.");
    }

    await this.supabase.client.from("webauthn_challenges").delete().lt("expires_at", simdi);
  }

  // ============================================================ Kayıt

  async registrationOptions(userId: string, password?: string, session: ReauthSession = {}): Promise<PasskeyRegistrationOptions> {
    const { data: user } = await this.supabase.client
      .from("users")
      .select("email, full_name, password_hash")
      .eq("id", userId)
      .maybeSingle();
    if (!user) throw new NotFoundException("Kullanıcı bulunamadı");

    // Kayıt meydan okuması yalnızca yeniden kimlik doğrulandıktan sonra verilir;
    // register ucu bu kullanıcıya bağlı, kısa ömürlü ve tek kullanımlık kanıtı harcar.
    this.kayitDenemeleri.assertNotLocked(userId);
    try {
      await assertPasskeyEnrollment(user.password_hash, password, session, verifyPassword);
    } catch (error) {
      if (user.password_hash) this.kayitDenemeleri.recordFailure(userId);
      throw error;
    }
    this.kayitDenemeleri.reset(userId);


    const { data: mevcut } = await this.supabase.client
      .from("user_passkeys")
      .select("credential_id")
      .eq("user_id", userId);

    return {
      challenge: await this.challengeUret(userId, "register"),
      rpId: this.rpId(),
      rpName: "Projelio",
      // Kullanıcı kimliği olarak UUID'nin KENDİSİ gidiyor, e-posta değil:
      // authenticator bu değeri cihazda saklıyor ve e-posta değişebilir.
      userId,
      userName: user.email,
      userDisplayName: user.full_name || user.email,
      algorithms: DESTEKLENEN_ALGORITMALAR,
      excludeCredentialIds: (mevcut ?? []).map((r: any) => r.credential_id),
      timeoutMs: CHALLENGE_SANIYE * 1000,
    };
  }

  async register(
    userId: string,
    body: { challenge?: string; clientDataJSON?: string; attestationObject?: string; label?: string }
  ): Promise<Passkey> {
    if (!body.challenge || !body.clientDataJSON || !body.attestationObject) {
      throw new BadRequestException("Geçiş anahtarı yanıtı eksik");
    }
    await this.challengeHarca(userId, "register", body.challenge);

    let anahtar;
    try {
      anahtar = kaydiDogrula({
        clientDataJSON: body.clientDataJSON,
        attestationObject: body.attestationObject,
        beklenenChallenge: body.challenge,
        izinliOriginler: this.izinliOriginler(),
        rpId: this.rpId(),
      });
    } catch (error) {
      // Doğrulama hataları kullanıcıya gösterilecek cümleler taşıyor
      // (webauthn.ts); 500 yerine 400 olarak geçiriyoruz.
      throw new BadRequestException((error as Error).message);
    }

    // BAŞKASININ ANAHTARI ÜZERİNE YAZILMAZ. credential_id tekil olduğu için
    // upsert, aynı kimliği taşıyan satırı kimin olduğuna bakmadan tazelerdi ve
    // kurbanın anahtarı sessizce silinmiş olurdu. Pratikte olması çok zor
    // (kimlik rastgele ve geçerli bir attestation gerekiyor), ama kontrolün
    // maliyeti bir sorgu.
    const { data: sahip } = await this.supabase.client
      .from("user_passkeys")
      .select("user_id")
      .eq("credential_id", anahtar.credentialId)
      .maybeSingle();
    if (sahip && sahip.user_id !== userId) {
      throw new BadRequestException("Bu geçiş anahtarı başka bir hesaba kayıtlı");
    }

    // Aynı cihaz yeniden kaydedilirse satır tazelenir: excludeCredentials'a
    // rağmen bu olabiliyor (kullanıcı anahtarı cihazdan silip yeniden ekler).
    const { data, error } = await this.supabase.client
      .from("user_passkeys")
      .upsert(
        {
          user_id: userId,
          credential_id: anahtar.credentialId,
          public_key: anahtar.spkiDer,
          algorithm: anahtar.algorithm,
          sign_count: anahtar.signCount,
          aaguid: anahtar.aaguid ?? null,
          label: body.label?.trim() || null,
        },
        { onConflict: "credential_id" }
      )
      .select("id, label, created_at, last_used_at")
      .single();
    if (error) throw error;

    return this.map(data);
  }

  // ============================================================ Liste

  async list(userId: string): Promise<Passkey[]> {
    const { data, error } = await this.supabase.client
      .from("user_passkeys")
      .select("id, label, created_at, last_used_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: any) => this.map(r));
  }

  async remove(id: string, userId: string): Promise<{ ok: true }> {
    // user_id koşulu ŞART: kimlik istemciden geliyor ve başka bir kullanıcının
    // anahtarını silmek, onu kilitten tamamen dışarıda bırakmak olurdu.
    const { data, error } = await this.supabase.client
      .from("user_passkeys")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id");
    if (error) throw error;
    if (!data?.length) throw new NotFoundException("Geçiş anahtarı bulunamadı");
    return { ok: true };
  }

  private map(row: any): Passkey {
    return {
      id: row.id,
      label: row.label ?? undefined,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at ?? undefined,
    };
  }

  // ============================================================ Kilit açma

  /**
   * Kilit açma seçenekleri.
   *
   * `allowCredentialIds` doldurulur (boş bırakılıp "keşfedilebilir anahtar"
   * akışına bırakılmaz): kullanıcı zaten oturum açmış, tarayıcıya hangi
   * cihazları tanıdığımızı söylemek seçim ekranını kısaltıyor.
   */
  async authOptions(userId: string): Promise<PasskeyAuthOptions> {
    const { data } = await this.supabase.client
      .from("user_passkeys")
      .select("credential_id")
      .eq("user_id", userId);
    if (!data?.length) {
      throw new BadRequestException("Kayıtlı geçiş anahtarınız yok. Ayarlar'dan bir cihaz ekleyin.");
    }

    return {
      challenge: await this.challengeUret(userId, "unlock"),
      rpId: this.rpId(),
      allowCredentialIds: data.map((r: any) => r.credential_id),
      timeoutMs: CHALLENGE_SANIYE * 1000,
    };
  }

  /**
   * Kilit açma yanıtını doğrular. Başarısızlıkta HATA ATAR, false dönmez:
   * çağıran tarafın sonucu kontrol etmeyi unutması, kilidi hiç koymamakla
   * aynı şey olurdu.
   */
  async assertionDogrula(
    userId: string,
    body: {
      challenge?: string;
      credentialId?: string;
      clientDataJSON?: string;
      authenticatorData?: string;
      signature?: string;
    }
  ): Promise<void> {
    if (!body.challenge || !body.credentialId || !body.clientDataJSON || !body.authenticatorData || !body.signature) {
      throw new BadRequestException("Geçiş anahtarı yanıtı eksik");
    }

    const { data: kayit } = await this.supabase.client
      .from("user_passkeys")
      .select("id, public_key, algorithm, sign_count")
      .eq("user_id", userId)
      .eq("credential_id", body.credentialId)
      .maybeSingle();
    // user_id koşulu burada da ŞART: doğrulama başka birinin anahtarıyla
    // yapılmış olsaydı imza geçerli çıkar ve kilit yanlış kişiye açılırdı.
    if (!kayit) throw new BadRequestException("Bu geçiş anahtarı hesabınıza kayıtlı değil");

    await this.challengeHarca(userId, "unlock", body.challenge);

    let sonuc;
    try {
      sonuc = imzayiDogrula({
        clientDataJSON: body.clientDataJSON,
        authenticatorData: body.authenticatorData,
        signature: body.signature,
        beklenenChallenge: body.challenge,
        izinliOriginler: this.izinliOriginler(),
        rpId: this.rpId(),
        spkiDer: kayit.public_key,
        algorithm: kayit.algorithm,
        kayitliSignCount: Number(kayit.sign_count ?? 0),
      });
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    await this.supabase.client
      .from("user_passkeys")
      .update({ sign_count: sonuc.signCount, last_used_at: new Date().toISOString() })
      .eq("id", kayit.id);
  }
}
