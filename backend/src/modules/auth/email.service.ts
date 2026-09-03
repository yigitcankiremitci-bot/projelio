import { Injectable, Logger } from "@nestjs/common";
import { getWebAppUrl, isProduction } from "../../common/config/env";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * E-posta gönderimi için ince bir katman (Resend HTTP API).
 *
 * Neden ek paket yok: Resend'in resmi npm paketi yerine doğrudan HTTP API'sine
 * istek atıyoruz. Backend zaten Node 20+ istiyor (package.json > engines), orada
 * `fetch` global olarak var — yani yeni bir bağımlılık kurmadan çalışıyor.
 *
 * Sağlayıcı yapılandırılmamışsa (RESEND_API_KEY yok) uygulama patlamaz; bağlantı
 * sunucu loguna yazılır ve yerel geliştirmede oradan kopyalanabilir. Bu, projedeki
 * diğer opsiyonel entegrasyonlarla aynı desen (ör. VAPID anahtarları yoksa push
 * bildirimleri sessizce devre dışı kalıyor, bkz. notifications.service.ts).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  private readonly from = process.env.EMAIL_FROM?.trim() || "Projelio <onboarding@resend.dev>";

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    if (!this.apiKey) {
      this.logUndeliverable("şifre sıfırlama", to, resetUrl);
      return;
    }

    await this.send({
      to,
      subject: "Projelio şifre sıfırlama",
      html: passwordResetHtml(resetUrl),
      text: passwordResetText(resetUrl),
    });
  }

  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    if (!this.apiKey) {
      this.logUndeliverable("e-posta doğrulama", to, verifyUrl);
      return;
    }

    await this.send({
      to,
      subject: "Projelio hesabını doğrula",
      html: verificationHtml(verifyUrl),
      text: verificationText(verifyUrl),
    });
  }

  /**
   * Gönderim hatasında BİLEREK exception fırlatmıyoruz.
   *
   * Şifre sıfırlama uç noktası, bir e-postanın kayıtlı olup olmadığını
   * sızdırmamak için her durumda aynı yanıtı döndürmek zorunda (bkz.
   * PasswordResetService.requestReset). Buradan bir hata yükselirse istek 500'e
   * düşer ve "bu adres kayıtlı" bilgisi dolaylı olarak sızar. Bu yüzden hata
   * yalnızca (yüksek görünürlükte) loglanır.
   */
  /**
   * "Bu adresle zaten bir hesap var" bildirimi.
   *
   * NEDEN VAR: kayıt uç noktası, e-posta zaten kayıtlıyken de yeni kayıtla AYNI
   * yanıtı döndürüyor (hesap varlığını sızdırmamak için, bkz. AuthService.register).
   * O zaman gerçek sahibi bilgilendirmenin tek yolu bu e-posta. Aynı zamanda
   * kullanıcıya faydalı: adresini unutup tekrar kayıt olmaya çalışan kişi
   * "zaten hesabın var, giriş yap" bilgisini alıyor.
   */
  async sendExistingAccountNotice(to: string, loginUrl: string): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn(
        `E-posta sağlayıcısı yapılandırılmadı (RESEND_API_KEY yok) — ` +
          `"hesabın zaten var" bildirimi gönderilemedi. Alıcı: ${to}`
      );
      return;
    }

    await this.send({
      to,
      subject: "Projelio hesabın zaten var",
      html: existingAccountHtml(loginUrl),
      text: existingAccountText(loginUrl),
    });
  }

  /**
   * E-posta sağlayıcısı yapılandırılmadığında ne olduğunu bildirir.
   *
   * BAĞLANTI YALNIZCA GELİŞTİRMEDE YAZILIR. Bu bağlantılar tek kullanımlık
   * jeton taşıyor: şifre sıfırlama bağlantısını ele geçiren, hesabı ele geçirir.
   * Yerelde e-posta sağlayıcısı olmadan akışı denemenin tek yolu bu olduğu için
   * geliştirmede yazılıyor; üretimde log'lar Render arayüzünde durur ve oraya
   * bir hesap kurtarma jetonu düşmemeli.
   *
   * Üretimde bu satırı görüyorsan asıl sorun RESEND_API_KEY'in eksik olması:
   * kullanıcılar kayıt olamıyor (doğrulama şart) ve şifrelerini sıfırlayamıyor.
   */
  private logUndeliverable(kind: string, to: string, url: string): void {
    const base = `E-posta sağlayıcısı yapılandırılmadı (RESEND_API_KEY yok) — ${kind} bağlantısı gönderilemedi. Alıcı: ${to}`;
    this.logger.warn(isProduction() ? base : `${base}\nBağlantı: ${url}`);
  }

  /**
   * "Hesabın silinecek" bildirimi.
   *
   * Silme talebi alındığında gider. İki şey söylemesi şart: ne zaman kalıcı
   * olacağı ve nasıl geri dönüleceği. Kullanıcı bu e-postayı sakladığı sürece
   * fikrini değiştirme imkânı elinde kalıyor.
   */
  async sendAccountDeletionScheduled(to: string, purgeAt: Date, graceDays: number): Promise<void> {
    const tarih = purgeAt.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
    if (!this.apiKey) {
      this.logger.warn(`E-posta sağlayıcısı yapılandırılmadı — hesap silme bildirimi gönderilemedi. Alıcı: ${to}`);
      return;
    }

    await this.send({
      to,
      subject: "Projelio hesabın silinmek üzere",
      html: accountDeletionHtml(tarih, graceDays, getWebAppUrl()),
      text: accountDeletionText(tarih, graceDays, getWebAppUrl()),
    });
  }

  private async send(params: { to: string; subject: string; html: string; text: string }): Promise<void> {
    try {
      const response = await fetchWithTimeout(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.from,
          to: [params.to],
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        this.logger.error(
          `E-posta gönderilemedi (HTTP ${response.status}). Alıcı: ${params.to}. Sağlayıcı yanıtı: ${detail.slice(0, 500)}`
        );
        return;
      }

      this.logger.log(`E-posta gönderildi: ${params.to} — "${params.subject}"`);
    } catch (err) {
      this.logger.error(`E-posta gönderilirken ağ hatası. Alıcı: ${params.to}. Hata: ${String(err)}`);
    }
  }
}

/**
 * Ortak e-posta iskeleti. Tüm şablonlar bunu kullanır ki marka görünümü tek
 * yerden değişsin. Marka renkleri README'deki paletten: Slate Navy #3E4858,
 * Bronz Kehribar #C0813F.
 *
 * NOT: stiller bilerek satır içi (inline) — e-posta istemcilerinin çoğu
 * <style> bloklarını ve harici CSS'i yok sayar.
 */
function emailLayout(params: { heading: string; intro: string; ctaLabel: string; url: string; footer: string }): string {
  return `<!doctype html>
<html lang="tr">
  <body style="margin:0;padding:24px;background:#F4F5F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:14px;padding:32px;">
      <tr>
        <td>
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:#3E4858;">${params.heading}</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#5A6472;">${params.intro}</p>
          <p style="margin:0 0 24px;">
            <a href="${params.url}"
               style="display:inline-block;background:#3E4858;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:500;">
              ${params.ctaLabel}
            </a>
          </p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#8A929E;">
            Düğme çalışmazsa bu adresi tarayıcına yapıştırabilirsin:
          </p>
          <p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-all;color:#C0813F;">
            ${params.url}
          </p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#8A929E;border-top:1px solid #E6E8EC;padding-top:16px;">
            ${params.footer}
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function passwordResetHtml(resetUrl: string): string {
  return emailLayout({
    heading: "Şifreni sıfırla",
    intro:
      "Projelio hesabın için şifre sıfırlama talebinde bulunuldu. Yeni şifreni belirlemek " +
      "için aşağıdaki düğmeye tıkla. Bu bağlantı <strong>1 saat</strong> boyunca geçerli.",
    ctaLabel: "Yeni şifre belirle",
    url: resetUrl,
    footer: "Bu talebi sen yapmadıysan bu e-postayı yok sayabilirsin — şifren değişmeyecek.",
  });
}

// Düz metin sürümü: HTML göstermeyen istemciler için ve spam puanını düşürmek adına.
function passwordResetText(resetUrl: string): string {
  return [
    "Şifreni sıfırla",
    "",
    "Projelio hesabın için şifre sıfırlama talebinde bulunuldu.",
    "Yeni şifreni belirlemek için aşağıdaki adresi tarayıcına yapıştır:",
    "",
    resetUrl,
    "",
    "Bu bağlantı 1 saat boyunca geçerlidir.",
    "Bu talebi sen yapmadıysan bu e-postayı yok sayabilirsin — şifren değişmeyecek.",
  ].join("\n");
}

function verificationHtml(verifyUrl: string): string {
  return emailLayout({
    heading: "Hesabını doğrula",
    intro:
      "Projelio'ya hoş geldin! Hesabını kullanmaya başlamak için e-posta adresini " +
      "doğrulaman gerekiyor. Bu bağlantı <strong>24 saat</strong> boyunca geçerli.",
    ctaLabel: "E-postamı doğrula",
    url: verifyUrl,
    footer: "Bu hesabı sen açmadıysan bu e-postayı yok sayabilirsin.",
  });
}

function verificationText(verifyUrl: string): string {
  return [
    "Hesabını doğrula",
    "",
    "Projelio'ya hoş geldin! Hesabını kullanmaya başlamak için e-posta adresini doğrulaman gerekiyor.",
    "Aşağıdaki adresi tarayıcına yapıştır:",
    "",
    verifyUrl,
    "",
    "Bu bağlantı 24 saat boyunca geçerlidir.",
    "Bu hesabı sen açmadıysan bu e-postayı yok sayabilirsin.",
  ].join("\n");
}


function existingAccountHtml(loginUrl: string): string {
  return emailLayout({
    heading: "Bu adresle zaten bir hesabın var",
    intro:
      "Az önce bu e-posta adresiyle Projelio'da yeni bir hesap açılmaya çalışıldı. " +
      "Adres zaten kayıtlı olduğu için <strong>yeni bir hesap oluşturulmadı</strong> ve " +
      "mevcut hesabında hiçbir şey değişmedi.",
    ctaLabel: "Giriş yap",
    url: loginUrl,
    footer:
      "Şifreni hatırlamıyorsan giriş ekranındaki \"Şifremi unuttum\" ile sıfırlayabilirsin. " +
      "Bunu sen yapmadıysan bu e-postayı yok sayabilirsin.",
  });
}

function existingAccountText(loginUrl: string): string {
  return [
    "Bu adresle zaten bir hesabın var",
    "",
    "Az önce bu e-posta adresiyle Projelio'da yeni bir hesap açılmaya çalışıldı.",
    "Adres zaten kayıtlı olduğu için yeni bir hesap oluşturulmadı ve mevcut hesabında hiçbir şey değişmedi.",
    "",
    "Giriş yapmak için:",
    loginUrl,
    "",
    'Şifreni hatırlamıyorsan giriş ekranındaki "Şifremi unuttum" ile sıfırlayabilirsin.',
    "Bunu sen yapmadıysan bu e-postayı yok sayabilirsin.",
  ].join("\n");
}


function accountDeletionHtml(tarih: string, graceDays: number, loginUrl: string): string {
  return emailLayout({
    heading: "Hesabın silinmek üzere",
    intro:
      `Hesabını silme talebini aldık. Verilerin <strong>${graceDays} gün</strong> daha duracak ve ` +
      `<strong>${tarih}</strong> tarihinde kalıcı olarak silinecek.<br><br>` +
      "Fikrin değişirse bir şey yapmana gerek yok: bu tarihe kadar aynı e-posta ve şifreyle giriş yapman " +
      "yeterli, hesabın olduğu gibi geri açılır.",
    ctaLabel: "Giriş yap ve hesabımı geri al",
    url: `${loginUrl}/login`,
    footer:
      "Bu talebi sen yapmadıysan hemen giriş yap — girişin kendisi silme talebini iptal eder. " +
      "Tarih geçtikten sonra veriler geri getirilemez.",
  });
}

function accountDeletionText(tarih: string, graceDays: number, loginUrl: string): string {
  return [
    "Hesabın silinmek üzere",
    "",
    `Hesabını silme talebini aldık. Verilerin ${graceDays} gün daha duracak ve ${tarih} tarihinde kalıcı olarak silinecek.`,
    "",
    "Fikrin değişirse bir şey yapmana gerek yok: bu tarihe kadar aynı e-posta ve şifreyle giriş yapman yeterli.",
    `${loginUrl}/login`,
    "",
    "Bu talebi sen yapmadıysan hemen giriş yap — girişin kendisi silme talebini iptal eder.",
    "Tarih geçtikten sonra veriler geri getirilemez.",
  ].join("\n");
}
