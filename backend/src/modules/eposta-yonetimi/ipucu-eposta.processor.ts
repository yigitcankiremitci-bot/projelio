import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { gercekEpostaMi, isLocale } from "@projelio/shared";
import type { Locale } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { EmailService } from "../auth/email.service";
import { getWebAppUrl } from "../../common/config/env";
import { demoEpostasiMi } from "../../common/demo-hesap";
import {
  BOS_DAMGALAR,
  NotificationEmailPrefsService,
  satiriCevir,
  VARSAYILAN_TERCIH,
  type TercihSatiri,
} from "../notifications/notification-email-prefs.service";
import { yerelAn } from "../notifications/notification-email.zaman";
import { ipucuKapatmaAdresi } from "../notifications/notification-email.abonelik";
import { ILK_IPUCU_BEKLEMESI_SAAT, ipucuKarari, siradakiIpucu, type EtkinIpucu } from "../notifications/ipucu.icerik";
import { ipucuEpostasiOlustur, ipucuMetni, type HazirMetin } from "../notifications/ipucu-eposta.template";
import { IpucuDeposuService } from "./ipucu-deposu.service";
import { EpostaAyarlariService } from "./eposta-ayarlari.service";
import { LioEpostaYazariService } from "./lio-eposta-yazari.service";

/**
 * Günlük "Projelio ipucu" e-postalarını gönderen işleyici (bkz. migration
 * 118-119, ipucu.icerik.ts).
 *
 * İpuçlarının listesi yöneticinin ayarlarıyla birleşik (IpucuDeposuService);
 * "Lio ile" işaretli ipucu her alıcıya Lio'nun yeniden yazdığı metinle gider.
 * Lio harcaması günlük tavanı (Admin > E-posta) aşarsa o gün kalan ipuçları
 * düz metinle gider — tur durmaz.
 *
 * ZAMANLAMA: kullanıcının günlük özet saatini kullanır. Tur, günlük özet
 * turuyla aynı dakikaya DÜŞMEZ (5-55/10): ikisi aynı anda çalışsaydı Resend'in
 * saniyedeki istek sınırını birlikte aşarlardı.
 */

const TUR_BASINA_EPOSTA = 40;
const GONDERIM_ARASI_MS = 600;
const KULLANICI_TAVANI = 2000;
/** "Kime ne gitti" kaydı bu büyüklükte parçalarla okunuyor (adres uzunluğu sınırı). */
const PARCA = 100;

interface Aday {
  userId: string;
  email: string;
  ad?: string;
  locale: Locale;
  hesapAcilis: Date | null;
  yonetici: boolean;
  tercih: TercihSatiri;
}

@Injectable()
export class IpucuEpostaProcessor {
  private readonly logger = new Logger(IpucuEpostaProcessor.name);
  /** Tur üst üste binmesin: iki tur aynı kişiye aynı ipucunu gönderirdi. */
  private calisiyor = false;

  constructor(
    private supabase: SupabaseService,
    private email: EmailService,
    private tercihler: NotificationEmailPrefsService,
    private depo: IpucuDeposuService,
    private ayarlar: EpostaAyarlariService,
    private lio: LioEpostaYazariService
  ) {}

  @Cron("5-55/10 * * * *")
  async tur() {
    if (this.calisiyor) return;
    this.calisiyor = true;
    const simdi = new Date();
    try {
      const ayar = await this.ayarlar.oku();
      if (!ayar.ipuclariAcik) return;
      const liste = await this.depo.liste();
      if (!liste.some((i) => i.aktif)) return;

      // Önce veritabanına sormadan elenebilenler (saat, gün, kapalı, yeni
      // hesap); "kime ne gitti" kaydı yalnızca kalanlar için okunuyor.
      const onAdaylar = (await this.adaylar()).filter((a) => {
        const { gun, saat } = yerelAn(simdi, a.tercih.timezone);
        if (a.tercih.lastTipOn === gun || saat < a.tercih.dailyHour) return false;
        if (!a.hesapAcilis) return false;
        return simdi.getTime() - a.hesapAcilis.getTime() >= ILK_IPUCU_BEKLEMESI_SAAT * 3_600_000;
      });
      if (onAdaylar.length === 0) return;
      const gonderilenler = await this.gonderilenler(onAdaylar.map((a) => a.userId));

      let lioHarcamasi = ayar.lioGunlukTavanBirim != null ? await this.lio.bugunkuHarcama("ipucu") : 0;
      let gonderilen = 0;
      for (const aday of onAdaylar) {
        const { gun, saat } = yerelAn(simdi, aday.tercih.timezone);
        const karar = ipucuKarari({
          simdi,
          hesapAcilis: aday.hesapAcilis,
          acik: aday.tercih.tipsEnabled,
          liste,
          gonderilenler: gonderilenler.get(aday.userId) ?? new Set(),
          sonIpucuGunu: aday.tercih.lastTipOn,
          bugun: gun,
          yerelSaat: saat,
          gunlukSaat: aday.tercih.dailyHour,
          yasSiniriYok: aday.yonetici,
        });
        if (!karar.gonder) continue;
        if (gonderilen >= TUR_BASINA_EPOSTA) {
          this.logger.warn(`İpucu turu tavana dayandı (${TUR_BASINA_EPOSTA}); kalanlar sonraki turda.`);
          break;
        }

        const tavanAsildi = ayar.lioGunlukTavanBirim != null && lioHarcamasi >= ayar.lioGunlukTavanBirim;
        let metin: HazirMetin | undefined;
        if (karar.ipucu.lioIle && !tavanAsildi) {
          const yazim = await this.lio.kisisellestir({
            taslak: ipucuMetni(aday.locale, karar.ipucu),
            aliciId: aday.userId,
            islem: "ipucu",
            ipucuAnahtari: karar.ipucu.anahtar,
          });
          if (yazim) {
            metin = yazim.metin;
            lioHarcamasi += yazim.birim;
          }
        }

        const gitti = await this.email.sendPrepared(
          aday.email,
          ipucuEpostasiOlustur({
            locale: aday.locale,
            ipucu: karar.ipucu,
            metin,
            sira: karar.sira,
            toplam: karar.toplam,
            webUrl: getWebAppUrl(),
            ad: aday.ad,
            abonelikAdresi: ipucuKapatmaAdresi(aday.userId),
          })
        );
        // Kayıt yalnızca gönderim BAŞARILIYSA: sağlayıcı hata verdiğinde
        // ipucunu "gitti" saymak, onu sessizce atlamak demekti.
        if (!gitti) continue;
        await this.kaydet(aday.userId, karar.ipucu, gun, Boolean(metin));
        gonderilen += 1;
        await bekle(GONDERIM_ARASI_MS);
      }
    } catch (err) {
      this.logger.error(`İpucu e-postası turu düştü: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.calisiyor = false;
    }
  }

  /**
   * Belirli (ya da sıradaki) ipucunu bir kullanıcıya HEMEN gönderir; kaydı
   * ilerletmez. İki kullanıcısı var: kullanıcının "Örnek ipucu gönder"
   * düğmesi ve yöneticinin panelden kendine deneme göndermesi. Saat, yaş ve
   * "bugün gitti mi" kuralları uygulanmaz — kişi bilerek istiyor.
   */
  async denemeGonder(userId: string, anahtar?: string): Promise<{ sent: boolean; lio: boolean }> {
    const { data: row } = await this.supabase.client
      .from("users")
      .select("id, email, full_name, locale, email_verified_at")
      .eq("id", userId)
      .maybeSingle();
    if (!row?.email || !row.email_verified_at) return { sent: false, lio: false };
    const liste = await this.depo.liste();
    const locale: Locale = isLocale(row.locale) ? row.locale : "tr";
    let secim: { ipucu: EtkinIpucu; sira: number; toplam: number } | null;
    if (anahtar) {
      const aktifler = liste.filter((i) => i.aktif);
      const ipucu = liste.find((i) => i.anahtar === anahtar);
      if (!ipucu) return { sent: false, lio: false };
      const index = aktifler.findIndex((i) => i.anahtar === anahtar);
      secim = { ipucu, sira: index >= 0 ? index + 1 : 1, toplam: Math.max(aktifler.length, 1) };
    } else {
      const gonderilenler = (await this.gonderilenler([userId])).get(userId) ?? new Set<string>();
      secim = siradakiIpucu(liste, gonderilenler) ?? siradakiIpucu(liste, new Set());
    }
    if (!secim) return { sent: false, lio: false };

    let metin: HazirMetin | undefined;
    if (secim.ipucu.lioIle) {
      const yazim = await this.lio.kisisellestir({
        taslak: ipucuMetni(locale, secim.ipucu),
        aliciId: userId,
        islem: "onizleme",
        ipucuAnahtari: secim.ipucu.anahtar,
        adminId: anahtar ? userId : undefined,
      });
      metin = yazim?.metin;
    }
    const sent = await this.email.sendPrepared(
      row.email,
      ipucuEpostasiOlustur({
        locale,
        ipucu: secim.ipucu,
        metin,
        sira: secim.sira,
        toplam: secim.toplam,
        webUrl: getWebAppUrl(),
        ad: typeof row.full_name === "string" && row.full_name.trim() ? row.full_name.trim() : undefined,
        abonelikAdresi: ipucuKapatmaAdresi(userId),
      })
    );
    return { sent, lio: Boolean(metin) };
  }

  private async kaydet(userId: string, ipucu: EtkinIpucu, gun: string, lio: boolean): Promise<void> {
    // İkisi de düşerse bir sonraki tur aynı ipucunu yeniden gönderir. Bunu
    // kabul ediyoruz: kaybetmektense iki kez göndermek daha az zararlı.
    const { error } = await this.supabase.client
      .from("ipucu_gonderimleri")
      .upsert({ user_id: userId, ipucu_anahtari: ipucu.anahtar, lio_ile: lio }, { onConflict: "user_id,ipucu_anahtari" });
    if (error) this.logger.warn(`İpucu gönderimi kaydedilemedi (${userId}): ${error.message}`);
    try {
      await this.tercihler.ipucuGunuDamgala(userId, gun);
    } catch (err) {
      this.logger.warn(`İpucu günü damgalanamadı (${userId}): ${err instanceof Error ? err.message : err}`);
    }
  }

  private async gonderilenler(userIds: string[]): Promise<Map<string, Set<string>>> {
    const sonuc = new Map<string, Set<string>>();
    for (let i = 0; i < userIds.length; i += PARCA) {
      const { data, error } = await this.supabase.client
        .from("ipucu_gonderimleri")
        .select("user_id, ipucu_anahtari")
        .in("user_id", userIds.slice(i, i + PARCA))
        .limit(PARCA * 100);
      if (error) throw error;
      for (const r of data ?? []) {
        const kume = sonuc.get(r.user_id) ?? new Set<string>();
        kume.add(r.ipucu_anahtari);
        sonuc.set(r.user_id, kume);
      }
    }
    return sonuc;
  }

  /**
   * Gönderilebilir adresi olan, ipuçlarını kapatmamış kullanıcılar. Satırı
   * olmayan da aday (varsayılan AÇIK). Süzme sorguda değil kodda: gömülü
   * ilişki üzerinde süzmek PostgREST'te satırı düşürmüyor, ilişkiyi boşaltıyor.
   */
  private async adaylar(): Promise<Aday[]> {
    const { data, error } = await this.supabase.client
      .from("users")
      .select("id, email, full_name, locale, role, email_verified_at, deleted_at, created_at, notification_email_prefs(*)")
      .is("deleted_at", null)
      .limit(KULLANICI_TAVANI);
    if (error) throw error;
    const satirlar = data ?? [];
    if (satirlar.length >= KULLANICI_TAVANI) {
      this.logger.warn(`İpucu taraması ${KULLANICI_TAVANI} kullanıcı tavanına dayandı — imleçli okumaya geçilmeli.`);
    }
    const adaylar: Aday[] = [];
    for (const row of satirlar as any[]) {
      // Gerçek olmayan adres (.test, .invalid, example.com) de elenir: ilk
      // turda security-test-b@projelio.test'e ipucu gitti — geri dönen her
      // e-posta gönderen itibarını düşürüyor.
      if (!row.email || !row.email_verified_at || demoEpostasiMi(row.email) || !gercekEpostaMi(row.email)) continue;
      const ham = Array.isArray(row.notification_email_prefs)
        ? row.notification_email_prefs[0]
        : row.notification_email_prefs;
      const tercih: TercihSatiri = ham
        ? satiriCevir({ ...ham, user_id: row.id })
        : { ...VARSAYILAN_TERCIH, userId: row.id, ...BOS_DAMGALAR };
      if (!tercih.tipsEnabled) continue;
      adaylar.push({
        userId: row.id,
        email: row.email,
        ad: typeof row.full_name === "string" && row.full_name.trim() ? row.full_name.trim() : undefined,
        locale: isLocale(row.locale) ? row.locale : "tr",
        hesapAcilis: zamanDamgasi(row.created_at),
        yonetici: row.role === "admin",
        tercih,
      });
    }
    return adaylar;
  }
}

/**
 * `timestamp` (saat dilimsiz) kolonu PostgREST'ten "2026-09-19T10:00:00"
 * biçiminde geliyor; Node bunu YEREL saat sanar. Veritabanı UTC yazıyor.
 */
export function zamanDamgasi(deger: unknown): Date | null {
  if (typeof deger !== "string" || !deger) return null;
  const dilimli = /[zZ]|[+-]\d{2}:?\d{2}$/.test(deger) ? deger : `${deger}Z`;
  const tarih = new Date(dilimli);
  return Number.isNaN(tarih.getTime()) ? null : tarih;
}

function bekle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
