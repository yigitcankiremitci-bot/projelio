import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { Locale } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { EmailService } from "../auth/email.service";
import { getWebAppUrl } from "../../common/config/env";
import { demoEpostasiMi } from "../../common/demo-hesap";
import { isLocale } from "@projelio/shared";
import {
  NotificationEmailPrefsService,
  satiriCevir,
  VARSAYILAN_TERCIH,
  type TercihSatiri,
} from "./notification-email-prefs.service";
import { bildirimEpostasiOlustur, type EpostaBildirimi, type EpostaGorevi } from "./notification-email.template";
import { gunlukOzetSirasiGeldiMi, yerelAn } from "./notification-email.zaman";
import { abonelikKapatmaAdresi } from "./notification-email.abonelik";

/**
 * Bildirimleri e-posta olarak gönderen işleyici (bkz. migration 102).
 *
 * İKİ TUR, TEK DOSYA: "anlık" ve "günlük" aynı veriyi aynı şablonla gönderiyor,
 * yalnızca ne zaman ateşlendikleri farklı. Ayrı dosyalara bölmek, gönderim ve
 * damgalama mantığını ikiye kopyalamak demekti.
 *
 * HİÇBİR TUR HATA FIRLATMAZ: tek bir kullanıcının bozuk verisi ya da
 * sağlayıcıdan dönen bir hata, aynı turdaki diğer kullanıcıların özetini
 * kaybettirmemeli. Hatalar loglanır, tur devam eder.
 */

/** Bir turda en çok kaç e-posta. Resend'in varsayılan hız sınırı ~2 istek/sn. */
const TUR_BASINA_EPOSTA = 40;

/** İki gönderim arası bekleme — sağlayıcının hız sınırına çarpmamak için. */
const GONDERIM_ARASI_MS = 600;

/**
 * Bir e-postada en fazla kaç bildirim taşınır. Şablon zaten 12'den sonrasını
 * "ve N tane daha" diye özetliyor; buradaki sınır sorgunun tavanı.
 */
const BILDIRIM_TAVANI = 60;

/**
 * Kaç kullanıcı taranır. Gerçek sayfalama yok (bkz. common/liste-tavani.ts);
 * bu tavan yalnızca kopmayı önlüyor. Tavana DAYANILDIĞI loglanıyor: o satırı
 * görürsen tarama artık imleçli (keyset) okumak istiyor demektir.
 */
const KULLANICI_TAVANI = 2000;

/** Su seviyesi yoksa en fazla bu kadar geriye bakılır. */
const EN_FAZLA_GERIYE_MS = 3 * 24 * 60 * 60 * 1000;

const TERCIH_KOLONLARI =
  "user_id, instant_enabled, daily_enabled, daily_hour, timezone, include_tasks, last_instant_at, last_digest_at, last_digest_on";

/** Görev + hangi takvim gününe ait olduğu (yerel gün süzmesi için). */
interface GunlukGorev extends EpostaGorevi {
  gun: string;
}

interface Alici {
  userId: string;
  email: string;
  ad?: string;
  locale: Locale;
  tercih: TercihSatiri;
}

@Injectable()
export class NotificationEmailProcessor {
  private readonly logger = new Logger(NotificationEmailProcessor.name);
  /**
   * Tur üst üste binmesin. Aynı koruma deadline-reminder'da da var; oradaki
   * gerekçe burada daha da kritik: iki tur aynı "su seviyesinin üstündeki"
   * bildirimleri görür ve AYNI E-POSTA İKİ KEZ gider.
   */
  private anlikCalisiyor = false;
  private gunlukCalisiyor = false;

  constructor(
    private supabase: SupabaseService,
    private email: EmailService,
    private tercihler: NotificationEmailPrefsService
  ) {}

  // ────────────────────────────────────────────────────────── Anlık tur

  /**
   * Her 3 dakikada bir: "anlık" seçen kullanıcıların yeni bildirimlerini
   * TEK e-postada toplayıp gönderir.
   *
   * Neden bildirim üretilirken değil de kuyrukla: notifyUser'ın içinden
   * e-posta göndermek, görev atamayı Resend'in yanıt süresine bağlardı ve
   * arka arkaya 10 bildirim alan kullanıcıya 10 ayrı e-posta giderdi.
   */
  @Cron("*/3 * * * *")
  async anlikTur() {
    if (this.anlikCalisiyor) return;
    this.anlikCalisiyor = true;
    const taramaAni = new Date();
    try {
      const satirlar = await this.anlikAdaylar();
      if (satirlar.length === 0) return;

      const aliciMap = await this.aliciBilgileri(satirlar);
      let gonderilen = 0;

      for (const alici of aliciMap) {
        if (gonderilen >= TUR_BASINA_EPOSTA) {
          this.logger.warn(`Anlık tur tavana dayandı (${TUR_BASINA_EPOSTA}); kalanlar sonraki turda.`);
          break;
        }
        const bildirimler = await this.yeniBildirimler(alici, taramaAni, "anlik");
        if (bildirimler.length === 0) continue;

        const gitti = await this.gonder(alici, "anlik", bildirimler, []);
        // Damga yalnızca gönderim BAŞARILIYSA ilerler: sağlayıcı hata
        // verdiğinde su seviyesini yükseltmek, o bildirimleri sessizce
        // yutmak demekti.
        if (gitti) {
          await this.damgalaSessiz(alici.userId, { taramaAni, kanal: "anlik" });
          gonderilen += 1;
          await bekle(GONDERIM_ARASI_MS);
        }
      }
    } catch (err) {
      this.logger.error(`Anlık bildirim e-postası turu düştü: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.anlikCalisiyor = false;
    }
  }

  // ────────────────────────────────────────────────────────── Günlük tur

  /**
   * Her 10 dakikada bir bakar, kimin YEREL saati geldiyse ona günlük özeti
   * gönderir.
   *
   * Neden sabit bir saatte tek tur değil: "her gün 09:00" kullanıcının saat
   * diliminde 09:00 demek. Sunucu saatinde tek bir Cron, Almanya'daki
   * kullanıcıya 08:00'de, Kaliforniya'dakine gece 23:00'te gönderirdi.
   * 10 dakikalık ızgara yarım saatlik ofsetleri de (Asia/Kolkata) kapsıyor.
   */
  @Cron("*/10 * * * *")
  async gunlukTur() {
    if (this.gunlukCalisiyor) return;
    this.gunlukCalisiyor = true;
    const taramaAni = new Date();
    try {
      const alicilar = await this.gunlukAdaylar();
      if (alicilar.length === 0) return;

      // Görevler TEK sorguda çekilip kullanıcıya göre dağıtılıyor: alıcı başına
      // ayrı sorgu, 500 kişilik bir turda 500 gidiş-dönüş demekti.
      const gorevler = await this.bugunkuGorevler(alicilar.map((a) => a.userId));
      let gonderilen = 0;

      for (const alici of alicilar) {
        const { gonder, gun } = gunlukOzetSirasiGeldiMi({
          simdi: taramaAni,
          timezone: alici.tercih.timezone,
          dailyHour: alici.tercih.dailyHour,
          sonOzetGunu: alici.tercih.lastDigestOn,
        });
        if (!gonder) continue;

        if (gonderilen >= TUR_BASINA_EPOSTA) {
          this.logger.warn(`Günlük tur tavana dayandı (${TUR_BASINA_EPOSTA}); kalanlar sonraki turda.`);
          break;
        }

        const bildirimler = await this.yeniBildirimler(alici, taramaAni, "gunluk");
        const gunlukGorevler = alici.tercih.includeTasks ? (gorevler.get(alici.userId) ?? []) : [];

        if (bildirimler.length === 0 && gunlukGorevler.length === 0) {
          // Söyleyecek bir şey yok: e-posta gönderme ama GÜNÜ DAMGALA, yoksa
          // bu kullanıcı gün boyu her 10 dakikada bir yeniden sorgulanırdı.
          await this.damgalaSessiz(alici.userId, { taramaAni, kanal: "gunluk", ozetGunu: gun });
          continue;
        }

        const gitti = await this.gonder(alici, "gunluk", bildirimler, gunlukGorevler);
        if (gitti) {
          await this.damgalaSessiz(alici.userId, { taramaAni, kanal: "gunluk", ozetGunu: gun });
          gonderilen += 1;
          await bekle(GONDERIM_ARASI_MS);
        }
      }
    } catch (err) {
      this.logger.error(`Günlük bildirim e-postası turu düştü: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.gunlukCalisiyor = false;
    }
  }

  // ────────────────────────────────────────────────────────── Ortak

  /**
   * Kullanıcıya tek bir örnek e-posta gönderir ("Deneme e-postası gönder").
   *
   * NEDEN VAR: bu özelliğin tek başarısızlık biçimi SESSİZ olması — e-posta
   * spam'e düşer, adres yanlıştır, sağlayıcı kapalıdır ve kullanıcı bunu
   * ancak "hiç e-posta gelmiyor" diye fark eder. Deneme düğmesi kurulumu
   * saniyeler içinde doğrulatıyor. Su seviyesini İLERLETMEZ: deneme, gerçek
   * özetin içeriğini tüketmemeli.
   */
  async denemeGonder(userId: string): Promise<{ sent: boolean }> {
    // Kullanıcının GERÇEK tercihi okunuyor (varsayılan değil): deneme, saat
    // dilimi ve "görevler de gelsin" ayarı dahil gerçek e-postanın aynısı
    // olmalı — yoksa denemesi çalışıp asıl özeti yanlış saatte gelirdi.
    const tercih = await this.tercihler.findForUser(userId);
    const alicilar = await this.aliciBilgileri([
      { ...tercih, userId, lastInstantAt: null, lastDigestAt: null, lastDigestOn: null },
    ]);
    const alici = alicilar[0];
    if (!alici) return { sent: false };

    const bildirimler = await this.yeniBildirimler(alici, new Date(), "gunluk");
    const gorevler = tercih.includeTasks ? await this.bugunkuGorevler([userId]) : new Map<string, GunlukGorev[]>();
    const ornek: EpostaBildirimi[] =
      bildirimler.length > 0
        ? bildirimler
        : [
            {
              baslik: "Deneme bildirimi",
              govde: "Bildirim e-postaların çalışıyor. Gerçek bildirimlerin de bu biçimde gelecek.",
              link: "/",
            },
          ];
    const gitti = await this.gonder(alici, "gunluk", ornek, gorevler.get(userId) ?? []);
    return { sent: gitti };
  }

  /**
   * Anlık kanal adayları.
   *
   * Burada "satırı olmayan kullanıcı" aranmıyor, günlük turun aksine: anlık
   * kanalın varsayılanı KAPALI, yani açmak için satır yazılmış olması şart.
   */
  private async anlikAdaylar(): Promise<TercihSatiri[]> {
    const { data, error } = await this.supabase.client
      .from("notification_email_prefs")
      .select(TERCIH_KOLONLARI)
      .eq("instant_enabled", true)
      .limit(KULLANICI_TAVANI);
    if (error) throw error;
    return (data ?? []).map(satiriCevir);
  }

  /**
   * Günlük özet adayları: günlüğü açık olanlar VE hiç tercihi olmayanlar.
   *
   * İkincisi şart — varsayılan açık ve satır ancak ilk gönderimde/kayıtta
   * oluşuyor (bkz. migration 102 başlığı). Yalnızca satırı olanlara baksaydık,
   * tabloya hiç dokunmamış kullanıcı hiçbir zaman e-posta almazdı.
   */
  private async gunlukAdaylar(): Promise<Alici[]> {
    const { data, error } = await this.supabase.client
      .from("users")
      .select("id, email, full_name, locale, email_verified_at, deleted_at, notification_email_prefs(*)")
      .is("deleted_at", null)
      .limit(KULLANICI_TAVANI);
    if (error) throw error;
    const satirlar = data ?? [];
    if (satirlar.length >= KULLANICI_TAVANI) {
      this.logger.warn(
        `Günlük e-posta taraması ${KULLANICI_TAVANI} kullanıcı tavanına dayandı — imleçli okumaya geçilmeli.`
      );
    }

    const alicilar: Alici[] = [];
    for (const row of satirlar) {
      // PostgREST tekil ilişkiyi ortama göre nesne ya da tek elemanlı dizi
      // olarak döndürebiliyor; ikisini de karşılıyoruz.
      const ham = Array.isArray((row as any).notification_email_prefs)
        ? (row as any).notification_email_prefs[0]
        : (row as any).notification_email_prefs;
      const tercih: TercihSatiri = ham
        ? satiriCevir({ ...ham, user_id: row.id })
        : { ...VARSAYILAN_TERCIH, userId: row.id, lastInstantAt: null, lastDigestAt: null, lastDigestOn: null };
      if (!tercih.dailyEnabled) continue;
      const alici = this.aliciYap(row, tercih);
      if (alici) alicilar.push(alici);
    }
    return alicilar;
  }

  /** Tercih satırlarını e-posta/ad/dil bilgisiyle tamamlar. */
  private async aliciBilgileri(satirlar: TercihSatiri[]): Promise<Alici[]> {
    if (satirlar.length === 0) return [];
    const { data, error } = await this.supabase.client
      .from("users")
      .select("id, email, full_name, locale, email_verified_at, deleted_at")
      .in(
        "id",
        satirlar.map((s) => s.userId)
      );
    if (error) throw error;

    const kullanicilar = new Map((data ?? []).map((row: any) => [row.id, row]));
    const alicilar: Alici[] = [];
    for (const tercih of satirlar) {
      const row = kullanicilar.get(tercih.userId);
      if (!row) continue;
      const alici = this.aliciYap(row, tercih);
      if (alici) alicilar.push(alici);
    }
    return alicilar;
  }

  /**
   * Gönderilebilir alıcı mı?
   *
   * DOĞRULANMAMIŞ ADRESE GÖNDERİLMEZ: doğrulanmamış adres ya yanlış yazılmış
   * ya da başkasının — ikisinde de düzenli e-posta göndermek şikâyet ve kara
   * liste demek. Silinmek üzere olan hesap ve demo hesabı da dışarıda
   * (demo adresi @celikhan.test, gerçek değil — bkz. common/demo-hesap.ts).
   */
  private aliciYap(row: any, tercih: TercihSatiri): Alici | null {
    if (row.deleted_at) return null;
    if (!row.email || !row.email_verified_at) return null;
    if (demoEpostasiMi(row.email)) return null;
    return {
      userId: row.id,
      email: row.email,
      ad: typeof row.full_name === "string" && row.full_name.trim() ? row.full_name.trim() : undefined,
      locale: isLocale(row.locale) ? row.locale : "tr",
      tercih,
    };
  }

  /**
   * Pencerenin üstündeki okunmamış bildirimler, eskiden yeniye.
   *
   * HER KANALIN KENDİ PENCERESİ VAR (bkz. migration 103). İkisi tek bir su
   * seviyesini paylaşsaydı, iki kanal birden açık olan kullanıcıda anlık
   * gönderim seviyeyi ilerletir ve akşamki günlük özet BOŞ çıkardı — oysa
   * özetin işi tam da gün içinde olanı tekrar toparlamak.
   */
  private async yeniBildirimler(
    alici: Alici,
    taramaAni: Date,
    kanal: "anlik" | "gunluk"
  ): Promise<EpostaBildirimi[]> {
    const enEski = new Date(taramaAni.getTime() - EN_FAZLA_GERIYE_MS);
    const damga = kanal === "anlik" ? alici.tercih.lastInstantAt : alici.tercih.lastDigestAt;
    const suSeviyesi = damga ? new Date(damga) : enEski;
    // Su seviyesi çok eskiyse (ör. uzun süre kapalı kalmış hesap) geriye
    // doğru sınırlanır: aylık bir bildirim yığınını tek e-postada göndermek
    // kimseye bir şey anlatmaz.
    const baslangic = suSeviyesi > enEski ? suSeviyesi : enEski;

    const { data, error } = await this.supabase.client
      .from("notifications")
      .select("title, body, link, created_at")
      .eq("user_id", alici.userId)
      .eq("read", false)
      .gt("created_at", baslangic.toISOString())
      .lte("created_at", taramaAni.toISOString())
      .order("created_at", { ascending: true })
      .limit(BILDIRIM_TAVANI);
    if (error) throw error;

    // OKUNMUŞ BİLDİRİM GÖNDERİLMEZ (yukarıdaki read=false): kullanıcı ekranda
    // görüp kapattığı şeyi bir de gelen kutusunda görmek istemiyor. Anlık
    // kipte bunun ikinci bir faydası var — uygulamayı açık tutan kişiye
    // neredeyse hiç e-posta gitmiyor.
    return (data ?? []).map((row: any) => ({
      baslik: row.title,
      govde: row.body,
      link: row.link ?? undefined,
    }));
  }

  /**
   * Bugün biten görevler, kullanıcıya göre gruplanmış.
   *
   * "Bugün" görevin TAKVİM GÜNÜ ile karşılaştırılıyor (deadline'ın ilk 10
   * karakteri). deadline bir son tarih; saat bileşenini saat dilimine çevirip
   * karşılaştırmak, 00:00'da saklanan bir tarihi komşu güne kaydırırdı.
   */
  private async bugunkuGorevler(userIds: string[]): Promise<Map<string, GunlukGorev[]>> {
    const sonuc = new Map<string, GunlukGorev[]>();
    if (userIds.length === 0) return sonuc;

    const simdi = new Date();
    const pencereBasi = new Date(simdi.getTime() - 36 * 60 * 60 * 1000);
    const pencereSonu = new Date(simdi.getTime() + 36 * 60 * 60 * 1000);

    const { data, error } = await this.supabase.client
      .from("tasks")
      .select("id, title, deadline, deadline_time, task_assignees(user_id)")
      .neq("status", "completed")
      .is("archived_at", null)
      .gte("deadline", pencereBasi.toISOString())
      .lte("deadline", pencereSonu.toISOString())
      .limit(1000);
    if (error) {
      // Görev listesi olmadan da özet gönderilebilir; bildirimler asıl içerik.
      this.logger.warn(`Günlük özet için görevler alınamadı: ${error.message}`);
      return sonuc;
    }

    const ilgili = new Set(userIds);
    for (const task of data ?? []) {
      const gun = typeof (task as any).deadline === "string" ? (task as any).deadline.slice(0, 10) : null;
      if (!gun) continue;
      for (const atanan of ((task as any).task_assignees ?? []) as { user_id: string }[]) {
        if (!ilgili.has(atanan.user_id)) continue;
        // Görevin günü kalemle birlikte taşınıyor: hangi günün "bugün" olduğu
        // kullanıcının saat dilimine bağlı ve o bilgi burada değil, gönderim
        // anında elimizde (bkz. gonder()).
        const liste = sonuc.get(atanan.user_id) ?? [];
        liste.push({ baslik: (task as any).title, saat: saatKirp((task as any).deadline_time), gun });
        sonuc.set(atanan.user_id, liste);
      }
    }
    return sonuc;
  }

  /** Şablonu üretip gönderir. Gönderim gerçekten yapıldıysa true. */
  private async gonder(
    alici: Alici,
    kip: "anlik" | "gunluk",
    bildirimler: EpostaBildirimi[],
    gorevler: GunlukGorev[]
  ): Promise<boolean> {
    // Görev listesi kullanıcının YEREL gününe göre süzülür (bkz. bugunkuGorevler).
    const bugun = yerelAn(new Date(), alici.tercih.timezone).gun;
    const bugunkuler = gorevler.filter((gorev) => gorev.gun === bugun);
    // Boş e-posta gönderilmez: "hiçbir şey olmadı" demek için gelen kutusuna
    // girmek, özelliğin kapatılma sebeplerinin başında gelir.
    if (bildirimler.length === 0 && bugunkuler.length === 0) return false;

    const mail = bildirimEpostasiOlustur({
      locale: alici.locale,
      kip,
      bildirimler,
      gorevler: bugunkuler,
      webUrl: getWebAppUrl(),
      ad: alici.ad,
      abonelikAdresi: abonelikKapatmaAdresi(alici.userId),
    });
    return this.email.sendPrepared(alici.email, mail);
  }

  /** Damgalama tek bir kullanıcı için düşse tur devam etmeli. */
  private async damgalaSessiz(
    userId: string,
    damga: { taramaAni: Date; kanal: "anlik" | "gunluk"; ozetGunu?: string }
  ): Promise<void> {
    try {
      await this.tercihler.damgala(userId, damga);
    } catch (err) {
      this.logger.warn(`Bildirim e-postası damgası yazılamadı (${userId}): ${err instanceof Error ? err.message : err}`);
    }
  }
}

/** "14:30:00" → "14:30"; boşsa undefined. */
function saatKirp(deadlineTime: unknown): string | undefined {
  return typeof deadlineTime === "string" && deadlineTime.length >= 5 ? deadlineTime.slice(0, 5) : undefined;
}

function bekle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
