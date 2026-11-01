#!/usr/bin/env node
// Yerel geliştirme vekili: localhost:3000 → https://api.projelio.app
//
// NEDEN: Bu bilgisayarda backend/.env yok, yani yerel backend açılamıyor. Ama
// web uygulaması VITE_API_URL tanımsızken zaten http://localhost:3000'e istek
// atıyor (bkz. apps/web/src/api/client.ts). Bu vekil o adrese oturup istekleri
// canlı API'ye aktarıyor; böylece yerel arayüz GERÇEK veriyle çalışıyor.
//
// DİKKAT: Gerçek veridir. Yerelde yapılan her değişiklik canlıya yazılır.
//
// CORS: canlı API yalnızca kendi alan adlarına izin veriyor. Tarayıcı isteği
// vekile (localhost) attığı için CORS kararını burada veriyoruz ve canlıya
// giden isteğin Origin başlığını siliyoruz.
//
// Kullanım: npm run dev:sakin   (vekil + web birlikte)

import http from "node:http";
import https from "node:https";
import tls from "node:tls";

const HEDEF = process.env.VEKIL_HEDEF ?? "api.projelio.app";
const PORT = Number(process.env.VEKIL_PORT ?? 3000);
const IZINLI = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

// İzin verilen başlıklar elle listelenmez: tarayıcının ön kontrolde sorduğu
// başlıklar (Access-Control-Request-Headers) aynen geri yansıtılır. Elle liste
// tutulduğunda uygulamaya eklenen her yeni başlık (ör. X-Projelio-Locale)
// girişi sessizce "Sunucuya ulaşılamadı" hatasına düşürüyordu.
function corsBasliklari(req) {
  const origin = req.headers.origin;
  if (!origin || !IZINLI.test(origin)) return {};
  const istenen = req.headers["access-control-request-headers"];
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    ...(istenen ? { "access-control-allow-headers": istenen } : {}),
    "access-control-expose-headers": "retry-after,content-disposition",
    vary: "Origin, Access-Control-Request-Headers",
  };
}

function temizBasliklar(basliklar) {
  const b = { ...basliklar, host: HEDEF };
  delete b.origin;
  delete b.referer;
  return b;
}

const sunucu = http.createServer((req, res) => {
  const cors = corsBasliklari(req);
  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...cors, "access-control-max-age": "600" });
    res.end();
    return;
  }
  const istek = https.request(
    { host: HEDEF, port: 443, method: req.method, path: req.url, headers: temizBasliklar(req.headers), servername: HEDEF },
    (yanit) => {
      const basliklar = { ...yanit.headers };
      for (const k of Object.keys(basliklar)) if (k.startsWith("access-control-")) delete basliklar[k];
      if ((yanit.statusCode ?? 0) >= 400) console.log(`  ${req.method} ${req.url.split("?")[0]} → ${yanit.statusCode}`);
      res.writeHead(yanit.statusCode ?? 502, { ...basliklar, ...cors });
      yanit.pipe(res);
    }
  );
  istek.on("error", (hata) => {
    console.log(`  ${req.method} ${req.url.split("?")[0]} → canlı API'ye ulaşılamadı (${hata.message})`);
    res.writeHead(502, { "content-type": "application/json", ...cors });
    res.end(JSON.stringify({ message: `Canlı API'ye ulaşılamadı: ${hata.message}` }));
  });
  req.pipe(istek);
});

// Socket.IO (canlı işbirliği, bildirimler) WebSocket'e yükseltir; onu da aktar.
sunucu.on("upgrade", (req, soket, bas) => {
  const hedef = tls.connect(443, HEDEF, { servername: HEDEF }, () => {
    const b = temizBasliklar(req.headers);
    const satirlar = [`${req.method} ${req.url} HTTP/1.1`, ...Object.entries(b).map(([k, v]) => `${k}: ${v}`), "", ""];
    hedef.write(satirlar.join("\r\n"));
    if (bas && bas.length) hedef.write(bas);
    hedef.pipe(soket);
    soket.pipe(hedef);
  });
  const kapat = () => {
    hedef.destroy();
    soket.destroy();
  };
  hedef.on("error", kapat);
  soket.on("error", kapat);
});

sunucu.listen(PORT, () => {
  console.log(`\n  Canlı veri vekili: http://localhost:${PORT} → https://${HEDEF}`);
  console.log("  Uyarı: GERÇEK veri. Yerelde yapılan değişiklikler canlıya yazılır.\n");
});
