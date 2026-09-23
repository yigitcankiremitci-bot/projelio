import { randomBytes, createHash } from "crypto";
import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { getWebAppUrl } from "../../common/config/env";
import { OTURUM_KARARI_MESAJI } from "../../common/hesap-durumu/oturum-engeli";
import { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";

/**
 * Doğrulamadan (24 saat) uzun: yönetici hesabı cuma akşamı açabilir, çalışan
 * e-postayı pazartesi açar. Bağlantı tek kullanımlık olduğu için uzun ömrün
 * bedeli düşük; yönetici gerekirse yenisini gönderir (eskiler o an kapanır).
 */
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const GECERSIZ = "Giriş bağlantısı geçersiz ya da süresi dolmuş. Yöneticinden yeni bir bağlantı iste ya da şifrenle giriş yap.";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Gerekçe: password-reset.service.ts'teki aynı adlı fonksiyon (timestamp sütunları ek taşımıyor). */
function parseDbTimestamp(value: string): Date {
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasTimezone ? value : `${value}Z`);
}

/**
 * E-postadaki tek kullanımlık giriş bağlantısı (bkz. migration 130).
 *
 * Ekip yöneticisinin açtığı hesaba giden e-postada bir "Hesabına gir" düğmesi
 * var; tıklayan kişi şifre sormadan içeri girer. Bağlantıya tıklamak AYNI
 * ZAMANDA adresin doğrulanmasıdır — e-postayı açabilen kişi adresin sahibidir,
 * doğrulama bağlantısının kanıtladığı şey de tam olarak bu.
 *
 * Şifre sıfırlama bağlantısıyla aynı güvenlik sözleşmesi: token düz
 * saklanmaz, tek kullanımlıktır, yenisi üretilince eskileri kapanır ve
 * reddetme sebebi yalnızca loga yazılır (kullanıcıya hep aynı mesaj).
 */
@Injectable()
export class GirisBaglantisiService {
  private readonly logger = new Logger(GirisBaglantisiService.name);

  constructor(
    private supabase: SupabaseService,
    private usersService: UsersService,
    private authService: AuthService
  ) {}

  /** Yeni bağlantı üretir; aynı kişiye ait kullanılmamış eski bağlantılar kapanır. */
  async olustur(userId: string, olusturanId: string): Promise<string> {
    const simdi = new Date().toISOString();
    await this.supabase.client
      .from("giris_baglantilari")
      .update({ used_at: simdi })
      .eq("user_id", userId)
      .is("used_at", null);

    const token = randomBytes(32).toString("hex");
    const { error } = await this.supabase.client.from("giris_baglantilari").insert({
      user_id: userId,
      token_hash: hashToken(token),
      expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
      created_by: olusturanId,
    });
    if (error) throw error;
    return `${getWebAppUrl()}/hesap-giris?token=${token}`;
  }

  /**
   * Bağlantıyı kullanır: oturum jetonu döner.
   *
   * Sıra önemli — askı ve silinme kontrolü token "kullanıldı" işaretlenmeden
   * ÖNCE: askıdaki bir hesabın bağlantısı yanarsa askı kalktığında kişi yeni
   * bağlantı istemek zorunda kalırdı.
   */
  async kullan(token: string): Promise<{ token: string; mustChangePassword: boolean }> {
    if (typeof token !== "string" || token.length < 32) throw new BadRequestException(GECERSIZ);

    const { data: row, error } = await this.supabase.client
      .from("giris_baglantilari")
      .select("id, user_id, expires_at, used_at")
      .eq("token_hash", hashToken(token))
      .maybeSingle();
    if (error) throw error;

    if (!row) {
      this.logger.warn("Giriş bağlantısı reddedildi: token bulunamadı.");
      throw new BadRequestException(GECERSIZ);
    }
    if (row.used_at) {
      this.logger.warn(`Giriş bağlantısı reddedildi: kullanılmış (used_at=${row.used_at}).`);
      throw new BadRequestException(GECERSIZ);
    }
    if (parseDbTimestamp(row.expires_at) < new Date()) {
      this.logger.warn(`Giriş bağlantısı reddedildi: süresi dolmuş (expires_at=${row.expires_at}).`);
      throw new BadRequestException(GECERSIZ);
    }

    const user = await this.usersService.findById(row.user_id);
    if (!user || user.deletedAt) {
      this.logger.warn(`Giriş bağlantısı reddedildi: hesap yok ya da silinmiş (${row.user_id}).`);
      throw new BadRequestException(GECERSIZ);
    }
    if (user.bannedAt) throw new ForbiddenException(OTURUM_KARARI_MESAJI.askida);

    // Koşullu güncelleme: aynı bağlantıya iki sekmeden aynı anda tıklanırsa
    // yalnızca biri geçer.
    const simdi = new Date().toISOString();
    const { data: yakalanan, error: kullanimHatasi } = await this.supabase.client
      .from("giris_baglantilari")
      .update({ used_at: simdi })
      .eq("id", row.id)
      .is("used_at", null)
      .select("id");
    if (kullanimHatasi) throw kullanimHatasi;
    if (!yakalanan?.length) throw new BadRequestException(GECERSIZ);

    if (!user.emailVerifiedAt) {
      const { error: dogrulamaHatasi } = await this.supabase.client
        .from("users")
        .update({ email_verified_at: simdi })
        .eq("id", user.id);
      if (dogrulamaHatasi) throw dogrulamaHatasi;
    }

    // Yöneticinin listesinde "giriş yaptı" görünsün; aynı zamanda artık yeni
    // bağlantı üretilemez (hesap kişinin kendisinin). Başarısızlığı girişi
    // bozmamalı.
    const { error: ilkGirisHatasi } = await this.supabase.client
      .from("ekip_hesaplari")
      .update({ ilk_giris_at: simdi })
      .eq("user_id", user.id)
      .is("ilk_giris_at", null);
    if (ilkGirisHatasi) this.logger.warn(`ilk_giris_at yazılamadı (${user.id}): ${ilkGirisHatasi.message}`);

    const { token: oturum } = this.authService.signToken(user.id, user.email, user.role);
    return { token: oturum, mustChangePassword: user.sifreDegistirmeli === true };
  }
}
