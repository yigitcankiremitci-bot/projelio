/**
 * Canlı demo randevuları (bkz. migration 120, backend modules/demo-randevu).
 *
 * NEDEN SHARED: slot hesabı, takvim dosyası (.ics) ve Google Takvim bağlantısı
 * hem sunucuda (e-posta, uygunluk kontrolü) hem arayüzde (başarı ekranındaki
 * "takvime ekle" düğmeleri) lazım. İki kopya olsaydı e-postadaki etkinlik ile
 * ekrandaki etkinlik bir gün ayrışırdı.
 *
 * Buradaki her şey SAF: saat bilgisi parametre olarak gelir, `new Date()`
 * çağrılmaz — testler saati sabitleyebilsin diye.
 */

export type DemoRandevuDurumu = "bekliyor" | "planlandi" | "tamamlandi" | "gelmedi" | "iptal";

/** Hâlâ takvimde yer tutan durumlar. Slot çakışması yalnızca bunlara bakar. */
export const DEMO_ETKIN_DURUMLAR: DemoRandevuDurumu[] = ["bekliyor", "planlandi"];

export const DEMO_DURUM_ETIKETI: Record<DemoRandevuDurumu, string> = {
  bekliyor: "Sunucu bekliyor",
  planlandi: "Planlandı",
  tamamlandi: "Tamamlandı",
  gelmedi: "Katılmadı",
  iptal: "İptal",
};

/** Takvime eklenen iki hatırlatma: 1 gün ve 1 saat önce (dakika). */
export const DEMO_HATIRLATMALARI_DK = [24 * 60, 60] as const;

export interface DemoCalismaAraligi {
  /** ISO haftanın günü: 1 = Pazartesi … 7 = Pazar */
  gun: number;
  /** "HH:MM" — saat dilimi DemoAyarlari.saatDilimi */
  baslangic: string;
  bitis: string;
}

export interface DemoAyarlari {
  aktif: boolean;
  sureDk: number;
  /** İki görüşme arasındaki boşluk: taşan görüşme bir sonrakini yemesin. */
  tamponDk: number;
  /** En erken kaç saat sonrası seçilebilir — sunucunun hazırlanma payı. */
  minOncedenSaat: number;
  /** Takvim kaç gün ileriyi gösterir. */
  maxGunIleri: number;
  saatDilimi: string;
  /** Sunucu atanmamışsa ya da kendi bağlantısı yoksa kullanılan görüşme adresi. */
  varsayilanToplantiLinki: string | null;
  /** Yeni randevuyu yöneticilere ek olarak bu adreslere de bildir. */
  bildirimEpostalari: string[];
  calismaSaatleri: DemoCalismaAraligi[];
  /** "YYYY-MM-DD" — tatil, izin; o gün hiç slot açılmaz. */
  kapaliGunler: { tarih: string; aciklama: string | null }[];
}

export const DEMO_VARSAYILAN_AYARLAR: DemoAyarlari = {
  aktif: false,
  sureDk: 40,
  tamponDk: 10,
  minOncedenSaat: 12,
  maxGunIleri: 21,
  saatDilimi: "Europe/Istanbul",
  varsayilanToplantiLinki: null,
  bildirimEpostalari: [],
  calismaSaatleri: [],
  kapaliGunler: [],
};

export interface DemoSlot {
  /** ISO (UTC) */
  baslangic: string;
  bitis: string;
}

/** Herkese açık sayfanın ihtiyacı: yalnızca takvimi çizecek kadar bilgi. */
export interface DemoMusaitlik {
  aktif: boolean;
  sureDk: number;
  saatDilimi: string;
  slotlar: DemoSlot[];
}

export interface DemoRandevuGirdisi {
  baslangic: string;
  ad?: string;
  eposta?: string;
  telefon?: string;
  sirket?: string;
  ekipBuyuklugu?: string;
  not?: string;
  /** Herkese açık formda KVKK onayı — üyeler kayıtta zaten onayladı. */
  kvkkOnay?: boolean;
  /** Bot tuzağı: görünmez alan, dolu gelirse istek sessizce yutulur. */
  website?: string;
  dil?: string;
}

/** Randevu sahibine gösterilen görünüm (yönetim bağlantısı ve Ayarlar kartı). */
export interface DemoRandevuGorunumu {
  id: string;
  baslangic: string;
  bitis: string;
  durum: DemoRandevuDurumu;
  ad: string;
  eposta: string;
  saatDilimi: string;
  sunucuAdi: string | null;
  toplantiLinki: string | null;
  /** Herkese açık yönetim sayfası: iptal / yeniden planlama. */
  yonetimToken: string;
  /** Üye değilse ve bu adresle henüz hesap açılmadıysa true. */
  hesapGerekli: boolean;
}

/** Yönetici listesindeki satır. */
export interface DemoRandevuYonetici extends DemoRandevuGorunumu {
  telefon: string | null;
  sirket: string | null;
  ekipBuyuklugu: string | null;
  not: string | null;
  icNot: string | null;
  kaynak: "herkese_acik" | "ayarlar";
  userId: string | null;
  sunucuId: string | null;
  /** Randevuyu alan üye değilse bile, bu adresle sonradan hesap açıldı mı. */
  hesabiVar: boolean;
  iptalNedeni: string | null;
  createdAt: string;
}

export interface DemoSunucu {
  userId: string;
  ad: string;
  eposta: string;
  /** Yöneticiler listede her zaman var; moderatörler ayrıca eklenir. */
  yonetici: boolean;
  toplantiLinki: string | null;
  /** Google takvimini bağladıysa hangi hesapla — her randevuya otomatik Meet açılır. */
  googleMeetEposta: string | null;
}

/** Sunucunun (moderatör/yönetici) kendi Google Meet bağlantı durumu. */
export interface DemoMeetDurumu {
  yapilandirildi: boolean;
  bagli: boolean;
  eposta: string | null;
}

export const DEMO_EKIP_BUYUKLUKLERI = ["Yalnızım", "2-5", "6-20", "21-50", "50+"] as const;

// ───────────────────────────────────────────── Saat dilimi

/** Verilen anın, saat diliminde UTC'ye göre farkı (ms). */
function dilimFarki(an: number, saatDilimi: string): number {
  const parcalar = new Intl.DateTimeFormat("en-US", {
    timeZone: saatDilimi,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(an));
  const al = (tur: string) => Number(parcalar.find((p) => p.type === tur)?.value ?? 0);
  const yerel = Date.UTC(al("year"), al("month") - 1, al("day"), al("hour"), al("minute"), al("second"));
  return yerel - Math.floor(an / 1000) * 1000;
}

/**
 * "2026-09-21" + "10:00" (İstanbul) → UTC anı.
 *
 * İki tur: ilk tahmin yaz saati sınırının öbür tarafına düşebilir; ikinci tur
 * farkı hedef anda yeniden ölçüyor. Türkiye 2016'dan beri yaz saati
 * uygulamıyor ama saat dilimi ayardan geliyor, sabit +3 yazmak yanlış olurdu.
 */
export function yereldenUtc(tarih: string, saat: string, saatDilimi: string): Date {
  const [y, a, g] = tarih.split("-").map(Number);
  const [s, d] = saat.split(":").map(Number);
  const tahmin = Date.UTC(y, a - 1, g, s, d);
  const ilk = tahmin - dilimFarki(tahmin, saatDilimi);
  return new Date(tahmin - dilimFarki(ilk, saatDilimi));
}

/** Anın saat dilimindeki takvim günü: "YYYY-MM-DD". */
export function yerelTarih(an: Date, saatDilimi: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: saatDilimi,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(an);
}

function gunEkle(tarih: string, n: number): string {
  const [y, a, g] = tarih.split("-").map(Number);
  return new Date(Date.UTC(y, a - 1, g + n)).toISOString().slice(0, 10);
}

/** ISO haftanın günü (1 = Pazartesi). Takvim günü saat diliminden bağımsız. */
function isoGun(tarih: string): number {
  const [y, a, g] = tarih.split("-").map(Number);
  const gun = new Date(Date.UTC(y, a - 1, g)).getUTCDay();
  return gun === 0 ? 7 : gun;
}

function dakika(saat: string): number {
  const [s, d] = saat.split(":").map(Number);
  return s * 60 + d;
}

function saatMetni(dk: number): string {
  return `${String(Math.floor(dk / 60)).padStart(2, "0")}:${String(dk % 60).padStart(2, "0")}`;
}

/** "HH:MM" mi? Ayarlar kaydedilirken ve slot üretilirken aynı kural. */
export function gecerliSaat(saat: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(saat);
}

// ───────────────────────────────────────────── Slotlar

/**
 * Çalışma saatlerinden 40 dakikalık blokları üretir, dolu olanları çıkarır.
 *
 * Izgara ARALIĞIN BAŞINDAN kurulur ve (süre + tampon) adımla ilerler: blokları
 * yönetici belirliyor, ziyaretçi 10:17 gibi bir saat seçemiyor. Dolu bir
 * randevunun tamponu da hesaba katılır — başka bir süre ayarıyla alınmış eski
 * bir randevu ızgaraya oturmasa bile üstüne yazılmasın.
 */
export function demoSlotlariUret(
  ayar: Pick<
    DemoAyarlari,
    "sureDk" | "tamponDk" | "minOncedenSaat" | "maxGunIleri" | "saatDilimi" | "calismaSaatleri" | "kapaliGunler"
  >,
  simdi: Date,
  dolu: { baslangic: string; bitis: string }[]
): DemoSlot[] {
  const sure = Math.max(5, ayar.sureDk);
  const adim = sure + Math.max(0, ayar.tamponDk);
  const enErken = simdi.getTime() + ayar.minOncedenSaat * 3_600_000;
  const kapali = new Set(ayar.kapaliGunler.map((k) => k.tarih));
  const doluAraliklar = dolu.map((d) => ({
    bas: new Date(d.baslangic).getTime() - ayar.tamponDk * 60_000,
    son: new Date(d.bitis).getTime() + ayar.tamponDk * 60_000,
  }));

  const bugun = yerelTarih(simdi, ayar.saatDilimi);
  const sonuc: DemoSlot[] = [];
  for (let i = 0; i <= ayar.maxGunIleri; i++) {
    const tarih = gunEkle(bugun, i);
    if (kapali.has(tarih)) continue;
    const gun = isoGun(tarih);
    const araliklar = ayar.calismaSaatleri
      .filter((a) => a.gun === gun && gecerliSaat(a.baslangic) && gecerliSaat(a.bitis))
      .sort((x, y) => dakika(x.baslangic) - dakika(y.baslangic));
    for (const aralik of araliklar) {
      const son = dakika(aralik.bitis);
      for (let bas = dakika(aralik.baslangic); bas + sure <= son; bas += adim) {
        const b = yereldenUtc(tarih, saatMetni(bas), ayar.saatDilimi).getTime();
        const e = b + sure * 60_000;
        if (b < enErken) continue;
        if (doluAraliklar.some((d) => b < d.son && e > d.bas)) continue;
        sonuc.push({ baslangic: new Date(b).toISOString(), bitis: new Date(e).toISOString() });
      }
    }
  }
  // Aynı güne çakışan iki aralık girilmişse aynı blok iki kez çıkmasın.
  const gorulen = new Set<string>();
  return sonuc
    .filter((s) => (gorulen.has(s.baslangic) ? false : (gorulen.add(s.baslangic), true)))
    .sort((x, y) => x.baslangic.localeCompare(y.baslangic));
}

// ───────────────────────────────────────────── Takvim

export interface DemoTakvimEtkinligi {
  uid: string;
  baslangic: string;
  bitis: string;
  baslik: string;
  aciklama: string;
  konum?: string | null;
  /** Değişiklikte artar: takvim uygulaması eski kaydın ÜSTÜNE yazsın, kopya açmasın. */
  sira?: number;
  iptal?: boolean;
}

function icsZaman(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function icsKacir(metin: string): string {
  return metin.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545: satır 75 sekizliyi geçmesin; devam satırı boşlukla başlar. */
function katla(satir: string): string {
  const parcalar: string[] = [];
  let kalan = satir;
  while (new TextEncoder().encode(kalan).length > 73) {
    let kes = 73;
    while (new TextEncoder().encode(kalan.slice(0, kes)).length > 73) kes--;
    parcalar.push(kalan.slice(0, kes));
    kalan = kalan.slice(kes);
  }
  parcalar.push(kalan);
  return parcalar.join("\r\n ");
}

/**
 * Apple Takvim / Outlook / Google için .ics dosyası.
 *
 * İKİ HATIRLATMA (VALARM) — 1 gün ve 1 saat önce. Google Takvim'in "etkinlik
 * oluştur" bağlantısı hatırlatma parametresi kabul etmiyor; iki bildirimi
 * garanti eden tek yol bu dosya. Bu yüzden e-postaya ek olarak da gidiyor.
 *
 * METHOD:PUBLISH bilerek: REQUEST olsaydı istemciler "katılıyor musunuz?"
 * yanıtını düzenleyene (bizim gönderen adresimize) geri yollamaya çalışırdı.
 */
export function demoIcsOlustur(e: DemoTakvimEtkinligi, simdi: Date): string {
  const satirlar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Projelio//Demo//TR",
    "CALSCALE:GREGORIAN",
    `METHOD:${e.iptal ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `SEQUENCE:${e.sira ?? 0}`,
    `DTSTAMP:${icsZaman(simdi.toISOString())}`,
    `DTSTART:${icsZaman(e.baslangic)}`,
    `DTEND:${icsZaman(e.bitis)}`,
    `SUMMARY:${icsKacir(e.baslik)}`,
    `DESCRIPTION:${icsKacir(e.aciklama)}`,
    ...(e.konum ? [`LOCATION:${icsKacir(e.konum)}`, `URL:${e.konum}`] : []),
    `STATUS:${e.iptal ? "CANCELLED" : "CONFIRMED"}`,
    ...(e.iptal
      ? []
      : DEMO_HATIRLATMALARI_DK.flatMap((dk) => [
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `DESCRIPTION:${icsKacir(e.baslik)}`,
          `TRIGGER:-PT${dk}M`,
          "END:VALARM",
        ])),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return satirlar.map(katla).join("\r\n") + "\r\n";
}

/** Google Takvim'de doldurulmuş "etkinlik oluştur" ekranı. */
export function googleTakvimUrl(e: Omit<DemoTakvimEtkinligi, "uid">): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.baslik,
    dates: `${icsZaman(e.baslangic)}/${icsZaman(e.bitis)}`,
    details: e.aciklama,
  });
  if (e.konum) p.set("location", e.konum);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

// ───────────────────────────────────────────── Doğrulama

export function demoEpostaGecerli(eposta: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(eposta.trim()) && eposta.length <= 254;
}

/** Rakam dışını atıp bakar: "+90 (532) 000 00 00" da geçerli. */
export function demoTelefonGecerli(telefon: string): boolean {
  const rakam = telefon.replace(/\D/g, "");
  return rakam.length >= 10 && rakam.length <= 15 && /^[+\d\s().-]+$/.test(telefon.trim());
}
