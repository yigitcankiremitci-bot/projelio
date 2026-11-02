/**
 * Mac prizde mi, kullanıcı Mac'in başında mı? Ajan buna göre "yoğun"
 * çalışır: prizdeyken ve kimse klavyeye/fareye dokunmuyorken öğrenme
 * arasında beklemez (sunucu aralığı kısaltır, bkz. ajanBostaNeYapsin).
 * Pilde ya da kullanıcı çalışırken eski 5 dk aralık sürer: fan, pil ve
 * kullanıcının işinin yavaşlaması yalnızca o zaman dert.
 *
 * İki macOS komutu okunur, hiçbir ayar değiştirilmez. Mac dışında ya da
 * komut okunamazsa "yoğun değil" sayılır — temkinli taraf.
 */
import { execFile } from "node:child_process";

/** Bu kadar süredir dokunulmuyorsa kullanıcı başında değil sayılır. */
export const BOSTA_SAYILMA_MS = 5 * 60_000;

/** `pmset -g batt` çıktısı: masaüstü Mac'te de "AC Power" yazar. */
export function prizdeMi(pmset: string): boolean {
  return /drawing from 'AC Power'/.test(pmset);
}

/** `ioreg -c IOHIDSystem` çıktısındaki son dokunuştan beri geçen süre (ms). */
export function bostaSuresi(ioreg: string): number | null {
  const m = ioreg.match(/"HIDIdleTime"\s*=\s*(\d+)/);
  return m ? Number(m[1]) / 1e6 : null;
}

function calistir(komut: string, argumanlar: string[]): Promise<string> {
  return new Promise((coz) => {
    execFile(komut, argumanlar, { timeout: 5000, maxBuffer: 4 * 1024 * 1024 }, (hata, cikti) => coz(hata ? "" : String(cikti)));
  });
}

export async function yogunCalisabilirMi(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  const [pmset, ioreg] = await Promise.all([calistir("pmset", ["-g", "batt"]), calistir("ioreg", ["-c", "IOHIDSystem", "-d", "4"])]);
  const bosta = bostaSuresi(ioreg);
  return prizdeMi(pmset) && bosta !== null && bosta >= BOSTA_SAYILMA_MS;
}
