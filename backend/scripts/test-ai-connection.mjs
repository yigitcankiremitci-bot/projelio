/**
 * AI asistanı bağlantı testi.
 *
 * Kullanım (proje kökünden):
 *   node backend/scripts/test-ai-connection.mjs
 *
 * backend/.env dosyasındaki ANTHROPIC_API_KEY / ANTHROPIC_MODEL değerlerini okur ve
 * Anthropic API'ye gerçek bir istek atar. Hata olursa "fetch failed" gibi kapalı bir
 * mesaj yerine asıl sebebi (DNS / TLS / proxy / geçersiz anahtar) açık açık yazar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(here, "..", ".env");

function readEnv() {
  if (!fs.existsSync(envPath)) {
    console.error(`✗ .env dosyası bulunamadı: ${envPath}`);
    process.exit(1);
  }
  const out = {};
  for (const rawLine of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    // Satır sonundaki "# açıklama" kısmını at, tırnakları temizle.
    const value = line.slice(eq + 1).split(/\s+#/)[0].trim().replace(/^["']|["']$/g, "");
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

function explain(err) {
  const chain = [];
  let cursor = err;
  let code = "";
  for (let depth = 0; cursor && depth < 6; depth++) {
    if (cursor.code && !code) code = String(cursor.code);
    if (cursor.message) chain.push(String(cursor.message));
    cursor = cursor.cause;
  }
  return { code: code || "UNKNOWN", detail: chain.join(" <- ") };
}

const env = readEnv();
const apiKey = env.ANTHROPIC_API_KEY;
const model = env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

console.log("Node sürümü :", process.version);
console.log("Model       :", model);
console.log("API anahtarı:", apiKey ? `${apiKey.slice(0, 12)}…${apiKey.slice(-4)}` : "(YOK)");
console.log("HTTPS_PROXY :", process.env.HTTPS_PROXY ?? process.env.https_proxy ?? "(tanımsız)");
console.log("");

if (!apiKey) {
  console.error("✗ backend/.env içinde ANTHROPIC_API_KEY boş.");
  process.exit(1);
}

// 1) Ham ağ testi — SDK devreye girmeden önce adrese ulaşabiliyor muyuz?
console.log("1/2 · api.anthropic.com adresine erişim deneniyor…");
try {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
  });
  console.log(`    ✓ Bağlantı kuruldu (HTTP ${res.status})`);
  if (res.status === 401) {
    console.error("    ✗ API anahtarı geçersiz. console.anthropic.com üzerinden yeni bir anahtar oluşturun.");
    process.exit(1);
  }
} catch (err) {
  const { code, detail } = explain(err);
  console.error(`    ✗ Bağlantı kurulamadı [${code}]`);
  console.error(`      ${detail}`);
  console.error("");
  console.error("    Olası sebepler: internet bağlantısı yok, VPN/proxy engelliyor,");
  console.error("    kurumsal güvenlik duvarı ya da antivirüs TLS trafiğini kesiyor.");
  process.exit(1);
}

// 2) Gerçek model çağrısı — model adı ve kredi durumu doğru mu?
console.log("2/2 · Model çağrısı deneniyor…");
try {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: "user", content: "merhaba de" }] }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error(`    ✗ HTTP ${res.status}: ${body?.error?.message ?? JSON.stringify(body)}`);
    if (res.status === 404) console.error("      → Model adı hatalı. backend/.env içindeki ANTHROPIC_MODEL değerini kontrol edin.");
    if (res.status === 400 && /credit balance/i.test(body?.error?.message ?? ""))
      console.error("      → Hesabınızda API kredisi yok. console.anthropic.com > Plans & Billing'den kredi yükleyin.");
    else if (res.status === 400) console.error("      → İstek reddedildi; mesajı yukarıda görebilirsiniz.");
    if (res.status === 429) console.error("      → Hız sınırı ya da kredi limiti. console.anthropic.com > Billing'i kontrol edin.");
    process.exit(1);
  }
  const text = (body.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join(" ");
  console.log(`    ✓ Model yanıt verdi: "${text.trim()}"`);
  console.log("");
  console.log("✓ Her şey yolunda. AI asistanı çalışmalı.");
} catch (err) {
  const { code, detail } = explain(err);
  console.error(`    ✗ İstek başarısız [${code}]`);
  console.error(`      ${detail}`);
  process.exit(1);
}
