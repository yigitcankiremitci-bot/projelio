import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ArkadasAramaSonucu, ArkadasIstegi, ArkadasKisi, ArkadasOzeti, SosyalProfil } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AccessService } from "../../common/access/access.service";
import { requireUuid } from "../../common/validation/input";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import {
  aramaSorgusuCoz,
  durumHesapla,
  istekKarari,
  likeKacir,
  type ArkadaslikSatiri,
} from "./arkadaslik-durumu";

const KISI_SUTUNLARI = "id, full_name, username, avatar_url, title";
const SATIR_SUTUNLARI = "id, isteyen_id, alan_id, durum, created_at";
const ARAMA_TAVANI = 10;

function kisiyeCevir(row: any): ArkadasKisi {
  return {
    userId: row.id,
    fullName: row.full_name ?? "Bilinmeyen kullanıcı",
    username: row.username ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    title: row.title ?? undefined,
  };
}

/**
 * Arkadaşlık: iş/şirket ilişkisinden bağımsız, iki kişi arasında.
 *
 * Kararların kendisi (kim kime istek gönderebilir, kim neyi görür) saf
 * fonksiyonlarda — bkz. arkadaslik-durumu.ts. Burası yalnızca veriyi okuyup
 * yazıyor. Uçların hiçbiri "kimin adına" bilgisini gövdeden almaz; daima
 * oturumdaki kullanıcı.
 */
@Injectable()
export class ArkadaslarService {
  constructor(
    private supabase: SupabaseService,
    private notifications: NotificationsService,
    private access: AccessService
  ) {}

  /** Kabul edilmiş arkadaşların kimlikleri. Akış ve duvar bu listeye bakar. */
  async arkadasIdleri(userId: string): Promise<string[]> {
    const { data, error } = await this.supabase.client
      .from("arkadasliklar")
      .select("isteyen_id, alan_id")
      .eq("durum", "kabul")
      .or(`isteyen_id.eq.${requireUuid(userId, "Kullanıcı kimliği")},alan_id.eq.${userId}`)
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return (data ?? []).map((r: any) => (r.isteyen_id === userId ? r.alan_id : r.isteyen_id));
  }

  async ozet(userId: string): Promise<ArkadasOzeti> {
    const { data, error } = await this.supabase.client
      .from("arkadasliklar")
      .select(SATIR_SUTUNLARI)
      .or(`isteyen_id.eq.${requireUuid(userId, "Kullanıcı kimliği")},alan_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    if (error) throw error;
    const satirlar = (data ?? []) as (ArkadaslikSatiri & { created_at: string })[];

    const digerId = (s: ArkadaslikSatiri) => (s.isteyen_id === userId ? s.alan_id : s.isteyen_id);
    const kisiler = await this.kisileriGetir(satirlar.map(digerId));

    const arkadaslar: ArkadasKisi[] = [];
    const gelenIstekler: ArkadasIstegi[] = [];
    const gidenIstekler: ArkadasIstegi[] = [];
    for (const s of satirlar) {
      const kisi = kisiler.get(digerId(s));
      // Silinmiş/askıya alınmış hesap listede görünmez (kisileriGetir onları eler).
      if (!kisi) continue;
      const durum = durumHesapla(s, userId, digerId(s));
      if (durum === "arkadas") arkadaslar.push(kisi);
      else if (durum === "gelen_istek") gelenIstekler.push({ ...kisi, istekId: s.id, createdAt: s.created_at });
      else if (durum === "giden_istek") gidenIstekler.push({ ...kisi, istekId: s.id, createdAt: s.created_at });
    }
    arkadaslar.sort((a, b) => a.fullName.localeCompare(b.fullName, "tr"));
    return { arkadaslar, gelenIstekler, gidenIstekler };
  }

  async ara(userId: string, ham: unknown): Promise<ArkadasAramaSonucu[]> {
    const sorgu = aramaSorgusuCoz(ham);
    if (!sorgu) return [];

    let query = this.supabase.client
      .from("users")
      .select(KISI_SUTUNLARI)
      .is("deleted_at", null)
      .is("banned_at", null)
      // Demo hesabı herkesin ortak kullandığı bir vitrin; arkadaş eklenecek biri değil.
      .neq("role", "demo")
      .neq("id", userId)
      .limit(ARAMA_TAVANI);
    query =
      sorgu.tur === "eposta"
        ? query.ilike("email", likeKacir(sorgu.deger))
        : query.ilike("username", `${likeKacir(sorgu.deger)}%`);
    const { data, error } = await query;
    if (error) throw error;

    const bulunanlar = (data ?? []).map(kisiyeCevir);
    const satirlar = await this.satirlariGetir(userId, bulunanlar.map((k) => k.userId));
    return bulunanlar.map((k) => ({ ...k, durum: durumHesapla(satirlar.get(k.userId) ?? null, userId, k.userId) }));
  }

  async istekGonder(userId: string, hedefHam: unknown): Promise<{ durum: SosyalProfil["durum"] }> {
    const hedefId = requireUuid(hedefHam, "Kullanıcı");
    if (hedefId === userId) throw new BadRequestException("Kendine arkadaşlık isteği gönderemezsin");
    const hedef = (await this.kisileriGetir([hedefId])).get(hedefId);
    if (!hedef) throw new NotFoundException("Kullanıcı bulunamadı");

    const satir = await this.satirGetir(userId, hedefId);
    const karar = istekKarari(satir, userId, hedefId);
    const benAdim = await this.adGetir(userId);

    if (karar.islem === "yok") return { durum: karar.durum };

    if (karar.islem === "kabul_et") {
      await this.kabulIsle(satir!.id, userId, satir!.isteyen_id, benAdim);
      return { durum: "arkadas" };
    }

    if (karar.islem === "ekle") {
      const { error } = await this.supabase.client
        .from("arkadasliklar")
        .insert({ isteyen_id: userId, alan_id: hedefId, durum: "bekliyor" });
      // 23505: karşı taraf aynı anda istek göndermiş (tekil çift indeksi).
      // Kullanıcıya hata göstermek yerine sayfayı tazelemesi yeter.
      if (error && error.code !== "23505") throw error;
      if (error) return { durum: durumHesapla(await this.satirGetir(userId, hedefId), userId, hedefId) };
    } else {
      const { error } = await this.supabase.client
        .from("arkadasliklar")
        .update({ isteyen_id: userId, alan_id: hedefId, durum: "bekliyor", created_at: new Date().toISOString(), yanitlandi_at: null })
        .eq("id", satir!.id);
      if (error) throw error;
    }

    this.notifications.notifyUserSafe(
      hedefId,
      "friend_request",
      "Yeni arkadaşlık isteği",
      { metin: "{kisi} seni arkadaş olarak eklemek istiyor.", params: { kisi: benAdim } },
      "/sosyal?sekme=istekler"
    );
    return { durum: "giden_istek" };
  }

  async kabulEt(userId: string, istekIdHam: unknown): Promise<void> {
    const satir = await this.gelenIstek(userId, istekIdHam);
    await this.kabulIsle(satir.id, userId, satir.isteyen_id, await this.adGetir(userId));
  }

  /** Reddetmek satırı silmez; nedeni migration 134 başlığında. İsteyene bildirim GİTMEZ. */
  async reddet(userId: string, istekIdHam: unknown): Promise<void> {
    const satir = await this.gelenIstek(userId, istekIdHam);
    const { error } = await this.supabase.client
      .from("arkadasliklar")
      .update({ durum: "reddedildi", yanitlandi_at: new Date().toISOString() })
      .eq("id", satir.id);
    if (error) throw error;
  }

  /** Gönderdiğim (bekleyen ya da reddedilmiş) isteği geri çekerim. */
  async iptalEt(userId: string, istekIdHam: unknown): Promise<void> {
    const istekId = requireUuid(istekIdHam, "İstek");
    const { error } = await this.supabase.client
      .from("arkadasliklar")
      .delete()
      .eq("id", istekId)
      .eq("isteyen_id", userId)
      .neq("durum", "kabul");
    if (error) throw error;
  }

  /**
   * Arkadaşlıktan çıkmak satırı siler: iki taraf da sonradan yeniden istek
   * gönderebilsin. Duvarlardaki eski paylaşımlar kalır; ama çıkan kişi artık
   * o duvarı göremez (görünürlük o anki ilişkiye bakar).
   */
  async arkadasliktanCik(userId: string, digerHam: unknown): Promise<void> {
    const digerId = requireUuid(digerHam, "Kullanıcı");
    const satir = await this.satirGetir(userId, digerId);
    if (!satir || satir.durum !== "kabul") return;
    const { error } = await this.supabase.client.from("arkadasliklar").delete().eq("id", satir.id);
    if (error) throw error;
  }

  async profil(bakanId: string, userIdHam: unknown): Promise<SosyalProfil> {
    const userId = requireUuid(userIdHam, "Kullanıcı");
    const { data: row } = await this.supabase.client
      .from("users")
      .select(`${KISI_SUTUNLARI}, bio, deleted_at, banned_at`)
      .eq("id", userId)
      .maybeSingle();
    if (!row || row.deleted_at || row.banned_at) throw new NotFoundException("Kullanıcı bulunamadı");

    const durum = durumHesapla(await this.satirGetir(bakanId, userId), bakanId, userId);
    const duvariGorebilir = durum === "kendisi" || durum === "arkadas";
    return {
      ...kisiyeCevir(row),
      // Hakkında yazısı da profilin özel kısmı: arkadaş olmayana yalnızca ad ve unvan.
      bio: duvariGorebilir ? row.bio ?? undefined : undefined,
      durum,
      arkadasSayisi: duvariGorebilir ? (await this.arkadasIdleri(userId)).length : 0,
      duvariGorebilir,
    };
  }

  // ------------------------------------------------------------ Yardımcılar

  private async kabulIsle(satirId: string, kabulEdenId: string, isteyenId: string, kabulEdenAdi: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("arkadasliklar")
      .update({ durum: "kabul", yanitlandi_at: new Date().toISOString() })
      .eq("id", satirId);
    if (error) throw error;
    this.notifications.notifyUserSafe(
      isteyenId,
      "friend_accepted",
      "Arkadaşlık isteğin kabul edildi",
      { metin: "{kisi} arkadaşlık isteğini kabul etti.", params: { kisi: kabulEdenAdi } },
      `/sosyal/${kabulEdenId}`
    );
  }

  private async gelenIstek(userId: string, istekIdHam: unknown): Promise<ArkadaslikSatiri> {
    const istekId = requireUuid(istekIdHam, "İstek");
    const { data } = await this.supabase.client
      .from("arkadasliklar")
      .select(SATIR_SUTUNLARI)
      .eq("id", istekId)
      .maybeSingle();
    if (!data || data.durum === "kabul") throw new NotFoundException("Arkadaşlık isteği bulunamadı");
    if (data.alan_id !== userId) throw new ForbiddenException("Bu isteği yalnızca alıcısı yanıtlayabilir");
    return data as ArkadaslikSatiri;
  }

  private async satirGetir(a: string, b: string): Promise<ArkadaslikSatiri | null> {
    return (await this.satirlariGetir(a, [b])).get(b) ?? null;
  }

  /** `userId` ile `digerleri` arasındaki satırlar, diğer kişinin kimliğine göre. */
  private async satirlariGetir(userId: string, digerleri: string[]): Promise<Map<string, ArkadaslikSatiri>> {
    const sonuc = new Map<string, ArkadaslikSatiri>();
    if (digerleri.length === 0) return sonuc;
    const liste = digerleri.map((id) => requireUuid(id, "Kullanıcı kimliği")).join(",");
    const { data, error } = await this.supabase.client
      .from("arkadasliklar")
      .select(SATIR_SUTUNLARI)
      .or(
        `and(isteyen_id.eq.${requireUuid(userId, "Kullanıcı kimliği")},alan_id.in.(${liste})),and(alan_id.eq.${userId},isteyen_id.in.(${liste}))`
      );
    if (error) throw error;
    for (const s of (data ?? []) as ArkadaslikSatiri[]) {
      sonuc.set(s.isteyen_id === userId ? s.alan_id : s.isteyen_id, s);
    }
    return sonuc;
  }

  /** Silinmemiş, askıda olmayan kullanıcılar; diğerleri haritada yer almaz. */
  private async kisileriGetir(ids: string[]): Promise<Map<string, ArkadasKisi>> {
    const sonuc = new Map<string, ArkadasKisi>();
    const tekil = Array.from(new Set(ids));
    if (tekil.length === 0) return sonuc;
    const { data, error } = await this.supabase.client
      .from("users")
      .select(KISI_SUTUNLARI)
      .in("id", tekil)
      .is("deleted_at", null)
      .is("banned_at", null);
    if (error) throw error;
    for (const row of data ?? []) sonuc.set(row.id, kisiyeCevir(row));
    return sonuc;
  }

  private async adGetir(userId: string): Promise<string> {
    const { data } = await this.supabase.client.from("users").select("full_name").eq("id", userId).maybeSingle();
    return data?.full_name ?? "Bir kullanıcı";
  }

  /** Duvar yetkisi AccessService'te; buradan da aynı kapıya gidilir, kural kopyalanmaz. */
  arkadasMi(a: string, b: string): Promise<boolean> {
    return this.access.arkadasMi(a, b);
  }
}
