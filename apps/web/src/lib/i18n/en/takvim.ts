import type { TranslationDict } from "@projelio/shared";

/** Takvim, planlama, dönem planı, zaman blokları. */
export const takvim: TranslationDict = {
  // ─────────────────────────────────────────────── Dönem planı ve hedefler
  "Dönem hedefleri": "Period goals",
  "Hedefleri düzenle": "Edit goals",
  "Bu dönemin niyeti": "Intent for this period",
  "Tek cümle: bu dönem ağırlığı neye vereceksin?": "One sentence: what will you weight this period?",
  "Odak alanları": "Focus areas",
  "Odak alanı": "Focus area",
  "+ Alan ekle": "+ Add area",
  "Satırı sil": "Delete row",
  "Yazılım, Müzik…": "Software, Music…",
  "Dağılım": "Distribution",
  "plan dışı": "unplanned",
  yapılan: "done",
  // Yüzde işareti Türkçede sayıdan ÖNCE, İngilizcede SONRA gelir.
  "toplam %{yuzde}": "{yuzde}% total",
  "%{yuzde} esneklik payı": "{yuzde}% slack",
  " — dönemde olmayan bir zamanı bölüştürüyorsun": " — you're allocating time the period doesn't have",
  'Odak alanı seçilmeyen bloklar dağılım raporunda "plan dışı" görünür.':
    'Blocks with no focus area show as "unplanned" in the distribution report.',

  // ─────────────────────────────────────────────── Çalışma ritmi
  "Çalışma ritmin güncellendi.": "Your work rhythm has been updated.",
  "Çalışma günleri": "Working days",
  "Hangi günler": "Which days",
  "Takvimde plan yalnızca bu günlere dağıtılır; diğerleri soluk görünür.":
    "The plan is only spread across these days; the rest are dimmed.",
  "Günlük çalışma hedefi": "Daily working target",
  "Dönem kapasitesi bundan hesaplanır — yüzdelerin paydası budur.":
    "Period capacity is derived from this — it's the denominator for the percentages.",
  "Odak bloğu ve mola": "Focus block and break",
  "Otomatik dağıtımın ürettiği blokların boyu ve aralarındaki boşluk.":
    "The length of the blocks auto-scheduling creates, and the gap between them.",
  "Takvim gridi bu aralıkta çizilir. Dışına taşan bloklar yine görünür.":
    "The calendar grid is drawn for this range. Blocks outside it are still shown.",
  "Günlük plan saati": "Daily planning time",
  "Gün başında kısa bir plan oturumu.": "A short planning session at the start of the day.",
  "Haftalık planlama günü": "Weekly planning day",
  "Aylık planlama günü": "Monthly planning day",
  "Bu güne gelince haftalık sihirbaz seni karşılar.": "The weekly wizard greets you on this day.",
  "Ayın hangi günü": "Which day of the month",
  "Her ayda karşılığı olsun diye en fazla 28 seçilebilir.":
    "Capped at 28 so every month has that day.",

  // ─────────────────────────────────────────────── Planlama sihirbazı
  "Planlama sihirbazı": "Planning wizard",
  "Lio ile planla": "Plan with Lio",
  "Kendim yaparım": "I'll do it myself",
  "Şimdi değil": "Not now",
  "Lio dönem başlarında seni karşılayıp planı birlikte kurar.":
    "Lio greets you at the start of each period and builds the plan with you.",
  "Takvime sürükleyerek zaman ayır.": "Drag onto the calendar to set aside time.",
  "Açık işlerinin hepsine zaman ayırmışsın.": "You've set aside time for all your open work.",
  "Proje görevleri": "Project tasks",
  "Bloğu sil": "Delete block",
  "Geçen sefer:": "Last time:",

  // ─────────────────────────────────────────────── Rutinler (tekrar kuralları)
  Tekrar: "Repeat",
  Her: "Every",
  "Ayın X. günü": "Day X of the month",
  "Ayın X. haftasının Y günü": "Day Y of week X of the month",
  "Ayın son günü": "Last day of the month",
  '29–31 arası günler o ayda yoksa atlanır. Her ayda çalışması için "Ayın son günü" seç.':
    'Days 29–31 are skipped in months that don\'t have them. Pick "Last day of the month" to run every month.',
  "Bu kural hiçbir tarihe denk gelmiyor.": "This rule doesn't match any date.",
  "Sıradaki tekrarlar": "Upcoming occurrences",
  "Bitiş (boş = süresiz)": "End (empty = no end)",
  "Kaç gün önce açılsın": "How many days ahead to open",
  "Tolerans (gün)": "Tolerance (days)",
  "Aktif — kapatırsan gelecekteki tekrarlar geri çekilir, geçmiş kalır":
    "Active — turning this off withdraws future occurrences; past ones stay",
  "Rutini sil": "Delete routine",
  "Evet, sil": "Yes, delete",
  "Tekrar başına ücret (₺)": "Fee per occurrence (₺)",
  "Haftalık içerik planı": "Weekly content plan",
};
