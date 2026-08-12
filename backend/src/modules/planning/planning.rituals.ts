import type { PlanRitualKind, PlanRitualQuestion } from "@projelio/shared";

/**
 * Lio'nun planlama sihirbazı: hafta başı, gün başı ve ay başı soruları.
 *
 * Sorular neden burada, promptun içinde değil?
 * ---------------------------------------------
 * İki nedenle. Birincisi, sihirbaz Lio'suz da çalışmalı: kullanıcı krediyi
 * tüketmişse ya da yapay zekayı hiç kullanmıyorsa aynı sorular düz bir formda
 * karşısına çıkar ve plan yine kurulur. İkincisi, sorular sabit anahtarlar
 * (key) taşıdığı için cevaplar plan_rituals.answers içinde karşılaştırılabilir
 * kalır — "geçen hafta neye ağırlık vereceğini söylemiştin" sorusunun cevabı
 * serbest metinden ayıklanmak zorunda kalmaz.
 *
 * Lio bu soruları kelimesi kelimesine okumaz; bunlar oturumun İSKELETİDİR.
 * Modelin görevi soruları kullanıcının bağlamına uydurmak ve cevapları
 * araçlarla gerçek hedeflere/bloklara çevirmektir (bkz. ai-assistant.tools.ts).
 *
 * Sıralamada bir mantık var: her ritüel önce GERİYE bakar (kapanış), sonra
 * İLERİYE (niyet), en sonda SOMUTA iner (takvime ne düşecek). Sadece ileriye
 * bakan bir soru dizisi, kullanıcının geçen dönem neyi neden yapamadığını
 * konuşmadan aynı hatayı tekrar planlamasına yol açıyor.
 */

export interface RitualDefinition {
  kind: PlanRitualKind;
  /** Sihirbazın açılış başlığı. */
  title: string;
  /** Lio'ya verilen, oturumun amacını anlatan tek paragraf. */
  intent: string;
  questions: PlanRitualQuestion[];
}

export const RITUALS: Record<PlanRitualKind, RitualDefinition> = {
  weekly: {
    kind: "weekly",
    title: "Haftalık planlama",
    intent:
      "Kullanıcının önündeki haftayı kurmasına yardım et. Önce geçen haftayı kısaca kapat, sonra bu haftanın " +
      "tek cümlelik niyetini çıkar, ardından zamanı odak alanlarına yüzdeyle böl ve son olarak bu bölümü " +
      "haftanın günlerine somut bloklar hâlinde dağıt.",
    questions: [
      {
        key: "last_week_review",
        question: "Geçen hafta neyi bitirdin, neyi bitiremedin?",
        hint: "Bitmeyen işler bu haftaya taşınacak; hangileri gerçekten hâlâ önemli?",
      },
      {
        key: "week_theme",
        question: "Bu haftayı tek cümleyle anlatsan, ağırlığı neye vereceksin?",
        hint: "Tek bir cümle. Hafta sonunda 'şunu yaptım' diyebileceğin şey.",
      },
      {
        key: "allocations",
        question: "Vaktini hangi alanlara yüzde kaç ayıracaksın?",
        hint: "Örn. %60 yazılım, %30 müzik prodüksiyon. Toplamın 100 olması şart değil; kalan pay esneklik payıdır.",
      },
      {
        key: "count_goals",
        question: "Zamanla ölçülmeyen, adetle ölçülen bir hedefin var mı?",
        hint: "Örn. 10 içerik, 3 teklif, 2 demo. Yüzdelerin dışında ayrıca takip edilir.",
      },
      {
        key: "must_finish",
        question: "Bu hafta MUTLAKA bitmesi gereken işler hangileri?",
        hint: "Kaçırılamayacak teslimler. Bunlar takvime ilk yerleşir.",
      },
      {
        key: "capacity",
        question: "Bu hafta kaç saat çalışabilirsin? Kapalı günün var mı?",
        hint: "Boş bırakırsan normal çalışma ritmin varsayılır.",
      },
    ],
  },

  daily: {
    kind: "daily",
    title: "Günlük plan",
    intent:
      "Kullanıcının gününü saat saat kurmasına yardım et. Kısa tut: gün başında uzun bir oturum kimsenin " +
      "işine yaramaz. Haftanın hedeflerinden bugüne düşen payı hatırlat, tek bir 'ana iş' seçtir ve günü " +
      "bloklara böl.",
    questions: [
      {
        key: "today_main",
        question: "Bugün bitmesi gereken tek şey ne?",
        hint: "Gün kötü giderse bile yapılmış olsun istediğin iş.",
      },
      {
        key: "today_hours",
        question: "Bugün kaç saat çalışacaksın, hangi saatler arası?",
        hint: "Boş bırakırsan normal mesain varsayılır.",
      },
      {
        key: "today_blockers",
        question: "Bugün takvimini bölen bir şey var mı?",
        hint: "Toplantı, randevu, yolculuk. Bloklar bunların etrafına kurulur.",
      },
    ],
  },

  monthly: {
    kind: "monthly",
    title: "Aylık planlama",
    intent:
      "Kullanıcının ayını çerçevelemesine yardım et. Ay ölçeğinde konuşulan şey saatler değil SONUÇLARDIR: " +
      "ay sonunda neyin bitmiş olacağı. Sonra bu sonuçları haftalara böl ki haftalık ritüelin girdisi olsun.",
    questions: [
      {
        key: "last_month_review",
        question: "Geçen ay neyi tamamladın, neyi erteledin?",
        hint: "Ertelenen işler bu aya taşınmalı mı, yoksa artık gündemden düşsün mü?",
      },
      {
        key: "month_outcomes",
        question: "Bu ayın sonunda hangi işler BİTMİŞ olacak?",
        hint: "Saat değil sonuç yaz. Örn. 'Projelio takvim sayfası yayında'.",
      },
      {
        key: "month_allocations",
        question: "Ay boyunca ağırlığı hangi alanlara vereceksin?",
        hint: "Aylık yüzdeler, haftalık planların varsayılanı olur.",
      },
      {
        key: "month_new",
        question: "Bu ay başlatmak istediğin yeni bir şey var mı?",
        hint: "Yeni işler kendine yer açmazsa hiç başlamaz.",
      },
      {
        key: "month_risks",
        question: "Bu ayı zorlaştıracak ne var?",
        hint: "Tatil, yoğun teslim, belirsiz müşteri. Kapasiteyi baştan gerçekçi kur.",
      },
    ],
  },
};

/** Sihirbazın açılış başlığı — dönemin tarihiyle birlikte. */
export function ritualTitle(kind: PlanRitualKind, periodStart: string): string {
  const def = RITUALS[kind];
  return `${def.title} · ${periodStart}`;
}
