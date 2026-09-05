import { randomBytes, createHash } from "crypto";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { hashPassword } from "../../common/password.util";
import { SupabaseService } from "../../database/supabase.service";
import { istekDili } from "../../common/i18n";
import { UsersService, normalizeEmail } from "../users/users.service";
import { EmailService } from "./email.service";
import { getWebAppUrl } from "../../common/config/env";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 saat

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Veritabanından gelen zaman damgasını GÜVENLE Date'e çevirir.
 *
 * Bu projedeki tüm tablolar `timestamp` (saat dilimi BİLGİSİ OLMADAN) kullanıyor
 * — bkz. 001_init_schema.sql. Değerleri UTC olarak yazıyoruz, ama PostgREST bunları
 * "2026-08-09T12:00:00" gibi saat dilimi eki olmadan geri döndürüyor. JavaScript,
 * ek taşımayan böyle bir metni ŞARTNAME GEREĞİ yerel saat kabul eder. Türkiye'de
 * (UTC+3) bu, her okumada 3 saatlik bir kayma demek: 1 saat geçerli olan sıfırlama
 * bağlantısı, daha oluşturulduğu anda "süresi dolmuş" görünüyordu.
 *
 * Çözüm: saat dilimi eki yoksa değeri UTC olarak yorumla (sonuna "Z" ekle).
 */
function parseDbTimestamp(value: string): Date {
  const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasTimezone ? value : `${value}Z`);
}

// database/migrations/043_password_reset_tokens.sql çalıştırılmadan bu servis
// kullanılamaz — password_reset_tokens tablosu henüz yoksa insert/select hata verir.
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private supabase: SupabaseService,
    private usersService: UsersService,
    private emailService: EmailService
  ) {}

  // Her zaman "e-posta gönderildiyse..." gibi genel bir yanıtla biter (controller
  // tarafında) — burada kullanıcı bulunamazsa ya da hesap Google ile bağlıysa
  // (şifresi yoksa) sessizce çıkılır. Bu, "bu e-posta kayıtlı mı" sorusuna
  // kesin cevap vermemek için (hesap varlığı sızdırmama / enumeration önleme).
  async requestReset(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.passwordHash) return;

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

    const { error } = await this.supabase.client.from("password_reset_tokens").insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });
    if (error) throw error;

    const webAppUrl = getWebAppUrl();
    const resetUrl = `${webAppUrl}/reset-password?token=${token}`;
    // Şifresini sıfırlayan kullanıcının hesabı zaten var; dili oradan okunur.
    // Hiç seçim yapmamışsa (locale null) varsayılana düşülür — bu akışta
    // tarayıcı ipucu yok, istek giriş ekranından geliyor ve kullanıcının
    // hangi dili kullandığını yalnızca hesabı biliyor.
    await this.emailService.sendPasswordResetEmail(user.email, resetUrl, istekDili(user.locale));
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const { data: row, error } = await this.supabase.client
      .from("password_reset_tokens")
      .select("id, user_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error) throw error;

    // Reddetme sebebini logla: kullanıcıya (bilerek) hepsi için aynı genel mesajı
    // döndürüyoruz, ama bir sorun olduğunda sebebin sunucu tarafında görünür olması
    // gerekiyor — aksi halde "geçersiz bağlantı" hatasını teşhis etmek imkânsız.
    if (!row) {
      this.logger.warn("Şifre sıfırlama reddedildi: token veritabanında bulunamadı.");
      throw new BadRequestException("Sıfırlama bağlantısı geçersiz ya da süresi dolmuş. Yeniden isteyin.");
    }
    if (row.used_at) {
      this.logger.warn(`Şifre sıfırlama reddedildi: token daha önce kullanılmış (used_at=${row.used_at}).`);
      throw new BadRequestException("Sıfırlama bağlantısı geçersiz ya da süresi dolmuş. Yeniden isteyin.");
    }
    const expiresAt = parseDbTimestamp(row.expires_at);
    if (expiresAt < new Date()) {
      this.logger.warn(
        `Şifre sıfırlama reddedildi: süresi dolmuş (expires_at=${row.expires_at} -> ${expiresAt.toISOString()}, şimdi=${new Date().toISOString()}).`
      );
      throw new BadRequestException("Sıfırlama bağlantısı geçersiz ya da süresi dolmuş. Yeniden isteyin.");
    }

    const passwordHash = await hashPassword(newPassword);
    const { error: updateError } = await this.supabase.client
      .from("users")
      .update({ password_hash: passwordHash })
      .eq("id", row.user_id);
    if (updateError) throw updateError;

    // Bu kullanıcının bekleyen tüm token'larını iptal et — art arda birden fazla
    // "bağlantıyı tekrar gönder" denemesinden kalan eski linkler artık işe yaramasın.
    await this.supabase.client
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", row.user_id)
      .is("used_at", null);
  }
}
