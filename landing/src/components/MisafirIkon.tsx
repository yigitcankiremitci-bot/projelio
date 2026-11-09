/**
 * Ana sayfanın simgeleri. Sayfada yazı yerine bunlar konuşuyor; adlarını
 * çağıran yer aria-label ve title ile veriyor (ekran okuyucu + fareyle üzerine gelme).
 */
const CIZIM = {
  is: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  proje: "M3 7h6l2 2h10v10H3z",
  gorev: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM8 12l3 3 5-6",
  takvim: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  ekip: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20c0-4 2.5-6 6-6s6 2 6 6M16 5.3a3 3 0 0 1 0 5.4M18 14.5c2 .8 3 2.6 3 5.5",
  dosya: "M6 3h8l4 4v14H6zM14 3v4h4",
  butce: "M3 7h18v13H3zM3 7l3-3h12l3 3M16 13.5h2",
  musteri: "M3 5h18v14H3zM9 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5.5 16c.4-1.8 1.7-2.7 3.5-2.7s3.1.9 3.5 2.7M15 9.5h3M15 13h3",
  lio: "M4 5h16v11H10l-4 4v-4H4zM9 10.5h.01M12 10.5h.01M15 10.5h.01",
  kilit: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  giris: "M13 4h6v16h-6M4 12h10M11 8.5 14.5 12 11 15.5",
  uyeOl: "M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3 21c0-4.5 3-7 7-7 1.5 0 2.9.4 4 1M18 14v6M15 17h6",
  bulut: "M7 18a4.5 4.5 0 0 1-.6-8.960 6 6 0 0 1 11.5 1.1A3.8 3.8 0 0 1 17.5 18M12 20v-8M9 14.5l3-3 3 3",
  cop: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5",
  arti: "M12 5v14M5 12h14",
  ok: "M5 12h14M13 6l6 6-6 6",
  kapat: "M6 6l12 12M18 6 6 18",
  onay: "M5 12.5l4.5 4.5L19 7",
  fiyat: "M3 12V4h8l10 10-8 7zM7.5 8.5h.01",
  sss: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9.5 9.5a2.5 2.5 0 1 1 3.7 2.2c-.8.5-1.2 1-1.2 1.8M12 17h.01",
  iletisim: "M3 6h18v13H3zM3 7l9 7 9-7",
  sartlar: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h4",
  kvkk: "M12 3l8 3v6c0 4.5-3 7.5-8 9-5-1.5-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5",
} as const;

export type IkonAdi = keyof typeof CIZIM;

export default function Ikon({ ad, boyut = 20 }: { ad: IkonAdi; boyut?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={boyut}
      height={boyut}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={CIZIM[ad]} />
    </svg>
  );
}
