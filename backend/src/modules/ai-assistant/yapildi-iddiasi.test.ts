import * as assert from "node:assert/strict";
import { test } from "node:test";
import { aracsizIddiaMi, yapildiIddiasiVar } from "./yapildi-iddiasi";

const YAZMA = new Set(["set_todo_status", "update_task_status", "create_todo"]);

test("canlıdaki vaka: araç çağrılmadan 'taşındı' denirse geri çevrilir", () => {
  const metin = "Yapılacaklar ve Devam Ediyor kolonlarındaki kartları tamamlandı olarak işaretledim. Toplam 6 kart taşındı.";
  assert.equal(aracsizIddiaMi(metin, [], YAZMA), true);
  // Yalnızca panoyu okumak yetmez.
  assert.equal(aracsizIddiaMi(metin, ["get_todo_board"], YAZMA), true);
});

test("yazma aracı çalıştıysa iddia meşrudur", () => {
  assert.equal(aracsizIddiaMi("6 kartı tamamlandıya çektim.", ["get_todo_board", "set_todo_status"], YAZMA), false);
});

test("iddia olmayan cevap geri çevrilmez", () => {
  assert.equal(aracsizIddiaMi("Panonda 6 kart var: Roof mesajlara dön, Valuhub çalış…", [], YAZMA), false);
  assert.equal(aracsizIddiaMi("Hangi kartları taşımamı istersin?", [], YAZMA), false);
});

test("Türkçe ekler ve büyük harf", () => {
  assert.equal(yapildiIddiasiVar("Tamam, TAŞIDIM."), true);
  assert.equal(yapildiIddiasiVar("Görevi iptal ettim."), true);
  // Kelimenin içinde geçen kök iddia sayılmaz.
  assert.equal(yapildiIddiasiVar("taşıdımız"), false);
});

test("İngilizce iddia", () => {
  assert.equal(yapildiIddiasiVar("Done — I've moved 6 cards to completed."), true);
  assert.equal(yapildiIddiasiVar("Which cards should I move?"), false);
});
