import { test } from "node:test";
import * as assert from "node:assert/strict";
import { HttpException, NotFoundException } from "@nestjs/common";
import { AiChatJobs as AiChatJobsService } from "./ai-chat-jobs";

const birTurBekle = () => new Promise((r) => setImmediate(r));

test("iş bitene kadar 'calisiyor', bitince sonuç döner", async () => {
  const jobs = new AiChatJobsService();
  let bitir!: (v: string) => void;
  const id = jobs.baslat("u1", () => new Promise<string>((r) => (bitir = r)));
  assert.deepEqual(jobs.oku("u1", id), { durum: "calisiyor" });
  await birTurBekle(); // iş bir sonraki turda başlıyor
  bitir("tamam");
  await birTurBekle();
  assert.deepEqual(jobs.oku("u1", id), { durum: "bitti", sonuc: "tamam" });
  // Sonuç bir kez okununca silinmez: kopan bir yoklamadan sonra tekrar alınabilmeli.
  assert.deepEqual(jobs.oku("u1", id), { durum: "bitti", sonuc: "tamam" });
});

test("işin hatası yoklayana AYNEN fırlatılır (402 gibi durum kodları korunur)", async () => {
  const jobs = new AiChatJobsService();
  const hata = new HttpException("Bakiye yetersiz", 402);
  const id = jobs.baslat("u1", async () => {
    throw hata;
  });
  await birTurBekle();
  assert.throws(() => jobs.oku("u1", id), (e) => e === hata);
});

test("başkasının işi bulunamadı görünür", () => {
  const jobs = new AiChatJobsService();
  const id = jobs.baslat("u1", () => new Promise(() => {}));
  assert.throws(() => jobs.oku("u2", id), NotFoundException);
  assert.throws(() => jobs.oku("u1", "yok"), NotFoundException);
});

test("bitiş sinyali yalnızca başarılı sonuçta gönderilir", async () => {
  const jobs = new AiChatJobsService();
  let sinyal = 0;
  jobs.baslat("u1", async () => 1, () => sinyal++);
  jobs.baslat("u1", async () => { throw new Error("x"); }, () => sinyal++);
  await birTurBekle();
  assert.equal(sinyal, 1);
});

test("bir kullanıcının aynı anda çalışan iş sayısı sınırlı", () => {
  const jobs = new AiChatJobsService();
  for (let i = 0; i < 3; i++) jobs.baslat("u1", () => new Promise(() => {}));
  assert.throws(() => jobs.baslat("u1", () => new Promise(() => {})), (e: any) => e.getStatus() === 429);
  // Başka kullanıcı etkilenmez.
  jobs.baslat("u2", () => new Promise(() => {}));
});
