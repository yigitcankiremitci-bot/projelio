/**
 * Kapak fotoğrafının odak noktası — fotoğrafın hangi kısmının görünür kalacağı.
 *
 * NEDEN: kapaklar her yerde `background-size: cover` ile çiziliyor ve kutunun
 * oranı yüzeye göre değişiyor (masaüstü sayfa kapağı ~5:1, kart 3:1, telefon
 * bandı). Fotoğraf hep ORTADAN kırpıldığı için ekip fotoğraflarında insanların
 * kafası kesiliyordu. Sabit bir oranla kırpıp yüklemek sorunu çözmezdi: aynı
 * görsel başka bir yüzeyde yine farklı orana kırpılıyor.
 *
 * Odak noktası her orana uyar: `background-position: x% y%` görselin x%/y%
 * noktasını kutunun x%/y% noktasına oturtur — yani seçilen nokta kutunun
 * oranı ne olursa olsun HER ZAMAN kutunun içinde kalır.
 *
 * NEREDE SAKLANIYOR: kapak adresinin parça (#) kısmında, `...jpg#odak=50,20`.
 *  - Kapak altı ayrı tabloda (iş, proje, rutin, şirket, grup, departman);
 *    ayrı sütun altı migration + altı servis + altı tip demekti. Adres zaten
 *    her yere taşınıyor, odak da onunla birlikte gidiyor.
 *  - Parça kısmı tarayıcı tarafından sunucuya HİÇ gönderilmez: aynı dosya,
 *    aynı önbellek; odağı olmayan eski istemciler de görseli sorunsuz açar.
 */

export interface KapakOdagi {
  /** 0–100, soldan yüzde. */
  x: number;
  /** 0–100, yukarıdan yüzde. */
  y: number;
}

export const VARSAYILAN_KAPAK_ODAGI: KapakOdagi = { x: 50, y: 50 };

const ODAK_KALIBI = /#odak=(\d{1,3}(?:\.\d+)?),(\d{1,3}(?:\.\d+)?)$/;

function sinirla(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.round(Math.min(100, Math.max(0, n)));
}

/** Adresin odak kısmı atılmış hâli — dosyanın kendisi. */
export function kapakDosyaAdresi(url: string): string {
  const i = url.indexOf("#");
  return i === -1 ? url : url.slice(0, i);
}

/** Adreste yazılı odak; yoksa (ya da bozuksa) undefined. */
export function kapakOdagiOku(url?: string | null): KapakOdagi | undefined {
  if (!url) return undefined;
  const m = ODAK_KALIBI.exec(url);
  if (!m) return undefined;
  return { x: sinirla(Number(m[1])), y: sinirla(Number(m[2])) };
}

/**
 * Adrese odağı yazar (varsa eskisinin yerine). Odak tam ortaysa adres sade
 * kalır: ortası zaten varsayılan, gereksiz bir ek taşımasın.
 */
export function kapakOdagiYaz(url: string, odak: KapakOdagi | null | undefined): string {
  const dosya = kapakDosyaAdresi(url);
  if (!odak) return dosya;
  const x = sinirla(odak.x);
  const y = sinirla(odak.y);
  if (x === 50 && y === 50) return dosya;
  return `${dosya}#odak=${x},${y}`;
}

/** CSS `background-position` değeri. */
export function kapakKonumu(url?: string | null): string {
  const odak = kapakOdagiOku(url);
  return odak ? `${odak.x}% ${odak.y}%` : "center";
}
