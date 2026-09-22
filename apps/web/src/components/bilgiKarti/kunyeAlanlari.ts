// dil:anahtar-dosya — etiketler; çeviri render anında (t(...)) yapılıyor.
import type { BilgiKarti } from "@projelio/shared";
import type { BilgiKartiGirdisi } from "../../api/bilgiKarti";
import { bicimDili } from "../../lib/i18n/depo";

/**
 * Künye alanlarının TEK tanımı.
 *
 * Okuma görünümü de düzenleme formu da bu listeden çiziliyor. İki ayrı yerde
 * yazılsaydı yeni bir alan eklendiğinde biri unutulur; kullanıcı doldurduğu
 * alanı kartta göremezdi (ya da tersi, kartta görünen alanı düzenleyemezdi).
 */
export type KunyeAlanTuru = "text" | "date" | "number" | "multiline" | "tel" | "email" | "url";

export interface KunyeAlani {
  key: keyof BilgiKartiGirdisi;
  label: string;
  tur?: KunyeAlanTuru;
  placeholder?: string;
  /** Formda tam satır kaplasın mı (adres, açıklama). */
  genis?: boolean;
}

export interface KunyeBolumu {
  key: string;
  title: string;
  alanlar: KunyeAlani[];
}

export const KUNYE_BOLUMLERI: KunyeBolumu[] = [
  {
    key: "kimlik",
    title: "Kimlik",
    alanlar: [
      { key: "legalName", label: "Ticari ünvan", placeholder: "Örn. Projelio Yazılım A.Ş." }, // dil:anahtar
      { key: "brandName", label: "Marka / kısa ad" }, // dil:anahtar
      { key: "sector", label: "Sektör" }, // dil:anahtar
      { key: "foundedOn", label: "Kuruluş tarihi", tur: "date" }, // dil:anahtar
      { key: "employeeCount", label: "Çalışan sayısı", tur: "number" }, // dil:anahtar
      { key: "about", label: "Şirket hakkında", tur: "multiline", genis: true }, // dil:anahtar
    ],
  },
  {
    key: "resmi",
    title: "Resmî bilgiler",
    alanlar: [
      { key: "taxOffice", label: "Vergi dairesi" },
      { key: "taxNumber", label: "Vergi / TC kimlik no" },
      { key: "tradeRegistryNo", label: "Ticaret sicil no" },
      { key: "mersisNo", label: "MERSİS no" }, // dil:anahtar
      { key: "naceCode", label: "Faaliyet (NACE) kodu" },
      { key: "sgkNo", label: "SGK işyeri sicil no" }, // dil:anahtar
      { key: "kepAddress", label: "KEP adresi", tur: "email" },
    ],
  },
  {
    key: "iletisim",
    title: "İletişim", // dil:anahtar
    alanlar: [
      { key: "phone", label: "Telefon", tur: "tel" },
      { key: "email", label: "E-posta", tur: "email" },
      { key: "website", label: "Web sitesi", tur: "url" },
    ],
  },
  {
    key: "adres",
    title: "Adres", // dil:anahtar
    alanlar: [
      { key: "address", label: "Açık adres", tur: "multiline", genis: true }, // dil:anahtar
      { key: "district", label: "İlçe" }, // dil:anahtar
      { key: "city", label: "İl" }, // dil:anahtar
      { key: "postalCode", label: "Posta kodu" },
      { key: "country", label: "Ülke" }, // dil:anahtar
    ],
  },
  {
    key: "banka",
    title: "Banka",
    alanlar: [
      { key: "bankName", label: "Banka" },
      { key: "iban", label: "IBAN", placeholder: "TR.. .... .... .... .... .... .." },
    ],
  },
  {
    key: "muhasebe",
    title: "Muhasebe",
    alanlar: [
      {
        key: "accountantEmail",
        label: "Muhasebeci e-postası", // dil:anahtar
        tur: "email",
        genis: true,
        placeholder: "muhasebe@ornek.com",
      },
    ],
  },
  {
    key: "notlar",
    title: "Notlar",
    alanlar: [{ key: "notes", label: "Not", tur: "multiline", genis: true }], // dil:anahtar
  },
];

/** Karttaki değerleri form durumuna çevirir (hepsi metin: input'lar metin tutar). */
export function formDurumu(kart: BilgiKarti | null): BilgiKartiGirdisi {
  const durum: BilgiKartiGirdisi = {};
  for (const bolum of KUNYE_BOLUMLERI) {
    for (const alan of bolum.alanlar) {
      const deger = kart ? (kart as unknown as Record<string, unknown>)[alan.key] : undefined;
      durum[alan.key] = deger === undefined || deger === null ? "" : String(deger);
    }
  }
  return durum;
}

/** Kart hiç doldurulmamış mı — boş durumda yönlendirici metin gösterilir. */
export function kartBosMu(kart: BilgiKarti | null): boolean {
  if (!kart) return true;
  return Object.values(formDurumu(kart)).every((v) => !v);
}

/** Görüntüleme biçimi: tarih gün/ay/yıl, gerisi olduğu gibi. */
export function kunyeDegeri(kart: BilgiKarti | null, alan: KunyeAlani): string {
  if (!kart) return "";
  const ham = (kart as unknown as Record<string, unknown>)[alan.key];
  if (ham === undefined || ham === null || ham === "") return "";
  if (alan.tur === "date") {
    const tarih = new Date(String(ham));
    return Number.isNaN(tarih.getTime()) ? String(ham) : tarih.toLocaleDateString(bicimDili());
  }
  return String(ham);
}
