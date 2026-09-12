import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { ServiceUnlockMethod, ServiceUnlockResult } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { verifyPassword, wasteVerifyTime } from "../../common/password.util";
import { LoginAttemptService } from "../auth/login-attempt.service";
import { hesapKilitPayload, HESAP_KILIT_AMACI } from "./hesap-kilit-payload";
import { PasskeysService } from "../passkeys/passkeys.service";

/**
 * Hesap sırlarının kilidi.
 *
 * NEDEN OTURUM YETMİYOR: oturum jetonu 7 gün yaşıyor ve açık kalmış bir ekran
 * başkasının eline geçebiliyor. Bir şifre kasasında "ekran açıksa her şey
 * açık" kabul edilemez; kilit, sırrı GÖSTERME anında kimliği yeniden sorar.
 * Bu, tarayıcıdaki şifre yöneticilerinin ve 1Password gibi araçların da
 * yaptığı şey.
 *
 * İKİ YOL, TEK JETON:
 *   - Projelio hesap şifresi (bildiğin şey)
 *   - Geçiş anahtarı / WebAuthn (elinde olan cihaz + biyometri)
 * İkisi de aynı kısa ömürlü jetonu üretir; `reveal` uçları yalnızca jetonu
 * tanır. Böylece yeni bir yöntem eklemek (ör. TOTP) tek bir fonksiyon demek.
 *
 * JETON NEDEN VERİTABANINDA DEĞİL: kilidin ömrü dakikalarla ölçülüyor ve
 * imzalı bir jeton zaten "sunucu bunu üretti" garantisi veriyor. Tabloda
 * tutmak, her gösterimde bir yazma ve arkasından bir çöp toplama işi demekti.
 * Tek kullanımlık OLMASI da gerekmiyor: jeton kullanıcının KENDİ kilidi, beş
 * dakika içinde birkaç şifreye bakması olağan kullanım.
 */

/** Kilidin açık kaldığı süre. Kısa: ekran başıboş kalırsa kendiliğinden kapanır. */
const KILIT_SANIYE = 300;

/** Jetonun içindeki amaç alanı — oturum jetonu buraya geçemesin. */
const AMAC = HESAP_KILIT_AMACI;

@Injectable()
export class HesapKilitService {
  private supabase: SupabaseService;
  private jwt: JwtService;
  private passkeys: PasskeysService;

  /**
   * Kilit denemelerinin sayacı.
   *
   * AuthService'in kullandığı sınıfın ayrı bir örneği: sayaç kilit
   * denemelerine ait olmalı, kullanıcının giriş denemelerine karışmamalı
   * (yanlış kilit şifresi yüzünden uygulamaya girişin kilitlenmesi, bambaşka
   * bir şeyi bozmak olurdu). Sınıf bağımlılıksız olduğu için elle
   * örneklenebiliyor.
   */
  private denemeler = new LoginAttemptService();

  constructor(supabase: SupabaseService, jwt: JwtService, passkeys: PasskeysService) {
    this.supabase = supabase;
    this.jwt = jwt;
    this.passkeys = passkeys;
  }

  // ============================================================ Açma

  /**
   * Projelio hesap şifresiyle açar.
   *
   * Google ile kayıt olmuş kullanıcının şifresi YOK: ona "şifre yanlış" demek
   * hiç çıkamayacağı bir döngü olurdu, doğru yolu söylüyoruz.
   */
  async sifreyleAc(userId: string, sifre?: string): Promise<ServiceUnlockResult> {
    const anahtar = `kilit:${userId}`;
    this.denemeler.assertNotLocked(anahtar);

    if (!sifre) throw new BadRequestException("Şifrenizi girin");

    const { data: user } = await this.supabase.client
      .from("users")
      .select("password_hash")
      .eq("id", userId)
      .maybeSingle();

    if (user && !user.password_hash) {
      throw new BadRequestException(
        "Hesabınız Google ile oluşturulmuş, şifresi yok. Kilidi geçiş anahtarıyla açın: Ayarlar > Geçiş anahtarları."
      );
    }

    // Kullanıcı bulunamasa bile bcrypt kadar zaman harcanıyor (auth.login ile
    // aynı desen): yanıt süresi bir bilgi sızdırmasın.
    const dogru = user?.password_hash
      ? await verifyPassword(sifre, user.password_hash)
      : await wasteVerifyTime(sifre);

    if (!dogru) {
      this.denemeler.recordFailure(anahtar);
      throw new UnauthorizedException("Şifre yanlış");
    }

    this.denemeler.reset(anahtar);
    return this.jetonUret(userId, "password");
  }

  /**
   * Geçiş anahtarı için meydan okuma üretir.
   *
   * PasskeysService'e devrediliyor, kopyalanmıyor: kilit açmanın iki yolu var
   * ama geçiş anahtarı kuralı tek yerde kalmalı. Burada durmasının sebebi
   * arayüzün tek bir akış görmesi — "kilidi aç" ekranı yalnızca bu servisin
   * uçlarını tanıyor.
   */
  async gecisAnahtariSecenekleri(userId: string) {
    return this.passkeys.authOptions(userId);
  }

  /** Geçiş anahtarıyla açar. Doğrulama PasskeysService'te, tek kopya. */
  async gecisAnahtariylaAc(
    userId: string,
    body: {
      challenge?: string;
      credentialId?: string;
      clientDataJSON?: string;
      authenticatorData?: string;
      signature?: string;
    }
  ): Promise<ServiceUnlockResult> {
    await this.passkeys.assertionDogrula(userId, body);
    return this.jetonUret(userId, "passkey");
  }

  private jetonUret(userId: string, method: ServiceUnlockMethod): ServiceUnlockResult {
    return {
      token: this.jwt.sign(hesapKilitPayload(userId, method), { expiresIn: KILIT_SANIYE }),
      expiresInSeconds: KILIT_SANIYE,
      method,
    };
  }

  // ============================================================ Doğrulama

  /**
   * Jetonu doğrular ve hangi yöntemle açıldığını döner.
   *
   * `sub` kontrolü ŞART: başka bir kullanıcının açtığı kilit jetonu geçerli
   * imzalı olurdu. Amaç kontrolü de şart: oturum jetonu da aynı sırla
   * imzalanıyor ve o jetonu buraya vermek kilidi hiç açmadan geçmek olurdu.
   */
  dogrula(token: string | undefined, userId: string): ServiceUnlockMethod {
    if (!token) {
      throw new UnauthorizedException("Kilidi açın: şifrenizi girin ya da geçiş anahtarınızı kullanın.");
    }
    let yuk: { sub?: string; typ?: string; amac?: string; method?: ServiceUnlockMethod };
    try {
      yuk = this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException("Kilit süresi doldu. Yeniden açmanız gerekiyor.");
    }
    if (yuk.typ !== AMAC || yuk.amac !== AMAC || yuk.sub !== userId || !yuk.method) {
      throw new UnauthorizedException("Kilit doğrulanamadı. Yeniden açmanız gerekiyor.");
    }
    return yuk.method;
  }
}
