import * as assert from "node:assert/strict";
import { test } from "node:test";
import { isSessionPayload } from "../auth/session-payload";
import { hesapKilitPayload } from "./hesap-kilit-payload";

test("üretilen şifre ve geçiş anahtarı kilit jetonları API oturumu olamaz", () => {
  for (const method of ["password", "passkey"] as const) {
    const payload = hesapKilitPayload("u1", method);
    assert.equal(isSessionPayload(payload), false);
    assert.equal(payload.sub, "u1");
    assert.equal(payload.method, method);
  }
});
