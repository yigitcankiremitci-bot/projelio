import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  gercekEpostaMi,
  isLocale,
  kampanyaGirdisiniDogrula,
  kampanyaTekilMi,
  type EpostaHedefi,
  type EpostaKampanyaGirdisi,
  type EpostaKampanyasi,
  type Locale,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { EmailService } from "../auth/email.service";
import { destekGondereni } from "../auth/destek-gondereni";
import { getWebAppUrl } from "../../common/config/env";
import { demoEpostasiMi } from "../../common/demo-hesap";
import { cevirmen } from "../../common/i18n";
import { anonimlestirilmisMi } from "../users/account-deletion.service";
import { ipucuKapatmaAdresi } from "../notifications/notification-email.abonelik";
import { bilgiEpostasiOlustur, type HazirMetin } from "../notifications/ipucu-eposta.template";
import { LioEpostaYazariService } from "./lio-eposta-yazari.service";
import { zamanDamgasi } from "./ipucu-eposta.processor";

/**
 * Yöneticinin toplu ve tekil e-postaları (bkz. migration 119).
 *
 * KUYRUK: kampanya ve alıcıları bir kez yazılır, gönderimi dakikada bir çalışan
 * tur yapar. Lio ile kişiselleştirilen metin alıcı başına birkaç saniye
 * sürüyor — yüzlerce kişilik bir gönderim istek içinde bitemez, ve istek
 * yarıda düşerse kimin aldığı belirsiz kalırdı. Alıcı satırı her gönderimde
 * damgalanıyor: sunucu yeniden başlasa bile kalan yerden sürer, kimseye iki
 * kez gitmez.
 *
 * TEKİL gönderim (tek kişi) kuyruğu beklemez, istek içinde gider: yönetici
 * "gitti mi" cevabını hemen görmeli.
 *
 * KİME GİTMEZ: silinmiş/anonimleştirilmiş hesap, doğrulanmamış adres, demo
 * kadrosu ve gerçek olmayan adresler (.test vb.). Toplu gönderim ayrıca
 * ipucu/duyuruları kapatmış kişiye gitmez; her toplu e-postada tek tık çıkış
 * bağlantısı var. Tekil gönderim yöneticinin o kişiye yazdığı mesajdır,
 * destek@ adresinden yanıtlanabilir gider ve tercihe bakmaz.
 */

const TUR_BASINA_ALICI = 15;
const GONDERIM_ARASI_MS = 600;
const KULLANICI_TAVANI = 5000;

@Injectable()
export class KampanyaService {
  private readonly logger = new Logger(KampanyaService.name);
  private calisiyor = false;

  constructor(
    private supabase: SupabaseService,
    private email: EmailService,
    private lio: LioEpostaYazariService
  ) {}

  /** Kitle tanımına uyan alıcı sayısı — "Gönder"den önce yöneticiye gösterilir. */
  async hedefSayisi(hedef: EpostaHedefi): Promise<{ sayi: number }> {
    const dogrulama = kampanyaGirdisiniDogrula({ konu: "x", baslik: "x", govde: "x", hedef, lioIle: false });
    if ("hata" in dogrulama) throw new BadRequestException(dogrulama.hata);
    const alicilar = await this.alicilariBul(dogrulama.temiz.hedef, !kampanyaTekilMi(dogrulama.temiz.hedef));
    return { sayi: alicilar.length };
  }

  async olustur(adminId: string, girdi: Partial<EpostaKampanyaGirdisi>): Promise<EpostaKampanyasi> {
    const dogrulama = kampanyaGirdisiniDogrula(girdi);
    if ("hata" in dogrulama) throw new BadRequestException(dogrulama.hata);
    const k = dogrulama.temiz;
    const tekil = kampanyaTekilMi(k.hedef);
    const alicilar = await this.alicilariBul(k.hedef, !tekil);
    if (alicilar.length === 0) {
      throw new BadRequestException(
        tekil
          ? "Bu kişiye e-posta gönderilemiyor: adresi doğrulanmamış ya da gerçek bir adres değil."
          : "Bu kitlede e-posta gönderilebilecek kimse yok."
      );
    }

    const { data, error } = await this.supabase.client
      .from("eposta_kampanyalari")
      .insert({
        tur: tekil ? "tekil" : "toplu",
        konu: k.konu,
        baslik: k.baslik,
        govde: k.govde,
        link: k.link ?? null,
        dugme: k.dugme ?? null,
        lio_ile: k.lioIle,
        hedef: k.hedef,
        alici_sayisi: alicilar.length,
        olusturan: adminId,
      })
      .select("id")
      .single();
    if (error) throw error;

    // Alıcılar parça parça: tek insert'te binlerce satır isteği şişiriyor.
    for (let i = 0; i < alicilar.length; i += 500) {
      const { error: aliciHatasi } = await this.supabase.client
        .from("eposta_kampanya_alicilari")
        .insert(alicilar.slice(i, i + 500).map((userId) => ({ kampanya_id: data.id, user_id: userId })));
      if (aliciHatasi) {
        // Yarım alıcı listesiyle kampanya başlamasın.
        await this.supabase.client.from("eposta_kampanyalari").delete().eq("id", data.id);
        throw aliciHatasi;
      }
    }
    this.logger.log(
      `E-posta kampanyası oluşturuldu: "${k.konu}" · ${alicilar.length} alıcı · lio=${k.lioIle} · yönetici ${adminId}`
    );

    if (tekil) await this.isle(data.id);
    return this.bul(data.id);
  }

  /**
   * Gönderilmeden önce bir alıcı için nasıl görüneceği. Lio seçiliyse metin
   * gerçekten yazdırılıyor (maliyet "onizleme" olarak deftere düşer) — yönetici
   * kişiselleştirmenin nasıl sonuç verdiğini ve alıcı başına kaç birim
   * tuttuğunu göndermeden görsün.
   */
  async onizle(
    adminId: string,
    girdi: Partial<EpostaKampanyaGirdisi> & { aliciId?: string }
  ): Promise<{ konu: string; html: string; lio: boolean; birim: number }> {
    const aliciId = typeof girdi.aliciId === "string" ? girdi.aliciId : adminId;
    const dogrulama = kampanyaGirdisiniDogrula({ ...girdi, hedef: { tur: "secili", kullaniciIds: [aliciId] } });
    if ("hata" in dogrulama) throw new BadRequestException(dogrulama.hata);
    const k = dogrulama.temiz;
    const { data: u } = await this.supabase.client
      .from("users")
      .select("id, full_name, locale")
      .eq("id", aliciId)
      .maybeSingle();
    if (!u) throw new NotFoundException("Kullanıcı bulunamadı");
    const locale: Locale = isLocale(u.locale) ? u.locale : "tr";
    const taslak: HazirMetin = { konu: k.konu, baslik: k.baslik, govde: k.govde, dugme: k.dugme };
    let metin = taslak;
    let birim = 0;
    let lio = false;
    if (k.lioIle) {
      const yazim = await this.lio.kisisellestir({ taslak, aliciId, islem: "onizleme", adminId });
      if (!yazim) throw new BadRequestException("Lio şu an metni yazamadı; biraz sonra tekrar dene.");
      metin = yazim.metin;
      birim = yazim.birim;
      lio = true;
    }
    const t = cevirmen(locale);
    const mail = bilgiEpostasiOlustur({
      locale,
      metin,
      link: k.link,
      webUrl: getWebAppUrl(),
      ad: lio ? undefined : (u.full_name?.trim() || undefined),
      altNot: t("Bu e-postayı Projelio hesabın olduğu için aldın."),
    });
    return { konu: mail.subject, html: mail.html, lio, birim };
  }

  async iptal(id: string): Promise<EpostaKampanyasi> {
    const { error } = await this.supabase.client
      .from("eposta_kampanyalari")
      .update({ durum: "iptal", bitti_at: new Date().toISOString() })
      .eq("id", id)
      .in("durum", ["bekliyor", "gonderiliyor"]);
    if (error) throw error;
    return this.bul(id);
  }

  async liste(): Promise<EpostaKampanyasi[]> {
    const { data, error } = await this.supabase.client
      .from("eposta_kampanyalari")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const satirlar = data ?? [];
    const ids = satirlar.map((r: any) => r.id);
    const birimler = new Map<string, number>();
    const tekilAlicilar = new Map<string, string>();
    if (ids.length) {
      const tekilIds = satirlar.filter((r: any) => r.tur === "tekil").map((r: any) => r.id);
      const [{ data: harcama }, { data: tekiller }] = await Promise.all([
        this.supabase.client.from("eposta_ai_kullanimi").select("kampanya_id, birim").in("kampanya_id", ids).limit(20000),
        tekilIds.length
          ? this.supabase.client
              .from("eposta_kampanya_alicilari")
              .select("kampanya_id, users(full_name, email)")
              .in("kampanya_id", tekilIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      for (const h of harcama ?? []) birimler.set(h.kampanya_id, (birimler.get(h.kampanya_id) ?? 0) + Number(h.birim || 0));
      for (const t of (tekiller ?? []) as any[]) {
        const u = Array.isArray(t.users) ? t.users[0] : t.users;
        tekilAlicilar.set(t.kampanya_id, u?.full_name || u?.email || "");
      }
    }
    return satirlar.map((r: any) => ({
      ...satirCevir(r),
      birim: Number((birimler.get(r.id) ?? 0).toFixed(2)),
      aliciAdi: tekilAlicilar.get(r.id),
    }));
  }

  private async bul(id: string): Promise<EpostaKampanyasi> {
    const { data, error } = await this.supabase.client.from("eposta_kampanyalari").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Kampanya bulunamadı");
    return satirCevir(data);
  }

  // ────────────────────────────────────────────── Gönderim turu

  @Cron("* * * * *")
  async tur() {
    if (this.calisiyor) return;
    this.calisiyor = true;
    try {
      const { data, error } = await this.supabase.client
        .from("eposta_kampanyalari")
        .select("id")
        // Tekil gönderim istek içinde gidiyor; tur ona dokunursa ikisi aynı
        // alıcıyı aynı anda görüp e-postayı iki kez gönderebilirdi.
        .eq("tur", "toplu")
        .in("durum", ["bekliyor", "gonderiliyor"])
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      const siradaki = data?.[0];
      if (siradaki) await this.isle(siradaki.id, TUR_BASINA_ALICI);
    } catch (err) {
      this.logger.error(`E-posta kampanya turu düştü: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.calisiyor = false;
    }
  }

  /** Bir kampanyanın bekleyen alıcılarından `adet` kadarını gönderir. */
  private async isle(kampanyaId: string, adet = 50): Promise<void> {
    const { data: k, error } = await this.supabase.client
      .from("eposta_kampanyalari")
      .select("*")
      .eq("id", kampanyaId)
      .maybeSingle();
    if (error) throw error;
    if (!k || k.durum === "iptal" || k.durum === "bitti") return;
    if (k.durum === "bekliyor") {
      await this.supabase.client.from("eposta_kampanyalari").update({ durum: "gonderiliyor" }).eq("id", kampanyaId);
    }

    const { data: bekleyenler, error: bekleyenHatasi } = await this.supabase.client
      .from("eposta_kampanya_alicilari")
      .select("user_id, users(id, email, full_name, locale, email_verified_at, deleted_at)")
      .eq("kampanya_id", kampanyaId)
      .eq("durum", "bekliyor")
      .limit(adet);
    if (bekleyenHatasi) throw bekleyenHatasi;

    const tekil = k.tur === "tekil";
    const gonderen = tekil ? destekGondereni(process.env.EMAIL_FROM, process.env.EMAIL_FROM_DESTEK) : null;
    for (const satir of (bekleyenler ?? []) as any[]) {
      // İptal gönderim sırasında da gelebilir; her alıcıdan önce bakılıyor.
      if (!tekil && (await this.iptalMi(kampanyaId))) return;
      const u = Array.isArray(satir.users) ? satir.users[0] : satir.users;
      let durum: "gonderildi" | "basarisiz" | "atlandi" = "atlandi";
      let hata: string | null = null;
      try {
        if (u && gonderilebilir(u)) {
          const gitti = await this.gonder(k, u, gonderen);
          durum = gitti ? "gonderildi" : "basarisiz";
          if (!gitti) hata = "Sağlayıcı e-postayı kabul etmedi";
        } else hata = "Adres artık gönderilebilir değil";
      } catch (err) {
        durum = "basarisiz";
        hata = err instanceof Error ? err.message.slice(0, 300) : String(err);
      }
      await this.supabase.client
        .from("eposta_kampanya_alicilari")
        .update({ durum, hata, gonderildi_at: durum === "gonderildi" ? new Date().toISOString() : null })
        .eq("kampanya_id", kampanyaId)
        .eq("user_id", satir.user_id);
      await bekle(GONDERIM_ARASI_MS);
    }
    await this.sayaclariTazele(kampanyaId);
  }

  private async gonder(
    k: any,
    u: { id: string; email: string; full_name?: string; locale?: string },
    gonderen: { from?: string; replyTo?: string } | null
  ): Promise<boolean> {
    const locale: Locale = isLocale(u.locale) ? u.locale : "tr";
    const ad = typeof u.full_name === "string" && u.full_name.trim() ? u.full_name.trim() : undefined;
    const taslak: HazirMetin = { konu: k.konu, baslik: k.baslik, govde: k.govde, dugme: k.dugme ?? undefined };
    let metin = taslak;
    let lioYazdi = false;
    if (k.lio_ile) {
      const yazim = await this.lio.kisisellestir({
        taslak,
        aliciId: u.id,
        islem: "kampanya",
        kampanyaId: k.id,
        adminId: k.olusturan ?? undefined,
      });
      if (yazim) {
        metin = yazim.metin;
        lioYazdi = true;
      }
    }
    const t = cevirmen(locale);
    const tekil = k.tur === "tekil";
    const mail = bilgiEpostasiOlustur({
      locale,
      metin,
      link: k.link ?? undefined,
      webUrl: getWebAppUrl(),
      // Lio kendi selamını yazıyor.
      ad: lioYazdi ? undefined : ad,
      altNot: tekil ? undefined : t("Bu e-postayı Projelio hesabın olduğu için aldın."),
      abonelikAdresi: tekil ? undefined : ipucuKapatmaAdresi(u.id),
    });
    return this.email.sendPrepared(u.email, { ...mail, from: gonderen?.from, replyTo: gonderen?.replyTo });
  }

  private async iptalMi(id: string): Promise<boolean> {
    const { data } = await this.supabase.client.from("eposta_kampanyalari").select("durum").eq("id", id).maybeSingle();
    return data?.durum === "iptal";
  }

  /** Sayaçlar alıcı satırlarından yeniden sayılıyor — artırma yarışına girmesin. */
  private async sayaclariTazele(id: string): Promise<void> {
    const { data, error } = await this.supabase.client
      .from("eposta_kampanya_alicilari")
      .select("durum")
      .eq("kampanya_id", id)
      .limit(KULLANICI_TAVANI);
    if (error) throw error;
    const say = (d: string) => (data ?? []).filter((r: any) => r.durum === d).length;
    const bekleyen = say("bekliyor");
    const alanlar: Record<string, unknown> = {
      gonderilen: say("gonderildi"),
      basarisiz: say("basarisiz"),
      atlanan: say("atlandi"),
    };
    if (bekleyen === 0) {
      alanlar.durum = "bitti";
      alanlar.bitti_at = new Date().toISOString();
    }
    await this.supabase.client.from("eposta_kampanyalari").update(alanlar).eq("id", id).neq("durum", "iptal");
  }

  /**
   * Kitleye uyan, e-posta gönderilebilir kullanıcıların kimlikleri.
   * `tercihSor`: toplu gönderimde ipucu/duyuruyu kapatanlar elenir.
   */
  private async alicilariBul(hedef: EpostaHedefi, tercihSor: boolean): Promise<string[]> {
    const alanlar = "id, email, email_verified_at, deleted_at, created_at, notification_email_prefs(tips_enabled)";
    const ham: any[] = [];
    if (hedef.tur === "secili") {
      // Kimlikler 100'lük parçalarla: 500 UUID tek adreste istek başlığı
      // sınırını zorluyor.
      for (let i = 0; i < hedef.kullaniciIds.length; i += 100) {
        const { data, error } = await this.supabase.client
          .from("users")
          .select(alanlar)
          .is("deleted_at", null)
          .in("id", hedef.kullaniciIds.slice(i, i + 100));
        if (error) throw error;
        ham.push(...(data ?? []));
      }
    } else {
      const { data, error } = await this.supabase.client
        .from("users")
        .select(alanlar)
        .is("deleted_at", null)
        .limit(KULLANICI_TAVANI);
      if (error) throw error;
      ham.push(...(data ?? []));
    }
    let satirlar = ham.filter((u) => gonderilebilir(u));
    if (tercihSor) {
      satirlar = satirlar.filter((u) => {
        const p = Array.isArray(u.notification_email_prefs) ? u.notification_email_prefs[0] : u.notification_email_prefs;
        return p?.tips_enabled !== false;
      });
    }
    const simdi = Date.now();
    if (hedef.tur === "yeni") {
      const sinir = simdi - hedef.gun * 86_400_000;
      satirlar = satirlar.filter((u) => (zamanDamgasi(u.created_at)?.getTime() ?? 0) >= sinir);
    }
    if (hedef.tur === "pasif") {
      const sinir = simdi - hedef.gun * 86_400_000;
      const { data: etkinlik, error: etkinlikHatasi } = await this.supabase.client
        .from("user_activity_state")
        .select("user_id, last_seen_at")
        .limit(KULLANICI_TAVANI);
      if (etkinlikHatasi) throw etkinlikHatasi;
      const sonGorulme = new Map((etkinlik ?? []).map((e: any) => [e.user_id, zamanDamgasi(e.last_seen_at)?.getTime() ?? 0]));
      satirlar = satirlar.filter((u) => (sonGorulme.get(u.id) ?? 0) < sinir);
    }
    return satirlar.map((u) => u.id);
  }
}

function gonderilebilir(u: { email?: string; email_verified_at?: string | null; deleted_at?: string | null }): boolean {
  if (!u.email || u.deleted_at || !u.email_verified_at) return false;
  return gercekEpostaMi(u.email) && !demoEpostasiMi(u.email) && !anonimlestirilmisMi(u.email);
}

function satirCevir(r: any): EpostaKampanyasi {
  return {
    id: r.id,
    tur: r.tur,
    konu: r.konu,
    baslik: r.baslik,
    lioIle: r.lio_ile === true,
    hedef: r.hedef,
    durum: r.durum,
    aliciSayisi: r.alici_sayisi ?? 0,
    gonderilen: r.gonderilen ?? 0,
    basarisiz: r.basarisiz ?? 0,
    atlanan: r.atlanan ?? 0,
    createdAt: r.created_at,
    bittiAt: r.bitti_at ?? undefined,
  };
}

function bekle(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
