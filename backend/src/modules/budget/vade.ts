import type { RecurrenceInterval } from "@projelio/shared";

/**
 * Düzenli ödemelerin tarih hesabı.
 *
 * Servisten AYRI bir dosyada: test koşucusu (node --test, tip silme kipi)
 * NestJS'in `constructor(private x: T)` kısayolunu ayrıştıramıyor, yani servis
 * dosyası bir testten import EDİLEMİYOR. Buradaki hesap ise tam da teste
 * muhtaç olan yer — ay sonu taşması, çapa gün, kaçırılmış dönemler.
 */

// Tarihi yerel saat diliminden bağımsız, "YYYY-MM-DD" olarak biçimlendirir.
// toISOString() UTC'ye kaydırdığı için Türkiye saatinde gece yarısına yakın
// işlemlerde bir gün geri gidebiliyor; bu yüzden elle biçimlendiriyoruz.
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Bir sonraki vade tarihini hesaplar.
//
// Aralıklar: haftalık (7 gün), aylık (1 ay), 3 aylık, 6 aylık, yıllık (12 ay).
// Ay ekleyen aralıkların hepsi aynı kuraldan geçer — 31 Ocak'tan 3 ay sonrası
// 30 Nisan'dır ve bir sonraki hesap yine 31'den yapılır (çapa gün).
//
// Ay sonu taşmasına dikkat edilir: 31 Ocak + 1 ay, JS'te doğal olarak 3 Mart'a taşar;
// bunun yerine ayın son gününe (28/29/30) sabitlenir. Ayrıca "çapa gün" (anchorDay)
// kavramı vardır: her ayın 31'i olan bir ödeme Şubat'ta 28'e çekilir, ama bir sonraki
// hesaplama yine 31'den yapılır — aksi halde ödeme kalıcı olarak 28'e kayardı.
export function advanceDueDate(current: string, interval: RecurrenceInterval, anchorDay?: number): string {
  const [year, month, day] = current.split("-").map(Number);

  if (interval === "weekly") {
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() + 7);
    return toDateString(d);
  }

  // Ay sayısı aralığa göre. Haftalık yukarıda ayrıldı çünkü o gün ekliyor,
  // ay ekleme kuralına (çapa gün + ay sonu taşması) hiç girmiyor.
  const monthsToAdd =
    interval === "monthly" ? 1 : interval === "quarterly" ? 3 : interval === "semiannual" ? 6 : 12;
  const targetMonthIndex = month - 1 + monthsToAdd;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  // Ayın 0. günü = bir önceki ayın son günü.
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const desiredDay = anchorDay ?? day;
  return toDateString(new Date(targetYear, targetMonth, Math.min(desiredDay, lastDayOfTargetMonth)));
}

/** Bir işleyişte üretilecek en fazla kayıt. Sonsuz döngüye karşı üst sınır. */
const EN_COK_DONEM = 60;

/**
 * Bir ödemenin ŞİMDİ deftere işlenecek dönemlerini ve işlemden sonraki vadeyi
 * hesaplar.
 *
 * İki durum var:
 *  - Vadesi gelmiş (bugün ya da geçmiş): kaçırılan HER dönem için ayrı kayıt.
 *    Sunucu kapalı kaldıysa defterde boşluk kalmasın diye (bkz. processor).
 *  - Vadesi gelmemiş: kullanıcı erken ödemiştir. Tek kayıt, tarihi BUGÜN —
 *    para bugün çıktı. Sonraki vade yine kendi takviminden ilerler, yani erken
 *    ödemek ödeme gününü kalıcı olarak öne çekmez.
 *
 * Saf fonksiyon: cron da elle "Ödendi" de aynı hesabı kullanıyor, iki kopya
 * olsaydı biri düzeltilip diğeri unutulurdu.
 */
export function islenecekDonemler(
  nextDueDate: string,
  interval: RecurrenceInterval,
  anchorDay: number | undefined,
  today: string
): { tarihler: string[]; sonrakiVade: string } {
  if (nextDueDate > today) {
    return { tarihler: [today], sonrakiVade: advanceDueDate(nextDueDate, interval, anchorDay) };
  }

  const tarihler: string[] = [];
  let vade = nextDueDate;
  while (vade <= today && tarihler.length < EN_COK_DONEM) {
    tarihler.push(vade);
    vade = advanceDueDate(vade, interval, anchorDay);
  }
  return { tarihler, sonrakiVade: vade };
}
