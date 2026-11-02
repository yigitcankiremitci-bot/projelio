import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bostaSuresi, prizdeMi } from "./mac.ts";

describe("mac", () => {
  test("priz ve pil ayrılır", () => {
    assert.equal(prizdeMi("Now drawing from 'AC Power'\n -InternalBattery-0 82%; charging"), true);
    assert.equal(prizdeMi("Now drawing from 'Battery Power'\n -InternalBattery-0 82%; discharging"), false);
    assert.equal(prizdeMi(""), false);
  });

  test("boşta süresi nanosaniyeden milisaniyeye çevrilir", () => {
    assert.equal(bostaSuresi('    | |     "HIDIdleTime" = 28871878791'), 28871.878791);
    assert.equal(bostaSuresi("çıktı yok"), null);
  });
});
