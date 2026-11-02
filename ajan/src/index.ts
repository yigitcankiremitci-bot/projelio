/**
 * Projelio Ajanı — Mac'te sürekli çalışan program.
 *
 * Döngü: 30 sn'de bir nabız, boştayken 15 sn'de bir "iş var mı". İş yoksa
 * sunucu öğrenme listesinden kendisi iş üretir (ajan.service.ts isAl). Mac
 * uyuyunca program da durur; uyanınca kaldığı yerden devam eder, yarım kalan
 * iş 30 dk sonra sunucuda kuyruğa geri döner.
 *
 * Ayar: ~/.projelio-ajan/ayar.env (kur.sh oluşturur). Çalıştırma:
 *   node ajan/src/index.ts
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isiYurut } from "./ajan.ts";
import { Projelio } from "./api.ts";
import { yogunCalisabilirMi } from "./mac.ts";
import { ollamaHazirMi, sohbet, type OllamaAyar } from "./ollama.ts";
import { sayfaOku, webAra } from "./web.ts";

const AYAR_DOSYASI = process.env.AJAN_AYAR ?? join(homedir(), ".projelio-ajan", "ayar.env");

function ayarOku(): Record<string, string> {
  const ayar: Record<string, string> = {};
  try {
    for (const satir of readFileSync(AYAR_DOSYASI, "utf8").split("\n")) {
      const m = satir.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m) ayar[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // dosya yoksa ortam değişkenleri yeter
  }
  return { ...ayar, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PROJELIO_API|AJAN_|OLLAMA_URL|SEARXNG_URL|BRAVE_API_KEY)/.test(k)) as [string, string][]) };
}

const ayar = ayarOku();
const ANAHTAR = ayar.AJAN_ANAHTARI;
if (!ANAHTAR) {
  console.error(`AJAN_ANAHTARI yok. Projelio'da ajan paneli > Mac bağlantısı'ndan anahtar üretip ${AYAR_DOSYASI} dosyasına yaz.`);
  process.exit(1);
}
for (const k of ["SEARXNG_URL", "BRAVE_API_KEY"]) if (ayar[k]) process.env[k] = ayar[k];

const projelio = new Projelio(ayar.PROJELIO_API ?? "https://api.projelio.app", ANAHTAR);
const ollama: OllamaAyar = { url: ayar.OLLAMA_URL ?? "http://127.0.0.1:11434", model: ayar.AJAN_MODEL ?? "qwen3:8b" };

let durum: "bosta" | "calisiyor" = "bosta";
let not: string | null = null;

const gunluk = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function nabizAt(): Promise<void> {
  try {
    await projelio.nabiz(durum, not, ollama.model);
  } catch (e: any) {
    gunluk("nabız gönderilemedi:", e?.message ?? e);
  }
}

const ETIKET = {
  sohbet: "Yanıtlıyor",
  arastirma: "Araştırıyor",
  ogrenme: "Öğreniyor",
  liste: "Öğrenme listesini hazırlıyor",
  fikir: "Öğrendiklerinden fikir çıkarıyor",
  otomasyon: "Otomasyon",
  sirket: "Şirketi inceliyor",
} as const;

async function birTur(): Promise<boolean> {
  const sorun = await ollamaHazirMi(ollama);
  if (sorun) {
    not = sorun;
    return false;
  }
  const yogun = await yogunCalisabilirMi();
  const paket = await projelio.isAl(yogun);
  if (!paket) {
    not = null;
    return false;
  }
  durum = "calisiyor";
  not = `${ETIKET[paket.is.tur]}: ${paket.is.girdi.split("\n")[0].slice(0, 120)}`;
  void nabizAt();
  gunluk("iş alındı", paket.is.tur, paket.is.id, yogun ? "(prizde, boşta)" : "");
  const basla = Date.now();
  try {
    const sonuc = await isiYurut(paket, {
      model: (m, a) => sohbet(ollama, m, a),
      webAra,
      sayfaOku,
      bellekteAra: (q) => projelio.bellekteAra(q),
      projeliodaOku: (arac, kimlik, sorgu) => projelio.projeliodaOku(arac, kimlik, sorgu),
      durumBildir: (n) => {
        not = n;
      },
    });
    await projelio.bitir(paket.is.id, sonuc);
    // Sonucun özeti: liste işi sessizce boş dönünce (2026-11-02) günlükten anlaşılmıyordu.
    const fikirSayisi = sonuc.oneriler?.filter((o) => o.tur === "fikir").length;
    const lioSayisi = sonuc.oneriler?.filter((o) => o.tur === "lio").length;
    const ozet = [sonuc.konular?.length && `${sonuc.konular.length} konu`, sonuc.bilgiler?.length && `${sonuc.bilgiler.length} not`, fikirSayisi && `${fikirSayisi} fikir`, lioSayisi && `${lioSayisi} Lio devri`, sonuc.rapor && "rapor", sonuc.mesaj && "mesaj"].filter(Boolean).join(", ") || "boş sonuç";
    gunluk("iş bitti", paket.is.id, `${Math.round((Date.now() - basla) / 1000)} sn`, `· ${ozet}`, paket.is.tur === "liste" ? `· öğretilen ${paket.ogretilenler.length}, mevcut konu ${paket.mevcutKonular.length}` : "");
  } catch (e: any) {
    gunluk("iş hata verdi", paket.is.id, e?.message ?? e);
    await projelio.bitir(paket.is.id, { hata: String(e?.message ?? e).slice(0, 400) }).catch(() => {});
  } finally {
    durum = "bosta";
    not = null;
    void nabizAt();
  }
  return true;
}

async function main(): Promise<void> {
  gunluk(`Projelio ajanı başladı: ${ollama.model} @ ${ollama.url}`);
  setInterval(nabizAt, 30_000);
  await nabizAt();
  for (;;) {
    let isVardi = false;
    try {
      isVardi = await birTur();
    } catch (e: any) {
      gunluk("tur hatası:", e?.message ?? e);
    }
    // İş bittiyse hemen sıradakine bak; yoksa bekle.
    if (!isVardi) await bekle(15_000);
  }
}

void main();
