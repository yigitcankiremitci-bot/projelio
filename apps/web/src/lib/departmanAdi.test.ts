import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createTranslator } from "@projelio/shared";
import { en } from "./i18n/en/index";
import { departmanAdi } from "./departmanAdi";

describe("departman adı", () => {
  const ingilizce = createTranslator("en", en);
  const turkce = createTranslator("tr", en);

  it("demodaki ve katalogdaki varsayılan adlar İngilizce arayüzde çevrilir", () => {
    assert.equal(departmanAdi("İnsan Kaynakları", ingilizce), "Human Resources");
    assert.equal(departmanAdi("HUKUK ve UYUM", ingilizce), "Legal & Compliance");
  });

  it("kullanıcının kendi yazdığı ad olduğu gibi kalır", () => {
    assert.equal(departmanAdi("Muhasebe Ekibi", ingilizce), "Muhasebe Ekibi");
  });

  it("Türkçe arayüzde değişmez, boş ad boş kalır", () => {
    assert.equal(departmanAdi("İnsan Kaynakları", turkce), "İnsan Kaynakları");
    assert.equal(departmanAdi(undefined, ingilizce), undefined);
  });
});
