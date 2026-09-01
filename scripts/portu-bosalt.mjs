// Backend'in portunu (3000) eski bir süreç tutuyorsa onu kapatır.
//
// NEDEN VAR: "npm run dev" çalışırken terminali kapatmak süreci öldürmüyor.
// Bir sonraki çalıştırmada backend "EADDRINUSE" ile düşüyor ve hata mesajı
// sebebi söylemiyor — kullanıcı kendi eski sunucusuyla yarıştığını anlamıyor.
// Bu betik predev olarak koşuyor, yani her "npm run dev" öncesinde.
//
// GÜVENLİK: körlemesine öldürmüyor. Yalnızca komut satırı bu depodaki
// backend'i gösteren node süreçleri kapatılıyor; portu tutan başka bir program
// varsa (ör. senin başka bir projen) dokunulmuyor, uyarı yazılıyor.

import { execFileSync } from "node:child_process";

const PORT = process.env.PORT ?? "3000";

if (process.platform === "win32") process.exit(0);

function calistir(komut, argumanlar) {
  try {
    return execFileSync(komut, argumanlar, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const pidler = calistir("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN", "-t"])
  .split("\n")
  .filter(Boolean);

for (const pid of pidler) {
  const komut = calistir("ps", ["-p", pid, "-o", "command="]);
  const bizim = komut.includes("node") && /projelio|nest/i.test(komut);
  if (!bizim) {
    console.warn(`UYARI: ${PORT} portunu başka bir program tutuyor, dokunulmadı:\n  ${komut}`);
    continue;
  }
  try {
    process.kill(Number(pid), "SIGTERM");
    console.log(`Eski backend kapatıldı (pid ${pid}), port ${PORT} boşaldı.`);
  } catch {
    console.warn(`UYARI: pid ${pid} kapatılamadı; gerekirse elle: kill ${pid}`);
  }
}
