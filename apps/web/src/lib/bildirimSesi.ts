import { BILDIRIM_SESLERI, bildirimSesiDosyasi, VARSAYILAN_BILDIRIM_SESI, type BildirimSesiAnahtari } from "@projelio/shared";
import { kabukBildirimSesiniSec, kabukSesiCal, kabuktaMi } from "./mobilKabuk";

/**
 * Uygulama açıkken gelen bildirimin sesi — kullanıcının seçtiği ses
 * (Ayarlar > Bildirimler, shared/bildirimSesleri.ts).
 *
 * Neden yalnızca sekme GÖRÜNÜRKEN: sekme arka plandaysa bildirim zaten web
 * push olarak işletim sistemine gidiyor ve onun sesi çalıyor; ikisi birden
 * çalmasın. Aynı sebeple birden çok sekme açıksa yalnızca bakılan sekme çalar.
 *
 * Neden mobil kabukta hiç çalmıyor: orada aynı bildirim FCM'den sistem
 * bildirimi olarak da geliyor ve seçili sesin kanalı çalıyor — burada da
 * çalınsa kullanıcı sesi iki kez duyardı.
 *
 * Açık/kapalı ve hangi ses hesapta (migration 135 + 144); çan açılışta okuyup
 * buraya bildirir. Okunamazsa açık ve varsayılan ses.
 */
let ses: HTMLAudioElement | null = null;
let sesAcik = true;
let secili: BildirimSesiAnahtari = VARSAYILAN_BILDIRIM_SESI;

export function bildirimSesiniAyarla(acik: boolean): void {
  sesAcik = acik;
}

/**
 * Seçili sesi değiştirir. Kabukta telefonun bildirim kanalını da değiştirir —
 * uygulama her açıldığında hesaptaki seçimle çağrıldığı için başka cihazda
 * yapılan değişiklik bu telefona da geçer.
 */
export function bildirimSesiSeciminiAyarla(anahtar: BildirimSesiAnahtari): void {
  if (anahtar !== secili) ses = null;
  secili = anahtar;
  const ad = BILDIRIM_SESLERI.find((s) => s.anahtar === anahtar)?.ad ?? "";
  kabukBildirimSesiniSec(anahtar, ad);
}

function cal(anahtar: BildirimSesiAnahtari): void {
  try {
    if (anahtar === secili) {
      ses ??= new Audio(bildirimSesiDosyasi(anahtar));
      ses.currentTime = 0;
      // Tarayıcı, kullanıcı sayfayla hiç etkileşmediyse otomatik çalmayı
      // reddeder; o durumda sessiz kalmak doğru, hata değil.
      void ses.play().catch(() => {});
    } else {
      void new Audio(bildirimSesiDosyasi(anahtar)).play().catch(() => {});
    }
  } catch {
    // Audio desteklenmiyorsa bildirim yine çanda görünür.
  }
}

export function bildirimSesiCal(): void {
  if (!sesAcik || kabuktaMi() || document.visibilityState !== "visible") return;
  cal(secili);
}

/**
 * Ayarlardaki "Dinle" — tercihten bağımsız, kullanıcı istedi. Kabukta telefonun
 * BİLDİRİM ses düzeyinde çalar (gerçekte duyacağı gibi); eski APK'da ya da
 * tarayıcıda dosyayı çalar.
 */
export function bildirimSesiniDene(anahtar: BildirimSesiAnahtari = secili): void {
  if (kabukSesiCal(anahtar)) return;
  cal(anahtar);
}
