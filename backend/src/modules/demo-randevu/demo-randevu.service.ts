import { randomBytes } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  DEMO_ETKIN_DURUMLAR,
  DEMO_VARSAYILAN_AYARLAR,
  demoEpostaGecerli,
  demoOnaylandiMi,
  demoSlotlariUret,
  demoTelefonGecerli,
  gecerliSaat,
  isLocale,
  type DemoAyarlari,
  type DemoMusaitlik,
  type DemoRandevuDurumu,
  type DemoRandevuGirdisi,
  type DemoRandevuGorunumu,
  type DemoRandevuYonetici,
  type DemoSunucu,
  type Locale,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { EmailService } from "../auth/email.service";
import { DemoMeetService } from "./demo-meet.service";
import type { DemoMeetEtkinligi } from "./google-takvim";
import { getWebAppUrl } from "../../common/config/env";
import { destekGondereni } from "../auth/destek-gondereni";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import {
  demoEkipEpostasi,
  demoIcsDosyasi,
  demoKatilimciEpostasi,
  demoTakvimUid,
  type DemoEkipOlayi,
  type DemoEpostaAdresleri,
  type DemoEpostaRandevusu,
  type DemoKatilimciOlayi,
} from "./demo-randevu-eposta";

/** Sütun listesi tek yerde: her okuma aynı biçime çevrilsin. */
const RANDEVU_ALANLARI =
  "id, baslangic, bitis, durum, kaynak, user_id, ad, eposta, telefon, sirket, ekip_buyuklugu, talep_notu, dil, sunucu_id, toplanti_linki, google_etkinlik_id, google_etkinlik_sahibi, ic_not, yonetim_token, takvim_sirasi, iptal_nedeni, created_at, sunucu:users!demo_randevulari_sunucu_id_fkey(full_name, email)";

interface RandevuSatiri {
  id: string;
  baslangic: string;
  bitis: string;
  durum: DemoRandevuDurumu;
  kaynak: "herkese_acik" | "ayarlar";
  user_id: string | null;
  ad: string;
  eposta: string;
  telefon: string | null;
  sirket: string | null;
  ekip_buyuklugu: string | null;
  talep_notu: string | null;
  dil: string;
  sunucu_id: string | null;
  toplanti_linki: string | null;
  google_etkinlik_id: string | null;
  google_etkinlik_sahibi: string | null;
  ic_not: string | null;
  yonetim_token: string;
  takvim_sirasi: number;
  iptal_nedeni: string | null;
  created_at: string;
  sunucu?: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
}

/**
 * Görüşme odası YALNIZCA https: e-postada düğmeye dönüşüyor ve katılımcı ona
 * güvenip tıklıyor. safeExternalUrl mailto:'ya da izin verdiği için burada yetmez.
 */
function toplantiLinkiGecerli(link: string): boolean {
  try {
    const u = new URL(link);
    return u.protocol === "https:" && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Aynı adresten aynı anda en fazla bu kadar yaklaşan randevu. */
const KISI_BASINA_ETKIN_RANDEVU = 1;

const kirp = (v: unknown, n: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, n) : null;
};

/**
 * Canlı demo randevuları (bkz. migration 120).
 *
 * ÇAKIŞMANIN SON SÖZÜ VERİTABANINDA: slotun boş olduğu burada kontrol ediliyor
 * ama iki ziyaretçi aynı anda basarsa ikisi de geçer. `demo_randevulari_blok_uniq`
 * ikincisini reddediyor; 23505 burada "bu saat az önce doldu"ya çevriliyor.
 *
 * E-POSTA HATASI RANDEVUYU BOZMAZ: gönderim beklenmeden, hatası yutularak
 * yapılıyor. Randevu kaydı asıl iş; e-posta sağlayıcısı düştüğünde kişi
 * "randevu alınamadı" görüp ikinci kez denerse ikinci bir blok daha tutardı.
 */
@Injectable()
export class DemoRandevuService {
  private readonly logger = new Logger(DemoRandevuService.name);

  constructor(
    private supabase: SupabaseService,
    private email: EmailService,
    private meet: DemoMeetService
  ) {}

  // ───────────────────────────────────────────── Ayarlar

  async ayarlariOku(): Promise<DemoAyarlari> {
    const db = this.supabase.client;
    const [ayar, saatler, kapali] = await Promise.all([
      db.from("demo_ayarlari").select("*").eq("id", true).maybeSingle(),
      db.from("demo_calisma_saatleri").select("gun, baslangic, bitis").order("gun").order("baslangic"),
      db.from("demo_kapali_gunler").select("tarih, aciklama").gte("tarih", new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)).order("tarih"),
    ]);
    // Tablo yoksa (migration uygulanmadan) sayfa "şu an kapalı" göstersin, 500 değil.
    if (ayar.error) {
      this.logger.warn(`Demo ayarları okunamadı: ${ayar.error.message}`);
      return DEMO_VARSAYILAN_AYARLAR;
    }
    const a = ayar.data;
    return {
      aktif: a?.aktif ?? false,
      sureDk: a?.sure_dk ?? DEMO_VARSAYILAN_AYARLAR.sureDk,
      tamponDk: a?.tampon_dk ?? DEMO_VARSAYILAN_AYARLAR.tamponDk,
      minOncedenSaat: a?.min_onceden_saat ?? DEMO_VARSAYILAN_AYARLAR.minOncedenSaat,
      maxGunIleri: a?.max_gun_ileri ?? DEMO_VARSAYILAN_AYARLAR.maxGunIleri,
      saatDilimi: a?.saat_dilimi ?? DEMO_VARSAYILAN_AYARLAR.saatDilimi,
      varsayilanToplantiLinki: a?.varsayilan_toplanti_linki ?? null,
      bildirimEpostalari: a?.bildirim_epostalari ?? [],
      // Postgres time "10:00:00" döner; arayüz ve slot hesabı "10:00" bekliyor.
      calismaSaatleri: (saatler.data ?? []).map((s: any) => ({
        gun: s.gun,
        baslangic: String(s.baslangic).slice(0, 5),
        bitis: String(s.bitis).slice(0, 5),
      })),
      kapaliGunler: (kapali.data ?? []).map((k: any) => ({ tarih: k.tarih, aciklama: k.aciklama })),
    };
  }

  async ayarlariKaydet(girdi: Partial<DemoAyarlari>, userId: string): Promise<DemoAyarlari> {
    const db = this.supabase.client;
    const yama: Record<string, unknown> = { updated_by: userId, updated_at: new Date().toISOString() };
    const sayi = (v: unknown, alt: number, ust: number, ad: string) => {
      if (typeof v !== "number" || !Number.isInteger(v) || v < alt || v > ust) {
        throw new BadRequestException(`${ad} ${alt} ile ${ust} arasında olmalı.`);
      }
      return v;
    };
    if (girdi.aktif !== undefined) yama.aktif = Boolean(girdi.aktif);
    if (girdi.sureDk !== undefined) yama.sure_dk = sayi(girdi.sureDk, 10, 240, "Görüşme süresi");
    if (girdi.tamponDk !== undefined) yama.tampon_dk = sayi(girdi.tamponDk, 0, 120, "Ara süre");
    if (girdi.minOncedenSaat !== undefined) yama.min_onceden_saat = sayi(girdi.minOncedenSaat, 0, 336, "En erken randevu");
    if (girdi.maxGunIleri !== undefined) yama.max_gun_ileri = sayi(girdi.maxGunIleri, 1, 120, "Takvim uzunluğu");
    if (girdi.saatDilimi !== undefined) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: girdi.saatDilimi });
      } catch {
        throw new BadRequestException("Saat dilimi tanınmadı.");
      }
      yama.saat_dilimi = girdi.saatDilimi;
    }
    if (girdi.varsayilanToplantiLinki !== undefined) {
      const link = kirp(girdi.varsayilanToplantiLinki, 500);
      if (link && !toplantiLinkiGecerli(link)) throw new BadRequestException("Görüşme bağlantısı https:// ile başlamalı.");
      yama.varsayilan_toplanti_linki = link;
    }
    if (girdi.bildirimEpostalari !== undefined) {
      const liste = (Array.isArray(girdi.bildirimEpostalari) ? girdi.bildirimEpostalari : [])
        .map((e) => String(e).trim().toLowerCase())
        .filter(Boolean);
      const hatali = liste.find((e) => !demoEpostaGecerli(e));
      if (hatali) throw new BadRequestException(`Geçersiz e-posta adresi: ${hatali}`);
      yama.bildirim_epostalari = [...new Set(liste)].slice(0, 20);
    }

    const { error } = await db.from("demo_ayarlari").upsert({ id: true, ...yama });
    if (error) throw new BadRequestException(error.message);

    // Çalışma saatleri ve kapalı günler BÜTÜN OLARAK yazılır: arayüz haftanın
    // tamamını tek formda düzenliyor, satır satır fark çıkarmak gereksiz.
    if (girdi.calismaSaatleri !== undefined) {
      const saatler = (girdi.calismaSaatleri ?? []).map((s) => {
        if (!Number.isInteger(s.gun) || s.gun < 1 || s.gun > 7) throw new BadRequestException("Geçersiz gün.");
        if (!gecerliSaat(s.baslangic) || !gecerliSaat(s.bitis) || s.bitis <= s.baslangic) {
          throw new BadRequestException("Çalışma saatinde bitiş başlangıçtan sonra olmalı.");
        }
        return { gun: s.gun, baslangic: s.baslangic, bitis: s.bitis };
      });
      await db.from("demo_calisma_saatleri").delete().gte("gun", 1);
      if (saatler.length) {
        const { error: e } = await db.from("demo_calisma_saatleri").insert(saatler);
        if (e) throw new BadRequestException(e.message);
      }
    }
    if (girdi.kapaliGunler !== undefined) {
      const gunler = (girdi.kapaliGunler ?? []).map((k) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k.tarih)) throw new BadRequestException("Geçersiz tarih.");
        return { tarih: k.tarih, aciklama: kirp(k.aciklama, 120) };
      });
      await db.from("demo_kapali_gunler").delete().gte("tarih", "1900-01-01");
      if (gunler.length) {
        const { error: e } = await db.from("demo_kapali_gunler").upsert(gunler);
        if (e) throw new BadRequestException(e.message);
      }
    }
    return this.ayarlariOku();
  }

  // ───────────────────────────────────────────── Müsaitlik

  private async doluBloklar(haric?: string): Promise<{ baslangic: string; bitis: string }[]> {
    let q = this.supabase.client
      .from("demo_randevulari")
      .select("id, baslangic, bitis")
      .in("durum", DEMO_ETKIN_DURUMLAR)
      .gte("bitis", new Date().toISOString())
      .limit(LISTE_TAVANI);
    if (haric) q = q.neq("id", haric);
    const { data } = await q;
    return (data ?? []) as { baslangic: string; bitis: string }[];
  }

  async musaitlik(haric?: string): Promise<DemoMusaitlik> {
    const ayar = await this.ayarlariOku();
    if (!ayar.aktif) return { aktif: false, sureDk: ayar.sureDk, saatDilimi: ayar.saatDilimi, slotlar: [] };
    const slotlar = demoSlotlariUret(ayar, new Date(), await this.doluBloklar(haric));
    return { aktif: true, sureDk: ayar.sureDk, saatDilimi: ayar.saatDilimi, slotlar };
  }

  /** Seçilen başlangıç, ŞU ANKİ müsaitlik listesinde birebir var mı. */
  private async slotuDogrula(baslangic: unknown, haric?: string): Promise<{ baslangic: string; bitis: string; ayar: DemoAyarlari }> {
    if (typeof baslangic !== "string" || Number.isNaN(Date.parse(baslangic))) {
      throw new BadRequestException("Bir saat seç.");
    }
    const ayar = await this.ayarlariOku();
    if (!ayar.aktif) throw new BadRequestException("Demo randevuları şu an kapalı.");
    const hedef = new Date(baslangic).toISOString();
    const slot = demoSlotlariUret(ayar, new Date(), await this.doluBloklar(haric)).find((s) => s.baslangic === hedef);
    if (!slot) throw new ConflictException("Bu saat az önce doldu ya da artık seçilemiyor. Lütfen başka bir saat seç.");
    return { ...slot, ayar };
  }

  // ───────────────────────────────────────────── Randevu alma

  async randevuAl(girdi: DemoRandevuGirdisi, uyeId: string | null): Promise<DemoRandevuGorunumu | null> {
    // Bot tuzağı: insan bu alanı görmüyor. Dolu gelirse başarı gibi davran,
    // botun "işe yaradı mı" sorusuna cevap verme.
    if (girdi.website) return null;

    const db = this.supabase.client;
    let ad: string | null;
    let eposta: string | null;
    let telefon = kirp(girdi.telefon, 30);
    let ekip = kirp(girdi.ekipBuyuklugu, 20);
    let dil: Locale = isLocale(girdi.dil) ? girdi.dil : "tr";

    if (uyeId) {
      const { data: u } = await db
        .from("users")
        .select("full_name, email, phone, team_size, locale")
        .eq("id", uyeId)
        .maybeSingle();
      if (!u) throw new NotFoundException("Kullanıcı bulunamadı");
      ad = kirp(u.full_name, 120) ?? u.email;
      eposta = String(u.email).toLowerCase();
      telefon = telefon ?? kirp(u.phone, 30);
      ekip = ekip ?? kirp(u.team_size, 20);
      if (isLocale(u.locale)) dil = u.locale;
    } else {
      ad = kirp(girdi.ad, 120);
      eposta = kirp(girdi.eposta, 254)?.toLowerCase() ?? null;
      if (!ad) throw new BadRequestException("Adını yaz.");
      if (!eposta || !demoEpostaGecerli(eposta)) throw new BadRequestException("Geçerli bir e-posta adresi yaz.");
      if (!telefon || !demoTelefonGecerli(telefon)) throw new BadRequestException("Geçerli bir telefon numarası yaz.");
      if (!girdi.kvkkOnay) throw new BadRequestException("Devam etmek için aydınlatma metnini onayla.");
    }
    if (telefon && !demoTelefonGecerli(telefon)) throw new BadRequestException("Geçerli bir telefon numarası yaz.");

    // Aynı kişi takvimi doldurmasın: yaklaşan etkin randevusu varsa yenisi
    // yerine onu değiştirmesi istenir (e-postasındaki bağlantıyla).
    const { count } = await db
      .from("demo_randevulari")
      .select("id", { count: "exact", head: true })
      .ilike("eposta", eposta!)
      .in("durum", DEMO_ETKIN_DURUMLAR)
      .gte("bitis", new Date().toISOString());
    if ((count ?? 0) >= KISI_BASINA_ETKIN_RANDEVU) {
      throw new ConflictException(
        "Bu e-posta adresiyle zaten yaklaşan bir randevun var. Saatini değiştirmek için onay e-postasındaki bağlantıyı kullan."
      );
    }

    const slot = await this.slotuDogrula(girdi.baslangic);

    // Üye değilse ama bu adresle zaten hesabı varsa randevu hesaba bağlanır.
    let userId = uyeId;
    if (!userId) {
      const { data: mevcut } = await db.from("users").select("id").ilike("email", eposta!).is("deleted_at", null).maybeSingle();
      userId = mevcut?.id ?? null;
    }

    const { data, error } = await db
      .from("demo_randevulari")
      .insert({
        baslangic: slot.baslangic,
        bitis: slot.bitis,
        kaynak: uyeId ? "ayarlar" : "herkese_acik",
        user_id: userId,
        ad,
        eposta,
        telefon,
        sirket: kirp(girdi.sirket, 120),
        ekip_buyuklugu: ekip,
        talep_notu: kirp(girdi.not, 1000),
        dil,
        toplanti_linki: null,
        yonetim_token: randomBytes(24).toString("base64url"),
      })
      .select(RANDEVU_ALANLARI)
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new ConflictException("Bu saat az önce doldu. Lütfen başka bir saat seç.");
      }
      throw new BadRequestException(error.message);
    }

    const r = data as unknown as RandevuSatiri;
    void this.katilimciyaYaz("alindi", r, slot.ayar);
    void this.ekibeYaz("yeni", r, slot.ayar, await this.yoneticiAdresleri(slot.ayar));
    return this.gorunum(r, slot.ayar, Boolean(userId));
  }

  // ───────────────────────────────────────────── Katılımcı: yönetim bağlantısı

  private async tokenIleBul(token: string): Promise<RandevuSatiri> {
    if (!token || token.length < 20) throw new NotFoundException("Randevu bulunamadı");
    const { data } = await this.supabase.client
      .from("demo_randevulari")
      .select(RANDEVU_ALANLARI)
      .eq("yonetim_token", token)
      .maybeSingle();
    if (!data) throw new NotFoundException("Randevu bulunamadı");
    return data as unknown as RandevuSatiri;
  }

  async tokenGorunumu(token: string): Promise<DemoRandevuGorunumu> {
    const r = await this.tokenIleBul(token);
    const ayar = await this.ayarlariOku();
    return this.gorunum(r, ayar, await this.hesabiVar(r));
  }

  async tokenIleIptal(token: string, neden?: string): Promise<DemoRandevuGorunumu> {
    const r = await this.tokenIleBul(token);
    return this.iptalEt(r, "katilimci", kirp(neden, 500));
  }

  async tokenIleTasi(token: string, baslangic: unknown): Promise<DemoRandevuGorunumu> {
    const r = await this.tokenIleBul(token);
    return this.tasi(r, baslangic);
  }

  /** Apple Takvim / Outlook için .ics — randevunun GÜNCEL hâli (iptalse iptal kaydı). */
  async tokenIcs(token: string): Promise<string> {
    const r = await this.tokenIleBul(token);
    const ayar = await this.ayarlariOku();
    const e = this.epostaRandevusu(r, ayar, true);
    return demoIcsDosyasi(e, this.adresler(r).yonetimUrl, new Date(), r.durum === "iptal");
  }

  // ───────────────────────────────────────────── Üye (Ayarlar kartı)

  /**
   * Üyenin yaklaşan randevusu. Üye olmadan randevu alıp SONRA aynı adresle
   * hesap açanın randevusu burada hesaba bağlanır — kart onu da göstersin.
   */
  async benim(userId: string): Promise<DemoRandevuGorunumu | null> {
    const db = this.supabase.client;
    const { data: u } = await db.from("users").select("email").eq("id", userId).maybeSingle();
    if (u?.email) {
      await db.from("demo_randevulari").update({ user_id: userId }).is("user_id", null).ilike("eposta", u.email);
    }
    const { data } = await db
      .from("demo_randevulari")
      .select(RANDEVU_ALANLARI)
      .eq("user_id", userId)
      .in("durum", DEMO_ETKIN_DURUMLAR)
      .gte("bitis", new Date().toISOString())
      .order("baslangic")
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return this.gorunum(data as unknown as RandevuSatiri, await this.ayarlariOku(), true);
  }

  // ───────────────────────────────────────────── Yönetici

  async liste(kapsam: "yaklasan" | "gecmis"): Promise<DemoRandevuYonetici[]> {
    const simdi = new Date().toISOString();
    let q = this.supabase.client.from("demo_randevulari").select(RANDEVU_ALANLARI).limit(LISTE_TAVANI);
    q =
      kapsam === "yaklasan"
        ? q.gte("bitis", simdi).in("durum", DEMO_ETKIN_DURUMLAR).order("baslangic")
        : q.or(`bitis.lt.${simdi},durum.in.(tamamlandi,gelmedi,iptal)`).order("baslangic", { ascending: false });
    const { data, error } = await q;
    if (error) throw new BadRequestException(error.message);
    const satirlar = (data ?? []) as unknown as RandevuSatiri[];
    const ayar = await this.ayarlariOku();

    // "Hesap açtı mı?" — üye olmayan katılımcıya demodan önce hesap açması
    // söyleniyor; yönetici görüşmeye girmeden bunu görebilsin.
    const adresler = [...new Set(satirlar.filter((r) => !r.user_id).map((r) => r.eposta.toLowerCase()))];
    const hesapli = new Set<string>();
    if (adresler.length) {
      const { data: u } = await this.supabase.client.from("users").select("email").in("email", adresler).is("deleted_at", null);
      for (const x of u ?? []) hesapli.add(String(x.email).toLowerCase());
    }
    return satirlar.map((r) => {
      const hesabiVar = Boolean(r.user_id) || hesapli.has(r.eposta.toLowerCase());
      return {
        ...this.gorunum(r, ayar, hesabiVar),
        telefon: r.telefon,
        sirket: r.sirket,
        ekipBuyuklugu: r.ekip_buyuklugu,
        not: r.talep_notu,
        icNot: r.ic_not,
        kaynak: r.kaynak,
        userId: r.user_id,
        sunucuId: r.sunucu_id,
        hesabiVar,
        iptalNedeni: r.iptal_nedeni,
        createdAt: r.created_at,
      };
    });
  }

  private async idIleBul(id: string): Promise<RandevuSatiri> {
    const { data } = await this.supabase.client.from("demo_randevulari").select(RANDEVU_ALANLARI).eq("id", id).maybeSingle();
    if (!data) throw new NotFoundException("Randevu bulunamadı");
    return data as unknown as RandevuSatiri;
  }

  /**
   * Görevi ata / bağlantıyı değiştir / iç not / sonucu işaretle.
   *
   * Sunucu atanınca randevu "planlandi" olur ve katılımcıya "kesinleşti"
   * e-postası gider (bağlantıyla birlikte). Atama ya da bağlantı sonradan
   * değişirse "güncellendi" gider ve takvim sırası artar.
   */
  async guncelle(
    id: string,
    girdi: { sunucuId?: string | null; toplantiLinki?: string | null; icNot?: string | null; durum?: DemoRandevuDurumu },
    yapan: { userId: string; yonetici: boolean }
  ): Promise<DemoRandevuYonetici> {
    const r = await this.idIleBul(id);
    const yama: Record<string, unknown> = {};

    // Moderatör yalnızca KENDİNE atanmış randevunun sonucunu işaretleyebilir.
    if (!yapan.yonetici) {
      if (r.sunucu_id !== yapan.userId) throw new ForbiddenException("Bu randevu sana atanmamış.");
      const izinli = Object.keys(girdi).every((k) => k === "durum" || k === "icNot");
      if (!izinli) throw new ForbiddenException("Atamayı yalnızca yönetici değiştirebilir.");
    }

    if (girdi.icNot !== undefined) yama.ic_not = kirp(girdi.icNot, 2000);
    if (girdi.durum !== undefined) {
      if (!["tamamlandi", "gelmedi"].includes(girdi.durum)) {
        throw new BadRequestException("İptal için iptal düğmesini kullan.");
      }
      yama.durum = girdi.durum;
    }

    let atamaDegisti = false;
    let linkDegisti = false;
    if (girdi.sunucuId !== undefined && girdi.sunucuId !== r.sunucu_id) {
      if (girdi.sunucuId) {
        const sunucular = await this.sunucular();
        if (!sunucular.some((s) => s.userId === girdi.sunucuId)) {
          throw new BadRequestException("Bu kişi demo sunucusu değil.");
        }
      }
      yama.sunucu_id = girdi.sunucuId;
      atamaDegisti = true;
    }
    const elleLink = girdi.toplantiLinki !== undefined;
    if (elleLink) {
      const link = kirp(girdi.toplantiLinki, 500);
      if (link && !toplantiLinkiGecerli(link)) throw new BadRequestException("Görüşme bağlantısı https:// ile başlamalı.");
      if (link !== r.toplanti_linki) {
        yama.toplanti_linki = link;
        linkDegisti = true;
      }
    }

    const ayar = await this.ayarlariOku();
    const yeniSunucu = (yama.sunucu_id as string | null | undefined) ?? (atamaDegisti ? null : r.sunucu_id);

    // Bağlantı OTOMATİK mi (eski sunucunun Meet'i, kişisel odası ya da
    // varsayılan)? Öyleyse görev değişince yeni sunucuya göre yeniden kurulur.
    // Yöneticinin elle yazdığı özel bir bağlantı ise olduğu gibi kalır.
    const eskiKisisel = r.sunucu_id ? await this.kisiselLink(r.sunucu_id) : null;
    const otomatikLink =
      !r.toplanti_linki ||
      Boolean(r.google_etkinlik_id) ||
      r.toplanti_linki === eskiKisisel ||
      r.toplanti_linki === ayar.varsayilanToplantiLinki;

    // Eski Meet etkinliği şu durumlarda kalkar: görev başka birine geçti /
    // görev boşaltıldı, ya da yönetici bağlantıyı elle değiştirdi.
    const meetKalkar = Boolean(r.google_etkinlik_id) && (atamaDegisti || (elleLink && linkDegisti));
    if (meetKalkar && r.google_etkinlik_sahibi) {
      void this.meet.sil(r.google_etkinlik_sahibi, r.google_etkinlik_id!);
      yama.google_etkinlik_id = null;
      yama.google_etkinlik_sahibi = null;
      if (!elleLink) {
        yama.toplanti_linki = null;
        linkDegisti = true;
      }
    }

    if (atamaDegisti && !elleLink && otomatikLink && DEMO_ETKIN_DURUMLAR.includes(r.durum)) {
      let link: string | null = null;
      if (yeniSunucu) {
        // Önce otomatik Meet: sunucunun Google takviminde ayrı bir oda.
        const meet = await this.meet.olustur(yeniSunucu, this.meetEtkinligi(r));
        if (meet) {
          link = meet.link;
          yama.google_etkinlik_id = meet.etkinlikId;
          yama.google_etkinlik_sahibi = yeniSunucu;
        } else {
          // Sunucu Google'ı bağlamamış ya da Google'a ulaşılamadı: kişisel oda,
          // o da yoksa varsayılan bağlantı.
          link = (await this.kisiselLink(yeniSunucu)) ?? ayar.varsayilanToplantiLinki;
        }
      }
      if (link !== (yama.toplanti_linki !== undefined ? yama.toplanti_linki : r.toplanti_linki)) {
        yama.toplanti_linki = link;
        linkDegisti = true;
      }
    }

    const etkin = DEMO_ETKIN_DURUMLAR.includes(r.durum) && !yama.durum;
    if (etkin && atamaDegisti) yama.durum = yeniSunucu ? "planlandi" : "bekliyor";
    const takvimDegisti = etkin && (atamaDegisti || linkDegisti);
    if (takvimDegisti) yama.takvim_sirasi = r.takvim_sirasi + 1;

    if (!Object.keys(yama).length) return (await this.liste("yaklasan")).find((x) => x.id === id) ?? this.yoneticiSatiri(r, ayar);

    const { data, error } = await this.supabase.client
      .from("demo_randevulari")
      .update(yama)
      .eq("id", id)
      .select(RANDEVU_ALANLARI)
      .single();
    if (error) {
      // Kayıt yazılamadıysa az önce açılan Meet etkinliği sahipsiz kalmasın.
      if (yama.google_etkinlik_id && yama.google_etkinlik_sahibi) {
        void this.meet.sil(yama.google_etkinlik_sahibi as string, yama.google_etkinlik_id as string);
      }
      throw new BadRequestException(error.message);
    }
    const yeni = data as unknown as RandevuSatiri;

    if (takvimDegisti) {
      // Katılımcıya ONAY yalnızca sunucu + bağlantı birlikte hazır olunca gider
      // (demoOnaylandiMi). Bağlantısız atama katılımcıya hiçbir şey yollamaz:
      // eskiden "kesinleşti" gidiyordu ama içinde bağlantı yoktu ve kişi
      // takvimine bağlantısız bir etkinlik ekliyordu (canlıda yaşandı).
      const onceOnayli = demoOnaylandiMi({ durum: r.durum, toplantiLinki: r.toplanti_linki });
      const simdiOnayli = demoOnaylandiMi({ durum: yeni.durum, toplantiLinki: yeni.toplanti_linki });
      const olay: DemoKatilimciOlayi | null = simdiOnayli ? (onceOnayli ? "degisti" : "kesinlesti") : onceOnayli ? "degisti" : null;
      if (olay) void this.katilimciyaYaz(olay, yeni, ayar);
      if (atamaDegisti && yeni.sunucu_id) void this.ekibeYaz("atandi", yeni, ayar, await this.kullaniciAdresi(yeni.sunucu_id));
      else if (yeni.sunucu_id) void this.ekibeYaz("degisti", yeni, ayar, await this.kullaniciAdresi(yeni.sunucu_id));
      // Görevden alınan sunucuya iptal kaydı: takviminde boşa bir etkinlik kalmasın.
      if (atamaDegisti && r.sunucu_id) void this.ekibeYaz("iptal", r, ayar, await this.kullaniciAdresi(r.sunucu_id), "Görev başka birine verildi.");
    }
    return this.yoneticiSatiri(yeni, ayar);
  }

  /**
   * Atanmış sunucunun Google takviminde Meet açar ve randevuya yazar.
   *
   * Ne zaman gerekir: sunucu Google'ı atamadan SONRA bağladıysa ya da atama
   * anında Google'a ulaşılamadıysa. Bağlantı yazılınca onay e-postası,
   * normal bağlantı güncellemesiyle aynı yoldan (guncelle) gider.
   */
  async meetOlustur(id: string, yapanId: string): Promise<DemoRandevuYonetici> {
    const r = await this.idIleBul(id);
    if (!DEMO_ETKIN_DURUMLAR.includes(r.durum)) throw new BadRequestException("Bu randevu zaten kapanmış.");
    if (!r.sunucu_id) throw new BadRequestException("Önce görüşmeyi yapacak kişiyi seç.");
    const meet = await this.meet.olustur(r.sunucu_id, this.meetEtkinligi(r));
    if (!meet) {
      throw new BadRequestException(
        "Meet oluşturulamadı: görüşmeyi yapacak kişinin Google Meet bağlantısı yok ya da Google'a ulaşılamadı."
      );
    }
    // Önce bağlantı (e-postalar buradan gider), sonra etkinlik kimliği: ters
    // sırada guncelle eski etkinlik sanıp yeni açtığımızı silerdi.
    if (r.google_etkinlik_id && r.google_etkinlik_sahibi) void this.meet.sil(r.google_etkinlik_sahibi, r.google_etkinlik_id);
    await this.supabase.client.from("demo_randevulari").update({ google_etkinlik_id: null, google_etkinlik_sahibi: null }).eq("id", id);
    await this.guncelle(id, { toplantiLinki: meet.link }, { userId: yapanId, yonetici: true });
    const { data } = await this.supabase.client
      .from("demo_randevulari")
      .update({ google_etkinlik_id: meet.etkinlikId, google_etkinlik_sahibi: r.sunucu_id })
      .eq("id", id)
      .select(RANDEVU_ALANLARI)
      .single();
    return this.yoneticiSatiri(data as unknown as RandevuSatiri, await this.ayarlariOku());
  }

  async yoneticiIptal(id: string, neden?: string): Promise<DemoRandevuGorunumu> {
    return this.iptalEt(await this.idIleBul(id), "yonetici", kirp(neden, 500));
  }

  async yoneticiTasi(id: string, baslangic: unknown): Promise<DemoRandevuGorunumu> {
    return this.tasi(await this.idIleBul(id), baslangic);
  }

  // ───────────────────────────────────────────── Sunucular (moderatörler)

  async sunucuMu(userId: string): Promise<boolean> {
    const { data } = await this.supabase.client.from("demo_sunuculari").select("user_id").eq("user_id", userId).maybeSingle();
    return Boolean(data);
  }

  /** Yöneticiler + eklenmiş moderatörler. Yönetici her zaman görev alabilir. */
  async sunucular(benId?: string): Promise<DemoSunucu[]> {
    const db = this.supabase.client;
    const [yon, mod] = await Promise.all([
      db.from("users").select("id, full_name, email").eq("role", "admin").is("deleted_at", null),
      db.from("demo_sunuculari").select("user_id, toplanti_linki, google_eposta, google_refresh_token, users(id, full_name, email, role)"),
    ]);
    const liste = new Map<string, DemoSunucu>();
    for (const m of (mod.data ?? []) as any[]) {
      const u = Array.isArray(m.users) ? m.users[0] : m.users;
      if (!u) continue;
      liste.set(u.id, {
        userId: u.id,
        ad: u.full_name || u.email,
        eposta: u.email,
        yonetici: u.role === "admin",
        toplantiLinki: m.toplanti_linki,
        // Şifreli token yalnızca var/yok bilgisi için okunuyor; yanıta girmez.
        googleMeetEposta: m.google_refresh_token ? m.google_eposta ?? null : null,
        ben: u.id === benId,
      });
    }
    for (const u of yon.data ?? []) {
      if (!liste.has(u.id)) {
        liste.set(u.id, { userId: u.id, ad: u.full_name || u.email, eposta: u.email, yonetici: true, toplantiLinki: null, googleMeetEposta: null, ben: u.id === benId });
      }
    }
    return [...liste.values()].sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  }

  async sunucuEkle(eposta: string, toplantiLinki: string | null | undefined, benId: string): Promise<DemoSunucu[]> {
    const adres = kirp(eposta, 254)?.toLowerCase();
    if (!adres) throw new BadRequestException("E-posta adresi yaz.");
    const { data: u } = await this.supabase.client.from("users").select("id").ilike("email", adres).is("deleted_at", null).maybeSingle();
    if (!u) throw new NotFoundException("Bu adresle bir Projelio hesabı yok. Moderatörün önce hesap açması gerekiyor.");
    const link = kirp(toplantiLinki, 500);
    if (link && !toplantiLinkiGecerli(link)) throw new BadRequestException("Görüşme bağlantısı https:// ile başlamalı.");
    const { error } = await this.supabase.client.from("demo_sunuculari").upsert({ user_id: u.id, toplanti_linki: link });
    if (error) throw new BadRequestException(error.message);
    return this.sunucular(benId);
  }

  async sunucuGuncelle(userId: string, toplantiLinki: string | null, benId: string): Promise<DemoSunucu[]> {
    const link = kirp(toplantiLinki, 500);
    if (link && !toplantiLinkiGecerli(link)) throw new BadRequestException("Görüşme bağlantısı https:// ile başlamalı.");
    // Yönetici listede satırı olmadan da görünüyor; bağlantı verince satırı açılır.
    const { error } = await this.supabase.client.from("demo_sunuculari").upsert({ user_id: userId, toplanti_linki: link });
    if (error) throw new BadRequestException(error.message);
    return this.sunucular(benId);
  }

  async sunucuSil(userId: string, benId: string): Promise<DemoSunucu[]> {
    await this.supabase.client.from("demo_sunuculari").delete().eq("user_id", userId);
    return this.sunucular(benId);
  }

  /** Moderatörün kendi görevleri (Ayarlar kartı). */
  async gorevlerim(userId: string): Promise<DemoRandevuYonetici[]> {
    const ayar = await this.ayarlariOku();
    const { data } = await this.supabase.client
      .from("demo_randevulari")
      .select(RANDEVU_ALANLARI)
      .eq("sunucu_id", userId)
      .in("durum", DEMO_ETKIN_DURUMLAR)
      .gte("bitis", new Date(Date.now() - 12 * 3_600_000).toISOString())
      .order("baslangic")
      .limit(50);
    return ((data ?? []) as unknown as RandevuSatiri[]).map((r) => this.yoneticiSatiri(r, ayar));
  }

  // ───────────────────────────────────────────── Hatırlatmalar

  /**
   * Takvime eklemeyen katılımcı için e-posta hatırlatması: 1 gün ve 1 saat
   * önce. Sunucuya yalnızca 1 saat kala gider.
   *
   * Damga YAZILDIKTAN SONRA gönderilir, önce değil: iki tur üst üste binerse
   * (bkz. DemoRandevuProcessor.running) ikincisi damgalı satırı görmez.
   * Gecikmiş hatırlatma (sunucu kapalıydı) görüşme başlamadıysa yine gider.
   */
  async hatirlatmaTuru(): Promise<void> {
    const simdi = Date.now();
    const { data } = await this.supabase.client
      .from("demo_randevulari")
      .select(`${RANDEVU_ALANLARI}, hatirlatma_gun_at, hatirlatma_saat_at`)
      .in("durum", DEMO_ETKIN_DURUMLAR)
      .gt("baslangic", new Date(simdi).toISOString())
      .lte("baslangic", new Date(simdi + 25 * 3_600_000).toISOString())
      .limit(LISTE_TAVANI);
    if (!data?.length) return;
    const ayar = await this.ayarlariOku();

    for (const satir of data as any[]) {
      const r = satir as RandevuSatiri;
      const baslangic = new Date(r.baslangic).getTime();
      const kalan = baslangic - simdi;
      // Randevu ne kadar önceden alındı: görüşmeden 1 saat önce alınan bir
      // randevuya 3 dakika sonra "1 saat kaldı" yazmak anlamsızdı (canlıda
      // yaşandı). Onay e-postası zaten az önce gitti.
      const oncedenAlindi = baslangic - new Date(r.created_at).getTime();
      const onayli = demoOnaylandiMi({ durum: r.durum, toplantiLinki: r.toplanti_linki });

      let alan: "hatirlatma_gun_at" | "hatirlatma_saat_at" | null = null;
      if (onayli && kalan <= 65 * 60_000 && !satir.hatirlatma_saat_at && oncedenAlindi > 3 * 3_600_000) {
        alan = "hatirlatma_saat_at";
      } else if (kalan <= 24 * 3_600_000 && kalan > 65 * 60_000 && !satir.hatirlatma_gun_at) {
        // Onaysız randevuda bu damga katılımcıya değil YÖNETİCİLERE gider:
        // "yarın görüşme var ama kimse atanmadı / bağlantı yok".
        if (!onayli || oncedenAlindi > 26 * 3_600_000) alan = "hatirlatma_gun_at";
      }
      if (!alan) continue;

      const { data: damga } = await this.supabase.client
        .from("demo_randevulari")
        .update({ [alan]: new Date().toISOString() })
        .eq("id", r.id)
        .is(alan, null)
        .select("id");
      if (!damga?.length) continue;

      if (alan === "hatirlatma_saat_at") {
        await this.katilimciyaYaz("hatirlatma_saat", r, ayar);
        if (r.sunucu_id) await this.ekibeYaz("hatirlatma_saat", r, ayar, await this.kullaniciAdresi(r.sunucu_id));
      } else if (onayli) {
        await this.katilimciyaYaz("hatirlatma_gun", r, ayar);
      } else {
        await this.ekibeYaz("onaysiz", r, ayar, await this.yoneticiAdresleri(ayar));
      }
    }
  }

  // ───────────────────────────────────────────── Ortak iç işler

  private async iptalEt(r: RandevuSatiri, eden: "katilimci" | "yonetici", neden: string | null): Promise<DemoRandevuGorunumu> {
    if (!DEMO_ETKIN_DURUMLAR.includes(r.durum)) throw new BadRequestException("Bu randevu zaten kapanmış.");
    const { data, error } = await this.supabase.client
      .from("demo_randevulari")
      .update({ durum: "iptal", iptal_eden: eden, iptal_nedeni: neden, takvim_sirasi: r.takvim_sirasi + 1 })
      .eq("id", r.id)
      .select(RANDEVU_ALANLARI)
      .single();
    if (error) throw new BadRequestException(error.message);
    const yeni = data as unknown as RandevuSatiri;
    if (r.google_etkinlik_id && r.google_etkinlik_sahibi) void this.meet.sil(r.google_etkinlik_sahibi, r.google_etkinlik_id);
    const ayar = await this.ayarlariOku();
    void this.katilimciyaYaz("iptal", yeni, ayar);
    const alicilar = await this.yoneticiAdresleri(ayar);
    if (yeni.sunucu_id) alicilar.push(...(await this.kullaniciAdresi(yeni.sunucu_id)));
    const kim = eden === "katilimci" ? "Katılımcı iptal etti" : "Yönetici iptal etti";
    void this.ekibeYaz("iptal", yeni, ayar, [...new Set(alicilar)], neden ? `${kim}: ${neden}` : kim);
    return this.gorunum(yeni, ayar, await this.hesabiVar(yeni));
  }

  /**
   * Yeni saate taşı. Kayıt AYNI kalır (iptal + yeni kayıt değil): atanmış
   * sunucu, iç not ve takvim UID'si korunur; takvim sırası artar, böylece
   * takvime eklenmiş etkinlik yeni saate kayar.
   */
  private async tasi(r: RandevuSatiri, baslangic: unknown): Promise<DemoRandevuGorunumu> {
    if (!DEMO_ETKIN_DURUMLAR.includes(r.durum)) throw new BadRequestException("Bu randevu zaten kapanmış.");
    const slot = await this.slotuDogrula(baslangic, r.id);
    const { data, error } = await this.supabase.client
      .from("demo_randevulari")
      .update({
        baslangic: slot.baslangic,
        bitis: slot.bitis,
        takvim_sirasi: r.takvim_sirasi + 1,
        hatirlatma_gun_at: null,
        hatirlatma_saat_at: null,
      })
      .eq("id", r.id)
      .select(RANDEVU_ALANLARI)
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") throw new ConflictException("Bu saat az önce doldu. Lütfen başka bir saat seç.");
      throw new BadRequestException(error.message);
    }
    const yeni = data as unknown as RandevuSatiri;
    // Meet odası aynı kalır, yalnızca sunucunun takvimindeki saat kayar.
    if (yeni.google_etkinlik_id && yeni.google_etkinlik_sahibi) {
      void this.meet.saatiGuncelle(yeni.google_etkinlik_sahibi, yeni.google_etkinlik_id, yeni.baslangic, yeni.bitis);
    }
    void this.katilimciyaYaz("degisti", yeni, slot.ayar);
    const alicilar = await this.yoneticiAdresleri(slot.ayar);
    if (yeni.sunucu_id) alicilar.push(...(await this.kullaniciAdresi(yeni.sunucu_id)));
    void this.ekibeYaz("degisti", yeni, slot.ayar, [...new Set(alicilar)]);
    return this.gorunum(yeni, slot.ayar, await this.hesabiVar(yeni));
  }

  private async kisiselLink(userId: string): Promise<string | null> {
    const { data } = await this.supabase.client.from("demo_sunuculari").select("toplanti_linki").eq("user_id", userId).maybeSingle();
    return data?.toplanti_linki ?? null;
  }

  /**
   * Sunucunun takvimine yazılan etkinlik. Katılımcı da davetli olduğu için
   * açıklamayı O DA görür: telefon, şirket ve iç not buraya BİLEREK konmuyor.
   */
  private meetEtkinligi(r: RandevuSatiri): DemoMeetEtkinligi {
    return {
      baslangic: r.baslangic,
      bitis: r.bitis,
      baslik: `Projelio canlı demo · ${r.ad}`,
      aciklama: [
        "Projelio ekibiyle 40 dakikalık canlı tanıtım görüşmesi.",
        ...(r.talep_notu ? ["", `Görmek istenen: ${r.talep_notu}`] : []),
      ].join("\n"),
      katilimciEposta: r.eposta,
      icalUid: demoTakvimUid(r.id),
    };
  }

  private sunucuAdi(r: RandevuSatiri): string | null {
    const s = Array.isArray(r.sunucu) ? r.sunucu[0] : r.sunucu;
    return s ? s.full_name || s.email : null;
  }

  private gorunum(r: RandevuSatiri, ayar: DemoAyarlari, hesabiVar: boolean): DemoRandevuGorunumu {
    return {
      id: r.id,
      baslangic: r.baslangic,
      bitis: r.bitis,
      durum: r.durum,
      ad: r.ad,
      eposta: r.eposta,
      saatDilimi: ayar.saatDilimi,
      sunucuAdi: this.sunucuAdi(r),
      toplantiLinki: r.toplanti_linki,
      yonetimToken: r.yonetim_token,
      hesapGerekli: !hesabiVar,
    };
  }

  private yoneticiSatiri(r: RandevuSatiri, ayar: DemoAyarlari): DemoRandevuYonetici {
    return {
      ...this.gorunum(r, ayar, Boolean(r.user_id)),
      telefon: r.telefon,
      sirket: r.sirket,
      ekipBuyuklugu: r.ekip_buyuklugu,
      not: r.talep_notu,
      icNot: r.ic_not,
      kaynak: r.kaynak,
      userId: r.user_id,
      sunucuId: r.sunucu_id,
      hesabiVar: Boolean(r.user_id),
      iptalNedeni: r.iptal_nedeni,
      createdAt: r.created_at,
    };
  }

  private async hesabiVar(r: RandevuSatiri): Promise<boolean> {
    if (r.user_id) return true;
    const { data } = await this.supabase.client.from("users").select("id").ilike("email", r.eposta).is("deleted_at", null).maybeSingle();
    return Boolean(data);
  }

  private adresler(r: RandevuSatiri): DemoEpostaAdresleri {
    const web = getWebAppUrl();
    const yonetimUrl = `${web}/demo-randevu/${r.yonetim_token}`;
    return {
      yonetimUrl,
      // Doğrudan API adresi değil: API_PUBLIC_URL her kurulumda tanımlı değil.
      // Yönetim sayfası bu parametreyi görünce .ics'i indirtiyor.
      icsUrl: `${yonetimUrl}?takvim=ics`,
      kayitUrl: `${web}/register?email=${encodeURIComponent(r.eposta)}`,
      adminUrl: `${web}/admin?sekme=demoRandevu`,
    };
  }

  private epostaRandevusu(r: RandevuSatiri, ayar: DemoAyarlari, uye: boolean): DemoEpostaRandevusu {
    return {
      id: r.id,
      baslangic: r.baslangic,
      bitis: r.bitis,
      ad: r.ad,
      eposta: r.eposta,
      telefon: r.telefon,
      sirket: r.sirket,
      ekipBuyuklugu: r.ekip_buyuklugu,
      not: r.talep_notu,
      dil: isLocale(r.dil) ? r.dil : "tr",
      saatDilimi: ayar.saatDilimi,
      toplantiLinki: r.toplanti_linki,
      sunucuAdi: this.sunucuAdi(r),
      takvimSirasi: r.takvim_sirasi,
      uye,
      durum: r.durum,
    };
  }

  private async katilimciyaYaz(olay: DemoKatilimciOlayi, r: RandevuSatiri, ayar: DemoAyarlari): Promise<void> {
    try {
      const e = this.epostaRandevusu(r, ayar, await this.hesabiVar(r));
      const a = this.adresler(r);
      const mail = demoKatilimciEpostasi(olay, e, a);
      // .ics eki yalnızca takvime girmesi gereken olaylarda: onay, onaylı bir
      // randevunun değişmesi ve onaylı bir randevunun iptali (takvimden düşsün).
      const onayli = demoOnaylandiMi({ durum: r.durum, toplantiLinki: r.toplanti_linki });
      const iptal = olay === "iptal";
      const ekli = iptal ? Boolean(r.sunucu_id && r.toplanti_linki) : onayli && (olay === "kesinlesti" || olay === "degisti");
      // GÖNDEREN destek@: yanıtlanabilir bir kişi adresi, "bildirim" adresine
      // göre Gmail'in Tanıtımlar sekmesine daha az düşüyor ve katılımcının
      // "saati değiştirebilir miyiz" yanıtı bir insana ulaşıyor.
      const gonderen = destekGondereni(process.env.EMAIL_FROM, process.env.EMAIL_FROM_DESTEK);
      await this.email.sendPrepared(r.eposta, {
        ...mail,
        ...(gonderen ?? {}),
        attachments: ekli
          ? [{ filename: "projelio-demo.ics", content: Buffer.from(demoIcsDosyasi(e, a.yonetimUrl, new Date(), iptal)) }]
          : undefined,
      });
    } catch (err) {
      this.logger.error(`Demo e-postası (${olay}) gönderilemedi: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async ekibeYaz(olay: DemoEkipOlayi, r: RandevuSatiri, ayar: DemoAyarlari, alicilar: string[], iptalNedeni?: string | null): Promise<void> {
    try {
      const e = this.epostaRandevusu(r, ayar, await this.hesabiVar(r));
      const a = this.adresler(r);
      const mail = demoEkipEpostasi(olay, e, a, { iptalNedeni });
      // Sunucunun takvimine de düşsün: atama ve değişiklikte .ics ekli.
      const ekli = olay === "atandi" || olay === "degisti" || olay === "iptal";
      const ics = ekli ? Buffer.from(demoIcsDosyasi({ ...e, dil: "tr" }, a.adminUrl, new Date(), olay === "iptal")) : null;
      for (const to of alicilar) {
        await this.email.sendPrepared(to, {
          ...mail,
          replyTo: r.eposta,
          attachments: ics ? [{ filename: "projelio-demo.ics", content: ics }] : undefined,
        });
      }
    } catch (err) {
      this.logger.error(`Demo ekip e-postası (${olay}) gönderilemedi: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async yoneticiAdresleri(ayar: DemoAyarlari): Promise<string[]> {
    const { data } = await this.supabase.client.from("users").select("email").eq("role", "admin").is("deleted_at", null);
    return [...new Set([...(data ?? []).map((u) => String(u.email).toLowerCase()), ...ayar.bildirimEpostalari])];
  }

  private async kullaniciAdresi(userId: string): Promise<string[]> {
    const { data } = await this.supabase.client.from("users").select("email").eq("id", userId).maybeSingle();
    return data?.email ? [data.email] : [];
  }
}
