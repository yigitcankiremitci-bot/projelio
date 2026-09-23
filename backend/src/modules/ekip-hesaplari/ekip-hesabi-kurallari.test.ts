import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { EkipHesabiGirdisi, EkipHesabiSecenekleri } from "@projelio/shared";
import { atanabilirDepartmanlar, girdiyiDogrula, tekilModuller } from "./ekip-hesabi-kurallari";

const secenekler: EkipHesabiSecenekleri = {
  sahipMi: false,
  departmanlar: [
    { id: "satis", name: "Satış", moduller: [{ key: "musteri", name: "Müşteri" }] },
    { id: "ik", name: "İK", moduller: [] },
  ],
};

const gecerli = (): EkipHesabiGirdisi => ({
  fullName: "Ayşe Yılmaz",
  username: "ayse.yilmaz",
  email: "ayse@ornek.com",
  password: "guclu-sifre-1",
  departmanlar: [{ departmentId: "satis", role: "employee" }],
  moduller: [{ departmentId: "satis", moduleKey: "musteri" }],
});

test("şirket sahibi tüm departmanlara, yönetici yalnızca yönettiklerine hesap açar", () => {
  const tum = ["a", "b", "c"];
  assert.deepEqual(atanabilirDepartmanlar(tum, { sahipMi: true, yonettigiDepartmanlar: [] }), tum);
  assert.deepEqual(atanabilirDepartmanlar(tum, { sahipMi: false, yonettigiDepartmanlar: ["b", "x"] }), ["b"]);
  assert.deepEqual(atanabilirDepartmanlar(tum, { sahipMi: false, yonettigiDepartmanlar: [] }), []);
});

test("geçerli girdi kabul edilir", () => {
  assert.equal(girdiyiDogrula(gecerli(), secenekler), null);
});

test("seçeneklerde olmayan departman reddedilir (elle yazılmış istek)", () => {
  const g = gecerli();
  g.departmanlar = [{ departmentId: "finans", role: "employee" }];
  g.moduller = [];
  assert.match(girdiyiDogrula(g, secenekler)!, /yetkin yok/);
});

test("modül, seçilmemiş bir departmandan ya da o departmanda kapalıysa reddedilir", () => {
  const g1 = gecerli();
  g1.departmanlar = [{ departmentId: "ik", role: "employee" }];
  assert.match(girdiyiDogrula(g1, secenekler)!, /seçilen departmanlardan/);

  const g2 = gecerli();
  g2.departmanlar.push({ departmentId: "ik", role: "employee" });
  g2.moduller = [{ departmentId: "ik", moduleKey: "musteri" }];
  assert.match(girdiyiDogrula(g2, secenekler)!, /açık değil/);
});

test("zorunlu alanlar ve sınırlar", () => {
  assert.match(girdiyiDogrula({ ...gecerli(), departmanlar: [], moduller: [] }, secenekler)!, /En az bir departman/);
  assert.match(girdiyiDogrula({ ...gecerli(), password: "kisa" }, secenekler)!, /Şifre/);
  assert.match(girdiyiDogrula({ ...gecerli(), email: "adres-degil" }, secenekler)!, /e-posta/);
  assert.match(girdiyiDogrula({ ...gecerli(), username: "A B" }, secenekler)!, /Kullanıcı adı/);
  assert.match(
    girdiyiDogrula({ ...gecerli(), departmanlar: [{ departmentId: "satis", role: "owner" as any }] }, secenekler)!,
    /rol/
  );
});

test("aynı departman iki kez seçilemez; tekrarlanan modül ataması teke iner", () => {
  const g = gecerli();
  g.departmanlar.push({ departmentId: "satis", role: "manager" });
  assert.match(girdiyiDogrula(g, secenekler)!, /iki kez/);

  assert.equal(
    tekilModuller([
      { departmentId: "satis", moduleKey: "musteri" },
      { departmentId: "satis", moduleKey: "musteri" },
    ]).length,
    1
  );
});

test("e-posta şifre taşımaz ve yöneticinin notunu kaçırır", async () => {
  const { ekipHesabiEpostasi } = await import("./ekip-hesabi-eposta");
  const mail = ekipHesabiEpostasi({
    alici: { ad: "Ayşe Yılmaz", kullaniciAdi: "ayse.yilmaz", eposta: "ayse@ornek.com" },
    yoneticiAdi: "Can",
    sirketAdi: "Örnek A.Ş.",
    departmanlar: ["Satış"],
    girisUrl: "https://app.projelio.app/hesap-giris?token=abc",
    sifreDegistirmeli: true,
    not: "<script>x</script> Hoş geldin",
    dil: "tr",
  });
  assert.ok(mail.html.includes("https://app.projelio.app/hesap-giris?token=abc"));
  assert.ok(mail.text.includes("@ayse.yilmaz"));
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(mail.html.includes("&lt;script&gt;"));
  assert.match(mail.subject, /Örnek A\.Ş\. ekibine eklendin/);
});
