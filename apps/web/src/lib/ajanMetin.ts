/**
 * Ajan raporlarının Markdown'ını bloklara ayırır (başlık, madde, paragraf,
 * kalın, bağlantı). HTML ÜRETMEZ: rapor bir dil modelinin yazdığı ve modelin
 * okuduğu web sayfalarından etkilenen metin; `innerHTML`'e girmesi sayfaya
 * yabancı betik sokmanın en kısa yolu olurdu. Bileşen blokları React
 * öğelerine çevirir, bağlantıda yalnızca http(s) kabul edilir.
 */

export type SatirIci =
  | { tur: "metin"; metin: string }
  | { tur: "kalin"; metin: string }
  | { tur: "baglanti"; metin: string; adres: string };

export type Blok =
  | { tur: "baslik"; seviye: 1 | 2 | 3; parcalar: SatirIci[] }
  | { tur: "liste"; sirali: boolean; maddeler: SatirIci[][] }
  | { tur: "paragraf"; parcalar: SatirIci[] };

export function satirIci(metin: string): SatirIci[] {
  const sonuc: SatirIci[] = [];
  const desen = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+)/g;
  let son = 0;
  for (const m of metin.matchAll(desen)) {
    if (m.index! > son) sonuc.push({ tur: "metin", metin: metin.slice(son, m.index) });
    if (m[1]) sonuc.push({ tur: "kalin", metin: m[1] });
    else if (m[2]) {
      if (/^https?:\/\//i.test(m[3])) sonuc.push({ tur: "baglanti", metin: m[2], adres: m[3] });
      else sonuc.push({ tur: "metin", metin: m[2] });
    } else sonuc.push({ tur: "baglanti", metin: m[4], adres: m[4] });
    son = m.index! + m[0].length;
  }
  if (son < metin.length) sonuc.push({ tur: "metin", metin: metin.slice(son) });
  return sonuc;
}

export function markdownBloklari(md: string): Blok[] {
  const bloklar: Blok[] = [];
  let paragraf: string[] = [];
  const paragrafiBitir = () => {
    if (paragraf.length) bloklar.push({ tur: "paragraf", parcalar: satirIci(paragraf.join(" ")) });
    paragraf = [];
  };
  for (const ham of md.replace(/\r/g, "").split("\n")) {
    const satir = ham.trim();
    const baslik = satir.match(/^(#{1,6})\s+(.*)$/);
    const madde = satir.match(/^([-*•]|\d+[.)])\s+(.*)$/);
    if (!satir) {
      paragrafiBitir();
    } else if (baslik) {
      paragrafiBitir();
      bloklar.push({ tur: "baslik", seviye: Math.min(3, baslik[1].length) as 1 | 2 | 3, parcalar: satirIci(baslik[2]) });
    } else if (madde) {
      paragrafiBitir();
      const sirali = /^\d/.test(madde[1]);
      const onceki = bloklar[bloklar.length - 1];
      if (onceki?.tur === "liste" && onceki.sirali === sirali) onceki.maddeler.push(satirIci(madde[2]));
      else bloklar.push({ tur: "liste", sirali, maddeler: [satirIci(madde[2])] });
    } else {
      paragraf.push(satir);
    }
  }
  paragrafiBitir();
  return bloklar;
}
