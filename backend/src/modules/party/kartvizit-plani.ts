import type { BaglantiOnem, PartyRole } from "@projelio/shared";
import { normalizeEmail, normalizeName } from "./party-dedup";

/**
 * Lio'nun okuduğu kartvizitlerden KAYIT PLANI — saf karar, yazma yok.
 *
 * Akış: Lio fotoğraftaki her kartviziti okur (ad, kurum, unvan, iletişim) ve
 * prepare_connections'a verir; sunucu bu planı çıkarır, kullanıcıya gösterir;
 * kullanıcı rolü söyleyip onaylayınca confirm_connections planı uygular.
 *
 * Gruplama SUNUCUDA, modelde değil: "aynı markadan iki kartvizit tek şirket
 * kartının altında birleşsin" kuralını modele bırakmak, bir gün birleştirip
 * ertesi gün iki ayrı kart açması demekti.
 *
 * Kurallar:
 *  - Kurumu kayıtlı bir şirket/kurum kartıyla eşleşen kişi o karta KİŞİ olarak eklenir.
 *  - Aynı kurumdan iki ve daha fazla kişi → yeni şirket kartı + altında kişiler.
 *  - Tek kişi → kendi kişi kartı (kurum alanı dolu).
 *  - Adı, e-postası ya da telefonu kayıtlı bir kişi kartıyla eşleşen ATLANIR.
 */

/** Görselde bir nokta, 0–1 arası (sol üst köşe 0,0). */
export type Nokta = [number, number];

/** Kartvizitin fotoğraftaki dört köşesi — Lio verir, sunucu düzleştirip kırpar. */
export interface Koseler {
  solUst: Nokta;
  sagUst: Nokta;
  sagAlt: Nokta;
  solAlt: Nokta;
}

/** Bir kartvizit görseli: sohbetteki dosyaKimligi ya da WhatsApp mediaId'si. */
export interface KartvizitKaynagi {
  dosya: string;
  kirpma?: Koseler;
}

export interface OkunanKisi {
  displayName: string;
  partyType?: "person" | "company" | "institution";
  kurum?: string;
  unvan?: string;
  email?: string;
  phone?: string;
  website?: string;
  linkedin?: string;
  instagram?: string;
  sehir?: string;
  adres?: string;
  roles?: PartyRole[];
  onem?: BaglantiOnem;
  tanismaYeri?: string;
  tanismaTarihi?: string;
  sonrakiTemas?: string;
  iliskiNotu?: string;
  /** Ön ve arka yüz ayrı fotoğraflarsa ikisi de. */
  kartvizitler?: KartvizitKaynagi[];
  /** Model kurum kartı verdiyse içindeki kişiler. */
  yetkililer?: { name: string; title?: string; phone?: string; email?: string }[];
}

/** Karşılaştırma için kayıtlı kartın gereken kısmı. */
export interface MevcutKart {
  id: string;
  displayName: string;
  partyType: string;
  email?: string;
  phone?: string;
}

export interface PlanKisisi {
  name: string;
  title?: string;
  phone?: string;
  email?: string;
  /** Kişi notu: LinkedIn/Instagram (party_contact'ta sosyal alan yok). */
  notes?: string;
}

export type PlanAdimi =
  | { tur: "yeniKisi"; kisi: OkunanKisi }
  | {
      tur: "yeniKurum";
      ad: string;
      partyType: "company" | "institution";
      website?: string;
      sehir?: string;
      adres?: string;
      kisiler: PlanKisisi[];
      kartvizitler: KartvizitKaynagi[];
      /** Gruplanan kartvizitlerden gelen rol/önem gibi ortak alanlar. */
      kaynak: OkunanKisi;
    }
  | { tur: "mevcutKurum"; partyId: string; ad: string; kisiler: PlanKisisi[]; kartvizitler: KartvizitKaynagi[] }
  | { tur: "atla"; ad: string; mevcutKart: string; sebep: "ad" | "e-posta" | "telefon" };

/** Telefonun karşılaştırma anahtarı: son 10 hane (ülke kodu/0 farkı eşleşsin). */
export function telefonAnahtari(tel?: string): string {
  const rakam = (tel ?? "").replace(/\D/g, "");
  return rakam.length >= 7 ? rakam.slice(-10) : "";
}

function kisiNotu(k: OkunanKisi): string | undefined {
  const parca = [k.linkedin && `LinkedIn: ${k.linkedin}`, k.instagram && `Instagram: ${k.instagram}`].filter(Boolean);
  return parca.length ? parca.join(" · ") : undefined;
}

function kisiyeCevir(k: OkunanKisi): PlanKisisi {
  return { name: k.displayName.trim(), title: k.unvan, phone: k.phone, email: k.email, notes: kisiNotu(k) };
}

export function kartvizitPlani(kisiler: OkunanKisi[], mevcut: MevcutKart[]): PlanAdimi[] {
  const kurumlar = new Map<string, MevcutKart>();
  const kisiAd = new Map<string, MevcutKart>();
  const eposta = new Map<string, MevcutKart>();
  const telefon = new Map<string, MevcutKart>();
  for (const m of mevcut) {
    const n = normalizeName(m.displayName);
    if (m.partyType !== "person") {
      if (n) kurumlar.set(n, m);
      continue;
    }
    if (n) kisiAd.set(n, m);
    if (m.email) eposta.set(normalizeEmail(m.email), m);
    const t = telefonAnahtari(m.phone);
    if (t) telefon.set(t, m);
  }

  const adimlar: PlanAdimi[] = [];
  const mevcutKurumAdimi = new Map<string, Extract<PlanAdimi, { tur: "mevcutKurum" }>>();
  // Aynı kurumdan gelen kişiler, sıra korunarak.
  const kovalar = new Map<string, OkunanKisi[]>();
  const kovaSirasi: string[] = [];

  for (const k of kisiler) {
    const ad = k.displayName?.trim();
    if (!ad) continue;

    // Modelin doğrudan kurum kartı olarak verdiği satır.
    if (k.partyType === "company" || k.partyType === "institution") {
      const var_ = kurumlar.get(normalizeName(ad));
      if (var_) {
        const kisilerI = (k.yetkililer ?? []).filter((y) => y.name?.trim());
        if (!kisilerI.length && !(k.kartvizitler ?? []).length) {
          adimlar.push({ tur: "atla", ad, mevcutKart: var_.displayName, sebep: "ad" });
        } else {
          adimlar.push({ tur: "mevcutKurum", partyId: var_.id, ad: var_.displayName, kisiler: kisilerI, kartvizitler: k.kartvizitler ?? [] });
        }
        continue;
      }
      adimlar.push({
        tur: "yeniKurum",
        ad,
        partyType: k.partyType,
        website: k.website,
        sehir: k.sehir,
        adres: k.adres,
        kisiler: (k.yetkililer ?? []).filter((y) => y.name?.trim()),
        kartvizitler: k.kartvizitler ?? [],
        kaynak: k,
      });
      continue;
    }

    const kopya =
      (k.email && eposta.get(normalizeEmail(k.email)) && { kart: eposta.get(normalizeEmail(k.email))!, sebep: "e-posta" as const }) ||
      (telefonAnahtari(k.phone) && telefon.get(telefonAnahtari(k.phone)) && {
        kart: telefon.get(telefonAnahtari(k.phone))!,
        sebep: "telefon" as const,
      }) ||
      (kisiAd.get(normalizeName(ad)) && { kart: kisiAd.get(normalizeName(ad))!, sebep: "ad" as const });
    if (kopya) {
      adimlar.push({ tur: "atla", ad, mevcutKart: kopya.kart.displayName, sebep: kopya.sebep });
      continue;
    }

    const kurumAnahtari = k.kurum ? normalizeName(k.kurum) : "";
    const kayitliKurum = kurumAnahtari ? kurumlar.get(kurumAnahtari) : undefined;
    if (kayitliKurum) {
      let adim = mevcutKurumAdimi.get(kayitliKurum.id);
      if (!adim) {
        adim = { tur: "mevcutKurum", partyId: kayitliKurum.id, ad: kayitliKurum.displayName, kisiler: [], kartvizitler: [] };
        mevcutKurumAdimi.set(kayitliKurum.id, adim);
        adimlar.push(adim);
      }
      adim.kisiler.push(kisiyeCevir(k));
      adim.kartvizitler.push(...(k.kartvizitler ?? []));
      continue;
    }

    const anahtar = kurumAnahtari || `kisi:${adimlar.length}:${kovaSirasi.length}:${ad}`;
    if (!kovalar.has(anahtar)) {
      kovalar.set(anahtar, []);
      kovaSirasi.push(anahtar);
    }
    kovalar.get(anahtar)!.push(k);
  }

  for (const anahtar of kovaSirasi) {
    const grup = kovalar.get(anahtar)!;
    if (grup.length === 1) {
      adimlar.push({ tur: "yeniKisi", kisi: grup[0] });
      continue;
    }
    // Aynı markadan iki ve daha fazla kartvizit: şirket kartı + kişiler.
    const ilk = grup[0];
    const ilkDolu = <K extends keyof OkunanKisi>(alan: K) => grup.find((g) => g[alan])?.[alan];
    adimlar.push({
      tur: "yeniKurum",
      ad: ilk.kurum!.trim(),
      partyType: "company",
      website: ilkDolu("website") as string | undefined,
      sehir: ilkDolu("sehir") as string | undefined,
      adres: ilkDolu("adres") as string | undefined,
      kisiler: grup.map(kisiyeCevir),
      kartvizitler: grup.flatMap((g) => g.kartvizitler ?? []),
      kaynak: ilk,
    });
  }
  return adimlar;
}

// ----------------------------------------------------------------- kırpma

/**
 * Lio'nun verdiği köşelerden ffmpeg'in perspective filtresine girdi.
 *
 * Köşeler %3 dışa açılır: modelin tahmini birkaç piksel içeride kalırsa
 * kartın kenarındaki yazı (e-posta, web adresi) kesilmesin. Çıktı boyutu
 * kartın kenar uzunluklarından; uzun kenar 1600 px'i geçmez, çiftlenir
 * (JPEG kodlayıcısı tek sayıda renk alt örneklemesinde sorun çıkarıyor).
 *
 * Geçersiz köşede (0–1 dışı, çakışık, alanı fotoğrafın %3'ünden küçük) null:
 * çağıran özgün fotoğrafı ekler — kötü kırpılmış kartvizit, kırpılmamıştan kötü.
 */
export function kirpmaHesabi(
  k: Koseler,
  genislik: number,
  yukseklik: number
): { noktalar: [number, number][]; genislik: number; yukseklik: number } | null {
  const sira = [k.solUst, k.sagUst, k.solAlt, k.sagAlt]; // ffmpeg perspective sırası
  if (!sira.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => Number.isFinite(v) && v >= -0.01 && v <= 1.01))) {
    return null;
  }
  const merkez: Nokta = [sira.reduce((t, p) => t + p[0], 0) / 4, sira.reduce((t, p) => t + p[1], 0) / 4];
  const ac = (p: Nokta): Nokta => {
    const x = merkez[0] + (p[0] - merkez[0]) * 1.03;
    const y = merkez[1] + (p[1] - merkez[1]) * 1.03;
    return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))];
  };
  const px = sira.map(ac).map(([x, y]) => [Math.round(x * genislik), Math.round(y * yukseklik)] as [number, number]);
  const [su, sa, slt, sgt] = px;
  const uz = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // Dörtgenin alanı (ayakkabı bağı formülü, saat yönünde sıra: SÜ, SaÜ, SaA, SA).
  const halka = [su, sa, sgt, slt];
  let alan = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = halka[i];
    const [x2, y2] = halka[(i + 1) % 4];
    alan += x1 * y2 - x2 * y1;
  }
  if (Math.abs(alan) / 2 < genislik * yukseklik * 0.03) return null;

  let w = Math.max(uz(su, sa), uz(slt, sgt));
  let h = Math.max(uz(su, slt), uz(sa, sgt));
  const olcek = Math.min(1, 1600 / Math.max(w, h));
  w = Math.max(2, Math.round((w * olcek) / 2) * 2);
  h = Math.max(2, Math.round((h * olcek) / 2) * 2);
  return { noktalar: px, genislik: w, yukseklik: h };
}
