// Statik dosyaları derleme sırasında BİR KEZ sıkıştırır.
//
// Neden: Caddy'nin `encode` yönergesi sıkıştırmayı ÖNBELLEKLEMİYOR — aynı 1,29
// MB'lık paketi her indirmede baştan sıkıştırıyordu. Burada bir kez, üstelik en
// yüksek kalitede yapılıyor; Caddy `precompressed br gzip` ile hazır dosyayı
// veriyor (bkz. deploy/Caddyfile). Sıkıştırma kalitesi 11 çalışma anında pahalı
// olduğu için tercih edilmezdi, derlemede sorun değil.
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

const KOK = process.argv[2];
// Zaten sıkıştırılmış biçimleri (png, woff2, jpg) tekrar sıkıştırmak yalnızca
// yer kaplar; kazanç yok.
const UZANTILAR = new Set([".js", ".css", ".html", ".svg", ".json", ".txt", ".map"]);

let sayi = 0;
function gez(dizin) {
  for (const ad of readdirSync(dizin)) {
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) {
      gez(yol);
      continue;
    }
    if (!UZANTILAR.has(extname(yol))) continue;
    const veri = readFileSync(yol);
    // 1 KB'ın altında sıkıştırma kazancı paket başlığını bile karşılamıyor.
    if (veri.length < 1024) continue;
    writeFileSync(
      yol + ".br",
      brotliCompressSync(veri, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 11,
          [constants.BROTLI_PARAM_SIZE_HINT]: veri.length,
        },
      })
    );
    writeFileSync(yol + ".gz", gzipSync(veri, { level: 9 }));
    sayi += 1;
  }
}

gez(KOK);
console.log(`Önceden sıkıştırıldı: ${sayi} dosya (.br + .gz)`);
