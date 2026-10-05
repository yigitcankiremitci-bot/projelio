/**
 * Lio'nun gönderi açıklaması önerisinin saf kuralları: videodan kaç kare, hangi
 * saniyelerden alınır; modele ne söylenir; modelin yanıtı nasıl okunur.
 *
 * Servisten AYRI, çünkü veritabanı, ffmpeg ya da sağlayıcı taklidi olmadan
 * test edilebilmeli (publish-format.ts ile aynı gerekçe).
 */

/** Instagram tek gönderide en fazla 30 etiket kabul ediyor; fazlası gönderiyi düşürür. */
export const MAX_ETIKET = 30;

/** Bir öneri için modele gösterilen toplam kare tavanı (bütün medya birlikte). */
export const MAX_KARE = 12;

/**
 * Bir videodan alınacak kare sayısı.
 *
 * Dört saniyede bir kare: 15 sn'lik reels 4, 60 sn'lik 10 kare görür. Alt sınır
 * 3 — tek kare bir videonun ne anlattığını söylemez (açılış sahnesi çoğu zaman
 * boş bir plan). Üst sınır bütçe: her kare ~450 token ve modele gidiyor.
 */
export function kareSayisi(sureSn: number, tavan = 10): number {
  if (!Number.isFinite(sureSn) || sureSn <= 0) return Math.min(3, tavan);
  return Math.max(1, Math.min(tavan, Math.max(3, Math.round(sureSn / 4))));
}

/**
 * Karelerin alınacağı saniyeler: videoyu eşit dilimlere bölüp her dilimin
 * ORTASI. İlk ve son saniye bilerek alınmıyor — açılışta siyah kare, kapanışta
 * logo/son kart olması olağan ve ikisi de videonun konusunu anlatmaz.
 */
export function kareZamanlari(sureSn: number, adet: number): number[] {
  if (adet <= 0) return [];
  const sure = Number.isFinite(sureSn) && sureSn > 0 ? sureSn : adet;
  return Array.from({ length: adet }, (_, i) => Math.round(((sure * (i + 0.5)) / adet) * 100) / 100);
}

/**
 * Etiket listesini Instagram'ın kabul ettiği biçime getirir.
 *
 * Model etiketleri "#" olmadan, boşluklu ("sosyal medya") ya da tekrarlı
 * dönebiliyor. Boşluklu etiket Instagram'da ilk kelimede kesilir; tekrar ise
 * 30'luk sınırı boşa harcar. Büyük/küçük harf farkı tekrar sayılır.
 */
export function etiketleriDuzenle(ham: unknown): string[] {
  const liste = Array.isArray(ham) ? ham : typeof ham === "string" ? ham.split(/[\s,]+/) : [];
  const gorulen = new Set<string>();
  const sonuc: string[] = [];
  for (const oge of liste) {
    if (typeof oge !== "string") continue;
    // Harf, rakam ve alt çizgi dışındaki her şey düşer (Instagram'ın kuralı);
    // \p{L} Türkçe harfleri de kapsar.
    const govde = oge.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (!govde || /^\d+$/.test(govde)) continue; // yalnızca rakamdan oluşan etiket çalışmaz
    const anahtar = govde.toLocaleLowerCase("tr");
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    sonuc.push(`#${govde}`);
    if (sonuc.length >= MAX_ETIKET) break;
  }
  return sonuc;
}

export class OneriOkunamadi extends Error {}

export interface OkunanOneri {
  caption: string;
  hashtags: string;
  gorulen?: string;
}

/** Modelin yanıtını öneriye çevirir. Açıklama boşsa öneri yoktur. */
export function oneriCevabiniCoz(yanit: string): OkunanOneri {
  const ham = jsonuAyikla(yanit) as Record<string, unknown> | null;
  if (!ham || typeof ham !== "object") throw new OneriOkunamadi("Lio bir öneri üretemedi, tekrar dene."); // dil:anahtar

  const caption = typeof ham.caption === "string" ? ham.caption.trim() : "";
  if (!caption) throw new OneriOkunamadi("Lio bir öneri üretemedi, tekrar dene."); // dil:anahtar

  const gorulen = typeof ham.gorulen === "string" ? ham.gorulen.trim().slice(0, 600) : "";
  return {
    // Instagram sınırı 2200; etiketler ayrı alanda ve yayında metne eklendiği
    // için açıklamaya biraz pay bırakılıyor.
    caption: caption.slice(0, 1800),
    hashtags: etiketleriDuzenle(ham.hashtags).join(" "),
    gorulen: gorulen || undefined,
  };
}

/** Modelin metin yanıtından JSON'u ayıklar (fatura-okuma.ts'teki eşiyle aynı tolerans). */
export function jsonuAyikla(metin: string): unknown {
  const temiz = metin.trim();
  try {
    return JSON.parse(temiz);
  } catch {
    const bas = temiz.indexOf("{");
    const son = temiz.lastIndexOf("}");
    if (bas < 0 || son <= bas) return null;
    try {
      return JSON.parse(temiz.slice(bas, son + 1));
    } catch {
      return null;
    }
  }
}

export interface OneriBaglami {
  dil: "tr" | "en";
  baslik: string;
  icerikTuru: string;
  kampanya?: string | null;
  /** Kullanıcının kutuya yazdığı taslak/notlar — öneri bunun üstüne kurulur. */
  mevcutMetin?: string | null;
  mevcutEtiketler?: string | null;
  /** "Ne vurgulansın" gibi tek seferlik istek. */
  istek?: string | null;
  hesaplar: { platform: string; handle?: string | null; tonNotu?: string | null; kitleNotu?: string | null }[];
  /** Videonun konuşmasının yazıya dökümü (varsa). */
  sesDokumu?: string | null;
  /** Kaç kare/görsel eklendi ve hangileri video karesi — modele bağlam. */
  medyaNotu: string;
}

/**
 * Modelin görev tanımı.
 *
 * "Kredi"/"credit" yasağı Lio'nun sohbet istemindeki gibi burada gerekmez:
 * model kullanıcıya konuşmuyor, yalnızca JSON dönüyor.
 */
export function oneriSistemi(dil: "tr" | "en"): string {
  const dilAdi = dil === "en" ? "English" : "Türkçe";
  return [
    "Sen Projelio'nun asistanı Lio'sun ve bir sosyal medya içerik yazarı gibi çalışıyorsun.",
    "Sana bir Instagram gönderisinin görselleri ya da videosundan eşit aralıklarla alınmış kareler, varsa videodaki konuşmanın dökümü ve gönderi hakkında bilgiler verilecek.",
    "Önce karelere bakıp videoda gerçekten ne olduğunu anla; görmediğin bir şeyi uydurma (ürün adı, fiyat, yer, kişi adı gibi bilgileri yalnızca karelerde, dökümde ya da verilen bilgilerde geçiyorsa kullan).",
    "Sonra gönderi için bir açıklama metni ve etiketler yaz:",
    "- Açıklama ilk satırda dikkat çeken bir kanca cümleyle başlasın, 2-5 kısa paragrafı geçmesin, doğal ve samimi olsun; uygun yerde az sayıda emoji kullanabilirsin.",
    "- Hesabın ton ve kitle notu verildiyse ona uy. Kullanıcının taslak metni varsa onu temel al, anlamını koru ve geliştir.",
    "- Sonda kısa bir eylem çağrısı olabilir (kaydet, paylaş, yorum yaz gibi).",
    "- Açıklamanın İÇİNE etiket yazma; etiketler ayrı alanda.",
    "- 8 ile 15 arası etiket öner: içeriğe özgü, orta hacimli ve birkaç geniş etiketin karışımı. Alakasız popüler etiket ekleme.",
    `- Dil: ${dilAdi}. Etiketler de çoğunlukla bu dilde olsun.`,
    "",
    "YALNIZCA şu biçimde tek bir JSON nesnesi döndür, başka hiçbir şey yazma:",
    '{"gorulen": "videoda/görselde ne gördüğünün 1-2 cümlelik özeti", "caption": "açıklama metni", "hashtags": ["etiket1", "etiket2"]}',
  ].join("\n");
}

/** Modele giden bağlam metni (karelerden sonra, kullanıcı mesajının sonunda). */
export function oneriIstemi(b: OneriBaglami): string {
  const satirlar: string[] = [`Gönderi başlığı (iç kullanım): ${b.baslik}`, `İçerik türü: ${b.icerikTuru}`];
  if (b.kampanya) satirlar.push(`Kampanya: ${b.kampanya}`);
  for (const h of b.hesaplar) {
    const ad = h.handle ? `@${h.handle}` : h.platform;
    satirlar.push(`Yayımlanacak hesap: ${ad} (${h.platform})`);
    if (h.tonNotu) satirlar.push(`  Ton notu: ${h.tonNotu}`);
    if (h.kitleNotu) satirlar.push(`  Kitle notu: ${h.kitleNotu}`);
  }
  satirlar.push(b.medyaNotu);
  if (b.sesDokumu) satirlar.push("", "Videodaki konuşmanın dökümü:", b.sesDokumu.slice(0, 6000));
  if (b.mevcutMetin?.trim()) satirlar.push("", "Kullanıcının taslak metni:", b.mevcutMetin.trim());
  if (b.mevcutEtiketler?.trim()) satirlar.push("", `Kullanıcının yazdığı etiketler: ${b.mevcutEtiketler.trim()}`);
  if (b.istek?.trim()) satirlar.push("", `Kullanıcının bu öneri için isteği: ${b.istek.trim().slice(0, 500)}`);
  return satirlar.join("\n");
}
