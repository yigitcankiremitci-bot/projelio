import type { MusteriSiparisi, OdemeYontemi, SiparisDurumu, TahsilatRaporSatiri } from "./types";

/**
 * Müşteri siparişi ve tahsilat — saf fonksiyonlar.
 *
 * Sunucu (tahsilat tutarını doğrularken) ve arayüz (durum rozeti, yönetici
 * raporu) aynı koddan geçer. Durum veritabanında SAKLANMIYOR; iki tarafta
 * ayrı hesaplansaydı "gecikti" rozeti ile raporun "geciken" sütunu bir gün
 * ayrışırdı.
 *
 * Kur dönüşümü YOK: rapor para birimi başına ayrı satır üretir (bkz.
 * butceToplama.ts'teki aynı kural).
 */

export const ODEME_YONTEMLERI: OdemeYontemi[] = ["havale", "nakit", "kredi_karti", "cek", "senet", "diger"];

// dil:anahtar-baslangic — etiketler; çeviri kullanım yerinde (t())
export const ODEME_YONTEMI_ETIKET: Record<OdemeYontemi, string> = {
  nakit: "Nakit",
  havale: "Havale / EFT",
  kredi_karti: "Kredi kartı",
  cek: "Çek",
  senet: "Senet",
  diger: "Diğer",
};

/** Evrak numarası ve evrak vadesi soran yöntemler. */
export function evrakliMi(yontem: OdemeYontemi | string | undefined): boolean {
  return yontem === "cek" || yontem === "senet";
}

export const SIPARIS_DURUMU_ETIKET: Record<SiparisDurumu, string> = {
  bekliyor: "Bekliyor",
  kismi: "Kısmi tahsil",
  tahsil_edildi: "Tahsil edildi",
  gecikti: "Gecikti",
};
// dil:anahtar-bitis

/** Kuruş hassasiyeti: 0.1 + 0.2 gibi kayan nokta artıkları "kalan 0,00000001" üretmesin. */
function kurus(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Sipariş tarihi + vade günü → YYYY-MM-DD.
 *
 * Veritabanındaki hesaplanan sütunun (vade_tarihi) arayüzdeki önizlemesi —
 * form kaydedilmeden "vade: 23 Ekim" yazabilsin diye. UTC ile hesaplanır:
 * yerel saatle yapılsaydı yaz saati geçişinde bir gün kayardı.
 */
export function vadeTarihiHesapla(siparisTarihi: string, vadeGun: number): string {
  const [y, m, d] = siparisTarihi.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + Math.max(0, Math.floor(vadeGun || 0))));
  return t.toISOString().slice(0, 10);
}

export function tahsilEdilen(s: Pick<MusteriSiparisi, "tahsilatlar">): number {
  return kurus(s.tahsilatlar.reduce((t, x) => t + Number(x.tutar || 0), 0));
}

export function kalanTutar(s: Pick<MusteriSiparisi, "tutar" | "tahsilatlar">): number {
  return Math.max(0, kurus(Number(s.tutar) - tahsilEdilen(s)));
}

/**
 * Siparişin durumu. Öncelik sırası bilinçli:
 *   1. Kalan yoksa → tahsil edildi (vadesi geçmiş olsa bile kapanmıştır).
 *   2. Vade geçtiyse → gecikti (kısmen ödenmiş olsa bile: yöneticinin
 *      bilmesi gereken şey kalanın gecikmiş olması).
 *   3. Bir kısmı geldiyse → kısmi.
 *   4. Aksi hâlde → bekliyor.
 * `bugun` YYYY-MM-DD; vade günü henüz gecikmiş sayılmaz.
 */
export function siparisDurumu(
  s: Pick<MusteriSiparisi, "tutar" | "tahsilatlar" | "vadeTarihi">,
  bugun: string
): SiparisDurumu {
  if (kalanTutar(s) <= 0) return "tahsil_edildi";
  if (s.vadeTarihi < bugun) return "gecikti";
  if (tahsilEdilen(s) > 0) return "kismi";
  return "bekliyor";
}

/**
 * Yeni tahsilat tutarı geçerli mi. Kalanı AŞAMAZ: fazlası deftere gerçekte
 * gelmemiş bir gelir yazardı. Hata yoksa null döner.
 */
// dil:anahtar-baslangic — dönen metin hem sunucuda istisna, hem ekranda t() ile gösteriliyor
export function tahsilatTutariHatasi(
  s: Pick<MusteriSiparisi, "tutar" | "tahsilatlar">,
  tutar: number
): string | null {
  if (!Number.isFinite(tutar) || tutar <= 0) return "Tutar sıfırdan büyük olmalı";
  if (kurus(tutar) > kalanTutar(s)) return "Tahsilat, siparişin kalan tutarını aşamaz";
  return null;
}
// dil:anahtar-bitis

/** Ay ekseni: vade ayı ("ne gelmeliydi") ya da sipariş ayı ("ne satıldı"). */
export type TahsilatAyEkseni = "vade" | "siparis";

export function siparisAyi(s: Pick<MusteriSiparisi, "vadeTarihi" | "siparisTarihi">, eksen: TahsilatAyEkseni): string {
  return (eksen === "siparis" ? s.siparisTarihi : s.vadeTarihi).slice(0, 7);
}

/**
 * Yönetici raporu: sorumlu × ay × para birimi.
 *
 * Varsayılan eksen vade AYI ("Ekim'de ne gelmeliydi, ne geldi"), tahsilatın
 * yapıldığı ay değil — geç gelen bir ödeme vadesinin ayını kapatır. Tahsilat
 * ekranı sipariş ayıyla çalışıyor (kullanıcı isteği, 2026-10-20: kargo
 * dökümüyle karşılaştırılan şey siparişin ayı); liste süzgeci ile rapor AYNI
 * ekseni kullanmalı, yoksa aynı ay için farklı rakam gösterirlerdi.
 */
export function tahsilatRaporu(
  siparisler: MusteriSiparisi[],
  bugun: string,
  eksen: TahsilatAyEkseni = "vade"
): TahsilatRaporSatiri[] {
  const kovalar = new Map<string, TahsilatRaporSatiri>();
  for (const s of siparisler) {
    const ay = siparisAyi(s, eksen);
    const para = s.paraBirimi || "TRY";
    const anahtar = `${s.sorumluId ?? ""}|${ay}|${para}`;
    let satir = kovalar.get(anahtar);
    if (!satir) {
      satir = {
        sorumluId: s.sorumluId ?? null,
        sorumluAdi: s.sorumluAdi,
        ay,
        paraBirimi: para,
        siparisSayisi: 0,
        beklenen: 0,
        tahsilEdilen: 0,
        kalan: 0,
        geciken: 0,
      };
      kovalar.set(anahtar, satir);
    }
    const kalan = kalanTutar(s);
    satir.siparisSayisi += 1;
    satir.beklenen = kurus(satir.beklenen + Number(s.tutar));
    satir.tahsilEdilen = kurus(satir.tahsilEdilen + tahsilEdilen(s));
    satir.kalan = kurus(satir.kalan + kalan);
    if (kalan > 0 && s.vadeTarihi < bugun) satir.geciken = kurus(satir.geciken + kalan);
  }
  return Array.from(kovalar.values()).sort(
    (a, b) =>
      a.ay.localeCompare(b.ay) ||
      (a.sorumluAdi ?? "").localeCompare(b.sorumluAdi ?? "", "tr") ||
      a.paraBirimi.localeCompare(b.paraBirimi)
  );
}
