import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import {
  AJAN_ANAHTAR_ONEKI,
  AJAN_SINIRLARI,
  ajanBagliMi,
  ajanBostaNeYapsin,
  ajanIsAsiliMi,
  ajanKirp,
  ajanKonuAnahtari,
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
  type AjanRapor,
  type AjanRaporOzeti,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { PersonalTodosService } from "../personal-todos/personal-todos.service";
import { AKIS_TAVANI, LISTE_TAVANI } from "../../common/liste-tavani";

/** Mac'in işi alırken gördüğü öğretilen bilgi sayısı (modelin bağlamı küçük). */
const OGRETILEN_PAKET_TAVANI = 30;
const SOHBET_GECMISI = 12;
const KONU_DURUMLARI: AjanKonuDurumu[] = ["bekliyor", "ogreniliyor", "ogrenildi", "atlandi"];

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
    private yapilacaklar: PersonalTodosService
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
      sonNabiz: null, ogrenmeAcik: false, bekleyenIs: 0, okunmamisRapor: 0, bekleyenOneri: 0,
    };
    if (!(await this.izinli(userId))) return bos;
    const a = await this.ayarlar(userId);
    const say = async (tablo: string, sutun: string, deger: unknown) => {
      const { count } = await this.db.from(tablo).select("id", { count: "exact", head: true }).eq("user_id", userId).eq(sutun, deger as any);
      return count ?? 0;
    };
    const [bekleyenIs, okunmamisRapor, bekleyenOneri] = await Promise.all([
      say("ajan_isleri", "durum", "bekliyor"),
      say("ajan_raporlari", "okundu", false),
      say("ajan_onerileri", "durum", "bekliyor"),
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
    return (data ?? []).map(bilgiSatiri);
  }

  async ogret(userId: string, body: { baslik?: unknown; icerik?: unknown }): Promise<AjanBilgi> {
    await this.assertIzinli(userId);
    const icerik = ajanKirp(body.icerik, AJAN_SINIRLARI.bilgi);
    if (!icerik) throw new BadRequestException("Öğretilecek metin boş olamaz.");
    const baslik = ajanKirp(body.baslik, AJAN_SINIRLARI.baslik) || icerik.split("\n")[0].slice(0, 80);
    const { data, error } = await this.db
      .from("ajan_bilgileri")
      .insert({ user_id: userId, tur: "ogretilen", baslik, icerik })
      .select()
      .single();
    if (error) throw error;
    return bilgiSatiri(data);
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

  async oneriler(userId: string): Promise<AjanOneri[]> {
    await this.assertIzinli(userId);
    const { data, error } = await this.db
      .from("ajan_onerileri")
      .select("*")
      .eq("user_id", userId)
      .eq("durum", "bekliyor")
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return (data ?? []).map((o: any) => ({ id: o.id, tur: o.tur, veri: o.veri, durum: o.durum, createdAt: o.created_at }));
  }

  /**
   * Öneriyi yanıtlar. Onayda işi yapan BU servis ve kullanıcının kendi
   * yetkisiyle: yapılacak, kişinin kendi listesine (PersonalTodosService) girer.
   */
  async oneriYanitla(userId: string, id: string, onay: boolean): Promise<void> {
    await this.assertIzinli(userId);
    // Önce durumu çevir: iki sekmeden aynı anda basılırsa yapılacak iki kez açılmasın.
    const { data, error } = await this.db
      .from("ajan_onerileri")
      .update({ durum: onay ? "onaylandi" : "reddedildi" })
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
  async isAl(userId: string): Promise<AjanIsPaketi | null> {
    await this.asililariGeriAl(userId);
    let is = await this.siradakiniKap(userId);
    if (!is) {
      const bosta = await this.bostaIsUret(userId);
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
    return { is, ad: a.ad, ogretilenler: ogretilen ?? [], sonMesajlar, mevcutKonular };
  }

  /** Bellekte arama (Mac'in "bellekte_ara" aracı). Basit metin eşleşmesi; MVP için yeterli. */
  async bellekteAra(userId: string, sorgu: unknown): Promise<{ baslik: string; icerik: string }[]> {
    const q = ajanKirp(sorgu, 100).replace(/[%_,()]/g, " ").trim();
    if (!q) return [];
    const { data, error } = await this.db
      .from("ajan_bilgileri")
      .select("baslik, icerik")
      .eq("user_id", userId)
      .or(`baslik.ilike.%${q}%,icerik.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw error;
    return (data ?? []).map((b: any) => ({ baslik: b.baslik, icerik: String(b.icerik).slice(0, 1500) }));
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
    if (s.oneriler?.length)
      await this.zorunlu(this.db.from("ajan_onerileri").insert(s.oneriler.map((o) => ({ user_id: userId, is_id: id, tur: o.tur, veri: o.veri }))));

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
    for (const turler of [["sohbet"], ["arastirma", "ogrenme", "liste"]]) {
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

  private async bostaIsUret(userId: string): Promise<boolean> {
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
    const karar = ajanBostaNeYapsin({
      ogrenmeAcik: a.ogrenme_acik,
      bekleyenKonuVar: !!konu?.length,
      // Liste hazırlamak da bir öğrenme adımı sayılır: ikisi arka arkaya koşmasın.
      sonOgrenme: [await sonu("ogrenme"), await sonu("liste")].filter(Boolean).sort().pop() ?? null,
      sonListe: await sonu("liste"),
    });
    if (karar === "ogrenme" && konu?.[0]) {
      const k = konu[0] as any;
      await this.isAc(userId, "ogrenme", k.neden ? `${k.konu}\n(Neden: ${k.neden})` : k.konu, k.id);
      return true;
    }
    if (karar === "liste") {
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
  return { id: r.id, tur: r.tur, baslik: r.baslik, icerik: r.icerik, kaynaklar: Array.isArray(r.kaynaklar) ? r.kaynaklar : [], createdAt: r.created_at };
}

function konuSatiri(r: any): AjanKonu {
  return { id: r.id, konu: r.konu, neden: r.neden, oneren: r.oneren, durum: r.durum, oncelik: r.oncelik, createdAt: r.created_at };
}
