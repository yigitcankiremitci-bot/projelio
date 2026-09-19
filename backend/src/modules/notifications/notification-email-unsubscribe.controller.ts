import { Controller, Get, Header, Logger, Post, Query } from "@nestjs/common";
import { isLocale } from "@projelio/shared";
import type { Locale } from "@projelio/shared";
import { cevirmen } from "../../common/i18n";
import { KullaniciDiliService } from "../../common/i18n/kullanici-dili.service";
import { epostaKabugu, MARKA } from "../auth/email-shell";
import { getWebAppUrl } from "../../common/config/env";
import { NotificationEmailPrefsService } from "./notification-email-prefs.service";
import { abonelikImzasiGecerliMi, type AbonelikTuru } from "./notification-email.abonelik";

/**
 * TEK TIK ABONELİĞİ BIRAK — kimlik doğrulaması YOK, imza var.
 *
 * NEDEN AYRI CONTROLLER: NotificationsController sınıf düzeyinde
 * `@UseGuards(AuthGuard("jwt"))` taşıyor ve bu uç tam tersini istiyor.
 * Metot bazında guard'ı delmek yerine ayrı bir dosya, "burası halka açık"
 * bilgisini dosyanın adına yazıyor.
 *
 * NEDEN VAR (yalnızca nezaket değil, TESLİM EDİLEBİLİRLİK):
 * Gmail ve Yahoo, düzenli e-posta gönderen sistemlerden `List-Unsubscribe` +
 * `List-Unsubscribe-Post` başlıklarını BEKLİYOR. Bu başlıkları taşımayan
 * gönderici "toplu posta ama çıkış yolu yok" sayılıyor ve doğrudan spam'e
 * düşüyor. Başlığın işaret ettiği adres de gerçekten çalışmalı: sağlayıcı
 * kullanıcı adına POST atar, 2xx beklemez ama hata dönen adres güveni düşürür.
 *
 * İKİ METOT, TEK İŞ:
 *   POST → sağlayıcının arka planda çağırdığı hâli (kullanıcı bir şey görmez)
 *   GET  → kullanıcının kendi tıkladığı hâli (küçük bir onay sayfası döner)
 * İkisi de AYNI şeyi yapıyor; GET'in yan etkisi olması alışılmadık ama burada
 * doğru: kullanıcı bağlantıya bastığında "kapatıldı" görmeli, ayrıca bir
 * düğmeye daha basmak zorunda kalmamalı.
 */
@Controller("notifications")
export class NotificationEmailUnsubscribeController {
  private readonly logger = new Logger(NotificationEmailUnsubscribeController.name);

  constructor(
    private prefs: NotificationEmailPrefsService,
    private diller: KullaniciDiliService
  ) {}

  @Post("eposta-kapat")
  async kapatPost(@Query("u") userId: string, @Query("i") imza: string) {
    const oldu = await this.kapat(userId, imza, "bildirim");
    return { ok: oldu };
  }

  @Get("eposta-kapat")
  @Header("Content-Type", "text/html; charset=utf-8")
  async kapatGet(@Query("u") userId: string, @Query("i") imza: string): Promise<string> {
    const oldu = await this.kapat(userId, imza, "bildirim");
    const locale: Locale = oldu ? await this.guvenliDil(userId) : "tr";
    return this.sayfa(locale, oldu, "bildirim");
  }

  /**
   * İpucu e-postalarının çıkışı — YALNIZCA ipuçlarını kapatır, bildirimler
   * sürer (bkz. ipucu-eposta.template.ts başlığı). Ayrı uç, çünkü imzası da
   * ayrı: biri diğerinin yerine kullanılamaz.
   */
  @Post("ipucu-kapat")
  async ipucuKapatPost(@Query("u") userId: string, @Query("i") imza: string) {
    const oldu = await this.kapat(userId, imza, "ipucu");
    return { ok: oldu };
  }

  @Get("ipucu-kapat")
  @Header("Content-Type", "text/html; charset=utf-8")
  async ipucuKapatGet(@Query("u") userId: string, @Query("i") imza: string): Promise<string> {
    const oldu = await this.kapat(userId, imza, "ipucu");
    const locale: Locale = oldu ? await this.guvenliDil(userId) : "tr";
    return this.sayfa(locale, oldu, "ipucu");
  }

  private async kapat(userId: unknown, imza: unknown, tur: AbonelikTuru): Promise<boolean> {
    if (typeof userId !== "string" || !abonelikImzasiGecerliMi(userId, imza, tur)) {
      // Geçersiz imzada BİLGİ SIZDIRMIYORUZ: "böyle bir kullanıcı yok" ile
      // "imza yanlış" ayrımı, adres uydurarak kullanıcı varlığı taramaya izin
      // verirdi. İkisi de aynı sayfayı görür.
      return false;
    }
    try {
      if (tur === "ipucu") await this.prefs.ipuclariniKapat(userId);
      else await this.prefs.hepsiniKapat(userId);
      this.logger.log(`${tur === "ipucu" ? "İpucu" : "Bildirim"} e-postaları tek tıkla kapatıldı: ${userId}`);
      return true;
    } catch (err) {
      this.logger.error(`Abonelik kapatılamadı (${userId}): ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }

  private async guvenliDil(userId: string): Promise<Locale> {
    try {
      const locale = await this.diller.diliniBul(userId);
      return isLocale(locale) ? locale : "tr";
    } catch {
      return "tr";
    }
  }

  private sayfa(locale: Locale, oldu: boolean, tur: AbonelikTuru): string {
    const t = cevirmen(locale);
    const ipucu = tur === "ipucu";
    const baslik = !oldu
      ? t("Bağlantı geçersiz")
      : ipucu
        ? t("İpucu e-postaları kapatıldı")
        : t("Bildirim e-postaların kapatıldı");
    const govde = !oldu
      ? t("Bu bağlantı artık geçerli değil. Ayarlar > Yardımcılar bölümünden tercihini kendin değiştirebilirsin.")
      : ipucu
        ? t(
            "Bundan sonra sana ipucu e-postası göndermeyeceğiz. Bildirim e-postaların bundan etkilenmedi; onları Ayarlar > Yardımcılar'dan yönetebilirsin."
          )
        : t(
            "Bundan sonra sana bildirim e-postası göndermeyeceğiz. Bildirimler uygulama içinde görünmeye devam edecek; fikrin değişirse Ayarlar > Yardımcılar'dan yeniden açabilirsin."
          );

    return epostaKabugu(
      locale,
      `          <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;color:${MARKA.yaziKoyu};">${baslik}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:${MARKA.yaziOrta};">${govde}</p>
          <p style="margin:0;">
            <a href="${getWebAppUrl()}/settings?sekme=yardimcilar"
               style="display:inline-block;background:${MARKA.yaziKoyu};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;font-weight:500;">
              ${t("Bildirim e-postası ayarları")}
            </a>
          </p>`
    );
  }
}
