import type { Locale } from "@projelio/shared";
import type { HazirMetin } from "../notifications/ipucu-eposta.template";

/**
 * Lio'nun e-posta yazarlığı — SAF kısım: modele giden istem ve dönen metnin
 * çözümü. Model çağrısı ve maliyet kaydı lio-eposta-yazari.service.ts'te.
 *
 * İKİ İŞ:
 *   1. Kişiselleştirme: yöneticinin (ya da koddaki ipucunun) taslağını TEK BİR
 *      ALICI için yeniden yazmak. Amaç teslim edilebilirlik ve okunma: aynı
 *      gövdenin yüzlerce kişiye birebir gitmesi spam süzgeçlerinin baktığı
 *      işaretlerden biri; kişinin diliyle ve durumuyla konuşan metin okunuyor.
 *   2. Taslak: yöneticinin birkaç cümlelik isteğinden bir e-posta taslağı.
 *
 * MODELE GİDEN ALICI BİLGİSİ BİLEREK AZ: ad, dil, hesap tipi, sektör ve
 * birkaç SAYI (kaç işi var, kaç gündür üye). Görev başlıkları, dosya adları,
 * müşteri verisi gönderilmiyor — metni kişiselleştirmek için gerekmiyor ve
 * sağlayıcıya gitmesi KVKK açısından ayrı bir karar olurdu.
 *
 * UYDURMAYA KARŞI: model taslakta olmayan bir özellik, indirim ya da tarih
 * yazmamalı. İstem bunu açıkça yasaklıyor; ayrıca yanıt tek bir JSON nesnesi
 * ve alan uzunlukları burada sınırlanıyor. Bağlantı adresini model YAZMIYOR —
 * düğmenin gittiği yer yöneticinin verdiği link, model yalnızca düğme metnini
 * seçiyor. Aksi hâlde bir halüsinasyon e-postaya sahte bir adres koyabilirdi.
 */

export interface LioAliciBaglami {
  ad?: string;
  dil: Locale;
  hesapTipi?: string | null;
  sektor?: string | null;
  uyelikGun?: number | null;
  isSayisi?: number | null;
  gorevSayisi?: number | null;
  /** Son etkinlikten bu yana geçen gün; hiç girmediyse null. */
  sonGirisGunOnce?: number | null;
}

export interface Taslak {
  konu?: string;
  baslik: string;
  govde: string;
  dugme?: string;
}

/** Yanıt alanlarının tavanı — Gmail 102 KB'ta keser, ayrıca kısa e-posta okunur. */
export const LIO_METIN_SINIRI = { konu: 140, baslik: 120, govde: 3000, dugme: 40 } as const;

/**
 * Üslup ipuçları. Aynı taslak aynı istemle yazılınca modeller birbirine çok
 * benzeyen metinler üretiyor; her alıcıya rastgele biri verilerek cümle
 * kuruluşu çeşitleniyor. Anlamı değiştirmiyor, yalnızca anlatımı.
 */
// dil:atla-baslangic — modele giden talimatlar, kullanıcıya görünmüyor.
const USLUPLAR = [
  "Kısa ve doğrudan yaz; ilk cümlede asıl faydayı söyle.",
  "Samimi bir arkadaş tonu kullan; bir soruyla başla.",
  "Somut bir örnekle anlat; kişinin gününden bir an hayal ettir.",
  "Sakin ve net ol; madde işareti kullanmadan iki kısa paragraf yaz.",
  "Hafif esprili ol ama abartma; tek bir cümleyle merak uyandır.",
  "Pratik ol: 'bugün şunu dene' diye tek bir adım öner.",
] as const;

const HESAP_TIPI_ACIKLAMA: Record<string, string> = {
  freelancer: "bireysel çalışan / serbest çalışan",
  organization_owner: "bir şirket ya da işletme sahibi",
  group_owner: "birden fazla şirketi (holding) yöneten biri",
  employee: "bir şirkette çalışan",
  subcontractor: "bir şirkete hizmet veren taşeron",
};

const DIL_ADI: Record<string, string> = { tr: "Türkçe", en: "İngilizce (English)" };

function ortakKurallar(dil: Locale): string {
  return [
    `Yalnızca ${DIL_ADI[dil] ?? "Türkçe"} yaz.`,
    dil === "tr" ? "Okuru 'sen' diye muhatap al." : "Use a friendly, direct tone.",
    "Taslakta OLMAYAN hiçbir özellik, fiyat, indirim, tarih ya da vaat ekleme. Emin olmadığın şeyi yazma.",
    "'kredi' ya da 'credit' kelimesini kullanma; Lio'nun bakiyesinden söz edilecekse adı 'Lio Bakiyesi' (EN: 'Lio Units').",
    "Hiçbir bağlantı, URL ya da e-posta adresi yazma. Düğme ayrıca eklenecek; yalnızca düğme metnini ver.",
    "HTML ya da Markdown kullanma. Paragrafları boş satırla ayır. Emoji kullanma.",
    "Gövde en fazla 3 kısa paragraf olsun.",
    'Yanıtın YALNIZCA şu JSON nesnesi olsun, başka hiçbir şey yazma: {"konu": "...", "baslik": "...", "govde": "...", "dugme": "..."}',
  ].join("\n- ");
}

/** Bir alıcı için kişiselleştirme istemi. `uslupSirasi` testte sabitlenebilsin diye dışarıdan. */
export function kisisellestirmeIstemi(
  taslak: Taslak,
  baglam: LioAliciBaglami,
  uslupSirasi: number = Math.floor(Math.random() * USLUPLAR.length)
): { system: string; user: string } {
  const uslup = USLUPLAR[Math.abs(uslupSirasi) % USLUPLAR.length];
  const system = `Sen Projelio'nun (iş, proje ve görev yönetimi uygulaması) e-posta yazarısın. Sana bir e-posta taslağı ve alıcı hakkında birkaç bilgi verilecek. Taslağı BU ALICI için yeniden yaz: aynı mesajı ver, ama kendi cümlelerinle ve kişiye uygun biçimde.

Kurallar:
- ${ortakKurallar(baglam.dil)}
- Adı biliniyorsa gövdeye adıyla selam vererek başla (yalnızca ilk adı kullan).
- Alıcının durumu mesajla ilgiliyse (ör. henüz hiç işi yoksa ve taslak iş açmayı anlatıyorsa) bir cümleyle bağla; sayıları aynen tekrar etme, "henüz" gibi doğal ifadeler kullan.
- Üslup: ${uslup}`;

  const bilgiler: string[] = [];
  if (baglam.ad) bilgiler.push(`Ad: ${baglam.ad.split(/\s+/)[0]}`);
  if (baglam.hesapTipi) bilgiler.push(`Hesap: ${HESAP_TIPI_ACIKLAMA[baglam.hesapTipi] ?? baglam.hesapTipi}`);
  if (baglam.sektor) bilgiler.push(`Sektör: ${baglam.sektor}`);
  if (baglam.uyelikGun != null) bilgiler.push(`Kaç gündür üye: ${baglam.uyelikGun}`);
  if (baglam.isSayisi != null) bilgiler.push(`Açtığı iş sayısı: ${baglam.isSayisi}`);
  if (baglam.gorevSayisi != null) bilgiler.push(`Kendisine atanmış görev sayısı (bitenler dahil): ${baglam.gorevSayisi}`);
  if (baglam.sonGirisGunOnce != null) bilgiler.push(`Son girişinden bu yana gün: ${baglam.sonGirisGunOnce}`);
  else bilgiler.push("Uygulamaya henüz hiç giriş yapmamış olabilir.");

  const user = `ALICI:
${bilgiler.join("\n")}

TASLAK:
Konu: ${taslak.konu ?? taslak.baslik}
Başlık: ${taslak.baslik}
Düğme: ${taslak.dugme ?? "(sen öner)"}
Gövde:
${taslak.govde}`;
  return { system, user };
}

/** Yöneticinin kısa isteğinden taslak yazdırma istemi. */
export function taslakIstemi(istek: string, dil: Locale): { system: string; user: string } {
  const system = `Sen Projelio'nun (iş, proje ve görev yönetimi uygulaması; içinde Lio adında bir yapay zekâ yardımcısı var) e-posta yazarısın. Yönetici sana kullanıcılara gidecek bir e-postanın ne anlatması gerektiğini söyleyecek; sen bir TASLAK yaz. Taslak daha sonra her alıcı için ayrıca kişiselleştirilebilir, bu yüzden kişiye özel bilgi (ad vb.) YAZMA ve selamla başlama.

Kurallar:
- ${ortakKurallar(dil)}`;
  return { system, user: `Yöneticinin isteği:\n${istek}` };
}
// dil:atla-bitis

export class LioMetniCozulemedi extends Error {}

function temizle(deger: unknown, sinir: number): string {
  if (typeof deger !== "string") return "";
  return deger
    .replace(/<[^>]*>/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, sinir);
}

/**
 * Modelin yanıtını hazır metne çevirir. Model JSON'u kod bloğuna sarabiliyor
 * ya da önüne bir cümle ekleyebiliyor; ilk `{` ile son `}` arası alınıyor.
 * Başlık ya da gövde boşsa HATA: yarım bir e-posta göndermektense taslağın
 * kendisine düşmek (çağıranın işi) daha iyi.
 */
export function lioMetniniCoz(yanit: string): HazirMetin {
  const bas = yanit.indexOf("{");
  const son = yanit.lastIndexOf("}");
  if (bas < 0 || son <= bas) throw new LioMetniCozulemedi("Yanıtta JSON yok");
  let veri: any;
  try {
    veri = JSON.parse(yanit.slice(bas, son + 1));
  } catch {
    throw new LioMetniCozulemedi("JSON çözülemedi");
  }
  const baslik = temizle(veri?.baslik, LIO_METIN_SINIRI.baslik);
  const govde = temizle(veri?.govde, LIO_METIN_SINIRI.govde);
  if (!baslik || !govde) throw new LioMetniCozulemedi("Başlık ya da gövde boş");
  const konu = temizle(veri?.konu, LIO_METIN_SINIRI.konu) || baslik;
  const dugme = temizle(veri?.dugme, LIO_METIN_SINIRI.dugme) || undefined;
  return { konu, baslik, govde, dugme };
}
