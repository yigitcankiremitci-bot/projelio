import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import {
  AJAN_ANAHTAR_ONEKI,
  AJAN_SINIRLARI,
  ajanAramaKelimeleri,
  ajanBagliMi,
  ajanBellekAlintisi,
  ajanBostaNeYapsin,
  ajanFikirAciklamasi,
  ajanHassasAlanlariAt,
  ajanProjelioAraciMi,
  AJAN_SIRKET_ARALIGI_MS,
  AJAN_SIRKET_BUTCESI,
  ajanSonrakiCalisma,
  ajanIsAsiliMi,
  ajanKirp,
  ajanKonuAnahtari,
  ajanOgretilenleriSigdir,
  ajanSonucunuTemizle,
  type AjanBilgi,
  type AjanDurumu,
  type AjanIs,
  type AjanIsPaketi,
  type AjanIsTuru,
  type AjanKonu,
  type AjanKonuDurumu,
  type AjanMesaj,
  type AjanOneri,
  type AjanOtomasyon,
  type AjanOtomasyonSikligi,
  type AjanRapor,
  type AjanRaporOzeti,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { PersonalTodosService } from "../personal-todos/personal-todos.service";
import { AiAssistantService } from "../ai-assistant/ai-assistant.service";
import { AKIS_TAVANI, LISTE_TAVANI } from "../../common/liste-tavani";

/** Mac'in işi alırken gördüğü öğretilen bilgi sayısı (modelin bağlamı küçük). */
const OGRETILEN_PAKET_TAVANI = 30;

/** Bellek listesinde bir kaydın gösterilen başı. */
const LISTEDE_ICERIK = 2000;
const SOHBET_GECMISI = 12;
const KONU_DURUMLARI: AjanKonuDurumu[] = ["bekliyor", "ogreniliyor", "ogrenildi", "atlandi"];
const SIKLIKLAR: AjanOtomasyonSikligi[] = ["gunluk", "haftalik", "aylik"];
/** Fikir/araştırma/otomasyon işinde ajana giden bağlamın tavanı (qwen3:8b'nin 16K'sı paylaşılıyor). */
const BAGLAM_BUTCESI = 7000;

export function anahtarOzeti(anahtar: string): string {
  return createHash("sha256").update(anahtar).digest("hex");
}

/**
 * Ajan MVP (migration 177). Model sunucuda DEĞİL, kullanıcının Mac'inde;
 * burası kuyruk + bellek. İki tür istemci var:
 *
 *   · Kullanıcı (JWT): öğretir, araştırma ister, raporları okur, önerileri onaylar.
 *   · Mac'teki program (kişiye özel anahtar): iş alır, sonucu yazar, nabız atar.
 *
 * Ajan Projelio'nun başka hiçbir tablosuna KENDİSİ yazmaz. Yapmak istediği bir
 * iş (yapılacak eklemek) `ajan_onerileri`'ne düşer, kullanıcı onaylayınca bu
 * servis yapar. Modelin okuduğu bir web sayfası ona her şeyi söyletebilir;
 * onayı kullanıcının elinde tutmak bunun tek gerçek korumasıdır.
 */
@Injectable()
export class AjanService {
  constructor(
    private supabase: SupabaseService,
    private yapilacaklar: PersonalTodosService,
    private lio: AiAssistantService
  ) {}

  private get db() {
    return this.supabase.client;
  }

  // ============================================================ erişim

  /**
   * Şimdilik yalnızca `AJAN_EPOSTALARI` listesindeki hesaplar (rakip takibiyle
   * aynı desen). Liste boşsa herkese kapalı — yanlışlıkla herkese açılmasın.
   */
  async izinli(userId: string): Promise<boolean> {
    const liste = (process.env.AJAN_EPOSTALARI ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (liste.length === 0) return false;
    const { data } = await this.db.from("users").select("email").eq("id", userId).maybeSingle<any>();
    return !!data?.email && liste.includes(String(data.email).toLowerCase());
  }

  async assertIzinli(userId: string): Promise<void> {
    if (!(await this.izinli(userId))) throw new ForbiddenException("Ajan şimdilik yalnızca izinli hesaplara açık.");
  }

  /** Mac'ten gelen anahtarı kullanıcıya çevirir. Anahtar değiştirilince eskisi anında geçersiz. */
  async isciyiBul(yetki: string | undefined): Promise<string> {
    const anahtar = (yetki ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!anahtar.startsWith(AJAN_ANAHTAR_ONEKI)) throw new UnauthorizedException("Ajan anahtarı geçersiz.");
    const { data } = await this.db
      .from("ajan_ayarlari")
      .select("user_id")
      .eq("isci_anahtar_ozeti", anahtarOzeti(anahtar))
      .maybeSingle<any>();
    if (!data) throw new UnauthorizedException("Ajan anahtarı geçersiz.");
    // İzin listesinden çıkarılan hesabın Mac'i de çalışmayı bırakır.
    if (!(await this.izinli(data.user_id))) throw new ForbiddenException("Ajan bu hesapta kapalı.");
    return data.user_id;
  }

  private async ayarlar(userId: string): Promise<any> {
    const { data, error } = await this.db.from("ajan_ayarlari").select("*").eq("user_id", userId).maybeSingle<any>();
    if (error) throw error;
    if (data) return data;
    const { data: yeni, error: e2 } = await this.db
      .from("ajan_ayarlari")
      .upsert({ user_id: userId }, { onConflict: "user_id" })
      .select()
      .single();
    if (e2) throw e2;
    return yeni;
  }

  // ============================================================ kullanıcı

  async durum(userId: string): Promise<AjanDurumu> {
    const bos: AjanDurumu = {
      izinli: false, ad: "Ajan", bagli: false, kurulu: false, calisiyor: false, not: null, model: null,
      sonNabiz: null, ogrenmeAcik: false, bekleyenIs: 0, okunmamisRapor: 0, bekleyenOneri: 0, bekleyenFikir: 0,
    };
    if (!(await this.izinli(userId))) return bos;
    const a = await this.ayarlar(userId);
    const say = async (tablo: string, sutun: string, deger: unknown) => {
      const { count } = await this.db.from(tablo).select("id", { count: "exact", head: true }).eq("user_id", userId).eq(sutun, deger as any);
      return count ?? 0;
    };
    const oneriSay = async (tur: string) => {
      const { count } = await this.db.from("ajan_onerileri").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("durum", "bekliyor").eq("tur", tur);
      return count ?? 0;
    };
    const [bekleyenIs, okunmamisRapor, bekleyenOneri, bekleyenFikir] = await Promise.all([
      say("ajan_isleri", "durum", "bekliyor"),
      say("ajan_raporlari", "okundu", false),
      oneriSay("yapilacak").then(async (n) => n + (await oneriSay("lio"))),
      oneriSay("fikir"),
    ]);
    const bagli = ajanBagliMi(a.son_nabiz);
    return {
      izinli: true,
      ad: a.ad,
      bagli,
      kurulu: !!a.isci_anahtar_ozeti,
      calisiyor: bagli && a.isci_durumu === "calisiyor",
      not: bagli ? a.isci_notu : null,
      model: a.model,
      sonNabiz: a.son_nabiz,
      ogrenmeAcik: a.ogrenme_acik,
      bekleyenIs,
      okunmamisRapor,
      bekleyenOneri,
      bekleyenFikir,
    };
  }

  async ayarlariGuncelle(userId: string, body: { ad?: unknown; ogrenmeAcik?: unknown }): Promise<AjanDurumu> {
    await this.assertIzinli(userId);
    await this.ayarlar(userId);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.ad !== undefined) {
      const ad = ajanKirp(body.ad, AJAN_SINIRLARI.ad);
      if (!ad) throw new BadRequestException("Ad boş olamaz.");
      patch.ad = ad;
    }
    if (typeof body.ogrenmeAcik === "boolean") patch.ogrenme_acik = body.ogrenmeAcik;
    const { error } = await this.db.from("ajan_ayarlari").update(patch).eq("user_id", userId);
    if (error) throw error;
    return this.durum(userId);
  }

  /** Yeni Mac anahtarı. Düz hâli YALNIZCA bu yanıtta görünür; saklanan özetidir. */
  async anahtarUret(userId: string): Promise<{ anahtar: string }> {
    await this.assertIzinli(userId);
    await this.ayarlar(userId);
    const anahtar = AJAN_ANAHTAR_ONEKI + randomBytes(24).toString("base64url");
    const { error } = await this.db
      .from("ajan_ayarlari")
      .update({ isci_anahtar_ozeti: anahtarOzeti(anahtar), anahtar_tarihi: new Date().toISOString(), son_nabiz: null })
      .eq("user_id", userId);
    if (error) throw error;
    return { anahtar };
  }

  async mesajlar(userId: string): Promise<AjanMesaj[]> {
    await this.assertIzinli(userId);
    const { data, error } = await this.db
      .from("ajan_mesajlari")
      .select("id, rol, metin, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(AKIS_TAVANI);
    if (error) throw error;
    return (data ?? []).reverse().map((m: any) => ({ id: m.id, rol: m.rol, metin: m.metin, createdAt: m.created_at }));
  }

  /** Sohbet mesajı: kayda girer ve Mac için bir "sohbet" işi açılır. */
  async mesajGonder(userId: string, metin: unknown): Promise<AjanMesaj> {
    await this.assertIzinli(userId);
    const temiz = ajanKirp(metin, AJAN_SINIRLARI.mesaj);
    if (!temiz) throw new BadRequestException("Mesaj boş olamaz.");
    const is = await this.isAc(userId, "sohbet", temiz);
    const { data, error } = await this.db
      .from("ajan_mesajlari")
      .insert({ user_id: userId, rol: "kullanici", metin: temiz, is_id: is.id })
      .select("id, rol, metin, created_at")
      .single();
    if (error) throw error;
    return { id: data.id, rol: data.rol, metin: data.metin, createdAt: data.created_at };
  }

  async arastir(userId: string, konu: unknown): Promise<AjanIs> {
    await this.assertIzinli(userId);
    const temiz = ajanKirp(konu, AJAN_SINIRLARI.girdi);
    if (!temiz) throw new BadRequestException("Araştırma konusu boş olamaz.");
    return this.isAc(userId, "arastirma", temiz);
  }

  async isler(userId: string): Promise<AjanIs[]> {
    await this.assertIzinli(userId);
    const { data, error } = await this.db
      .from("ajan_isleri")
      .select("*")
      .eq("user_id", userId)
      .neq("tur", "sohbet")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map(isSatiri);
  }

  async isIptal(userId: string, id: string): Promise<void> {
    await this.assertIzinli(userId);
    // Yalnızca bekleyen iş silinir; Mac'in elindeki iş zaten bitmek üzere.
    const { error } = await this.db.from("ajan_isleri").delete().eq("user_id", userId).eq("id", id).eq("durum", "bekliyor");
    if (error) throw error;
  }

  async raporlar(userId: string): Promise<AjanRaporOzeti[]> {
    await this.assertIzinli(userId);
    const { data, error } = await this.db
      .from("ajan_raporlari")
      .select("id, baslik, ozet, okundu, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({ id: r.id, baslik: r.baslik, ozet: r.ozet, okundu: r.okundu, createdAt: r.created_at }));
  }

  /** Raporu getirir ve okundu sayar. */
  async rapor(userId: string, id: string): Promise<AjanRapor> {
    await this.assertIzinli(userId);
    const { data, error } = await this.db.from("ajan_raporlari").select("*").eq("user_id", userId).eq("id", id).maybeSingle<any>();
    if (error) throw error;
    if (!data) throw new NotFoundException("Rapor bulunamadı.");
    if (!data.okundu) await this.db.from("ajan_raporlari").update({ okundu: true }).eq("id", id);
    return {
      id: data.id, baslik: data.baslik, ozet: data.ozet, okundu: true, createdAt: data.created_at,
      icerik: data.icerik, kaynaklar: Array.isArray(data.kaynaklar) ? data.kaynaklar : [],
    };
  }

  async raporSil(userId: string, id: string): Promise<void> {
    await this.assertIzinli(userId);
    const { error } = await this.db.from("ajan_raporlari").delete().eq("user_id", userId).eq("id", id);
    if (error) throw error;
  }

  async bilgiler(userId: string): Promise<AjanBilgi[]> {
    await this.assertIzinli(userId);
    const { data, error } = await this.db
      .from("ajan_bilgileri")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return (data ?? []).map(listeSatiri);
  }

  async ogret(userId: string, body: { baslik?: unknown; icerik?: unknown }): Promise<AjanBilgi> {
    await this.assertIzinli(userId);
    const icerik = ajanKirp(body.icerik, AJAN_SINIRLARI.ogretilen);
    if (!icerik) throw new BadRequestException("Öğretilecek metin boş olamaz.");
    const baslik = ajanKirp(body.baslik, AJAN_SINIRLARI.baslik) || icerik.split("\n")[0].slice(0, 80);
    const { data, error } = await this.db
      .from("ajan_bilgileri")
      .insert({ user_id: userId, tur: "ogretilen", baslik, icerik })
      .select()
      .single();
    if (error) throw error;
    return listeSatiri(data);
  }

  async bilgiSil(userId: string, id: string): Promise<void> {
    await this.assertIzinli(userId);
    const { error } = await this.db.from("ajan_bilgileri").delete().eq("user_id", userId).eq("id", id);
    if (error) throw error;
  }

  async konular(userId: string): Promise<AjanKonu[]> {
    await this.assertIzinli(userId);
    const { data, error } = await this.db
      .from("ajan_konulari")
      .select("*")
      .eq("user_id", userId)
      .order("oncelik", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return (data ?? []).map(konuSatiri);
  }

  async konuEkle(userId: string, body: { konu?: unknown; neden?: unknown }): Promise<AjanKonu> {
    await this.assertIzinli(userId);
    const [eklenen] = await this.konulariEkle(userId, [{ konu: ajanKirp(body.konu, AJAN_SINIRLARI.konu), neden: ajanKirp(body.neden, AJAN_SINIRLARI.neden) }], "kullanici", 1);
    if (!eklenen) throw new BadRequestException("Bu konu boş ya da zaten listede.");
    return eklenen;
  }

  async konuGuncelle(userId: string, id: string, body: { durum?: unknown; oncelik?: unknown }): Promise<AjanKonu> {
    await this.assertIzinli(userId);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.durum !== undefined) {
      if (!KONU_DURUMLARI.includes(body.durum as AjanKonuDurumu)) throw new BadRequestException("Geçersiz durum.");
      patch.durum = body.durum;
    }
    if (body.oncelik !== undefined) patch.oncelik = Math.max(-10, Math.min(10, Math.round(Number(body.oncelik) || 0)));
    const { data, error } = await this.db.from("ajan_konulari").update(patch).eq("user_id", userId).eq("id", id).select().maybeSingle<any>();
    if (error) throw error;
    if (!data) throw new NotFoundException("Konu bulunamadı.");
    return konuSatiri(data);
  }

  async konuSil(userId: string, id: string): Promise<void> {
    await this.assertIzinli(userId);
    const { error } = await this.db.from("ajan_konulari").delete().eq("user_id", userId).eq("id", id);
    if (error) throw error;
  }

  /** Sohbette onay bekleyen yapılacak ve Lio'ya devir önerileri. Fikirlerin kendi sekmesi var (fikirler). */
  async oneriler(userId: string): Promise<AjanOneri[]> {
    await this.assertIzinli(userId);
    const { data, error } = await this.db
      .from("ajan_onerileri")
      .select("*")
      .eq("user_id", userId)
      .eq("durum", "bekliyor")
      .in("tur", ["yapilacak", "lio"])
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return (data ?? []).map(oneriSatiri);
  }

  /** Bekleyen fikirler önce, sonra yanıtlanmış olanlar (geçmiş). */
  async fikirler(userId: string): Promise<AjanOneri[]> {
    await this.assertIzinli(userId);
    const { data, error } = await this.db
      .from("ajan_onerileri")
      .select("*")
      .eq("user_id", userId)
      .eq("tur", "fikir")
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    if (error) throw error;
    const liste = (data ?? []).map(oneriSatiri);
    return [...liste.filter((o) => o.durum === "bekliyor"), ...liste.filter((o) => o.durum !== "bekliyor")];
  }

  /** Fikri araştırmaya gönderir: ajan nasıl hayata geçeceğini araştırıp rapor yazar. Fikir beklemede kalır. */
  async fikriArastir(userId: string, id: string): Promise<AjanIs> {
    await this.assertIzinli(userId);
    const { data } = await this.db.from("ajan_onerileri").select("*").eq("user_id", userId).eq("id", id).eq("tur", "fikir").maybeSingle<any>();
    if (!data) throw new NotFoundException("Fikir bulunamadı.");
    const f = data.veri ?? {};
    await this.db.from("ajan_onerileri").update({ yanit_notu: "Araştırmaya gönderildi" }).eq("id", id);
    return this.isAc(
      userId,
      "arastirma",
      ajanKirp(
        `Şu fikri hayata geçirmek için araştır: "${f.baslik}". Beklenen fayda: ${f.fayda}. ` +
          `Benzer örnekleri, maliyeti, gereken araçları ve riskleri bul; adım adım uygulanabilir bir plan yaz.`,
        AJAN_SINIRLARI.girdi
      )
    );
  }

  /**
   * Öneriyi yanıtlar. Onayda işi yapan BU servis ve kullanıcının kendi
   * yetkisiyle: yapılacak, kişinin kendi listesine (PersonalTodosService) girer.
   */
  async oneriYanitla(userId: string, id: string, onay: boolean, not?: unknown): Promise<void> {
    await this.assertIzinli(userId);
    // Önce durumu çevir: iki sekmeden aynı anda basılırsa yapılacak iki kez açılmasın.
    // Gerekçe fikirde ajana geri gider: "neden istemediğini" sonraki fikirlerde görür.
    const { data, error } = await this.db
      .from("ajan_onerileri")
      .update({ durum: onay ? "onaylandi" : "reddedildi", yanit_notu: ajanKirp(not, 500) || null, yanit_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .eq("durum", "bekliyor")
      .select()
      .maybeSingle<any>();
    if (error) throw error;
    if (!data) throw new NotFoundException("Öneri bulunamadı ya da zaten yanıtlandı.");
    if (!onay) return;
    if (data.tur === "yapilacak") {
      try {
        await this.yapilacaklar.create(userId, {
          title: data.veri?.baslik,
          description: data.veri?.aciklama,
          dueDate: data.veri?.bitis,
        });
      } catch (e) {
        await this.db.from("ajan_onerileri").update({ durum: "bekliyor" }).eq("id", id);
        throw e;
      }
    }
    if (data.tur === "fikir") {
      try {
        await this.yapilacaklar.create(userId, { title: data.veri?.baslik, description: ajanFikirAciklamasi(data.veri) });
      } catch (e) {
        await this.db.from("ajan_onerileri").update({ durum: "bekliyor" }).eq("id", id);
        throw e;
      }
    }
  }

  // ============================================================ otomasyonlar

  async otomasyonlar(userId: string): Promise<AjanOtomasyon[]> {
    await this.assertIzinli(userId);
    const { data, error } = await this.db.from("ajan_otomasyonlari").select("*").eq("user_id", userId).order("created_at", { ascending: true }).limit(LISTE_TAVANI);
    if (error) throw error;
    return (data ?? []).map(otomasyonSatiri);
  }

  async otomasyonEkle(userId: string, body: Record<string, unknown>): Promise<AjanOtomasyon> {
    await this.assertIzinli(userId);
    const { count } = await this.db.from("ajan_otomasyonlari").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if ((count ?? 0) >= AJAN_SINIRLARI.otomasyon) throw new BadRequestException("Otomasyon sınırına ulaştın; birini silip yeniden dene.");
    const v = otomasyonGirdisi(body, null);
    const { data, error } = await this.db
      .from("ajan_otomasyonlari")
      .insert({ user_id: userId, ...v, sonraki: ajanSonrakiCalisma(v) })
      .select()
      .single();
    if (error) throw error;
    return otomasyonSatiri(data);
  }

  async otomasyonGuncelle(userId: string, id: string, body: Record<string, unknown>): Promise<AjanOtomasyon> {
    await this.assertIzinli(userId);
    const { data: eski } = await this.db.from("ajan_otomasyonlari").select("*").eq("user_id", userId).eq("id", id).maybeSingle<any>();
    if (!eski) throw new NotFoundException("Otomasyon bulunamadı.");
    const v = otomasyonGirdisi(body, eski);
    const { data, error } = await this.db
      .from("ajan_otomasyonlari")
      .update({ ...v, sonraki: ajanSonrakiCalisma(v), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return otomasyonSatiri(data);
  }

  async otomasyonSil(userId: string, id: string): Promise<void> {
    await this.assertIzinli(userId);
    const { error } = await this.db.from("ajan_otomasyonlari").delete().eq("user_id", userId).eq("id", id);
    if (error) throw error;
  }

  /** "Şimdi çalıştır": zamanını beklemeden sıraya koyar; düzenli zamanı değişmez. */
  async otomasyonCalistir(userId: string, id: string): Promise<AjanIs> {
    await this.assertIzinli(userId);
    const { data } = await this.db.from("ajan_otomasyonlari").select("*").eq("user_id", userId).eq("id", id).maybeSingle<any>();
    if (!data) throw new NotFoundException("Otomasyon bulunamadı.");
    return this.otomasyonIsiAc(userId, data);
  }

  // ============================================================ şirket

  /** Ajanın şirket hakkında bildiği: panelde gösterilir, kullanıcı neyin gittiğini görsün. */
  async sirket(userId: string, tazele = false): Promise<{ metin: string; tarih: string | null }> {
    await this.assertIzinli(userId);
    return this.sirketProfili(userId, tazele);
  }

  /**
   * Şirketin Projelio'daki profili. Lio'nun salt okunur araçlarından, kullanıcının
   * yetkisiyle; hassas alanlar ayıklanır. Günde bir tazelenir (her iş için yeniden
   * çıkarmak onlarca sorgu demek), şirket inceleme işinde zorla tazelenir.
   */
  private async sirketProfili(userId: string, zorla: boolean): Promise<{ metin: string; tarih: string | null }> {
    const a = await this.ayarlar(userId);
    const taze = a.sirket_ozeti_at && Date.now() - Date.parse(a.sirket_ozeti_at) < AJAN_SIRKET_ARALIGI_MS;
    if (!zorla && taze) return { metin: a.sirket_ozeti ?? "", tarih: a.sirket_ozeti_at };
    const oku = async (arac: string, girdi: Record<string, unknown> = {}) => {
      try {
        return ajanHassasAlanlariAt(await this.lio.ajanIcinOku(userId, arac, girdi));
      } catch {
        return null; // yetki yoksa ya da modül kapalıysa o parça atlanır
      }
    };
    const kisa = (v: unknown, n: number) => {
      const m = JSON.stringify(v ?? null);
      return m.length > n ? m.slice(0, n) + "…" : m;
    };
    const parcalar: string[] = [];
    const sirketler = ((await oku("list_organizations")) as any[]) ?? [];
    if (sirketler.length) parcalar.push(`Şirketler: ${kisa(sirketler, 600)}`);
    for (const o of sirketler.slice(0, 3)) {
      const id = o.organizationId;
      const [kart, departmanlar, urunler, musteriler] = await Promise.all([
        oku("get_info_card", { scopeType: "organization", scopeId: id }),
        oku("list_departments", { organizationId: id }),
        oku("list_products", { organizationId: id, limit: 25 }),
        oku("list_customers", { organizationId: id }),
      ]);
      parcalar.push(`[${o.ad}] Bilgi kartı: ${kisa(kart, 700)}`);
      if (Array.isArray(departmanlar) && departmanlar.length) parcalar.push(`[${o.ad}] Departmanlar: ${kisa(departmanlar.map((d: any) => d.name ?? d.ad), 300)}`);
      if (Array.isArray(urunler) && urunler.length) parcalar.push(`[${o.ad}] Ürün/hizmetler (${urunler.length}): ${kisa(urunler, 700)}`);
      if (Array.isArray(musteriler) && musteriler.length)
        parcalar.push(`[${o.ad}] Müşteriler (${musteriler.length}${musteriler.length >= 50 ? "+" : ""}): ${kisa(musteriler.map((m: any) => m.ad), 400)}`);
    }
    const [isler, projeler, durum] = await Promise.all([oku("list_jobs"), oku("list_projects"), oku("get_workspace_summary")]);
    if (Array.isArray(isler) && isler.length) parcalar.push(`İşler (${isler.length}): ${kisa(isler.map((j: any) => j.title), 400)}`);
    if (Array.isArray(projeler) && projeler.length) {
      const aktif = projeler.filter((p: any) => p.status === "active");
      parcalar.push(`Projeler (aktif ${aktif.length}/${projeler.length}): ${kisa((aktif.length ? aktif : projeler).slice(0, 25), 700)}`);
    }
    if (durum) parcalar.push(`Genel durum: ${kisa(durum, 500)}`);
    const metin = parcalar.join("\n").slice(0, AJAN_SIRKET_BUTCESI);
    const tarih = new Date().toISOString();
    await this.db.from("ajan_ayarlari").update({ sirket_ozeti: metin, sirket_ozeti_at: tarih }).eq("user_id", userId);
    return { metin, tarih };
  }

  /** Mac'in projelio_oku aracı: izinli okuma aracı + kimlik/sorgu, hassas alanlar ayıklanmış, kırpılmış. */
  async projeliodaOku(userId: string, arac: unknown, kimlik: unknown, sorgu: unknown): Promise<{ sonuc: string }> {
    if (!ajanProjelioAraciMi(arac)) throw new BadRequestException("Ajan bu aracı kullanamaz.");
    const id = ajanKirp(kimlik, 80) || undefined;
    const girdi: Record<string, unknown> = { query: ajanKirp(sorgu, 100) || undefined };
    if (arac === "get_info_card") Object.assign(girdi, { scopeType: "organization", scopeId: id });
    else if (arac === "list_projects") girdi.jobId = id;
    else if (arac === "list_tasks") girdi.projectId = id;
    else girdi.organizationId = id;
    try {
      const v = ajanHassasAlanlariAt(await this.lio.ajanIcinOku(userId, arac, girdi));
      return { sonuc: JSON.stringify(v).slice(0, 6000) };
    } catch (e: any) {
      return { sonuc: `Okunamadı: ${String(e?.message ?? e).slice(0, 200)}` };
    }
  }

  // ============================================================ Mac (işçi)

  async nabiz(userId: string, body: { durum?: unknown; not?: unknown; model?: unknown }): Promise<{ ok: true }> {
    await this.ayarlar(userId);
    const { error } = await this.db
      .from("ajan_ayarlari")
      .update({
        son_nabiz: new Date().toISOString(),
        isci_durumu: body.durum === "calisiyor" ? "calisiyor" : "bosta",
        isci_notu: ajanKirp(body.not, AJAN_SINIRLARI.not) || null,
        model: ajanKirp(body.model, 80) || null,
      })
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  }

  /**
   * Mac'e sıradaki işi verir. Kuyruk boşsa ve öğrenme açıksa kendi öğrenme
   * işini kendisi yaratır: "sürekli öğrenen ajan" bu fonksiyondan ibaret.
   */
  /** `yogun`: Mac prizde ve kullanıcı başında değil (Mac kendisi söyler, bkz. ajan/src/mac.ts). */
  async isAl(userId: string, secenek: { yogun?: boolean } = {}): Promise<AjanIsPaketi | null> {
    await this.asililariGeriAl(userId);
    await this.vadesiGelenOtomasyonlar(userId);
    let is = await this.siradakiniKap(userId);
    if (!is) {
      const bosta = await this.bostaIsUret(userId, !!secenek.yogun);
      if (bosta) is = await this.siradakiniKap(userId);
    }
    if (!is) return null;
    const a = await this.ayarlar(userId);
    const { data: ogretilen } = await this.db
      .from("ajan_bilgileri")
      .select("baslik, icerik")
      .eq("user_id", userId)
      .eq("tur", "ogretilen")
      .order("created_at", { ascending: false })
      .limit(OGRETILEN_PAKET_TAVANI);
    let sonMesajlar: AjanIsPaketi["sonMesajlar"] = [];
    if (is.tur === "sohbet") {
      const { data } = await this.db
        .from("ajan_mesajlari")
        .select("rol, metin")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(SOHBET_GECMISI);
      sonMesajlar = (data ?? []).reverse();
    }
    let mevcutKonular: string[] = [];
    if (is.tur === "liste") {
      const { data } = await this.db.from("ajan_konulari").select("konu").eq("user_id", userId).order("created_at", { ascending: false }).limit(100);
      mevcutKonular = (data ?? []).map((k: any) => k.konu);
    }
    const baglam = ["fikir", "arastirma", "otomasyon", "sirket"].includes(is.tur) ? await this.baglamMetni(userId) : undefined;
    // Liste işi dışında her işte: ajan şirketi bilerek konuşsun, araştırsın, önersin.
    const sirket = is.tur === "liste" ? undefined : (await this.sirketProfili(userId, is.tur === "sirket")).metin || undefined;
    return { is, ad: a.ad, ogretilenler: ajanOgretilenleriSigdir(ogretilen ?? []), sonMesajlar, mevcutKonular, baglam, sirket };
  }

  /**
   * Bellekte arama (Mac'in "bellekte_ara" aracı). Basit metin eşleşmesi; MVP
   * için yeterli. Kelimelerden BİRİ geçen kayıt gelir (model "Pro paket fiyatı"
   * diye cümle arıyor, belgede o cümle yok), uzun belgeden de yalnızca
   * kelimelerin geçtiği yerlerin çevresi döner.
   */
  async bellekteAra(userId: string, sorgu: unknown): Promise<{ baslik: string; icerik: string }[]> {
    const kelimeler = ajanAramaKelimeleri(ajanKirp(sorgu, 100));
    if (!kelimeler.length) return [];
    const kosul = kelimeler.flatMap((k) => [`baslik.ilike.%${k}%`, `icerik.ilike.%${k}%`]).join(",");
    const { data, error } = await this.db
      .from("ajan_bilgileri")
      .select("baslik, icerik")
      .eq("user_id", userId)
      .or(kosul)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw error;
    return (data ?? []).map((b: any) => ({ baslik: b.baslik, icerik: ajanBellekAlintisi(String(b.icerik), kelimeler) }));
  }

  async isBitir(userId: string, id: string, ham: unknown): Promise<{ ok: true }> {
    const { data: is, error } = await this.db.from("ajan_isleri").select("*").eq("user_id", userId).eq("id", id).maybeSingle<any>();
    if (error) throw error;
    if (!is) throw new NotFoundException("İş bulunamadı.");
    if (is.durum !== "calisiyor") return { ok: true }; // geç gelen ikinci yanıt: sessizce yok say
    const s = ajanSonucunuTemizle(ham);
    const simdi = new Date().toISOString();

    if (s.mesaj && is.tur === "sohbet")
      await this.zorunlu(this.db.from("ajan_mesajlari").insert({ user_id: userId, rol: "ajan", metin: s.mesaj, is_id: id }));
    if (s.rapor)
      await this.zorunlu(
        this.db.from("ajan_raporlari").insert({
          user_id: userId, is_id: id, baslik: s.rapor.baslik, ozet: s.rapor.ozet ?? null,
          icerik: s.rapor.icerik, kaynaklar: s.rapor.kaynaklar ?? [],
        })
      );
    // Sohbette kaydedilen not kullanıcının söylediğidir ("bunu unutma"): öğretilen
    // sayılır ve sonraki her işte ajana kural olarak gider. Araştırmada ve
    // öğrenmede çıkanlar ajanın kendi bulduğu bilgi.
    if (s.bilgiler?.length)
      await this.zorunlu(
        this.db.from("ajan_bilgileri").insert(
          s.bilgiler.map((b) => ({
            user_id: userId, tur: is.tur === "sohbet" ? "ogretilen" : "ogrenilen",
            baslik: b.baslik, icerik: b.icerik, kaynaklar: b.kaynaklar ?? [],
          }))
        )
      );
    if (s.konular?.length) await this.konulariEkle(userId, s.konular, "ajan", 0);
    // Aynı fikir ikinci kez önüne gelmesin: bekleyen ya da reddedilmiş bir fikirle aynı başlık atılır.
    const oneriler = s.oneriler?.length ? await this.yeniFikirleriAyikla(userId, s.oneriler) : [];
    if (oneriler.length)
      await this.zorunlu(this.db.from("ajan_onerileri").insert(oneriler.map((o) => ({ user_id: userId, is_id: id, tur: o.tur, veri: o.veri }))));

    if (is.konu_id)
      await this.db
        .from("ajan_konulari")
        .update({ durum: s.hata ? "bekliyor" : "ogrenildi", updated_at: simdi })
        .eq("id", is.konu_id);
    // Sohbet hatası kullanıcıya görünsün: yoksa mesajı yanıtsız kalır, neden bilinmez.
    if (s.hata && is.tur === "sohbet")
      await this.db.from("ajan_mesajlari").insert({ user_id: userId, rol: "ajan", metin: `(Yanıt veremedim: ${s.hata})`, is_id: id });

    await this.zorunlu(
      this.db.from("ajan_isleri").update({ durum: s.hata ? "hata" : "bitti", hata: s.hata ?? null, bitti_at: simdi }).eq("id", id)
    );
    return { ok: true };
  }

  // ============================================================ iç

  private async zorunlu(q: PromiseLike<{ error: any }>): Promise<void> {
    const { error } = await q;
    if (error) throw error;
  }

  private async isAc(userId: string, tur: AjanIsTuru, girdi: string, konuId?: string): Promise<AjanIs> {
    const { data, error } = await this.db
      .from("ajan_isleri")
      .insert({ user_id: userId, tur, girdi, konu_id: konuId ?? null })
      .select()
      .single();
    if (error) throw error;
    return isSatiri(data);
  }

  private async yeniFikirleriAyikla(userId: string, oneriler: NonNullable<ReturnType<typeof ajanSonucunuTemizle>["oneriler"]>) {
    if (!oneriler.some((o) => o.tur === "fikir")) return oneriler;
    const { data } = await this.db.from("ajan_onerileri").select("veri").eq("user_id", userId).eq("tur", "fikir").in("durum", ["bekliyor", "reddedildi"]).limit(LISTE_TAVANI);
    const gorulen = new Set((data ?? []).map((o: any) => ajanKonuAnahtari(String(o.veri?.baslik ?? ""))));
    return oneriler.filter((o) => {
      if (o.tur !== "fikir") return true;
      const anahtar = ajanKonuAnahtari(o.veri.baslik);
      if (gorulen.has(anahtar)) return false;
      gorulen.add(anahtar);
      return true;
    });
  }

  /** Vadesi gelen otomasyonlar sıraya girer; sonraki zaman hemen ilerletilir (iki yoklama aynısını açmasın). */
  private async vadesiGelenOtomasyonlar(userId: string): Promise<void> {
    const simdi = new Date().toISOString();
    const { data } = await this.db.from("ajan_otomasyonlari").select("*").eq("user_id", userId).eq("acik", true).lte("sonraki", simdi).limit(5);
    for (const o of data ?? []) {
      // Koşullu güncelleme: eş zamanlı iki is-al'den yalnızca biri işi açar.
      const { data: kapilan } = await this.db
        .from("ajan_otomasyonlari")
        .update({ sonraki: ajanSonrakiCalisma(o), son_calisma: simdi })
        .eq("id", o.id)
        .eq("sonraki", o.sonraki)
        .select()
        .maybeSingle<any>();
      if (kapilan) await this.otomasyonIsiAc(userId, o);
    }
  }

  private async otomasyonIsiAc(userId: string, o: any): Promise<AjanIs> {
    const { data, error } = await this.db
      .from("ajan_isleri")
      .insert({ user_id: userId, tur: "otomasyon", girdi: ajanKirp(`${o.ad}\n\n${o.talimat}`, AJAN_SINIRLARI.talimat), otomasyon_id: o.id })
      .select()
      .single();
    if (error) throw error;
    return isSatiri(data);
  }

  /**
   * Ajanın öğrendiğini KULLANMASI için pakete giren özet: son notlar, son
   * raporlar, önceki fikirlere verilen yanıtlar. Ret gerekçesi bilerek var:
   * kullanıcı "bunu neden istemediğini" söyledikçe fikirler ona göre değişir.
   */
  private async baglamMetni(userId: string): Promise<string> {
    const [notlar, raporlar, fikirler] = await Promise.all([
      this.db.from("ajan_bilgileri").select("baslik, icerik").eq("user_id", userId).eq("tur", "ogrenilen").order("created_at", { ascending: false }).limit(15),
      this.db.from("ajan_raporlari").select("baslik, ozet").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
      this.db.from("ajan_onerileri").select("veri, durum, yanit_notu").eq("user_id", userId).eq("tur", "fikir").order("created_at", { ascending: false }).limit(25),
    ]);
    const bolumler: string[] = [];
    if (notlar.data?.length) bolumler.push(`Son öğrendiklerin:\n${notlar.data.map((n: any) => `- ${n.baslik}: ${String(n.icerik).slice(0, 350)}`).join("\n")}`);
    if (raporlar.data?.length) bolumler.push(`Son raporların:\n${raporlar.data.map((r: any) => `- ${r.baslik}${r.ozet ? `: ${r.ozet}` : ""}`).join("\n")}`);
    const f = fikirler.data ?? [];
    const kabul = f.filter((x: any) => x.durum === "onaylandi").map((x: any) => `- ${x.veri?.baslik}`);
    const ret = f.filter((x: any) => x.durum === "reddedildi").map((x: any) => `- ${x.veri?.baslik}${x.yanit_notu ? ` (neden: ${x.yanit_notu})` : ""}`);
    const bekleyen = f.filter((x: any) => x.durum === "bekliyor").map((x: any) => `- ${x.veri?.baslik}`);
    if (kabul.length) bolumler.push(`Kullanıcının BEĞENİP işe çevirdiği fikirler (bu tarzda devam et):\n${kabul.join("\n")}`);
    if (ret.length) bolumler.push(`Kullanıcının REDDETTİĞİ fikirler (benzerini önerme, gerekçeye dikkat et):\n${ret.join("\n")}`);
    if (bekleyen.length) bolumler.push(`Zaten önerdiğin, yanıt bekleyen fikirler (tekrarlama):\n${bekleyen.join("\n")}`);
    return bolumler.join("\n\n").slice(0, BAGLAM_BUTCESI);
  }

  private async asililariGeriAl(userId: string): Promise<void> {
    const { data } = await this.db.from("ajan_isleri").select("id, alindi_at").eq("user_id", userId).eq("durum", "calisiyor").limit(20);
    const asili = (data ?? []).filter((i: any) => ajanIsAsiliMi(i.alindi_at)).map((i: any) => i.id);
    if (asili.length) await this.db.from("ajan_isleri").update({ durum: "bekliyor", alindi_at: null }).in("id", asili);
  }

  /**
   * En eski bekleyen işi "calisiyor"a çevirerek kapar. Kullanıcının sohbeti
   * araştırmadan önce gelir: araştırma dakikalar sürer, mesaja yanıt beklemek
   * ise ekranın başındaki birini bekletir.
   */
  private async siradakiniKap(userId: string): Promise<AjanIs | null> {
    // Kullanıcının istedikleri (araştırma, otomasyon) ajanın kendi işlerinden önce.
    for (const turler of [["sohbet"], ["arastirma", "otomasyon"], ["fikir", "ogrenme", "liste"]]) {
      const { data } = await this.db
        .from("ajan_isleri")
        .select("id")
        .eq("user_id", userId)
        .eq("durum", "bekliyor")
        .in("tur", turler)
        .order("created_at", { ascending: true })
        .limit(1);
      const id = data?.[0]?.id;
      if (!id) continue;
      // Koşullu güncelleme: iki program aynı işi alırsa yalnızca biri kazanır.
      const { data: kapilan } = await this.db
        .from("ajan_isleri")
        .update({ durum: "calisiyor", alindi_at: new Date().toISOString() })
        .eq("id", id)
        .eq("durum", "bekliyor")
        .select()
        .maybeSingle<any>();
      if (kapilan) {
        if (kapilan.konu_id) await this.db.from("ajan_konulari").update({ durum: "ogreniliyor" }).eq("id", kapilan.konu_id);
        return isSatiri(kapilan);
      }
    }
    return null;
  }

  private async bostaIsUret(userId: string, yogun: boolean): Promise<boolean> {
    const a = await this.ayarlar(userId);
    const sonu = async (tur: AjanIsTuru) => {
      const { data } = await this.db.from("ajan_isleri").select("created_at").eq("user_id", userId).eq("tur", tur).order("created_at", { ascending: false }).limit(1);
      return (data?.[0]?.created_at as string | undefined) ?? null;
    };
    const { data: konu } = await this.db
      .from("ajan_konulari")
      .select("id, konu, neden")
      .eq("user_id", userId)
      .eq("durum", "bekliyor")
      .order("oncelik", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);
    const sonFikir = await sonu("fikir");
    const sonSirket = await sonu("sirket");
    let yeniNot = this.db.from("ajan_bilgileri").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("tur", "ogrenilen");
    if (sonFikir) yeniNot = yeniNot.gt("created_at", sonFikir);
    const { count: yeniNotSayisi } = await yeniNot;
    const karar = ajanBostaNeYapsin({
      ogrenmeAcik: a.ogrenme_acik,
      bekleyenKonuVar: !!konu?.length,
      // Liste ve fikir de birer öğrenme adımı sayılır: arka arkaya koşmasınlar.
      sonOgrenme: [await sonu("ogrenme"), await sonu("liste"), sonFikir, sonSirket].filter(Boolean).sort().pop() ?? null,
      sonListe: await sonu("liste"),
      yeniNot: yeniNotSayisi ?? 0,
      sonFikir,
      sonSirket,
      yogun,
    });
    if (karar === "sirket") {
      await this.isAc(userId, "sirket", "Şirketimin Projelio'daki profilini incele: neler var, neler eksik, nerede fırsat ya da risk görüyorsun?");
      return true;
    }
    if (karar === "fikir") {
      await this.isAc(userId, "fikir", "Son öğrendiklerini ve araştırmalarını şirketim için iş bitirici fikirlere dönüştür.");
      return true;
    }
    if (karar === "ogrenme" && konu?.[0]) {
      const k = konu[0] as any;
      await this.isAc(userId, "ogrenme", k.neden ? `${k.konu}\n(Neden: ${k.neden})` : k.konu, k.id);
      return true;
    }
    if (karar === "liste") {
      // Hiçbir şey öğretilmemişken liste çıkarılmaz: canlıdaki ilk koşuda
      // (2026-11-02) model dayanacak bir şey bulamayıp boş döndü. Ajan
      // kullanıcının öğrettikleri doğrultusunda öğrenir; o yoksa bekler.
      const { count } = await this.db
        .from("ajan_bilgileri")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("tur", "ogretilen");
      if (!count) return false;
      await this.isAc(userId, "liste", "Öğrettiklerime ve şimdiye kadar öğrendiklerine bakarak öğrenme listene yeni konular ekle.");
      return true;
    }
    return false;
  }

  private async konulariEkle(
    userId: string,
    konular: { konu: string; neden?: string }[],
    oneren: "kullanici" | "ajan",
    oncelik: number
  ): Promise<AjanKonu[]> {
    const { data: mevcut } = await this.db.from("ajan_konulari").select("konu").eq("user_id", userId).limit(LISTE_TAVANI);
    const gorulen = new Set((mevcut ?? []).map((k: any) => ajanKonuAnahtari(k.konu)));
    const yeni = [];
    for (const k of konular) {
      const anahtar = ajanKonuAnahtari(k.konu);
      if (!anahtar || gorulen.has(anahtar)) continue;
      gorulen.add(anahtar);
      yeni.push({ user_id: userId, konu: k.konu, neden: k.neden || null, oneren, oncelik });
    }
    if (!yeni.length) return [];
    const { data, error } = await this.db.from("ajan_konulari").insert(yeni).select();
    if (error) throw error;
    return (data ?? []).map(konuSatiri);
  }
}

function isSatiri(r: any): AjanIs {
  return { id: r.id, tur: r.tur, girdi: r.girdi, konuId: r.konu_id, durum: r.durum, hata: r.hata, createdAt: r.created_at };
}

function bilgiSatiri(r: any): AjanBilgi {
  return { id: r.id, tur: r.tur, baslik: r.baslik, icerik: r.icerik, uzunluk: String(r.icerik ?? "").length, kaynaklar: Array.isArray(r.kaynaklar) ? r.kaynaklar : [], createdAt: r.created_at };
}

/** Listede belgenin yalnızca başı: 100 sayfalık metni her açılışta tarayıcıya taşımaya gerek yok. */
function listeSatiri(r: any): AjanBilgi {
  return { ...bilgiSatiri(r), icerik: String(r.icerik).slice(0, LISTEDE_ICERIK) };
}

function oneriSatiri(o: any): AjanOneri {
  return { id: o.id, tur: o.tur, veri: o.veri, durum: o.durum, yanitNotu: o.yanit_notu ?? null, createdAt: o.created_at };
}

function otomasyonSatiri(r: any): AjanOtomasyon {
  return {
    id: r.id, ad: r.ad, talimat: r.talimat, siklik: r.siklik, saat: r.saat, gun: r.gun, acik: r.acik,
    sonCalisma: r.son_calisma, sonraki: r.sonraki, createdAt: r.created_at,
  };
}

/** Gövdeden otomasyon alanları; `eski` verilirse eksik alanlar ondan gelir (kısmi güncelleme). */
function otomasyonGirdisi(b: Record<string, unknown>, eski: any) {
  const ad = b.ad !== undefined ? ajanKirp(b.ad, AJAN_SINIRLARI.otomasyonAdi) : eski?.ad;
  const talimat = b.talimat !== undefined ? ajanKirp(b.talimat, AJAN_SINIRLARI.talimat) : eski?.talimat;
  const siklik = (b.siklik ?? eski?.siklik) as AjanOtomasyonSikligi;
  const tamsayi = (v: unknown, enAz: number, enCok: number, varsayilan: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(enAz, Math.min(enCok, n)) : varsayilan;
  };
  const saat = tamsayi(b.saat ?? eski?.saat, 0, 23, 9);
  const gun = tamsayi(b.gun ?? eski?.gun, 1, siklik === "haftalik" ? 7 : 28, 1);
  const acik = b.acik !== undefined ? b.acik === true : eski?.acik ?? true;
  if (!ad) throw new BadRequestException("Otomasyonun adı boş olamaz.");
  if (!talimat) throw new BadRequestException("Otomasyonun talimatı boş olamaz.");
  if (!SIKLIKLAR.includes(siklik)) throw new BadRequestException("Geçersiz sıklık.");
  return { ad, talimat, siklik, saat, gun, acik };
}

function konuSatiri(r: any): AjanKonu {
  return { id: r.id, konu: r.konu, neden: r.neden, oneren: r.oneren, durum: r.durum, oncelik: r.oncelik, createdAt: r.created_at };
}
