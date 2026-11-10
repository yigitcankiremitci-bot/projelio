import { test } from "node:test";
import * as assert from "node:assert/strict";
import { kadroDavetiEpostasi } from "./kadro-daveti-eposta";

const temel = {
  davetEdenAdi: "Selin",
  departmanAdi: "Tasarım",
  sirketAdi: "Kapak",
  davetUrl: "https://app.projelio.app/departments/abc",
  eposta: "yeni@ornek.com",
  dil: "tr" as const,
};

test("hesabı olmayana kayıt olmasını, olana giriş yapmasını söyler", () => {
  const yeni = kadroDavetiEpostasi({ ...temel, hesabiVar: false });
  assert.match(yeni.text, /kayıt ol/);
  assert.match(yeni.text, /yeni@ornek\.com/);
  const eski = kadroDavetiEpostasi({ ...temel, hesabiVar: true });
  assert.match(eski.text, /giriş yap/);
  assert.equal(eski.subject, "Kapak · Tasarım kadrosuna davet edildin");
  assert.ok(eski.html.includes(temel.davetUrl));
});

test("kullanıcı metnini HTML'de kaçırır ve İngilizceye çevrilir", () => {
  const m = kadroDavetiEpostasi({ ...temel, davetEdenAdi: "<b>x</b>", hesabiVar: true, dil: "en" });
  assert.ok(!m.html.includes("<b>x</b>"));
  assert.match(m.subject, /invited/);
});
