import { createTranslator } from "@projelio/shared";
import type { Translate } from "@projelio/shared";
import { en } from "./en/index";
import { etkinDil } from "./depo";

/**
 * Kanca kullanamayan yerler için çevirmen.
 *
 * React sınıf bileşenleri (hata sınırı) ve React ağacının dışındaki kod
 * (api katmanı, olay işleyicileri, lib/ yardımcıları) kanca çağıramıyor. Bu
 * fonksiyon dili doğrudan depodan okuyor — sağlayıcıya bağlı değil.
 *
 * Ayrı bir .ts dosyasında çünkü lib/ altındaki düz modüller de kullanıyor ve
 * Node'un test koşucusu index.tsx'i yükleyemiyor.
 *
 * Bedeli: dil değişince bu metinler KENDİLİĞİNDEN yenilenmiyor, bileşen
 * yeniden çizilene kadar eski dilde kalıyorlar. Hata ekranı ve tek seferlik
 * uyarılar için sorun değil; normal arayüzde `useT()` kullan.
 */
export function cevirmenSuAn(): Translate {
  return createTranslator(etkinDil(), en);
}
