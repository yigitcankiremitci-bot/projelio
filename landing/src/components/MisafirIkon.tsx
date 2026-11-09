/**
 * Ana sayfanın simgeleri. Panel simgeleri apps/web/src/components/icons.tsx'ten
 * birebir kopya (landing workspace olmadığı için içe aktaramıyor): sayfa panelin
 * aynısı görünsün diye çizgiler değiştirilmemeli. Biri değişirse öbürü de.
 *
 * Çizimler sabit metin; dışarıdan gelen hiçbir şey buraya girmiyor.
 */
const CIZIM = {
  // Panel (icons.tsx)
  kasa: '<path d="M19 7V5a1 1 0 0 0-1-1H6a2 2 0 0 0 0 4h13a1 1 0 0 1 1 1v3"/><path d="M20 16v3a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V6"/><path d="M21 12v4h-4a2 2 0 0 1 0-4z"/>',
  liste: '<path d="M4 6l1.5 1.5L8 5"/><path d="M11 6h9"/><path d="M4 12l1.5 1.5L8 11"/><path d="M11 12h9"/><path d="M4 18l1.5 1.5L8 17"/><path d="M11 18h9"/>',
  takvim: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
  is: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M3 12h18"/>',
  proje: '<path d="M3 12h4l2.5-7L14 19l2.5-7H21"/>',
  saat: '<path d="M7 3h10M7 21h10"/><path d="M8 3v3a4 4 0 0 0 1.2 2.8L12 12l2.8-3.2A4 4 0 0 0 16 6V3"/><path d="M8 21v-3a4 4 0 0 1 1.2-2.8L12 12l2.8 3.2A4 4 0 0 1 16 18v3"/>',
  katman: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  isilti: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z"/>',
  dosya: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  not: '<path d="M5 3h14a1 1 0 0 1 1 1v11l-5 6H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M15 21v-6h5M8 8h8M8 12h5"/>',
  kisi: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  bina: '<rect x="4" y="3" width="12" height="18" rx="1.5"/><path d="M9 8h2M9 12h2M9 16h2"/><path d="M16 10h3a1 1 0 0 1 1 1v10h-4"/><path d="M8 21h9"/>',
  sag: '<path d="M9 6l6 6-6 6"/>',
  sol: '<path d="M15 6l-6 6 6 6"/>',
  arti: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  gonder: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
  kapat: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  oynat: '<path d="M7 4.5l12 7.5-12 7.5z"/>',
  duraklat: '<path d="M9 5v14"/><path d="M15 5v14"/>',
  sifirla: '<path d="M3 11a9 9 0 1 1 2.6 6.3"/><path d="M3 4v6h6"/>',
  klasor: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
  onay: '<path d="M5 12l5 5 9-10"/>',
  // Misafire özgü
  kilit: '<path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>',
  giris: '<path d="M13 4h6v16h-6M4 12h10M11 8.5 14.5 12 11 15.5"/>',
  uyeOl: '<path d="M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3 21c0-4.5 3-7 7-7 1.5 0 2.9.4 4 1M18 14v6M15 17h6"/>',
  bulut: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96 6 6 0 0 1 11.5 1.1A3.8 3.8 0 0 1 17.5 18M12 20v-8M9 14.5l3-3 3 3"/>',
  cop: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
  fiyat: '<path d="M3 12V4h8l10 10-8 7zM7.5 8.5h.01"/>',
  sss: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9.5 9.5a2.5 2.5 0 1 1 3.7 2.2c-.8.5-1.2 1-1.2 1.8M12 17h.01"/>',
  iletisim: '<path d="M3 6h18v13H3zM3 7l9 7 9-7"/>',
  sartlar: '<path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/>',
  kvkk: '<path d="M12 3l8 3v6c0 4.5-3 7.5-8 9-5-1.5-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5"/>',
} as const;

export type IkonAdi = keyof typeof CIZIM;

export default function Ikon({ ad, boyut = 18, renk = "currentColor", kalinlik = 1.8 }: { ad: IkonAdi; boyut?: number; renk?: string; kalinlik?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={boyut}
      height={boyut}
      fill="none"
      stroke={renk}
      strokeWidth={kalinlik}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: CIZIM[ad] }}
    />
  );
}
