import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type {
  GoogleTakvimDurumu,
  GoogleTakvimEtkinligi,
  GoogleTakvimEtkinlikGirdisi,
  GoogleTakvimOzeti,
  TakvimIsleme,
} from "@projelio/shared";
import { takvimGunEkle } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { parcalara } from "../../common/parcali-liste";
import { GoogleOAuthService, LOGIN_SCOPES } from "../google/google-oauth.service";
import { decryptToken, encryptToken } from "../google/token-crypto.util";
import {
  PROJELIO_ISARETI,
  TAKVIM_ETKINLIK_IZNI,
  TAKVIM_IZINLERI,
  TAKVIM_LISTE_IZNI,
  TakvimApiHatasi,
  etkinlikAc,
  etkinlikGovdesi,
  etkinlikGuncelle,
  etkinlikSil,
  etkinligiSatiraCevir,
  etkinlikleriGetir,
  girdiHatasi,
  takvimleriGetir,
  takvimListesiniCevir,
  type GoogleEtkinlik,
} from "./takvim-api";

interface BaglantiSatiri {
  user_id: string;
  google_eposta: string;
  google_refresh_token: string;
  saat_dilimi: string | null;
  takvimler: GoogleTakvimOzeti[] | null;
  hedef_takvim_id: string;
  son_esitleme_at: string | null;
  son_hata: string | null;
  kopuk_at: string | null;
}

/** Aynı aralık bu süreden kısa arayla yeniden eşitlenmez (sayfa odaklanması, Lio'nun art arda soruları). */
const ESITLEME_ARALIGI_MS = 60_000;
/** Bir aralıkta gösterilecek en fazla etkinlik. Ay görünümü + yoğun bir iş takvimi ~300 eder. */
const ETKINLIK_TAVANI = 1500;
/** Cron'un her kullanıcı için eşitlediği pencere. */
const CRON_GERI_GUN = 7;
const CRON_ILERI_GUN = 60;

const bugun = () => new Date().toISOString().slice(0, 10);

/**
 * Google Takvim entegrasyonu.
 *
 * ÜÇ YÖN:
 *   Google → Projelio  etkinlikler önbelleğe eşitlenir, takvim sayfası ve Lio
 *                      oradan okur (bkz. migration 133 başlığı).
 *   Projelio → Google  elle etkinlik ya da plan bloğu Google'a yazılır. Bloğun
 *                      sahibi Projelio'dur: blok taşınınca Google'daki kopyası
 *                      da taşınır; Google'da taşımak bloğu OYNATMAZ (iki yönlü
 *                      düzenleme, kimin kazandığı sorusu olmadan çözülmüyor).
 *   Lio                etkinliği göreve çevirir ve kararını `isleme`ye yazar.
 *
 * HATA POLİTİKASI: Google'a ulaşılamaması hiçbir Projelio işini durdurmaz. Blok
 * kaydedilir, takvim önbellekten çizilir; hata `son_hata`ya yazılıp Ayarlar
 * kartında gösterilir.
 */
@Injectable()
export class GoogleTakvimService {
  private readonly logger = new Logger(GoogleTakvimService.name);
  /** Kısa ömürlü erişim jetonları. Cron her 15 dakikada tüm kullanıcılar için jeton istemesin. */
  private jetonlar = new Map<string, { token: string; bitis: number }>();
  private sonEsitlemeler = new Map<string, number>();

  constructor(
    private supabase: SupabaseService,
    private oauth: GoogleOAuthService
  ) {}

  yapilandirildi(): boolean {
    return this.oauth.isDriveConfigured();
  }

  // ================================================================ bağlantı

  async durum(userId: string): Promise<GoogleTakvimDurumu> {
    const b = await this.baglanti(userId);
    return {
      yapilandirildi: this.yapilandirildi(),
      bagli: Boolean(b),
      eposta: b?.google_eposta ?? null,
      kopuk: Boolean(b?.kopuk_at),
      takvimler: b?.takvimler ?? [],
      hedefTakvimId: b?.hedef_takvim_id ?? "primary",
      sonEsitleme: b?.son_esitleme_at ?? null,
      sonHata: b?.son_hata ?? null,
    };
  }

  /** Google onay ekranının adresi. Dönüş google.controller'daki ortak callback'e düşer. */
  baglantiAdresi(userId: string, next = "/calendar"): string {
    if (!this.yapilandirildi()) {
      throw new BadRequestException("Google entegrasyonu sunucuda yapılandırılmamış.");
    }
    const state = this.oauth.signState({ mode: "takvim", userId, next });
    // Hesap seçme ekranı zorunlu: Projelio'ya kişisel Gmail'le girip iş
    // takvimini bağlamak en sık senaryo.
    return this.oauth.buildAuthUrl({ scopes: [...LOGIN_SCOPES, ...TAKVIM_IZINLERI], state, selectAccount: true });
  }

  /** google.controller callback'i "takvim" akışında buraya devreder. */
  async baglantiyiKaydet(userId: string, eposta: string, refreshToken: string | undefined, izinler: string[]): Promise<void> {
    // Google izinleri tek tek seçtiriyor; etkinlik kutusu kaldırılırsa elde
    // hiçbir şey yapamayan bir bağlantı kalırdı.
    if (!izinler.includes(TAKVIM_ETKINLIK_IZNI)) {
      throw new BadRequestException("Takvim izni verilmedi. Bağlarken takvim kutularını işaretli bırak.");
    }
    if (!refreshToken) throw new BadRequestException("Google kalıcı erişim vermedi. Tekrar bağlanmayı dene.");

    const onceki = await this.baglanti(userId);
    // Farklı bir Google hesabına geçildiyse eski hesabın önbelleği ve seçimi
    // anlamını yitirir: takvim kimlikleri başka hesaba ait.
    const ayniHesap = onceki?.google_eposta === eposta;
    if (onceki && !ayniHesap) await this.onbellegiTemizle(userId);

    let takvimler: GoogleTakvimOzeti[] = [birincilTakvim(eposta)];
    let saatDilimi: string | null = ayniHesap ? (onceki?.saat_dilimi ?? null) : null;
    // Liste izni isteğe bağlı: verilmediyse yalnızca birincil takvimle çalışılır.
    if (izinler.includes(TAKVIM_LISTE_IZNI)) {
      try {
        const token = await this.jetonuYenile(userId, refreshToken);
        if (token) {
          const oncekiSecim = ayniHesap ? new Map((onceki?.takvimler ?? []).map((t) => [t.id, t.secili])) : undefined;
          const liste = takvimListesiniCevir(await takvimleriGetir(token), oncekiSecim);
          if (liste.takvimler.length) takvimler = liste.takvimler;
          saatDilimi = liste.saatDilimi ?? saatDilimi;
        }
      } catch (err) {
        // Liste okunamadıysa birincil takvimle başla; kullanıcı Ayarlar'dan yeniler.
        this.logger.warn(`Takvim listesi okunamadı (${userId}): ${hataMesaji(err)}`);
      }
    }

    const hedef = ayniHesap && onceki && takvimler.some((t) => t.id === onceki.hedef_takvim_id && t.yazilabilir)
      ? onceki.hedef_takvim_id
      : (takvimler.find((t) => t.birincil)?.id ?? "primary");

    const { error } = await this.supabase.client.from("google_takvim_baglantilari").upsert({
      user_id: userId,
      google_eposta: eposta,
      google_refresh_token: encryptToken(refreshToken),
      saat_dilimi: saatDilimi,
      takvimler,
      hedef_takvim_id: hedef,
      son_hata: null,
      kopuk_at: null,
      baglandi_at: new Date().toISOString(),
    });
    if (error) throw new BadRequestException(error.message);
    this.jetonlar.delete(userId);

    // İlk eşitleme arka planda: kullanıcı takvime döndüğünde etkinlikler
    // büyük ihtimalle gelmiş olur, gelmemişse sayfa kendisi ister.
    void this.esitle(userId, takvimGunEkle(bugun(), -CRON_GERI_GUN), takvimGunEkle(bugun(), CRON_ILERI_GUN), true).catch(
      () => undefined
    );
  }

  /**
   * Bağlantıyı keser ve önbelleği siler. Projelio'nun Google'a yazdığı
   * etkinlikler Google'da KALIR — onlar artık kullanıcının takviminin parçası;
   * habersiz silmek "toplantım kayboldu" demek olurdu.
   */
  async baglantiyiKes(userId: string): Promise<GoogleTakvimDurumu> {
    const b = await this.baglanti(userId);
    if (b) {
      try {
        await this.oauth.revokeToken(decryptToken(b.google_refresh_token));
      } catch {
        /* çözülemeyen token: yerel kayıt yine silinir */
      }
    }
    await this.onbellegiTemizle(userId);
    await this.supabase.client.from("google_takvim_baglantilari").delete().eq("user_id", userId);
    this.jetonlar.delete(userId);
    return this.durum(userId);
  }

  async ayarlariGuncelle(
    userId: string,
    yama: { seciliTakvimler?: string[]; hedefTakvimId?: string }
  ): Promise<GoogleTakvimDurumu> {
    const b = await this.baglantiZorunlu(userId);
    let takvimler = b.takvimler ?? [];
    const guncelleme: Record<string, unknown> = {};

    if (Array.isArray(yama.seciliTakvimler)) {
      const secili = new Set(yama.seciliTakvimler.map(String));
      if (secili.size === 0) throw new BadRequestException("En az bir takvim seçili kalmalı.");
      takvimler = takvimler.map((t) => ({ ...t, secili: secili.has(t.id) }));
      guncelleme.takvimler = takvimler;
      // Seçimden çıkan takvimin önbelleği silinir: gizlenen takvim Lio'nun
      // "işlenmemiş etkinlikler" listesinde görünmeye devam etmesin.
      const cikanlar = takvimler.filter((t) => !t.secili).map((t) => t.id);
      if (cikanlar.length) {
        await this.supabase.client
          .from("google_takvim_etkinlikleri")
          .delete()
          .eq("user_id", userId)
          .in("takvim_id", cikanlar);
      }
    }

    if (yama.hedefTakvimId !== undefined) {
      const hedef = takvimler.find((t) => t.id === yama.hedefTakvimId);
      if (!hedef?.yazilabilir) throw new BadRequestException("Bu takvime etkinlik eklenemiyor.");
      guncelleme.hedef_takvim_id = hedef.id;
    }

    if (Object.keys(guncelleme).length) {
      const { error } = await this.supabase.client.from("google_takvim_baglantilari").update(guncelleme).eq("user_id", userId);
      if (error) throw new BadRequestException(error.message);
    }
    // Yeni seçilen takvimler hemen gelsin.
    if (yama.seciliTakvimler) {
      await this.esitle(userId, takvimGunEkle(bugun(), -CRON_GERI_GUN), takvimGunEkle(bugun(), CRON_ILERI_GUN), true);
    }
    return this.durum(userId);
  }

  /** Google'da yeni takvim açıldıysa listeyi tazeler; mevcut seçim korunur. */
  async takvimleriYenile(userId: string): Promise<GoogleTakvimDurumu> {
    const b = await this.baglantiZorunlu(userId);
    const token = await this.jeton(b);
    if (!token) throw new BadRequestException("Google Takvim bağlantısı kopmuş. Yeniden bağlan.");
    let liste;
    try {
      liste = takvimListesiniCevir(await takvimleriGetir(token), new Map((b.takvimler ?? []).map((t) => [t.id, t.secili])));
    } catch (err) {
      if (err instanceof TakvimApiHatasi && err.status === 403) {
        throw new BadRequestException("Takvim listesini okuma izni verilmemiş. Bağlantıyı kesip yeniden bağlan.");
      }
      throw err;
    }
    await this.supabase.client
      .from("google_takvim_baglantilari")
      .update({ takvimler: liste.takvimler, saat_dilimi: liste.saatDilimi ?? b.saat_dilimi })
      .eq("user_id", userId);
    return this.durum(userId);
  }

  // =============================================================== okuma

  /**
   * Aralıktaki etkinlikler — önbellekten. Güncellik `esitle`nin işi; bu çağrı
   * Google'ı beklemez ki takvim sayfası anında çizilsin.
   *
   * Aralık gün olarak verilir ama kullanıcının saat dilimi burada bilinmiyor:
   * bir gün pay bırakılır, günlere ayırma istemcide yapılır.
   */
  async etkinlikler(userId: string, from: string, to: string): Promise<GoogleTakvimEtkinligi[]> {
    assertTarih(from);
    assertTarih(to);
    const b = await this.baglanti(userId);
    if (!b) return [];
    const secili = (b.takvimler ?? []).filter((t) => t.secili);
    if (!secili.length) return [];

    const { data, error } = await this.supabase.client
      .from("google_takvim_etkinlikleri")
      .select("*, tasks(title)")
      .eq("user_id", userId)
      .in(
        "takvim_id",
        secili.map((t) => t.id)
      )
      .gt("bitis", `${takvimGunEkle(from, -1)}T00:00:00.000Z`)
      .lt("baslangic", `${takvimGunEkle(to, 2)}T00:00:00.000Z`)
      .order("baslangic", { ascending: true })
      .limit(ETKINLIK_TAVANI);
    if (error) throw new BadRequestException(error.message);
    const takvimler = new Map(secili.map((t) => [t.id, t]));
    return (data ?? []).map((r: any) => satiriCevir(r, takvimler.get(r.takvim_id)));
  }

  async etkinlik(userId: string, id: string): Promise<GoogleTakvimEtkinligi> {
    const r = await this.etkinlikSatiri(userId, id);
    const b = await this.baglanti(userId);
    return satiriCevir(r, (b?.takvimler ?? []).find((t) => t.id === r.takvim_id));
  }

  /**
   * Google → önbellek. Seçili her takvim için aralık okunur, önbellek
   * güncellenir, Google'da artık olmayanlar silinir.
   *
   * @param zorla  Kısa aralıklı tekrar korumasını atlar (bağlanma, ayar değişikliği, "Şimdi eşitle").
   */
  async esitle(userId: string, from: string, to: string, zorla = false): Promise<{ sonEsitleme: string | null; hata?: string }> {
    assertTarih(from);
    assertTarih(to);
    const b = await this.baglanti(userId);
    if (!b || b.kopuk_at) return { sonEsitleme: b?.son_esitleme_at ?? null };

    const anahtar = `${userId}|${from}|${to}`;
    const son = this.sonEsitlemeler.get(anahtar);
    if (!zorla && son && Date.now() - son < ESITLEME_ARALIGI_MS) return { sonEsitleme: b.son_esitleme_at };
    this.sonEsitlemeler.set(anahtar, Date.now());
    if (this.sonEsitlemeler.size > 5000) this.sonEsitlemeler.clear();

    const token = await this.jeton(b);
    if (!token) return { sonEsitleme: b.son_esitleme_at, hata: "Google Takvim bağlantısı kopmuş. Yeniden bağlan." };

    // Sorgu penceresi görünen aralıktan birer gün geniş (saat dilimi payı).
    const timeMin = `${takvimGunEkle(from, -1)}T00:00:00.000Z`;
    const timeMax = `${takvimGunEkle(to, 2)}T00:00:00.000Z`;

    const hatalar: string[] = [];
    for (const takvim of (b.takvimler ?? []).filter((t) => t.secili)) {
      try {
        await this.takvimiEsitle(userId, takvim.id, token, timeMin, timeMax);
      } catch (err) {
        hatalar.push(`${takvim.ad}: ${hataMesaji(err)}`);
      }
    }

    const simdi = new Date().toISOString();
    const hata = hatalar.length ? hatalar.join(" · ").slice(0, 500) : null;
    if (hata) this.logger.warn(`Google Takvim eşitlemesi kısmen düştü (${userId}): ${hata}`);
    await this.supabase.client
      .from("google_takvim_baglantilari")
      .update({ son_esitleme_at: simdi, son_hata: hata })
      .eq("user_id", userId);
    return { sonEsitleme: simdi, ...(hata ? { hata } : {}) };
  }

  private async takvimiEsitle(userId: string, takvimId: string, token: string, timeMin: string, timeMax: string) {
    const { etkinlikler, eksik } = await etkinlikleriGetir(token, takvimId, timeMin, timeMax);
    const simdi = new Date().toISOString();
    const satirlar = [];
    for (const e of etkinlikler) {
      const s = etkinligiSatiraCevir(e);
      if (!s) continue;
      satirlar.push({
        ...s,
        user_id: userId,
        takvim_id: takvimId,
        kaynak: projelioninMi(e) ? "projelio" : "google",
        updated_at: simdi,
      });
    }

    // Upsert yalnızca Google'dan gelen sütunları yazar: isleme, gorev_id,
    // plan_blok_id satırda olduğu gibi kalır (PostgREST yalnızca verilen
    // sütunları günceller).
    for (const parca of parcalara(satirlar, 500)) {
      const { error } = await this.supabase.client
        .from("google_takvim_etkinlikleri")
        .upsert(parca, { onConflict: "user_id,takvim_id,google_id" });
      if (error) throw new Error(error.message);
    }

    // Liste eksikse silme YOK: okunmayan sayfadaki etkinlikler "yok" sanılırdı.
    if (eksik) return;

    // Silme penceresi sorgu penceresinden birer gün DAR. Kenardaki tüm gün
    // etkinlikleri Google'ın saat dilimine göre, bizim önbelleğimiz UTC gece
    // yarısına göre değerlendiriliyor; dar pencere, "Google döndürmedi ama
    // önbellekte aralıkta görünüyor" durumunun silmeye dönüşmesini engelliyor.
    const gorulenler = new Set(satirlar.map((s) => s.google_id));
    const { data: mevcut, error } = await this.supabase.client
      .from("google_takvim_etkinlikleri")
      .select("id, google_id")
      .eq("user_id", userId)
      .eq("takvim_id", takvimId)
      .gte("baslangic", new Date(Date.parse(timeMin) + 86_400_000).toISOString())
      .lt("baslangic", new Date(Date.parse(timeMax) - 86_400_000).toISOString());
    if (error) throw new Error(error.message);
    const silinecek = (mevcut ?? []).filter((r: any) => !gorulenler.has(r.google_id)).map((r: any) => r.id);
    for (const parca of parcalara(silinecek, 200)) {
      await this.supabase.client.from("google_takvim_etkinlikleri").delete().in("id", parca);
    }
  }

  // =============================================================== yazma

  /** Projelio → Google: yeni etkinlik. Hedef takvim Ayarlar'da seçilir. */
  async etkinlikEkle(
    userId: string,
    girdi: GoogleTakvimEtkinlikGirdisi,
    bag: { planBlokId?: string; gorevId?: string } = {}
  ): Promise<GoogleTakvimEtkinligi> {
    const hata = girdiHatasi(girdi);
    if (hata) throw new BadRequestException(hata);
    const b = await this.baglantiZorunlu(userId);
    const token = await this.jetonZorunlu(b);
    const saatDilimi = await this.saatDilimi(b);

    const ozel: Record<string, string> = {};
    if (bag.planBlokId) ozel.projelioBlok = bag.planBlokId;
    if (bag.gorevId) ozel.projelioGorev = bag.gorevId;

    const olusan = await googleCagrisi(() => etkinlikAc(token, b.hedef_takvim_id, etkinlikGovdesi(girdi, saatDilimi, ozel)));
    return this.onbellegeYaz(userId, b, b.hedef_takvim_id, olusan, {
      plan_blok_id: bag.planBlokId ?? null,
      gorev_id: bag.gorevId ?? null,
      ...(bag.gorevId ? { isleme: "gorev" } : {}),
    });
  }

  /**
   * Projelio'nun açtığı etkinliği düzenler. Kullanıcının kendi Google
   * etkinlikleri (başkasının davet ettiği toplantılar dahil) buradan
   * DEĞİŞTİRİLEMEZ: tek bir yanlış tıklama, davetlilerin takvimindeki
   * toplantıyı kaydırırdı.
   */
  async etkinlikDuzenle(userId: string, id: string, girdi: GoogleTakvimEtkinlikGirdisi): Promise<GoogleTakvimEtkinligi> {
    const hata = girdiHatasi(girdi);
    if (hata) throw new BadRequestException(hata);
    const r = await this.etkinlikSatiri(userId, id);
    if (r.kaynak !== "projelio") throw new BadRequestException("Bu etkinlik Google Takvim'den geldi; orada düzenleyebilirsin.");
    const b = await this.baglantiZorunlu(userId);
    const token = await this.jetonZorunlu(b);
    const saatDilimi = await this.saatDilimi(b);
    const guncel = await googleCagrisi(() =>
      etkinlikGuncelle(token, r.takvim_id, r.google_id, guncellemeGovdesi(girdi, saatDilimi))
    );
    return this.onbellegeYaz(userId, b, r.takvim_id, guncel, {});
  }

  async etkinlikSil(userId: string, id: string): Promise<{ ok: true }> {
    const r = await this.etkinlikSatiri(userId, id);
    if (r.kaynak !== "projelio") throw new BadRequestException("Bu etkinlik Google Takvim'den geldi; orada silebilirsin.");
    const b = await this.baglantiZorunlu(userId);
    const token = await this.jetonZorunlu(b);
    await googleCagrisi(() => etkinlikSil(token, r.takvim_id, r.google_id));
    await this.supabase.client.from("google_takvim_etkinlikleri").delete().eq("id", id).eq("user_id", userId);
    return { ok: true };
  }

  /**
   * Etkinlik hakkındaki Projelio kararı: göreve çevrildi / yok sayıldı / yeniden
   * bakılacak. Görev bağı verildiyse görevin kullanıcıya görünür olduğu
   * doğrulanmıyor — bağ yalnızca bir işaret, görev verisi buradan okunmuyor
   * (başlık join'i kullanıcının kendi etkinlik satırı üzerinden geliyor).
   */
  async islemeAyarla(userId: string, id: string, isleme: TakvimIsleme, gorevId?: string | null): Promise<GoogleTakvimEtkinligi> {
    if (!["yeni", "gorev", "yoksay"].includes(isleme)) throw new BadRequestException("Geçersiz işlem durumu.");
    await this.etkinlikSatiri(userId, id);
    const yama: Record<string, unknown> = { isleme, updated_at: new Date().toISOString() };
    if (gorevId !== undefined) yama.gorev_id = gorevId || null;
    if (isleme === "yeni") yama.gorev_id = null;
    const { error } = await this.supabase.client
      .from("google_takvim_etkinlikleri")
      .update(yama)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new BadRequestException(error.message);
    return this.etkinlik(userId, id);
  }

  // ======================================================== plan blokları

  /** Blok → Google. Zaten gönderilmişse Google'daki kopyası güncellenir. */
  async blokuGonder(userId: string, blokId: string): Promise<GoogleTakvimEtkinligi> {
    const blok = await this.blokGirdisi(userId, blokId);
    if (!blok) throw new NotFoundException("Blok bulunamadı.");
    const bag = await this.blokBagi(userId, blokId);
    if (bag) {
      await this.blokDegisti(userId, blokId);
      return this.etkinlik(userId, bag.id);
    }
    return this.etkinlikEkle(userId, blok.girdi, { planBlokId: blokId, gorevId: blok.gorevId });
  }

  /** "Google Takvim'e de ekle" işareti kaldırıldı: Google'daki kopyayı sil. */
  async blokBaginiKaldir(userId: string, blokId: string): Promise<{ ok: true }> {
    const bag = await this.blokBagi(userId, blokId);
    if (bag) await this.etkinlikSil(userId, bag.id);
    return { ok: true };
  }

  /**
   * PlanningService çağırır: blok düzenlendi ya da taşındı. Blok Google'a
   * gönderilmemişse hiçbir şey yapmaz (tek sorgu). Hata FIRLATMAZ — blok
   * kaydedildi, Google'ın geç kalması onu geri almamalı.
   */
  async blokDegisti(userId: string, blokId: string): Promise<void> {
    try {
      const bag = await this.blokBagi(userId, blokId);
      if (!bag) return;
      const blok = await this.blokGirdisi(userId, blokId);
      const b = await this.baglanti(userId);
      if (!blok || !b || b.kopuk_at) return;
      const token = await this.jeton(b);
      if (!token) return;
      const guncel = await etkinlikGuncelle(token, bag.takvim_id, bag.google_id, guncellemeGovdesi(blok.girdi, await this.saatDilimi(b)));
      await this.onbellegeYaz(userId, b, bag.takvim_id, guncel, {});
    } catch (err) {
      this.logger.warn(`Blok Google'a taşınamadı (${blokId}): ${hataMesaji(err)}`);
    }
  }

  /** PlanningService çağırır: blok silinmek üzere. Google'daki kopyası da gider. */
  async blokSilinecek(userId: string, blokId: string): Promise<void> {
    try {
      const bag = await this.blokBagi(userId, blokId);
      if (!bag) return;
      const b = await this.baglanti(userId);
      const token = b && !b.kopuk_at ? await this.jeton(b) : null;
      if (token) await etkinlikSil(token, bag.takvim_id, bag.google_id);
      await this.supabase.client.from("google_takvim_etkinlikleri").delete().eq("id", bag.id);
    } catch (err) {
      this.logger.warn(`Bloğun Google kopyası silinemedi (${blokId}): ${hataMesaji(err)}`);
    }
  }

  // ================================================================= cron

  /** Bağlı herkesin yakın penceresini tazeler — en uzun süredir eşitlenmeyenden başlayarak. */
  async cronTuru(): Promise<void> {
    if (!this.yapilandirildi()) return;
    const { data, error } = await this.supabase.client
      .from("google_takvim_baglantilari")
      .select("user_id")
      .is("kopuk_at", null)
      .order("son_esitleme_at", { ascending: true, nullsFirst: true })
      .limit(100);
    if (error) {
      this.logger.error(`Takvim eşitleme turu okunamadı: ${error.message}`);
      return;
    }
    const from = takvimGunEkle(bugun(), -CRON_GERI_GUN);
    const to = takvimGunEkle(bugun(), CRON_ILERI_GUN);
    for (const { user_id } of data ?? []) {
      try {
        await this.esitle(user_id, from, to, true);
      } catch (err) {
        this.logger.warn(`Takvim eşitlemesi düştü (${user_id}): ${hataMesaji(err)}`);
      }
    }
  }

  // ============================================================ yardımcılar

  private async baglanti(userId: string): Promise<BaglantiSatiri | null> {
    const { data, error } = await this.supabase.client
      .from("google_takvim_baglantilari")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    // Tablo yoksa (migration 133 uygulanmadan) takvim sayfası çalışmaya devam etsin.
    if (error) {
      this.logger.warn(`Takvim bağlantısı okunamadı: ${error.message}`);
      return null;
    }
    return (data as BaglantiSatiri) ?? null;
  }

  private async baglantiZorunlu(userId: string): Promise<BaglantiSatiri> {
    const b = await this.baglanti(userId);
    if (!b) throw new BadRequestException("Google Takvim bağlı değil. Ayarlar > Bağlı hesaplar'dan bağlayabilirsin.");
    if (b.kopuk_at) throw new BadRequestException("Google Takvim bağlantısı kopmuş. Yeniden bağlan.");
    return b;
  }

  private async jetonZorunlu(b: BaglantiSatiri): Promise<string> {
    const token = await this.jeton(b);
    if (!token) throw new BadRequestException("Google Takvim bağlantısı kopmuş. Yeniden bağlan.");
    return token;
  }

  /**
   * Erişim jetonu (önbellekli). invalid_grant → kullanıcı erişimi Google'dan
   * kaldırmış: bağlantı "kopuk" işaretlenir, satır silinmez (bkz. migration 133).
   */
  private async jeton(b: BaglantiSatiri): Promise<string | null> {
    const onbellek = this.jetonlar.get(b.user_id);
    if (onbellek && onbellek.bitis > Date.now()) return onbellek.token;
    if (!this.yapilandirildi()) return null;
    try {
      return await this.jetonuYenile(b.user_id, decryptToken(b.google_refresh_token));
    } catch (err) {
      this.logger.error(`Takvim jetonu alınamadı (${b.user_id}): ${hataMesaji(err)}`);
      return null;
    }
  }

  private async jetonuYenile(userId: string, refreshToken: string): Promise<string | null> {
    const sonuc = await this.oauth.refreshAccessToken(refreshToken);
    if ("invalidGrant" in sonuc) {
      this.logger.warn(`Google Takvim erişimi kaldırılmış (${userId}); bağlantı kopuk işaretlendi.`);
      await this.supabase.client
        .from("google_takvim_baglantilari")
        .update({ kopuk_at: new Date().toISOString(), son_hata: "Google erişimi geri alındı. Yeniden bağlan." })
        .eq("user_id", userId);
      this.jetonlar.delete(userId);
      return null;
    }
    // Bir dakika erken bırak: sınırdaki jetonla başlayan istek yolda ölmesin.
    this.jetonlar.set(userId, { token: sonuc.accessToken, bitis: Date.now() + (sonuc.expiresIn - 60) * 1000 });
    return sonuc.accessToken;
  }

  /** Google'ın saat dilimi, yoksa kullanıcının çalışma ritmi ayarı, yoksa İstanbul. */
  private async saatDilimi(b: BaglantiSatiri): Promise<string> {
    if (b.saat_dilimi) return b.saat_dilimi;
    const { data } = await this.supabase.client
      .from("plan_preferences")
      .select("timezone")
      .eq("user_id", b.user_id)
      .maybeSingle();
    return (data as { timezone?: string } | null)?.timezone || "Europe/Istanbul";
  }

  private async etkinlikSatiri(userId: string, id: string): Promise<any> {
    const { data, error } = await this.supabase.client
      .from("google_takvim_etkinlikleri")
      .select("*, tasks(title)")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException("Etkinlik bulunamadı.");
    return data;
  }

  private async blokBagi(userId: string, blokId: string): Promise<{ id: string; takvim_id: string; google_id: string } | null> {
    const { data } = await this.supabase.client
      .from("google_takvim_etkinlikleri")
      .select("id, takvim_id, google_id")
      .eq("user_id", userId)
      .eq("plan_blok_id", blokId)
      .maybeSingle();
    return data ?? null;
  }

  /**
   * Bloğun Google'a gidecek hâli. Blok başlıksızsa bağlı işin adı kullanılır —
   * takvimde "Blok" yazan bir kutu kimseye bir şey söylemez.
   */
  private async blokGirdisi(
    userId: string,
    blokId: string
  ): Promise<{ girdi: GoogleTakvimEtkinlikGirdisi; gorevId?: string } | null> {
    const { data } = await this.supabase.client
      .from("plan_time_blocks")
      .select("id, block_date, starts_at, ends_at, title, note, task_id, tasks(title), personal_todos(title)")
      .eq("id", blokId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return null;
    const r = data as any;
    const baslik = r.title || r.tasks?.title || r.personal_todos?.title || "Projelio";
    return {
      girdi: {
        baslik,
        aciklama: [r.note, "Projelio takviminden eklendi."].filter(Boolean).join("\n\n"),
        tarih: String(r.block_date).slice(0, 10),
        baslangicSaati: String(r.starts_at).slice(0, 5),
        bitisSaati: String(r.ends_at).slice(0, 5),
      },
      gorevId: r.task_id ?? undefined,
    };
  }

  private async onbellegeYaz(
    userId: string,
    b: BaglantiSatiri,
    takvimId: string,
    e: GoogleEtkinlik,
    ek: Record<string, unknown>
  ): Promise<GoogleTakvimEtkinligi> {
    const s = etkinligiSatiraCevir(e);
    if (!s) throw new BadRequestException("Google etkinliği okunamadı.");
    const { data, error } = await this.supabase.client
      .from("google_takvim_etkinlikleri")
      .upsert(
        { ...s, ...ek, user_id: userId, takvim_id: takvimId, kaynak: "projelio", updated_at: new Date().toISOString() },
        { onConflict: "user_id,takvim_id,google_id" }
      )
      .select("*, tasks(title)")
      .single();
    if (error) throw new BadRequestException(error.message);
    return satiriCevir(data, (b.takvimler ?? []).find((t) => t.id === takvimId));
  }

  private async onbellegiTemizle(userId: string): Promise<void> {
    await this.supabase.client.from("google_takvim_etkinlikleri").delete().eq("user_id", userId);
  }
}

// ------------------------------------------------------------------ saf yardımcılar

function birincilTakvim(eposta: string): GoogleTakvimOzeti {
  return { id: "primary", ad: eposta, birincil: true, yazilabilir: true, secili: true };
}

/**
 * Güncellemede özel alanlar gönderilmez: PATCH'te `extendedProperties.private`
 * eşlemi toptan değişebiliyor ve etkinliği bloğa bağlayan `projelioBlok` işareti
 * düşerdi. İşaret açılışta bir kez yazılıyor, sonra dokunulmuyor.
 */
function guncellemeGovdesi(girdi: GoogleTakvimEtkinlikGirdisi, saatDilimi: string): Record<string, unknown> {
  const { extendedProperties: _atla, ...govde } = etkinlikGovdesi(girdi, saatDilimi);
  return govde;
}

function projelioninMi(e: GoogleEtkinlik): boolean {
  return e.extendedProperties?.private?.[PROJELIO_ISARETI] === "1";
}

function assertTarih(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ""))) throw new BadRequestException("Tarih YYYY-AA-GG biçiminde olmalı.");
}

function hataMesaji(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Google'ın hata gövdesi kullanıcıya gösterilmez; durum koduna göre anlaşılır bir cümle. */
async function googleCagrisi<T>(is: () => Promise<T>): Promise<T> {
  try {
    return await is();
  } catch (err) {
    if (err instanceof TakvimApiHatasi) {
      if (err.status === 403) throw new BadRequestException("Bu takvime yazma izni yok. Ayarlar'dan başka bir hedef takvim seç.");
      if (err.status === 404) throw new BadRequestException("Etkinlik Google Takvim'de bulunamadı; silinmiş olabilir.");
    }
    throw new BadRequestException("Google Takvim'e ulaşılamadı. Biraz sonra tekrar dene.");
  }
}

function satiriCevir(r: any, takvim?: GoogleTakvimOzeti): GoogleTakvimEtkinligi {
  return {
    id: r.id,
    takvimId: r.takvim_id,
    takvimAdi: takvim?.ad,
    takvimRengi: takvim?.renk,
    baslik: r.baslik ?? "(başlıksız)",
    aciklama: r.aciklama ?? undefined,
    konum: r.konum ?? undefined,
    baslangic: new Date(r.baslangic).toISOString(),
    bitis: new Date(r.bitis).toISOString(),
    tumGun: Boolean(r.tum_gun),
    htmlLink: r.html_link ?? undefined,
    meetLink: r.meet_link ?? undefined,
    katilimciSayisi: r.katilimci_sayisi ?? undefined,
    duzenleyen: r.duzenleyen ?? undefined,
    kaynak: r.kaynak,
    planBlokId: r.plan_blok_id ?? undefined,
    gorevId: r.gorev_id ?? undefined,
    gorevBasligi: r.tasks?.title ?? undefined,
    isleme: r.isleme,
  };
}
