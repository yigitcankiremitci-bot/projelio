import { kabuktaMi } from "./mobilKabuk";

/**
 * Uygulama açıkken gelen bildirimin sesi (public/sounds/bildirim.mp3).
 *
 * Neden yalnızca sekme GÖRÜNÜRKEN: sekme arka plandaysa bildirim zaten web
 * push olarak işletim sistemine gidiyor ve onun sesi çalıyor; ikisi birden
 * çalmasın. Aynı sebeple birden çok sekme açıksa yalnızca bakılan sekme çalar.
 *
 * Neden mobil kabukta hiç çalmıyor: orada aynı bildirim FCM'den sistem
 * bildirimi olarak da geliyor ve kanalın kendi sesi (aynı dosya, res/raw)
 * çalıyor — burada da çalınsa kullanıcı sesi iki kez duyardı.
 *
 * Açık/kapalı tercihi hesapta (Ayarlar > Bildirimler, migration 135); çan
 * açılışta okuyup buraya bildirir. Okunamazsa açık kalır.
 */
let ses: HTMLAudioElement | null = null;
let sesAcik = true;

export function bildirimSesiniAyarla(acik: boolean): void {
  sesAcik = acik;
}

function cal(): void {
  try {
    ses ??= new Audio("/sounds/bildirim.mp3");
    ses.currentTime = 0;
    // Tarayıcı, kullanıcı sayfayla hiç etkileşmediyse otomatik çalmayı
    // reddeder; o durumda sessiz kalmak doğru, hata değil.
    void ses.play().catch(() => {});
  } catch {
    // Audio desteklenmiyorsa bildirim yine çanda görünür.
  }
}

export function bildirimSesiCal(): void {
  if (!sesAcik || kabuktaMi() || document.visibilityState !== "visible") return;
  cal();
}

/** Ayarlardaki "Sesi dinle" — tercihten ve kabuktan bağımsız, kullanıcı istedi. */
export function bildirimSesiniDene(): void {
  cal();
}
