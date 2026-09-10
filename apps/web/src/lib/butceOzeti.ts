import type { BudgetTransaction } from "@projelio/shared";

/**
 * Kasa sayfasının hesapları: aylık gelir/gider özeti ve vade durumu.
 *
 * Bileşenden ayrı duruyor çünkü ikisi de ay/gün sınırı hesabı yapıyor ve bu
 * hesap ekranda gözle doğrulanamaz (yanlış ay kovasına düşen bir hareket
 * grafikte "biraz farklı" görünür, hata gibi değil). Buradaki fonksiyonlar
 * `bugun` parametresi alıyor ki test sabit bir güne göre koşabilsin.
 */

/**
 * Grafiğin ve sıralamanın gördüğü en az bilgi.
 *
 * BudgetTransaction'a bağlı DEĞİL: şirket kasasının defteri generic modül
 * kayıtlarında (module_records) duruyor ve aynı grafiği o da kullanıyor.
 * BudgetTransaction bu biçime kendiliğinden uyuyor.
 */
export interface KasaHareketi {
  occurredAt: string;
  type: BudgetTransaction["type"];
  amount: number;
}

/** Gider ve hakediş birlikte "harcama" sayılır (bkz. budget.service.ts sumSpent). */
export function harcamaMi(type: BudgetTransaction["type"]): boolean {
  return type === "expense" || type === "payout";
}

export interface AyOzeti {
  /** "2026-09" — hareketin occurredAt'inin ilk 7 karakteriyle eşleşir. */
  anahtar: string;
  etiket: string;
  gelir: number;
  gider: number;
}

/**
 * Son N ayın gelir/gider toplamı, eskiden yeniye.
 *
 * Hareketi olmayan ay da diziye girer: grafikte ay atlanırsa iki sütun yan yana
 * gelir ve boşluk "o ay hiç para hareketi olmadı" bilgisini gizler.
 */
export function aylikOzet(transactions: KasaHareketi[], aySayisi: number, bugun = new Date()): AyOzeti[] {
  const aylar: AyOzeti[] = [];
  for (let i = aySayisi - 1; i >= 0; i--) {
    const d = new Date(bugun.getFullYear(), bugun.getMonth() - i, 1);
    aylar.push({
      anahtar: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      etiket: d.toLocaleDateString("tr-TR", { month: "short" }),
      gelir: 0,
      gider: 0,
    });
  }

  const index = new Map(aylar.map((ay) => [ay.anahtar, ay]));
  for (const tx of transactions) {
    const ay = index.get(String(tx.occurredAt).slice(0, 7));
    if (!ay) continue;
    const tutar = Number(tx.amount) || 0;
    if (harcamaMi(tx.type)) ay.gider += tutar;
    else ay.gelir += tutar;
  }
  return aylar;
}

/** Vadeye kalan gün. Negatif = gecikmiş, 0 = bugün. */
export function kalanGun(tarih: string, bugun = new Date()): number {
  const [yil, ay, gun] = String(tarih).slice(0, 10).split("-").map(Number);
  if (!yil || !ay || !gun) return 0;
  // Saat dilimi kaymasının günü bir ileri/geri almaması için iki taraf da UTC
  // gün başına sabitleniyor; karşılaştırılan şey takvim günü, an değil.
  const hedef = Date.UTC(yil, ay - 1, gun);
  const bugunUtc = Date.UTC(bugun.getFullYear(), bugun.getMonth(), bugun.getDate());
  return Math.round((hedef - bugunUtc) / 86_400_000);
}

/** "Yaklaşan" sayılan pencere. Bir haftalık: kullanıcı haftalık planlıyor. */
export const YAKLASAN_GUN = 7;

export type VadeDurumu = "gecikti" | "bugun" | "yaklasti" | "uzak";

export function vadeDurumu(tarih: string, bugun = new Date()): VadeDurumu {
  const kalan = kalanGun(tarih, bugun);
  if (kalan < 0) return "gecikti";
  if (kalan === 0) return "bugun";
  return kalan <= YAKLASAN_GUN ? "yaklasti" : "uzak";
}

/**
 * Sıralama ölçütü.
 *
 * "yakin"/"uzak", "yeni"/"eski" yerine geçti çünkü kasa sayfalarındaki
 * listelerin tarihi ZITTIR: hareketlerinki geçmişte (en yakın tarih = en
 * yeni), düzenli ödeme ve alacak/borç vadesininki gelecekte (en yakın tarih =
 * ilk ödenecek). Tek bir "yeni → eski" seçeneği vade listesini ters
 * çeviriyordu — en uzak vade en üstte duruyordu. Şimdi ölçüt "şu ana
 * yakınlık" ve her iki yönde de doğru anlamı veriyor.
 */
export type SiralamaKey = "yakin" | "uzak" | "tutar-cok" | "tutar-az";

export const SIRALAMA_SECENEKLERI: { key: SiralamaKey; label: string }[] = [
  { key: "yakin", label: "Yakın tarih önce" }, // dil:anahtar
  { key: "uzak", label: "Uzak tarih önce" }, // dil:anahtar
  { key: "tutar-cok", label: "Tutar: çok → az" }, // dil:anahtar
  { key: "tutar-az", label: "Tutar: az → çok" }, // dil:anahtar
];

/**
 * Listeyi seçilen ölçüte göre sıralar.
 *
 * `gecmis`, tarihin hangi yöne baktığını söyler: gerçekleşmiş hareketlerde
 * tarih geçmişte (yakın = en yeni, azalan), vadelerde gelecekte (yakın = ilk
 * vade, artan). Bkz. SiralamaKey üstündeki not.
 *
 * Kopya üzerinde çalışıyor: gelen dizi doğrudan sunucu yanıtının state'i ve
 * sort() yerinde sıralar — kaynağı bozarsak sıralamayı değiştirmek eski sırayı
 * geri getiremez hale gelir.
 */
export function sirala<T>(
  liste: T[],
  key: SiralamaKey,
  tarihAl: (kayit: T) => string,
  tutarAl: (kayit: T) => number,
  gecmis: boolean
): T[] {
  const kopya = [...liste];
  const artan = (a: T, b: T) => tarihAl(a).localeCompare(tarihAl(b));
  const azalan = (a: T, b: T) => tarihAl(b).localeCompare(tarihAl(a));
  switch (key) {
    case "uzak":
      return kopya.sort(gecmis ? artan : azalan);
    case "tutar-cok":
      return kopya.sort((a, b) => tutarAl(b) - tutarAl(a));
    case "tutar-az":
      return kopya.sort((a, b) => tutarAl(a) - tutarAl(b));
    default:
      return kopya.sort(gecmis ? azalan : artan);
  }
}
