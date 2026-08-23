import { randomBytes, createHash } from "crypto";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../../database/supabase.service";
import { UsersService, normalizeEmail } from "../users/users.service";
import { EmailService } from "./email.service";
import { getWebAppUrl } from "../../common/config/env";

// Şifre sıfırlamadan (1 saat) bilinçli olarak daha uzun: kullanıcı kaydolduktan
// sonra e-postasını hemen açmayabilir, ertesi gün dönebilir.
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Veritabanından gelen zaman damgasını güvenle Date'e çevirir.
 * Gerekçesi için bkz. password-reset.service.ts'teki aynı isimli fonksiyon
 * (kolonlar `timestamp` — saat dilimi eki taşımıyor, JS onları yerel saat sanıyor).
 */
function parseDbTimestamp(value: string): Date {
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasTimezone ? value : `${value}Z`);
}

/**
 * Kayıt sırasında e-posta doğrulaması.
 *
 * Akış: register → token üret + e-posta gönder → kullanıcı bağlantıya tıklar →
 * users.email_verified_at doldurulur → artık giriş yapabilir.
 *
 * bkz. database/migrations/044_email_verification.sql
 */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private supabase: SupabaseService,
    private usersService: UsersService,
    private emailService: EmailService
  ) {}

  /** Yeni bir doğrulama token'ı üretip kullanıcıya e-posta ile gönderir. */
  async sendVerification(userId: string, email: string): Promise<void> {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    const { error } = await this.supabase.client.from("email_verification_tokens").insert({
      user_id: userId,
      token_hash: hashToken(token),
      expires_at: expiresAt,
    });
    if (error) throw error;

    const webAppUrl = getWebAppUrl();
    await this.emailService.sendVerificationEmail(email, `${webAppUrl}/verify-email?token=${token}`);
  }

  /**
   * Bağlantıdaki token'ı doğrular ve hesabı aktifleştirir.
   *
   * Zaten doğrulanmış bir hesap için tekrar tıklanırsa hata vermez — kullanıcı
   * bağlantıya iki kez tıkladığında (ya da e-postayı sonra tekrar açtığında)
   * "geçersiz bağlantı" görmesi gereksiz bir korku yaratırdı.
   */
  async verify(token: string): Promise<{ alreadyVerified: boolean }> {
    const { data: row, error } = await this.supabase.client
      .from("email_verification_tokens")
      .select("id, user_id, expires_at, used_at")
      .eq("token_hash", hashToken(token))
      .maybeSingle();
    if (error) throw error;

    if (!row) {
      this.logger.warn("E-posta doğrulama reddedildi: token bulunamadı.");
      throw new BadRequestException("Doğrulama bağlantısı geçersiz. Yeni bir bağlantı isteyin.");
    }

    const user = await this.usersService.findById(row.user_id);
    if (user?.emailVerifiedAt) return { alreadyVerified: true };

    if (row.used_at) {
      this.logger.warn(`E-posta doğrulama reddedildi: token kullanılmış (used_at=${row.used_at}).`);
      throw new BadRequestException("Doğrulama bağlantısı geçersiz. Yeni bir bağlantı isteyin.");
    }

    const expiresAt = parseDbTimestamp(row.expires_at);
    if (expiresAt < new Date()) {
      this.logger.warn(`E-posta doğrulama reddedildi: süresi dolmuş (expires_at=${row.expires_at}).`);
      throw new BadRequestException("Doğrulama bağlantısının süresi dolmuş. Yeni bir bağlantı isteyin.");
    }

    const now = new Date().toISOString();
    const { error: updateError } = await this.supabase.client
      .from("users")
      .update({ email_verified_at: now })
      .eq("id", row.user_id);
    if (updateError) throw updateError;

    // Bu kullanıcının bekleyen tüm token'larını kapat (birden fazla kez
    // "tekrar gönder" denmişse eski bağlantılar işe yaramasın).
    await this.supabase.client
      .from("email_verification_tokens")
      .update({ used_at: now })
      .eq("user_id", row.user_id)
      .is("used_at", null);

    return { alreadyVerified: false };
  }

  /**
   * Doğrulama e-postasını yeniden gönderir.
   *
   * Şifre sıfırlamadaki gibi burada da hesabın var olup olmadığı sızdırılmaz:
   * kullanıcı yoksa ya da zaten doğrulanmışsa sessizce çıkılır, çağıran taraf
   * her durumda aynı genel mesajı döner.
   */
  async resend(rawEmail: string): Promise<void> {
    const user = await this.usersService.findByEmail(normalizeEmail(rawEmail));
    if (!user || user.emailVerifiedAt) return;
    await this.sendVerification(user.id, user.email);
  }
}
