import { strict as assert } from "node:assert";
import { test } from "node:test";
import { xmlNormallestir } from "./xlsx-yukle";

const ANA = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

test("ana ad alanının önekini kaldırır (ERP/.NET çıktısı)", () => {
  const xml = `<x:workbook xmlns:x="${ANA}" xmlns:r="r"><x:sheets><x:sheet name="A" r:id="rId1"/></x:sheets></x:workbook>`;
  assert.equal(
    xmlNormallestir(xml),
    `<workbook xmlns="${ANA}" xmlns:r="r"><sheets><sheet name="A" r:id="rId1"/></sheets></workbook>`
  );
});

test("diğer öneklere dokunmaz", () => {
  const xml = `<x:worksheet xmlns:x="${ANA}" xmlns:mc="m"><mc:AlternateContent/></x:worksheet>`;
  assert.equal(xmlNormallestir(xml), `<worksheet xmlns="${ANA}" xmlns:mc="m"><mc:AlternateContent/></worksheet>`);
});

test("varsayılan ad alanı zaten varsa ikinci xmlns eklemez", () => {
  const xml = `<workbook xmlns="${ANA}" xmlns:x="${ANA}"><x:sheets/></workbook>`;
  assert.equal(xmlNormallestir(xml), `<workbook xmlns="${ANA}" ><sheets/></workbook>`);
});

test("Strict Open XML ad alanını Transitional'a çevirir", () => {
  const xml = `<workbook xmlns="http://purl.oclc.org/ooxml/spreadsheetml/main"/>`;
  assert.equal(xmlNormallestir(xml), `<workbook xmlns="${ANA}"/>`);
});

test("olağan dosyayı değiştirmez", () => {
  const xml = `<workbook xmlns="${ANA}"><sheets/></workbook>`;
  assert.equal(xmlNormallestir(xml), xml);
});
