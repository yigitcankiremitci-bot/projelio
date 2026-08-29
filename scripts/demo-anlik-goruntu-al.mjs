#!/usr/bin/env node
/**
 * DEMO ANLIK GÖRÜNTÜSÜ ALIR — database/demo/celikhan-demo.json
 *
 *   node scripts/demo-anlik-goruntu-al.mjs          # yazar
 *   node scripts/demo-anlik-goruntu-al.mjs --rapor  # yalnızca sayar, dosyaya dokunmaz
 *
 * NE İŞE YARAR: `ceo@celikhan.test` herkese açık bir demo hesabı ve her girişte
 * verisi bu dosyadan geri yükleniyor (bkz.
 * backend/src/modules/demo/demo-sifirlama.service.ts). Yani bu dosya "demonun
 * ilk hali"dir. Demo verisini elle güzelleştirdikten sonra bu scripti bir kez
 * çalıştır; o andaki hal yeni "ilk hal" olur.
 *
 * NEYİ ALIR: demo şirketine ait, id'si demo aralığında (`ce11...`) olan satırlar.
 * Uygulamanın kendi ürettiği kayıtlar (rutin motorunun açtığı görevler,
 * bildirimler) rastgele id aldığı için bilerek DIŞARIDA kalır — onlar zaten
 * her sıfırlamada siliniyor.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { anonimlestir } from "./demo-anonimlestir.mjs";

const kok = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(kok, "backend/.env"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
    })
);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const ID_ALT = "ce110000-0000-0000-0000-000000000000";
const ID_UST = "ce11ffff-ffff-ffff-ffff-ffffffffffff";
const DEMO_EPOSTA_SONU = "@celikhan.test";

/**
 * Tablo sırası = bağımlılık sırası; geri yükleme bu sırayla yazıyor, önce
 * ebeveyn sonra çocuk. Sırayı değiştirirsen yabancı anahtar hatası alırsın.
 * `kendine` alanı olan tablolarda satırlar da kendi içinde sıralanır
 * (üst görev alt görevden önce yazılmalı).
 */
const TABLOLAR = [
  { tablo: "users", sutun: "email", tip: "eposta" },
  { tablo: "organizations", sutun: "id", tip: "aralik" },
  { tablo: "departments", sutun: "organization_id", tip: "kapsam", kaynak: "organizations" },
  { tablo: "department_members", sutun: "department_id", tip: "kapsam", kaynak: "departments" },
  { tablo: "organization_modules", sutun: "organization_id", tip: "kapsam", kaynak: "organizations" },
  { tablo: "module_members", sutun: "organization_id", tip: "kapsam", kaynak: "organizations" },
  { tablo: "party", sutun: "organization_id", tip: "kapsam", kaynak: "organizations", kendine: "parent_party_id" },
  { tablo: "party_contact", sutun: "party_id", tip: "kapsam", kaynak: "party" },
  { tablo: "products", sutun: "organization_id", tip: "kapsam", kaynak: "organizations" },
  { tablo: "jobs", sutun: "organization_id", tip: "kapsam", kaynak: "organizations" },
  { tablo: "job_members", sutun: "job_id", tip: "kapsam", kaynak: "jobs" },
  { tablo: "projects", sutun: "job_id", tip: "kapsam", kaynak: "jobs" },
  { tablo: "project_members", sutun: "project_id", tip: "kapsam", kaynak: "projects" },
  { tablo: "outputs", sutun: "project_id", tip: "kapsam", kaynak: "projects" },
  { tablo: "operations", sutun: "job_id", tip: "kapsam", kaynak: "jobs" },
  { tablo: "operation_routines", sutun: "operation_id", tip: "kapsam", kaynak: "operations" },
  { tablo: "tasks", tip: "gorevler", kendine: "parent_task_id" },
  { tablo: "budget_transactions", tip: "butce" },
  { tablo: "module_records", sutun: "organization_id", tip: "kapsam", kaynak: "organizations" },
  { tablo: "module_record_versions", sutun: "record_id", tip: "kapsam", kaynak: "module_records" },
  { tablo: "project_posts", sutun: "project_id", tip: "kapsam", kaynak: "projects" },
  { tablo: "post_comments", sutun: "user_id", tip: "kapsam", kaynak: "users" },
  { tablo: "task_comments", sutun: "task_id", tip: "kapsam", kaynak: "tasks" },
  { tablo: "notifications", sutun: "user_id", tip: "kapsam", kaynak: "users" },
  { tablo: "personal_todos", sutun: "user_id", tip: "kapsam", kaynak: "users" },
];

/** Demo aralığındaki satırları getirir; `in` listeleri parça parça sorgulanır. */
async function getir(tablo, sutun, degerler) {
  const hepsi = [];
  const parcalar = degerler ? parcala(degerler, 80) : [null];
  for (const parca of parcalar) {
    let sorgu = supabase.from(tablo).select("*").gte("id", ID_ALT).lte("id", ID_UST);
    if (parca) sorgu = sorgu.in(sutun, parca);
    const { data, error } = await sorgu.limit(5000);
    if (error) throw new Error(`${tablo}: ${error.message}`);
    hepsi.push(...data);
  }
  return hepsi;
}

function parcala(dizi, boyut) {
  const cikti = [];
  for (let i = 0; i < dizi.length; i += boyut) cikti.push(dizi.slice(i, i + boyut));
  return cikti;
}

/** Kendine referans veren tablolarda ebeveyni önce yaz. */
function ebeveynOnce(satirlar, sutun) {
  const sirali = [];
  const yazilan = new Set();
  let kalan = [...satirlar];
  while (kalan.length) {
    const simdi = kalan.filter((r) => !r[sutun] || yazilan.has(r[sutun]));
    if (simdi.length === 0) {
      // Döngüsel/eksik referans: sırayı zorlamadan olduğu gibi ekle.
      sirali.push(...kalan);
      break;
    }
    for (const r of simdi) {
      sirali.push(r);
      yazilan.add(r.id);
    }
    kalan = kalan.filter((r) => !yazilan.has(r.id));
  }
  return sirali;
}

const idler = {};
const cikti = [];

for (const t of TABLOLAR) {
  let satirlar;
  if (t.tip === "eposta") {
    const { data, error } = await supabase.from("users").select("*").like("email", `%${DEMO_EPOSTA_SONU}`);
    if (error) throw new Error(`users: ${error.message}`);
    satirlar = data;
  } else if (t.tip === "aralik") {
    satirlar = await getir(t.tablo);
  } else if (t.tip === "gorevler") {
    // Görev üç ayrı yerden sarkabiliyor: proje, operasyon ya da departman.
    const parcalar = await Promise.all([
      getir("tasks", "project_id", idler.projects),
      getir("tasks", "operation_id", idler.operations),
      getir("tasks", "department_id", idler.departments),
    ]);
    const teklestir = new Map();
    for (const p of parcalar) for (const r of p) teklestir.set(r.id, r);
    satirlar = [...teklestir.values()];
  } else if (t.tip === "butce") {
    const parcalar = await Promise.all([
      getir("budget_transactions", "project_id", idler.projects),
      getir("budget_transactions", "operation_id", idler.operations),
      getir("budget_transactions", "department_id", idler.departments),
    ]);
    const teklestir = new Map();
    for (const p of parcalar) for (const r of p) teklestir.set(r.id, r);
    satirlar = [...teklestir.values()];
  } else {
    satirlar = await getir(t.tablo, t.sutun, idler[t.kaynak] ?? []);
  }

  if (t.kendine) satirlar = ebeveynOnce(satirlar, t.kendine);
  idler[t.tablo] = satirlar.map((r) => r.id);
  cikti.push({ table: t.tablo, rows: satirlar });
  console.log(`  ${String(satirlar.length).padStart(5)}  ${t.tablo}`);
}

const toplam = cikti.reduce((a, t) => a + t.rows.length, 0);

// ANONİMLEŞTİRME YAZMA YOLUNUN ÜSTÜNDE, ayrı bir adım değil.
// Demo şirketinin verisi gerçek müşteri/tedarikçi kayıtlarından geliyor ve bu
// depo herkese açık; anlık görüntü dosyaya bu haliyle düşerse firmaların
// e-postaları, telefonları ve vergi numaraları yayımlanmış olur. Ayrı bir
// komut olsaydı bir sonraki görüntüde unutulurdu (bkz. demo-anonimlestir.mjs).
const { veri: temiz, sayac } = anonimlestir(cikti.filter((t) => t.rows.length > 0));
console.log(
  `\nAnonimleştirildi — firma: ${sayac.firma}  kişi: ${sayac.kisi}  ` +
    `e-posta: ${sayac.eposta}  telefon: ${sayac.telefon}  vergi no: ${sayac.vergi}`
);

if (process.argv.includes("--rapor")) {
  console.log(`Rapor: ${toplam} satır (dosya yazılmadı).`);
} else {
  const hedef = join(kok, "database/demo/celikhan-demo.json");
  writeFileSync(hedef, JSON.stringify(temiz));
  console.log(`${toplam} satır yazıldı: ${hedef}`);
}
