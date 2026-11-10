import * as assert from "node:assert/strict";
import { test } from "node:test";
import { suresiGectiMi } from "./gecikme";

const simdi = new Date(2026, 10, 10, 15, 0); // 10 Kasım 2026, 15:00 (yerel)

test("dünün görevi süresi geçmiş, bugünün değil", () => {
  assert.equal(suresiGectiMi({ status: "todo", deadline: "2026-11-09" }, simdi), true);
  assert.equal(suresiGectiMi({ status: "in_progress", deadline: "2026-11-10" }, simdi), false);
  assert.equal(suresiGectiMi({ status: "todo", deadline: "2026-11-11" }, simdi), false);
});

test("tamamlanan, tarihsiz ve bozuk tarihli görev sayılmaz", () => {
  assert.equal(suresiGectiMi({ status: "completed", deadline: "2026-01-01" }, simdi), false);
  assert.equal(suresiGectiMi({ status: "todo", deadline: "" }, simdi), false);
  assert.equal(suresiGectiMi({ status: "todo", deadline: null }, simdi), false);
  assert.equal(suresiGectiMi({ status: "todo", deadline: "tarih-değil" }, simdi), false);
});
