/**
 * Harcama uyarısının KARAR mantığı — veritabanından ve Nest'ten bağımsız.
 *
 * Ayrı dosyada çünkü processor `@Injectable()` dekoratörü taşıyor ve test koşucusu
 * (node --test) dekoratörlü dosyaları yükleyemiyor. Asıl sebep test edilebilirlik:
 * "ne zaman uyarmalı" sorusu paranın gittiği yerle ilgili, sessizce bozulmamalı.
 */

/** Yalnızca eşiği aşan durumda uyarı üretilir; `null` = uyarılacak bir şey yok. */
export interface SpendAlert {
  seviye: "kritik" | "uyarı";
  baslik: string;
  govde: string;
}

export interface BalanceAlertInput {
  /** Sağlayıcıda kalan tahmini bakiye (USD). */
  remainingUsd: number;
  /** Son 7 günün ortalama GÜNLÜK harcaması (USD). Bilinmiyorsa 0. */
  gunlukOrtalamaUsd: number;
  criticalUsd: number;
  warningUsd: number;
}

/**
 * Bakiye uyarısı.
 *
 * NEDEN SADECE MUTLAK EŞİK DEĞİL: "10 dolar kaldı" tek başına bir şey söylemiyor.
 * Günde 0,20 dolar harcayan bir kurulumda 10 dolar iki ay demek; günde 8 dolar
 * harcayanda yarım gün. Bu yüzden mesaja "yaklaşık kaç gün kaldı" bilgisi de
 * konuyor — asıl karar verdiren sayı o.
 */
export function bakiyeUyarisi(input: BalanceAlertInput): SpendAlert | null {
  const { remainingUsd, gunlukOrtalamaUsd, criticalUsd, warningUsd } = input;

  if (remainingUsd > warningUsd) return null;

  const kalanGun =
    gunlukOrtalamaUsd > 0 ? Math.floor(Math.max(remainingUsd, 0) / gunlukOrtalamaUsd) : null;
  const gunMetni =
    kalanGun === null
      ? "Son günlerde harcama olmadığı için ne kadar yeteceği hesaplanamadı."
      : kalanGun <= 0
        ? "Bu hızla bugün içinde tükenebilir."
        : `Son 7 günün hızıyla yaklaşık ${kalanGun} gün yeter.`;

  const tutar = `${remainingUsd.toFixed(2)} USD`;

  if (remainingUsd <= criticalUsd) {
    return {
      seviye: "kritik",
      baslik: "Lio kredisi kritik seviyede",
      govde:
        `Anthropic bakiyesi ${tutar}. ${gunMetni} ` +
        "Bakiye bittiğinde Lio tüm kullanıcılar için durur. " +
        "console.anthropic.com üzerinden kredi yükleyip yönetici panelinden kaydedin.",
    };
  }

  return {
    seviye: "uyarı",
    baslik: "Lio kredisi azalıyor",
    govde:
      `Anthropic bakiyesi ${tutar}. ${gunMetni} ` +
      "Kesinti olmaması için kredi yüklemeyi planlayın.",
  };
}

export interface SpikeAlertInput {
  /** Dünkü toplam harcama (USD). */
  duneUsd: number;
  /** Ondan önceki 7 günün ortalama günlük harcaması (USD). */
  oncekiOrtalamaUsd: number;
  /** Kaç katına çıkınca uyarılsın. */
  katsayi: number;
  /** Bu tutarın altındaki günlük harcamalar için uyarı üretilmez. */
  tabanUsd: number;
}

/**
 * Ani harcama sıçraması uyarısı.
 *
 * NEDEN GEREKLİ: bakiye uyarısı günde bir çalışıyor, yani kaçak bir döngü ya da
 * kötüye kullanım bakiyeyi saatler içinde bitirirse haber 24 saat geç gelir.
 * Sıçrama kontrolü aynı veriyle bunu erken yakalar.
 *
 * TABAN NEDEN VAR: küçük sayılarda oran yanıltıcı. 0,02 USD'den 0,10 USD'ye çıkmak
 * "5 kat artış" ama kimseyi ilgilendirmez. Taban altındaki günler sessiz geçilir.
 */
export function sicramaUyarisi(input: SpikeAlertInput): SpendAlert | null {
  const { duneUsd, oncekiOrtalamaUsd, katsayi, tabanUsd } = input;

  if (duneUsd < tabanUsd) return null;
  if (oncekiOrtalamaUsd <= 0) return null;
  if (duneUsd < oncekiOrtalamaUsd * katsayi) return null;

  const kat = (duneUsd / oncekiOrtalamaUsd).toFixed(1);
  return {
    seviye: "uyarı",
    baslik: "Lio harcamasında ani artış",
    govde:
      `Dün ${duneUsd.toFixed(2)} USD harcandı — önceki 7 günün ortalamasının (` +
      `${oncekiOrtalamaUsd.toFixed(2)} USD) ${kat} katı. ` +
      "Beklenen bir artış değilse yönetici panelinden kullanıcı bazlı tüketime bakın.",
  };
}

/** Bir günün başlangıcı (yerel saat), gün bazlı toplama için. */
export function gunAnahtari(tarih: Date): string {
  return `${tarih.getFullYear()}-${String(tarih.getMonth() + 1).padStart(2, "0")}-${String(
    tarih.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Gün bazında toplanmış harcamadan "dün" ve "ondan önceki 7 günün ortalaması"nı çıkarır.
 *
 * Bugün BİLEREK dışarıda: gün henüz bitmediği için kısmi veriyle karşılaştırma
 * yapmak sürekli yanlış alarm üretirdi.
 */
export function gunlukPencere(
  gunlukToplam: Map<string, number>,
  simdi: Date
): { duneUsd: number; oncekiOrtalamaUsd: number } {
  const gun = (kaydirma: number) => {
    const d = new Date(simdi);
    d.setDate(d.getDate() - kaydirma);
    return gunlukToplam.get(gunAnahtari(d)) ?? 0;
  };

  const duneUsd = gun(1);
  let toplam = 0;
  for (let i = 2; i <= 8; i++) toplam += gun(i);

  return { duneUsd, oncekiOrtalamaUsd: toplam / 7 };
}

/**
 * Son `gunSayisi` günün ortalama günlük harcaması. Bugün dahil DEĞİL (gün henüz
 * bitmedi), yani 1 gün öncesinden başlar.
 */
export function sonGunlerinOrtalamasi(
  gunlukToplam: Map<string, number>,
  simdi: Date,
  gunSayisi: number
): number {
  let toplam = 0;
  for (let i = 1; i <= gunSayisi; i++) {
    const d = new Date(simdi);
    d.setDate(d.getDate() - i);
    toplam += gunlukToplam.get(gunAnahtari(d)) ?? 0;
  }
  return toplam / gunSayisi;
}
