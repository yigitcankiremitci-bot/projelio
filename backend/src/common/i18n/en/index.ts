import type { TranslationDict } from "@projelio/shared";
import { epostalar } from "./epostalar";
import { bildirimler } from "./bildirimler";
import { hatalar } from "./hatalar";
import { whatsapp } from "./whatsapp";

/**
 * Sunucu metinlerinin Türkçe → İngilizce sözlüğü.
 *
 * Web sözlüğünden (apps/web/src/lib/i18n/en/) AYRI: backend derlemesi web
 * kaynağını görmüyor, ayrıca buradaki metinler farklı bir tonda (e-posta,
 * bildirim başlığı) ve karışmaları kimseye bir şey kazandırmıyor.
 *
 * ## Neyin çevrildiği, neyin çevrilmediği
 *
 * Yalnızca KULLANICIYA ULAŞAN metin çevrilir: e-posta gövdesi, bildirim,
 * istemciye dönen istisna mesajı. Log satırları, hata ayıklama çıktıları ve
 * Lio'ya verilen araç açıklamaları çevrilmez — onları okuyan kullanıcı değil,
 * geliştirici ya da model.
 *
 * Yazım kuralları web sözlüğüyle aynı; oradaki başlığa bak.
 */
export const en: TranslationDict = {
  ...epostalar,
  ...bildirimler,
  ...hatalar,
  ...whatsapp,
};
