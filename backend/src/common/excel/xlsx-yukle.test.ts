import { strict as assert } from "node:assert";
import { test } from "node:test";
import { relsHedefleriniGoreceYap, xmlNormallestir } from "./xlsx-yukle";

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

test("openpyxl'in mutlak ilişki adreslerini parçanın klasörüne göre göreli yazar", () => {
  const xml = `<Relationships><Relationship Type="t/drawing" Target="/xl/drawings/drawing1.xml" Id="r1" /><Relationship Type="t/link" Target="https://ornek.com" TargetMode="External" Id="r2" /></Relationships>`;
  assert.equal(
    relsHedefleriniGoreceYap(xml, "xl/worksheets/_rels/sheet1.xml.rels"),
    `<Relationships><Relationship Type="t/drawing" Target="../drawings/drawing1.xml" Id="r1" /><Relationship Type="t/link" Target="https://ornek.com" TargetMode="External" Id="r2" /></Relationships>`
  );
  assert.equal(relsHedefleriniGoreceYap(`<Relationship Target="/xl/workbook.xml"/>`, "_rels/.rels"), `<Relationship Target="xl/workbook.xml"/>`);
  assert.equal(
    relsHedefleriniGoreceYap(`<Relationship Target="/xl/worksheets/sheet1.xml"/>`, "xl/_rels/workbook.xml.rels"),
    `<Relationship Target="worksheets/sheet1.xml"/>`
  );
});

test("hücre yorumu bağlarını atar (ExcelJS openpyxl'in yorum dosyasını bulamıyor)", () => {
  const xml = `<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="/xl/comments/comment1.xml" Id="comments" /><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="/xl/drawings/commentsDrawing1.vml" Id="anysvml" /></Relationships>`;
  assert.equal(relsHedefleriniGoreceYap(xml, "xl/worksheets/_rels/sheet1.xml.rels"), `<Relationships></Relationships>`);
});
