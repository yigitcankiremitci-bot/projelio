import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Job, JobMember, Project, Task } from "@projelio/shared";
import { isTemasi, serbestIsMi, studyoOdalari } from "./studyoOfisi";
import { KASA_MODULU, KUPA_RAFI, PROJE_ONEKI, RAF_KAPASITESI } from "./ofisOyunu";

const is = (o: Partial<Job> = {}): Job => ({ id: "j1", ownerId: "ben", title: "Music Production", createdAt: "", ...o });
const uye = (o: Partial<JobMember>): JobMember => ({ id: "m", jobId: "j1", userId: "u1", status: "approved", joinedAt: "", ...o });
const gorev = (o: Partial<Task>): Task => ({ id: "t", status: "todo", ...o }) as Task;
const proje = (o: Partial<Project>): Project => ({ id: "p", title: "Proje", status: "active", ...o }) as Project;
const ayar = { benId: "ben", benAd: "Oliver", bugun: "2026-11-01", modulAdi: (k: string) => (k === "crm_musteri" ? "Müşteriler" : undefined) };

describe("serbestIsMi", () => {
  test("şirkete ya da holdinge bağlı ve arşivlenmiş işler stüdyoya girmez", () => {
    assert.ok(serbestIsMi(is()));
    assert.ok(!serbestIsMi(is({ organizationId: "o" })));
    assert.ok(!serbestIsMi(is({ groupId: "g" })));
    assert.ok(!serbestIsMi(is({ archivedAt: "2026-10-01" })));
  });
});

describe("studyoOdalari", () => {
  test("sahip yönetici masasında, onaylı ekip yanında; bekleyen davet ve sahibin kaydı sayılmaz", () => {
    const [oda] = studyoOdalari(
      [
        {
          job: is(),
          uyeler: [uye({ userId: "u1", fullName: "Deniz" }), uye({ userId: "u2", status: "pending" }), uye({ userId: "ben" })],
          moduller: [],
          projeler: [],
          gorevler: [],
        },
      ],
      ayar
    );
    assert.deepEqual(
      oda.kisiler.map((k) => [k.id, k.ad, !!k.yonetici]),
      [
        ["ben", "Oliver", true],
        ["u1", "Deniz", false],
      ]
    );
  });

  test("modüller adlarıyla, kasa yalnızca işin sahibine", () => {
    const benim = studyoOdalari([{ job: is(), uyeler: [], moduller: ["crm_musteri"], projeler: [], gorevler: [] }], ayar)[0];
    assert.deepEqual(benim.moduller, [
      { key: KASA_MODULU, ad: "Kasa" },
      { key: "crm_musteri", ad: "Müşteriler" },
    ]);
    const baskasinin = studyoOdalari([{ job: is({ ownerId: "x", ownerName: "Ayşe" }), uyeler: [], moduller: [], projeler: [], gorevler: [] }], ayar)[0];
    assert.equal(baskasinin.moduller.length, 0);
    assert.equal(baskasinin.kisiler[0].ad, "Ayşe");
  });

  test("açık ve geciken görevler sayılır, tamamlayan emek kazanır", () => {
    const [oda] = studyoOdalari(
      [
        {
          job: is(),
          uyeler: [],
          moduller: [],
          projeler: [],
          gorevler: [
            gorev({ status: "todo", deadline: "2026-10-20" }),
            gorev({ status: "in_progress", deadline: "2026-12-01" }),
            gorev({ status: "completed", completedBy: "ben" }),
          ],
        },
      ],
      ayar
    );
    assert.equal(oda.acikGorev, 2);
    assert.equal(oda.gecikmis, 1);
    assert.equal(oda.kisiler[0].emek, 1);
  });

  test("süren her proje teslimi en yakın önce bir istasyon; bitenler kupa rafında", () => {
    const [oda] = studyoOdalari(
      [
        {
          job: is(),
          uyeler: [],
          moduller: ["crm_musteri"],
          projeler: [
            proje({ id: "uzak", title: "Uzak", deadline: "2026-12-20" }),
            proje({ id: "gec", title: "Geç", deadline: "2026-10-25" }),
            proje({ id: "yakin", title: "Yakın", deadline: "2026-11-03" }),
            proje({ id: "b1", status: "completed" }),
            proje({ id: "b2", status: "completed" }),
            proje({ id: "arsiv", status: "archived" }),
          ],
          gorevler: [
            gorev({ projectId: "gec", status: "completed" }),
            gorev({ projectId: "gec", status: "todo" }),
          ],
        },
      ],
      ayar
    );
    assert.deepEqual(
      oda.moduller.map((m) => m.key),
      [`${PROJE_ONEKI}gec`, `${PROJE_ONEKI}yakin`, `${PROJE_ONEKI}uzak`, KASA_MODULU, KUPA_RAFI, "crm_musteri"]
    );
    const [gec, yakin, uzak] = oda.moduller.map((m) => m.bilgi);
    assert.deepEqual(gec, { biten: 1, toplam: 2, teslim: "2026-10-25", gecikti: true, yaklasti: false });
    assert.equal(yakin?.yaklasti, true);
    assert.equal(uzak?.gecikti || uzak?.yaklasti, false);
    assert.equal(oda.moduller[4].bilgi?.kupa, 2);
  });

  test("biten projeler rafta kapaklı plaket: en yenisi önce, raf kadar", () => {
    const biten = Array.from({ length: RAF_KAPASITESI + 2 }, (_, i) =>
      proje({ id: `b${i}`, title: `Biten ${i}`, status: "completed", deadline: `2026-0${(i % 9) + 1}-1${i % 10}`, createdAt: "2026-01-01" })
    );
    const [oda] = studyoOdalari(
      [
        {
          job: is(),
          uyeler: [],
          moduller: [],
          projeler: [
            ...biten,
            proje({ id: "kapakli", title: "Kapaklı", status: "completed", deadline: "2026-10-30", coverImageUrl: "preset:orman" }),
            proje({ id: "teslimsiz", title: "Teslimsiz", status: "completed", createdAt: "2026-10-31T09:00:00Z" }),
          ],
          gorevler: [],
        },
      ],
      ayar
    );
    const raf = oda.moduller.find((m) => m.key === KUPA_RAFI)?.bilgi;
    assert.equal(raf?.kupa, RAF_KAPASITESI + 4);
    assert.equal(raf?.plaketler?.length, RAF_KAPASITESI);
    // Teslim günü olmayan proje açılış gününe göre sıralanır.
    assert.deepEqual(raf?.plaketler?.slice(0, 2), [
      { projeId: "teslimsiz", ad: "Teslimsiz", kapak: undefined, tarih: "2026-10-31" },
      { projeId: "kapakli", ad: "Kapaklı", kapak: "preset:orman", tarih: "2026-10-30" },
    ]);
  });

  test("kişi üzerinde çalıştığı görevin (alt görev de olabilir) projesinin istasyonunda durur", () => {
    const [oda] = studyoOdalari(
      [
        {
          job: is(),
          uyeler: [uye({ userId: "u1", fullName: "Deniz", activeTaskId: "alt" }), uye({ userId: "u2", fullName: "Ece", activeTaskId: "baska-is" })],
          moduller: [],
          projeler: [proje({ id: "p1" }), proje({ id: "bitti", status: "completed" })],
          gorevler: [gorev({ id: "ust", projectId: "p1" }), gorev({ id: "alt", projectId: "p1", parentTaskId: "ust" }), gorev({ id: "eski", projectId: "bitti" })],
        },
      ],
      { ...ayar, benAktifGorev: "eski" }
    );
    const istasyon = Object.fromEntries(oda.kisiler.map((k) => [k.id, k.istasyon]));
    assert.equal(istasyon.u1, `${PROJE_ONEKI}p1`);
    assert.equal(istasyon.u2, undefined, "başka işin görevi");
    assert.equal(istasyon.ben, undefined, "biten projenin istasyonu yok");
    // Alt görev sayıma girmez.
    assert.equal(oda.moduller[0].bilgi?.toplam, 1);
  });
});

describe("isTemasi", () => {
  test("işin adından odanın döşemesi", () => {
    assert.equal(isTemasi("Music Production"), "muzik");
    assert.equal(isTemasi("Müzik prodüksiyon"), "muzik");
    assert.equal(isTemasi("Video Editing"), "video");
    assert.equal(isTemasi("Düğün Fotoğrafçılığı"), "foto");
    assert.equal(isTemasi("Logo ve Grafik Tasarım"), "tasarim");
    assert.equal(isTemasi("Muhasebe danışmanlığı"), undefined);
  });
});
