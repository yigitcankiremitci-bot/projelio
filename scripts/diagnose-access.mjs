#!/usr/bin/env node
// Bir kullanıcının görünürlüğünü teşhis eder: hesap tipi ne, hangi
// organizasyon/departman/iş/projelere bağlı, nereden yetki alıyor.
//
// Yetki kuralları hesap tipine ve üyelik satırlarına bakar; "neden hâlâ
// görüyor?" sorusunun cevabı neredeyse her zaman bu çıktının içindedir.
//
// Kullanım:
//   node scripts/diagnose-access.mjs taseron@celikhan.test
//
// backend/.env dosyasındaki SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY okunur.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const env = Object.fromEntries(
  readFileSync(join(root, "backend/.env"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const BASE = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) {
  console.error("backend/.env içinde SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY bulunamadı.");
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error("Kullanım: node scripts/diagnose-access.mjs <e-posta>");
  process.exit(1);
}

async function q(path) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

const users = await q(`users?email=eq.${encodeURIComponent(email)}&select=id,email,full_name,account_type,role`);
if (users.length === 0) {
  console.error(`"${email}" adresiyle kullanıcı bulunamadı.`);
  process.exit(1);
}

const user = users[0];
console.log("\n=== KULLANICI ===");
console.log(`  ${user.full_name ?? "(isimsiz)"} <${user.email}>`);
console.log(`  id           : ${user.id}`);
console.log(`  account_type : ${user.account_type ?? "(boş)"}`);
console.log(`  role         : ${user.role ?? "(boş)"}`);

const isSub = user.account_type === "subcontractor";
console.log(
  `\n  ${isSub ? "✔ Taşeron kısıtları BU kullanıcıya uygulanır." : "✘ Taşeron DEĞİL — kısıtlar uygulanmaz."}`
);
if (!isSub) {
  console.log("    Kısıtların çalışması için account_type 'subcontractor' olmalı:");
  console.log(`    UPDATE users SET account_type = 'subcontractor' WHERE email = '${user.email}';`);
}

const id = user.id;

async function section(title, path, format) {
  let rows;
  try {
    rows = await q(path);
  } catch (err) {
    console.log(`\n=== ${title} ===\n  (okunamadı: ${err.message})`);
    return;
  }
  console.log(`\n=== ${title} (${rows.length}) ===`);
  if (rows.length === 0) console.log("  —");
  for (const r of rows) console.log("  " + format(r));
}

await section(
  "SAHİBİ OLDUKLARI",
  `organizations?owner_id=eq.${id}&select=id,name`,
  (r) => `organizasyon: ${r.name} (${r.id})`
);
await section("SAHİBİ OLDUĞU İŞLER", `jobs?owner_id=eq.${id}&select=id,title`, (r) => `${r.title} (${r.id})`);
await section("SAHİBİ OLDUĞU PROJELER", `projects?owner_id=eq.${id}&select=id,title`, (r) => `${r.title} (${r.id})`);

await section(
  "ORGANİZASYON ÜYELİKLERİ",
  `organization_members?user_id=eq.${id}&select=organization_id,status,organizations(name)`,
  (r) => `${r.organizations?.name ?? r.organization_id} — status=${r.status}`
);
await section(
  "DEPARTMAN KADROSU",
  `department_members?user_id=eq.${id}&select=department_id,role,status,departments(name)`,
  (r) => `${r.departments?.name ?? r.department_id} — role=${r.role}, status=${r.status}`
);
await section(
  "İŞ EKİBİ ÜYELİKLERİ",
  `job_members?user_id=eq.${id}&select=job_id,status,jobs(title)`,
  (r) => `${r.jobs?.title ?? r.job_id} — status=${r.status}`
);
await section(
  "PROJE ÜYELİKLERİ",
  `project_members?user_id=eq.${id}&select=project_id,role,status,can_view_budget,projects(title)`,
  (r) =>
    `${r.projects?.title ?? r.project_id} — role=${r.role}, status=${r.status}, bütçe=${
      r.can_view_budget ? "GÖREBİLİR" : "göremez"
    }`
);
await section(
  "MODÜL ÜYELİKLERİ",
  `module_members?user_id=eq.${id}&select=module_key,role,status,department_id,job_id`,
  (r) => `${r.module_key} — role=${r.role}, status=${r.status}`
);
await section("GRUP ÜYELİKLERİ", `group_members?user_id=eq.${id}&select=group_id,groups(name)`, (r) =>
  String(r.groups?.name ?? r.group_id)
);

// ---------------------------------------------------------------------------
// Anasayfadaki iş listesini birebir yeniden hesaplar (JobsService.findAllForUser)
// ve HER İŞİN NEDEN listede olduğunu söyler. "Neden 4 iş görüyorum?" sorusunun
// cevabı burada.
// ---------------------------------------------------------------------------

const reasons = new Map(); // jobId -> [gerekçe]
const note = (jobId, why) => {
  if (!jobId) return;
  const list = reasons.get(jobId) ?? [];
  list.push(why);
  reasons.set(jobId, list);
};

for (const j of await q(`jobs?owner_id=eq.${id}&archived_at=is.null&select=id`)) {
  note(j.id, "sahibi");
}
for (const m of await q(`job_members?user_id=eq.${id}&status=eq.approved&select=job_id`)) {
  note(m.job_id, "iş ekibi üyesi (job_members, approved)");
}
const projectIds = (await q(`project_members?user_id=eq.${id}&status=eq.approved&select=project_id`)).map(
  (m) => m.project_id
);
if (projectIds.length > 0) {
  const inList = projectIds.map((p) => `"${p}"`).join(",");
  for (const p of await q(`projects?id=in.(${inList})&select=id,title,job_id`)) {
    note(p.job_id, `proje üyeliği: "${p.title}"`);
  }
}

console.log(`\n=== ANASAYFADA GÖRÜNEN İŞLER (${reasons.size}) ===`);
if (reasons.size === 0) {
  console.log("  — (anasayfa boş olmalı)");
} else {
  const inList = [...reasons.keys()].map((k) => `"${k}"`).join(",");
  const jobs = await q(`jobs?id=in.(${inList})&archived_at=is.null&select=id,title,organization_id`);
  for (const j of jobs) {
    console.log(`  • ${j.title}`);
    for (const why of reasons.get(j.id) ?? []) console.log(`      ↳ ${why}`);
  }
}

console.log("\nNot: 'approved' olmayan üyelikler erişim vermez.");
console.log("     Yukarıdaki gerekçelerden fazlalık olanların satırını silmek");
console.log("     (ya da status'ünü 'removed' yapmak) işi listeden düşürür.");
console.log("     Bir işte 'approved' iş ekibi üyeliği olan TAŞERON, artık o işin");
console.log("     tüm projelerini değil yalnızca proje üyeliği olanları görür.\n");
