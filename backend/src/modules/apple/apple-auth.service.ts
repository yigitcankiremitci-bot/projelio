import { ForbiddenException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Locale } from "@projelio/shared";
import { OTURUM_KARARI_MESAJI } from "../../common/hesap-durumu/oturum-engeli";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";
import { SupabaseService } from "../../database/supabase.service";
import { nowInSeconds } from "../auth/session-payload";
import { AccountDeletionService } from "../users/account-deletion.service";
import { UsersService } from "../users/users.service";
import {
  AppleKimlikHatasi,
  appleKimliginiDogrula,
  jetonAnahtarKimligi,
  type AppleAnahtari,
  type AppleKimligi,
} from "./apple-kimlik";

const ANAHTAR_ADRESI = "https://appleid.apple.com/auth/keys";
/** Apple anahtarları seyrek değişir; her girişte indirmeye gerek yok. */
const ANAHTAR_OMRU_MS = 60 * 60 * 1000;

/**
 * Jetonun kime verildiği (aud): iPhone'daki yerel giriş penceresinde bu,
 * uygulamanın paket kimliğidir. Web'de "Apple ile giriş" eklenirse Services
 * ID'si de buraya virgülle eklenir (APPLE_ALICILAR).
 */
function izinliAlicilar(): string[] {
  const ham = process.env.APPLE_ALICILAR?.trim();
  return ham ? ham.split(",").map((a) => a.trim()).filter(Boolean) : ["app.projelio.mobile"];
}

@Injectable()
export class AppleAuthService {
  private readonly logger = new Logger(AppleAuthService.name);
  private anahtarlar: AppleAnahtari[] = [];
  private anahtarZamani = 0;

  constructor(
    private supabase: SupabaseService,
    private usersService: UsersService,
    private accountDeletionService: AccountDeletionService,
    private jwtService: JwtService
  ) {}

  /** Apple'ın açık anahtarları; `zorla` önbelleği atlar (yeni kid geldiğinde). */
  private async anahtarlariGetir(zorla = false): Promise<AppleAnahtari[]> {
    if (!zorla && this.anahtarlar.length && Date.now() - this.anahtarZamani < ANAHTAR_OMRU_MS) {
      return this.anahtarlar;
    }
    try {
      const yanit = await fetchWithTimeout(ANAHTAR_ADRESI, {}, 10_000);
      if (!yanit.ok) throw new Error(`HTTP ${yanit.status}`);
      const govde = (await yanit.json()) as { keys?: AppleAnahtari[] };
      if (!Array.isArray(govde.keys) || !govde.keys.length) throw new Error("anahtar listesi boş");
      this.anahtarlar = govde.keys;
      this.anahtarZamani = Date.now();
    } catch (e) {
      this.logger.warn(`Apple anahtarları indirilemedi: ${(e as Error).message}`);
      // Eski liste varsa onunla devam: Apple'a bir anlık ulaşılamaması herkesi
      // dışarıda bırakmasın.
      if (!this.anahtarlar.length) {
        throw new ServiceUnavailableException("Apple ile giriş şu an doğrulanamıyor. Lütfen biraz sonra tekrar dene.");
      }
    }
    return this.anahtarlar;
  }

  private async dogrula(jeton: string, hamNonce: string): Promise<AppleKimligi> {
    let anahtarlar = await this.anahtarlariGetir();
    const kid = jetonAnahtarKimligiGuvenli(jeton);
    // Apple anahtarlarını döndürdüyse önbellekte olmayan bir kid gelir.
    if (kid && !anahtarlar.some((a) => a.kid === kid)) anahtarlar = await this.anahtarlariGetir(true);
    try {
      return appleKimliginiDogrula(jeton, anahtarlar, { izinliAlicilar: izinliAlicilar(), hamNonce });
    } catch (e) {
      if (e instanceof AppleKimlikHatasi) {
        this.logger.warn(`Apple jetonu reddedildi: ${e.kod}`);
        throw new UnauthorizedException("Apple ile giriş doğrulanamadı. Lütfen tekrar dene.");
      }
      throw e;
    }
  }

  /**
   * Apple kimliğinden Projelio oturumu üretir. GoogleAuthService.loginWithGoogle
   * ile aynı üç durum:
   *   1. Bu apple_sub daha önce bağlanmış      -> o kullanıcıyla giriş
   *   2. Aynı e-postalı bir hesap var          -> Apple'ı o hesaba bağla
   *   3. Hiçbiri yok                           -> yeni kullanıcı
   *
   * (2) yalnızca Apple e-postayı doğrulanmış verdiyse. "E-postamı gizle"
   * seçen kişinin adresi yönlendirme adresidir; var olan hesabıyla eşleşmez
   * ve YENİ bir hesap açılır — bu Apple'ın tasarımı, kişi isterse girişte
   * e-postasını paylaşmayı seçer.
   *
   * `adSoyad` yalnızca İLK yetkilendirmede gelir (Apple sonra bir daha
   * göndermez); jetonun içinde değil, istemciden düz metin gelir, bu yüzden
   * yalnızca yeni hesabın adı olarak kullanılır.
   */
  async girisYap(
    jeton: string,
    hamNonce: string,
    adSoyad?: string,
    locale?: Locale
  ): Promise<{ token: string; isNewUser: boolean }> {
    const kimlik = await this.dogrula(jeton, hamNonce);

    const { data: kayitli, error } = await this.supabase.client
      .from("apple_hesaplari")
      .select("user_id")
      .eq("apple_sub", kimlik.sub)
      .maybeSingle();
    if (error) throw error;

    let userId: string;
    let isNewUser = false;

    if (kayitli) {
      userId = kayitli.user_id;
    } else {
      if (!kimlik.email) {
        throw new UnauthorizedException(
          "Apple e-posta adresini paylaşmadı. iPhone Ayarlar > Apple Hesabı > Apple ile giriş'ten Projelio'yu kaldırıp tekrar dene."
        );
      }
      const byEmail = await this.usersService.findByEmail(kimlik.email);
      if (byEmail) {
        if (!kimlik.emailVerified) {
          throw new UnauthorizedException("Apple e-postanı doğrulanmış olarak vermedi; bu e-postayla var olan hesaba bağlanamaz.");
        }
        userId = byEmail.id;
      } else {
        const ad = adSoyad?.trim().slice(0, 120);
        const created = await this.usersService.createFromSocialLogin({
          fullName: ad || kimlik.email.split("@")[0],
          email: kimlik.email,
          usernameSeed: kimlik.email.split("@")[0],
          locale,
          emailVerified: kimlik.emailVerified,
        });
        userId = created.id;
        isNewUser = true;
      }

      // Kullanıcının Apple kimliği tektir (user_id tekil). Başka bir Apple
      // kimliği zaten bağlıysa ekleme 23505 ile düşer — e-postası ele geçen
      // biri kendi Apple hesabını ikinci anahtar olarak takamasın.
      const { error: ekleHatasi } = await this.supabase.client.from("apple_hesaplari").insert({
        user_id: userId,
        apple_sub: kimlik.sub,
        email: kimlik.email,
        ozel_eposta: kimlik.ozelEposta,
      });
      if (ekleHatasi) {
        if ((ekleHatasi as any).code === "23505") {
          throw new UnauthorizedException("Bu Projelio hesabına zaten başka bir Apple hesabı bağlı.");
        }
        throw ekleHatasi;
      }
    }

    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException("Kullanıcı bulunamadı.");

    // Şifreli ve Google girişiyle aynı sıra: önce askı, sonra silme talebinin
    // geri alınması (bkz. GoogleAuthService.loginWithGoogle).
    if (user.bannedAt) throw new ForbiddenException(OTURUM_KARARI_MESAJI.askida);
    if (user.deletedAt) await this.accountDeletionService.restoreAccount(user.id);

    void this.supabase.client
      .from("apple_hesaplari")
      .update({ son_giris: new Date().toISOString() })
      .eq("user_id", userId)
      .then(
        () => undefined,
        () => undefined
      );

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      loginAt: nowInSeconds(),
    });
    return { token, isNewUser };
  }
}

/** Bozuk jetonda kid okunamazsa doğrulama zaten "bicim" ile düşer. */
function jetonAnahtarKimligiGuvenli(jeton: string): string | undefined {
  try {
    return jetonAnahtarKimligi(jeton);
  } catch {
    return undefined;
  }
}
