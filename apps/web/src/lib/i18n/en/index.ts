import type { TranslationDict } from "@projelio/shared";
import { ortak } from "./ortak";
import { gezinme } from "./gezinme";
import { kimlik } from "./kimlik";
import { ayarlar } from "./ayarlar";
import { gorevler } from "./gorevler";
import { projeler } from "./projeler";
import { kurumsal } from "./kurumsal";
import { moduller } from "./moduller";
import { lio } from "./lio";
import { dosyalar } from "./dosyalar";
import { takvim } from "./takvim";
import { hatalar } from "./hatalar";
import { sosyal } from "./sosyal";
import { abonelik } from "./abonelik";
import { yaptim } from "./yaptim";
import { butce } from "./butce";
import { hesaplar } from "./hesaplar";
import { ekipHesaplari } from "./ekipHesaplari";
import { epostaYonetimi } from "./epostaYonetimi";
import { demoRandevu } from "./demoRandevu";
import { baslangic } from "./baslangic";
import { ilkAdimlar } from "./ilkAdimlar";
import { uygulama } from "./uygulama";

/**
 * Türkçe → İngilizce sözlük.
 *
 * Anahtar, arayüzdeki Türkçe metnin KENDİSİ. Bir metnin burada karşılığı yoksa
 * İngilizce arayüzde Türkçe görünür — bilinçli: eksik çeviri boş ekrandan
 * iyidir ve çevirinin dosya dosya ilerlemesine izin verir.
 * Gerekçenin tamamı packages/shared/src/i18n.ts başında.
 *
 * ## Neden alanlara bölünmüş
 *
 * Tek dosyada birkaç bin satır olurdu ve asıl sorun boyut değil: aynı dosyaya
 * paralel dokunan her değişiklik birbiriyle çakışıyordu. Alan başına dosya,
 * çevirinin ekran ekran ve bağımsız ilerlemesini sağlıyor.
 *
 * Aynı anahtar iki alanda tanımlıysa SONRAKİ kazanır. Bu bir kaza değil sıra
 * meselesi: ortak metinler en başta, özel alanlar sonra — böylece bir alan
 * gerektiğinde ortak bir karşılığı kendi bağlamı için ezebiliyor.
 *
 * ## Yazım kuralları
 *
 * - Anahtar, koddaki metinle BİREBİR aynı olmalı — noktalama ve boşluk dahil.
 *   Tek karakterlik fark sessizce Türkçeye düşürür; `npm run dil` bunu yakalar.
 * - Yer tutucular ({ad}, {n}) çeviride de aynı adla durmalı.
 * - Eşsesli metinler bağlamla ayrılır: `"Kapat ##anahtar"` → "Off",
 *   bağlamsız `"Kapat"` → "Close".
 * - Türkçede sayıdan sonra çoğul eki yok, İngilizcede var. Sayı içeren
 *   metinler bu yüzden { one, other } biçiminde yazılır.
 * - Arayüz metni kısa olmalı: uzun çeviri düğümü taşırır.
 */
export const en: TranslationDict = {
  ...ortak,
  ...gezinme,
  ...kimlik,
  ...baslangic,
  ...ilkAdimlar,
  ...uygulama,
  ...ayarlar,
  ...gorevler,
  ...projeler,
  ...kurumsal,
  ...moduller,
  ...lio,
  ...dosyalar,
  ...takvim,
  ...sosyal,
  ...abonelik,
  ...yaptim,
  ...butce,
  ...hesaplar,
  ...ekipHesaplari,
  ...hatalar,
  ...epostaYonetimi,
  ...demoRandevu,
};
