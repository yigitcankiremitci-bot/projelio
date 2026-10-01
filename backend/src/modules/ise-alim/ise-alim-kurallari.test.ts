import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { EkipHesabiSecenekleri, IseAlimGirdisi } from "@projelio/shared";
import { davetGirdisiniDogrula, gecerliSecim, kabulPlani } from "./ise-alim-kurallari";

const KISI = "3f1c2a9e-1b2c-4d5e-8f90-0123456789ab";

const secenekler: EkipHesabiSecenekleri = {
  sahipMi: false,
  departmanlar: [
    { id: "satis", name: "Satış", moduller: [{ key: "musteri", name: "Müşteri" }] },
    { id: "ik", name: "İK", moduller: [] },
  ],
};

const gecerli = (): IseAlimGirdisi => ({
  userId: KISI,
  pozisyon: "Satış temsilcisi",
  isTanimi: "Bölge müşterileriyle ilgilenir.",
  departmanlar: [{ departmentId: "satis", role: "employee" }],
  moduller: [{ departmentId: "satis", moduleKey: "musteri" }],
});

test("geçerli davet kabul edilir", () => {
  assert.equal(davetGirdisiniDogrula(gecerli(), secenekler), null);
});

test("kişi seçilmeden davet gönderilemez", () => {
  assert.equal(davetGirdisiniDogrula({ ...gecerli(), userId: "" }, secenekler), "İşe alınacak kişiyi seç.");
  assert.equal(davetGirdisiniDogrula({ ...gecerli(), userId: "x' or 1=1" }, secenekler), "İşe alınacak kişiyi seç.");
});

test("yetkisi olmayan departmana kişi alınamaz", () => {
  const girdi = { ...gecerli(), departmanlar: [{ departmentId: "muhasebe", role: "employee" as const }], moduller: [] };
  assert.equal(davetGirdisiniDogrula(girdi, secenekler), "Bu departmana kişi alma yetkin yok.");
});

test("departmansız davet olmaz: şirkete erişim kadrodan geliyor", () => {
  assert.equal(davetGirdisiniDogrula({ ...gecerli(), departmanlar: [], moduller: [] }, secenekler), "En az bir departman seç.");
});

test("modül seçilen departmanda açık olmalı", () => {
  const girdi = {
    ...gecerli(),
    departmanlar: [{ departmentId: "ik", role: "employee" as const }],
    moduller: [{ departmentId: "ik", moduleKey: "musteri" }],
  };
  assert.equal(davetGirdisiniDogrula(girdi, secenekler), "Seçilen modül bu departmanda açık değil.");
});

test("uzun iş tanımı reddedilir", () => {
  assert.equal(
    davetGirdisiniDogrula({ ...gecerli(), isTanimi: "a".repeat(2001) }, secenekler),
    "İş tanımı en fazla 2000 karakter olabilir."
  );
});

test("kabul planı: yeni satır eklenir, eski bekleyen davet onaylanır, onaylı satıra dokunulmaz", () => {
  const plan = kabulPlani(
    {
      departmanlar: [
        { departmentId: "a", role: "employee" },
        { departmentId: "b", role: "manager" },
        { departmentId: "c", role: "employee" },
      ],
      moduller: [
        { departmentId: "a", moduleKey: "m1" },
        { departmentId: "a", moduleKey: "m1" },
        { departmentId: "b", moduleKey: "m2" },
        { departmentId: "c", moduleKey: "m3" },
      ],
    },
    [
      { id: "kb", departmentId: "b", status: "rejected" },
      // Zaten yönetici: davetteki "employee" rolü onu düşürmemeli.
      { id: "kc", departmentId: "c", status: "approved" },
    ],
    [
      { id: "mb", departmentId: "b", moduleKey: "m2", status: "pending" },
      { id: "mc", departmentId: "c", moduleKey: "m3", status: "approved" },
    ]
  );
  assert.deepEqual(plan.kadroEkle, [{ departmentId: "a", role: "employee" }]);
  assert.deepEqual(plan.kadroGuncelle, [{ id: "kb", role: "manager" }]);
  assert.deepEqual(plan.modulEkle, [{ departmentId: "a", moduleKey: "m1" }]);
  assert.deepEqual(plan.modulGuncelle, ["mb"]);
});

test("kabulde silinmiş departman ve kapatılmış modül düşer; departman kalmazsa kabul yok", () => {
  const davet = {
    departmanlar: [
      { departmentId: "a", role: "employee" as const },
      { departmentId: "b", role: "employee" as const },
    ],
    moduller: [
      { departmentId: "a", moduleKey: "m1" },
      { departmentId: "a", moduleKey: "kapali" },
      { departmentId: "b", moduleKey: "m1" },
    ],
  };
  assert.deepEqual(gecerliSecim(davet, new Set(["a"]), new Set(["m1"])), {
    departmanlar: [{ departmentId: "a", role: "employee" }],
    moduller: [{ departmentId: "a", moduleKey: "m1" }],
  });
  assert.equal(gecerliSecim(davet, new Set(), new Set(["m1"])), null);
});
