import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ArkadasAramaSonucu, ArkadasIstegi, ArkadasKisi, ArkadasOnerisi, ArkadasOzeti, SosyalProfil } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AccessService } from "../../common/access/access.service";
import { requireUuid } from "../../common/validation/input";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import {
  aramaSirasi,
  aramaSorgusuCoz,
  durumHesapla,
  istekKarari,
  likeKacir,
  oneriSirala,
  type ArkadaslikSatiri,
} from "./arkadaslik-durumu";

const KISI_SUTUNLARI = "id, full_name, username, avatar_url, title";
const SATIR_SUTUNLARI = "id, isteyen_id, alan_id, durum, created_at";
const ARAMA_TAVANI = 10;
const ONERI_TAVANI = 20;

/**
 * "Birlikte çalışılan" kişileri bulmak için bakılan üyelik tabloları.
 * Yalnızca ONAYLI üyelikler sayılır: davet edilmiş ama katılmamış biri o
 * ekibin parçası değil, ve bekleyen davet üzerinden birini önermek davetin
 * varlığını üçüncü kişilere sızdırırdı.
 */
const UYELIK_KAYNAKLARI = [
  { tablo: "job_members", alan: "job_id", sahipTablo: "jobs" },
  { tablo: "project_members", alan: "project_id", sahipTablo: "projects" },
  { tablo: "department_members", alan: "department_id", sahipTablo: null },
  { tablo: "organization_members", alan: "organization_id", sahipTablo: "organizations" },
] as const;

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

  /**
   * Yazdıkça arama: ad-soyad, kullanıcı adı (başında @ olsun olmasın) ya da
   * tam e-posta. Sonuç yalnızca ad, kullanıcı adı, unvan ve fotoğraf taşır —
   * e-posta hiçbir zaman dönmez, eşleşme e-postadan olsa bile.
   */
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
      // Sıralamayı biz yapıyoruz; fazladan çekip iyi eşleşmeleri öne alıyoruz.
      .limit(ARAMA_TAVANI * 3);
    if (sorgu.tur === "eposta") {
      query = query.ilike("email", likeKacir(sorgu.deger));
    } else {
      // Değer aramaSorgusuCoz'dan geçtiği için virgül/parantez/tırnak içermiyor;
      // yine de tırnak içinde gömülüyor ki boşluklu ad filtreyi bölmesin.
      // "_" LIKE'ta tek karakter jokeri ama burada zararsız: en kötü ihtimalle
      // bir iki fazla sonuç — kaçırmak tırnak içindeki ters bölüyle çakışıyordu.
      const v = sorgu.deger;
      query = query.or(`username.ilike."${v}%",full_name.ilike."${v}%",full_name.ilike."% ${v}%"`);
    }
    const { data, error } = await query;
    if (error) throw error;

    const bulunanlar = (data ?? [])
      .map(kisiyeCevir)
      .sort((a, b) => aramaSirasi(sorgu.deger, a) - aramaSirasi(sorgu.deger, b) || a.fullName.localeCompare(b.fullName, "tr"))
      .slice(0, ARAMA_TAVANI);
    const satirlar = await this.satirlariGetir(userId, bulunanlar.map((k) => k.userId));
    return bulunanlar.map((k) => ({ ...k, durum: durumHesapla(satirlar.get(k.userId) ?? null, userId, k.userId) }));
  }

  /**
   * "Tanıyor olabileceğin kişiler": ortak arkadaşlar + birlikte çalışılan
   * kişiler (aynı iş, proje, departman ya da şirket). Sıralama ve eleme saf
   * fonksiyonda (oneriSirala); burası yalnızca sayıları topluyor.
   */
  async oneriler(userId: string): Promise<ArkadasOnerisi[]> {
    requireUuid(userId, "Kullanıcı kimliği");
    const [tumSatirlar, ortakAlan] = await Promise.all([this.tumSatirlar(userId), this.birlikteCalisilanlar(userId)]);

    const haric = new Set<string>([userId]);
    const arkadaslar: string[] = [];
    for (const s of tumSatirlar) {
      const diger = s.isteyen_id === userId ? s.alan_id : s.isteyen_id;
      haric.add(diger);
      if (s.durum === "kabul") arkadaslar.push(diger);
    }

    // Arkadaşlarımın arkadaşları: kaç arkadaşımla ortak olduğu sayılır.
    const ortakArkadas = new Map<string, number>();
    if (arkadaslar.length > 0) {
      const liste = arkadaslar.join(",");
      const { data } = await this.supabase.client
        .from("arkadasliklar")
        .select("isteyen_id, alan_id")
        .eq("durum", "kabul")
        .or(`isteyen_id.in.(${liste}),alan_id.in.(${liste})`)
        .limit(LISTE_TAVANI * 4);
      const arkadasKumesi = new Set(arkadaslar);
      for (const r of data ?? []) {
        // Satırın iki ucundan biri arkadaşım; diğeri aday. İki ucu da
        // arkadaşımsa (arkadaşlarım kendi aralarında arkadaş) aday yok.
        for (const [arkadas, aday] of [[r.isteyen_id, r.alan_id], [r.alan_id, r.isteyen_id]]) {
          if (arkadasKumesi.has(arkadas) && !arkadasKumesi.has(aday)) {
            ortakArkadas.set(aday, (ortakArkadas.get(aday) ?? 0) + 1);
          }
        }
      }
    }

    const adaylar = oneriSirala(ortakArkadas, ortakAlan, haric, ONERI_TAVANI * 2);
    const kisiler = await this.kisileriGetir(adaylar.map((a) => a.userId), true);
    return adaylar
      .filter((a) => kisiler.has(a.userId))
      .slice(0, ONERI_TAVANI)
      .map((a) => ({ ...kisiler.get(a.userId)!, ortakArkadasSayisi: a.ortakArkadasSayisi, ortakAlanSayisi: a.ortakAlanSayisi }));
  }

  /**
   * Birlikte çalıştığım kişiler → kaç ortak alanımız var. Bir tablo
   * okunamazsa (ör. eski bir şemada) o kaynak atlanır; öneri bir hata yüzünden
   * tamamen boş dönmesin.
   */
  private async birlikteCalisilanlar(userId: string): Promise<Map<string, number>> {
    const sayac = new Map<string, number>();
    const ekle = (id: string | null | undefined) => {
      if (id && id !== userId) sayac.set(id, (sayac.get(id) ?? 0) + 1);
    };

    await Promise.all(
      UYELIK_KAYNAKLARI.map(async ({ tablo, alan, sahipTablo }) => {
        try {
          const { data: benim } = await this.supabase.client
            .from(tablo)
            .select(alan)
            .eq("user_id", userId)
            .eq("status", "approved")
            .limit(LISTE_TAVANI);
          const alanIdleri = new Set<string>((benim ?? []).map((r: any) => r[alan]));
          // Sahibi olduğum işler/projeler/şirketler de "benim alanım" — üyelik
          // tablosunda kendim için satır olmayabilir.
          if (sahipTablo) {
            const { data: sahip } = await this.supabase.client.from(sahipTablo).select("id").eq("owner_id", userId).limit(LISTE_TAVANI);
            for (const r of sahip ?? []) alanIdleri.add(r.id);
          }
          if (alanIdleri.size === 0) return;
          const idler = Array.from(alanIdleri);

          const { data: digerleri } = await this.supabase.client
            .from(tablo)
            .select(`user_id, ${alan}`)
            .in(alan, idler)
            .eq("status", "approved")
            .limit(LISTE_TAVANI * 4);
          // Aynı kişi aynı alanda bir kez sayılsın.
          const gorulen = new Set<string>();
          for (const r of (digerleri ?? []) as any[]) {
            const anahtar = `${r.user_id}|${r[alan]}`;
            if (gorulen.has(anahtar)) continue;
            gorulen.add(anahtar);
            ekle(r.user_id);
          }
          if (sahipTablo) {
            const { data: sahipler } = await this.supabase.client.from(sahipTablo).select("owner_id").in("id", idler);
            for (const r of sahipler ?? []) ekle(r.owner_id);
          }
        } catch {
          // bkz. fonksiyon açıklaması
        }
      })
    );
    return sayac;
  }

  /** Benimle ilgili TÜM satırlar (her durum) — öneriden elenecekleri bulmak için. */
  private async tumSatirlar(userId: string): Promise<ArkadaslikSatiri[]> {
    const { data, error } = await this.supabase.client
      .from("arkadasliklar")
      .select(SATIR_SUTUNLARI)
      .or(`isteyen_id.eq.${userId},alan_id.eq.${userId}`)
      .limit(LISTE_TAVANI * 4);
    if (error) throw error;
    return (data ?? []) as ArkadaslikSatiri[];
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
  private async kisileriGetir(ids: string[], demoHaric = false): Promise<Map<string, ArkadasKisi>> {
    const sonuc = new Map<string, ArkadasKisi>();
    const tekil = Array.from(new Set(ids));
    if (tekil.length === 0) return sonuc;
    let query = this.supabase.client
      .from("users")
      .select(KISI_SUTUNLARI)
      .in("id", tekil)
      .is("deleted_at", null)
      .is("banned_at", null);
    if (demoHaric) query = query.neq("role", "demo");
    const { data, error } = await query;
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
