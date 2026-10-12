import { test } from "node:test";
import assert from "node:assert/strict";
import type { ModuleCatalogEntry } from "@projelio/shared";
import { VARSAYILAN_FILTRE, aramaPuani, kategoriAnahtari, modulleriSuz } from "./serbestModuller";

const m = (key: string, name: string, departmentKey: string | undefined, sortOrder: number, description = ""): ModuleCatalogEntry => ({
  key,
  name,
  departmentKey,
  description,
  sortOrder,
  scope: "organization" as ModuleCatalogEntry["scope"],
  appliesToFreelancer: true,
});

const katalog = [
  m("fm_fatura", "Fatura", "finans_muhasebe", 3, "Kesilen ve gelen faturalar"),
  m("fm_nakit", "Nakit Akışı", "finans_muhasebe", 1, "Fatura vadelerinden nakit tahmini"),
  m("crm_musteri", "Müşteri", "satis_is_gelistirme", 10),
  m("pd_sosyal", "Sosyal Medya", "pazarlama_buyume", 2),
  m("tuhaf", "Garip Modül", "yok_boyle_departman", 1),
];

test("arama Türkçe harflere duyarsız ve adda geçeni öne alır", () => {
  assert.equal(aramaPuani(katalog[2], "musteri"), 3);
  const sonuc = modulleriSuz(katalog, { ...VARSAYILAN_FILTRE, arama: "fatura" }, () => 0);
  assert.deepEqual(
    sonuc.map((x) => x.key),
    ["fm_fatura", "fm_nakit"]
  );
});

test("arama kelimelerinin hepsi eşleşmeli", () => {
  assert.equal(aramaPuani(katalog[0], "fatura sosyal"), null);
});

test("önerilen sıra: kategori sırası, sonra sortOrder; bilinmeyen kategori sonda", () => {
  const sonuc = modulleriSuz(katalog, VARSAYILAN_FILTRE, () => 0).map((x) => x.key);
  assert.deepEqual(sonuc, ["crm_musteri", "pd_sosyal", "fm_nakit", "fm_fatura", "tuhaf"]);
  assert.equal(kategoriAnahtari(katalog[4]), "diger");
});

test("kategori ve durum filtresi", () => {
  const atanan = new Set(["fm_fatura"]);
  const say = (k: string) => (atanan.has(k) ? 1 : 0);
  assert.deepEqual(
    modulleriSuz(katalog, { ...VARSAYILAN_FILTRE, kategori: "finans_muhasebe", durum: "atanmamis" }, say).map((x) => x.key),
    ["fm_nakit"]
  );
  assert.deepEqual(
    modulleriSuz(katalog, { ...VARSAYILAN_FILTRE, durum: "atanmis" }, say).map((x) => x.key),
    ["fm_fatura"]
  );
});

test("kullanıma göre sıralama, eşitlikte ada göre", () => {
  const say = (k: string) => (k === "pd_sosyal" ? 3 : k === "crm_musteri" ? 1 : 0);
  const sonuc = modulleriSuz(katalog, { ...VARSAYILAN_FILTRE, siralama: "kullanim" }, say).map((x) => x.key);
  assert.deepEqual(sonuc.slice(0, 3), ["pd_sosyal", "crm_musteri", "fm_fatura"]);
});
