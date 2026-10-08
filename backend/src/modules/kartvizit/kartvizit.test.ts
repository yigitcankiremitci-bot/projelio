import * as assert from "node:assert/strict";
import { test } from "node:test";
import { alanAdindanAdres, kartvizitGirdisiniDogrula } from "./kartvizit-girdi";
import { kartvizitSayfasi } from "./kartvizit-sayfa";

const temel = { adres: "ali-veli", fullName: "Ali Veli", sosyal: {}, showPhoto: true, active: true };

test("girdi: geçerli kayıt normalleştirilir", () => {
  const r = kartvizitGirdisiniDogrula({
    ...temel,
    adres: "  Ali-Veli ",
    fullName: "  Ali   Veli ",
    phone: "+90 (533) 652-39-33",
    email: "Ali@Ornek.COM",
    website: "ornek.com",
    sosyal: { instagram: "https://instagram.com/ali.veli/", linkedin: "in/ali-veli" },
  });
  assert.ok("veri" in r, JSON.stringify(r));
  if (!("veri" in r)) return;
  assert.equal(r.veri.adres, "ali-veli");
  assert.equal(r.veri.full_name, "Ali Veli");
  assert.equal(r.veri.email, "ali@ornek.com");
  assert.equal(r.veri.website, "https://ornek.com/");
  assert.deepEqual(r.veri.sosyal, { instagram: "ali.veli", linkedin: "ali-veli" });
  assert.equal(r.veri.title, null);
});

test("girdi: hatalı alanlar Türkçe hata döndürür", () => {
  const hata = (g: object) => {
    const r = kartvizitGirdisiniDogrula({ ...temel, ...g });
    return "hata" in r ? r.hata : null;
  };
  assert.match(hata({ adres: "api" }) ?? "", /ayrılmış/);
  assert.match(hata({ adres: "a_b" }) ?? "", /küçük harf/);
  assert.match(hata({ fullName: "  " }) ?? "", /Ad soyad gerekli/);
  assert.match(hata({ phone: "12" }) ?? "", /7 ile 15/);
  assert.match(hata({ phone: "abc123456" }) ?? "", /yalnızca rakam/);
  assert.match(hata({ email: "ali@" }) ?? "", /E-posta/);
  assert.match(hata({ website: "javascript:alert(1)" }) ?? "", /Web sitesi/);
  assert.match(hata({ website: "mailto:a@b.com" }) ?? "", /Web sitesi/);
  assert.match(hata({ sosyal: { instagram: "https://evil.example/x" } }) ?? "", /Instagram/);
  assert.match(hata({ title: "x".repeat(81) }) ?? "", /80/);
});

test("Caddy izni: yalnızca tek seviyeli, geçerli alt alan adı", () => {
  assert.equal(alanAdindanAdres("ali.projelio.app"), "ali");
  assert.equal(alanAdindanAdres("ALI.projelio.app."), "ali");
  assert.equal(alanAdindanAdres("a.b.projelio.app"), null);
  assert.equal(alanAdindanAdres("api.projelio.app"), null);
  assert.equal(alanAdindanAdres("ali.example.com"), null);
  assert.equal(alanAdindanAdres("projelio.app"), null);
  assert.equal(alanAdindanAdres(undefined), null);
});

test("sayfa: kullanıcı verisi kaçırılır, adresler tutamaçtan üretilir", () => {
  const html = kartvizitSayfasi({
    adres: "ali-veli",
    fullName: 'Ali <script>alert("x")</script>',
    title: "Tasarımcı & Yazar",
    titleEn: "Designer & Writer",
    phone: "+90 533 652 39 33",
    email: "ali@ornek.com",
    website: "https://ornek.com/",
    location: null,
    tagline: null,
    taglineEn: null,
    sosyal: { instagram: "ali.veli" },
    avatarUrl: null,
  });
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("Ali &lt;script&gt;"));
  assert.ok(html.includes('data-en="Designer &amp; Writer">Tasarımcı &amp; Yazar'));
  assert.ok(html.includes('href="tel:+905336523933"'));
  assert.ok(html.includes('href="https://wa.me/905336523933"'));
  assert.ok(html.includes('href="https://www.instagram.com/ali.veli"'));
  assert.ok(html.includes('<meta property="og:url" content="https://ali-veli.projelio.app">'));
  assert.ok(html.includes('class="quick n3"'));
  assert.ok(!html.includes("style="), "CSP: satır içi stil olmamalı");
  assert.ok(!/<script>(?!<\/script>)/.test(html.replace('<script src="app.js" defer></script>', "")), "CSP: satır içi script olmamalı");
});
