import assert from "node:assert/strict";
import { test } from "node:test";
import {
  kartvizitAdresHatasi,
  kartvizitAdresOnerileri,
  kartvizitMeslekEtiketi,
  kartvizitQrSvg,
  kartvizitSadelestir,
  kartvizitSosyalNormallestir,
  kartvizitVcard,
} from "./kartvizit";

test("adres önerileri addan başlar, Türkçe harfleri sadeleştirir, rastgele sonek eklemez", () => {
  const o = kartvizitAdresOnerileri("Selin Aktar Kiremitci");
  assert.equal(o[0], "selinkiremitci"); // "selin" ayrılmış: eski elle kurulmuş kart
  assert.ok(o.includes("selinkiremitci"));
  assert.ok(o.includes("selin-kiremitci"));
  assert.ok(o.includes("skiremitci"));
  for (const a of o) assert.equal(kartvizitAdresHatasi(a), null, a);
  for (const a of o) assert.ok(!/\d/.test(a), a);
});

test("ayrılmış ad öneriye girmez", () => {
  const o = kartvizitAdresOnerileri("Selin Aktar Kiremitci");
  assert.ok(!o.includes("selin"));
  assert.equal(kartvizitAdresOnerileri("Ali Veli")[0], "ali");
});

test("unvandan meslek etiketi öneriye katılır", () => {
  assert.equal(kartvizitMeslekEtiketi("Dr. Öğr. Üyesi, İstinye Üniversitesi"), "dr");
  assert.equal(kartvizitMeslekEtiketi("Kıdemli Grafik Tasarımcı"), "tasarim");
  assert.equal(kartvizitMeslekEtiketi("Satış Müdürü"), null);
  const o = kartvizitAdresOnerileri("Ayşe Işık", "Avukat");
  assert.ok(o.includes("avayse"), o.join(","));
  assert.ok(o.includes("av-isik"), o.join(","));
});

test("sadeleştirme", () => {
  assert.equal(kartvizitSadelestir("  İSMAİL Çağlar-Öz  "), "ismail caglar oz");
  assert.equal(kartvizitSadelestir("Élodie Brûlé"), "elodie brule");
});

test("adres doğrulama", () => {
  assert.equal(kartvizitAdresHatasi("ab"), "kisa");
  assert.equal(kartvizitAdresHatasi("a".repeat(31)), "uzun");
  assert.equal(kartvizitAdresHatasi("Ali"), "karakter");
  assert.equal(kartvizitAdresHatasi("ali_veli"), "karakter");
  assert.equal(kartvizitAdresHatasi("-ali"), "tire");
  assert.equal(kartvizitAdresHatasi("ali-"), "tire");
  assert.equal(kartvizitAdresHatasi("xn--ali"), "tire");
  assert.equal(kartvizitAdresHatasi("api"), "ayrilmis");
  assert.equal(kartvizitAdresHatasi("ali-veli2"), null);
});

test("sosyal hesap: @ad, düz ad ve tam adres aynı tutamaca iner", () => {
  assert.equal(kartvizitSosyalNormallestir("instagram", "@aktar.selin"), "aktar.selin");
  assert.equal(kartvizitSosyalNormallestir("instagram", "https://www.instagram.com/aktar.selin/?hl=tr"), "aktar.selin");
  assert.equal(kartvizitSosyalNormallestir("instagram", "instagram.com/aktar.selin"), "aktar.selin");
  assert.equal(
    kartvizitSosyalNormallestir("linkedin", "https://www.linkedin.com/in/selin-aktar-kiremitci-33684346/"),
    "selin-aktar-kiremitci-33684346"
  );
  assert.equal(kartvizitSosyalNormallestir("linkedin", "tr.linkedin.com/in/firdevs-ceren-ayberk-83b09a36a"), "firdevs-ceren-ayberk-83b09a36a");
  assert.equal(kartvizitSosyalNormallestir("linkedin", "https://linkedin.com/company/projelio"), "company/projelio");
  assert.equal(kartvizitSosyalNormallestir("x", "https://twitter.com/ycankiremitci"), "ycankiremitci");
  assert.equal(kartvizitSosyalNormallestir("youtube", "https://www.youtube.com/@yigitcankiremitci"), "yigitcankiremitci");
  assert.equal(kartvizitSosyalNormallestir("instagram", "  "), "");
});

test("sosyal hesap: başka sitenin adresi ve geçersiz karakter reddedilir", () => {
  assert.equal(kartvizitSosyalNormallestir("instagram", "https://evil.example/aktar"), null);
  assert.equal(kartvizitSosyalNormallestir("instagram", "javascript:alert(1)"), null);
  assert.equal(kartvizitSosyalNormallestir("x", "çok uzun bir ad burada"), null);
  assert.equal(kartvizitSosyalNormallestir("linkedin", "https://www.linkedin.com/feed/"), null);
});

test("vCard: özel karakterler kaçırılır, satırlar CRLF ve 75 karakterde katlanır", () => {
  const v = kartvizitVcard(
    {
      adres: "selin-dr",
      fullName: "Selin Aktar Kiremitci",
      title: "Dr. Öğr. Üyesi, İstinye Üniversitesi",
      phone: "+905336523933",
      email: "aktar.selinn@gmail.com",
      sosyal: { instagram: "aktar.selin", linkedin: "selin-aktar-kiremitci-33684346" },
    },
    { base64: "A".repeat(300), tur: "JPEG" }
  );
  assert.ok(v.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\nN:Kiremitci;Selin Aktar;;;\r\n"));
  assert.ok(v.includes("TITLE:Dr. Öğr. Üyesi\\, İstinye Üniversitesi\r\n"));
  const acik = v.replace(/\r\n /g, "");
  assert.ok(acik.includes("X-SOCIALPROFILE;TYPE=linkedin:https://www.linkedin.com/in/selin-aktar-kiremitci-33684346"));
  assert.ok(v.includes("NOTE:https://selin-dr.projelio.app"));
  assert.ok(v.endsWith("END:VCARD\r\n"));
  for (const satir of v.split("\r\n")) assert.ok(satir.length <= 75, satir.slice(0, 20));
});

test("QR: geçerli SVG, logo ortada, çerçevede ad kaçırılmış", () => {
  const yalin = kartvizitQrSvg("https://selin-dr.projelio.app");
  assert.ok(yalin.startsWith("<svg "));
  assert.ok(yalin.includes("data:image/png;base64,"));
  assert.ok(!yalin.includes("<text"));
  const cerceveli = kartvizitQrSvg("https://ali.projelio.app", { ad: "Ali <Veli> & Co", adresMetni: "ali.projelio.app" });
  assert.ok(cerceveli.includes("Ali &lt;Veli&gt; &amp; Co"));
  assert.ok(cerceveli.includes("ali.projelio.app"));
});
