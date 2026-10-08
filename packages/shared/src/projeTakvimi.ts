/**
 * Proje takvimi — web ve backend'in ortak tipleri ve saf yardımcıları
 * (bkz. backend modules/calendar, migration 152).
 *
 * Proje takvimi kişisel Takvim'den AYRI bir katmandır: kişisel takvimdeki
 * plan blokları kullanıcının kimseye göstermediği kendi zamanıdır, proje
 * etkinliği ise ekibe verilmiş bir sözdür. İki takvim birbirini okur ama
 * birbirine yazmaz:
 *   - Proje etkinliği, katılımcılarının kişisel Takvim'inde salt okunur görünür.
 *   - Proje takviminde, bakan kişinin O PROJENİN görevlerine ayırdığı kendi
 *     plan blokları görünür — yalnızca ona; başkasının planı görünmez.
 *
 * Izgaralar (PlanGrid / PlanMonthGrid) salt okunur kutuları Google
 * etkinliğinin şekliyle çiziyor; aşağıdaki çeviriciler Projelio kayıtlarını o
 * şekle sokar. Ayrı bir çizim yolu açmak, çakışan kutuların yan yana
 * yerleşimini iki ayrı koda bölerdi.
 */
import type { GoogleTakvimEtkinligi } from "./googleTakvim";
import { takvimGunEkle } from "./googleTakvim";
import type { PlanTimeBlock } from "./types";
import { etiketRenkleri } from "./theme";

export type ProjeEtkinlikTuru = "meeting" | "milestone" | "delivery" | "other";

export const PROJE_ETKINLIK_TURLERI: ProjeEtkinlikTuru[] = ["meeting", "milestone", "delivery", "other"];

export const PROJE_ETKINLIK_TURU_ETIKETI: Record<ProjeEtkinlikTuru, string> = {
  meeting: "Toplantı", // dil:anahtar
  milestone: "Kilometre taşı", // dil:anahtar
  delivery: "Teslim", // dil:anahtar
  other: "Diğer", // dil:anahtar
};

/**
 * Rengi seçilmemiş etkinliğin türüne göre rengi. Etiket paletinden: iki
 * temada da okunur kaldığı sınanmış tonlar (bkz. theme.ts `etiketRenkleri`).
 */
export const PROJE_ETKINLIK_TURU_RENGI: Record<ProjeEtkinlikTuru, string> = {
  meeting: etiketRenkleri[5], // mavi
  milestone: etiketRenkleri[7], // mor
  delivery: etiketRenkleri[1], // turuncu
  other: etiketRenkleri[9], // gri
};

export function projeEtkinlikRengi(e: Pick<ProjeEtkinligi, "color" | "kind">): string {
  return e.color ?? PROJE_ETKINLIK_TURU_RENGI[e.kind] ?? PROJE_ETKINLIK_TURU_RENGI.other;
}

export interface ProjeEtkinligi {
  id: string;
  projectId: string;
  /** Kişisel takvimde hangi projeden geldiğini söylemek için. */
  projectTitle?: string;
  title: string;
  note?: string;
  location?: string;
  kind: ProjeEtkinlikTuru;
  /** YYYY-MM-DD */
  eventDate: string;
  /** Çok günlü tüm gün etkinlikte son gün (DAHİL). */
  endDate?: string;
  allDay: boolean;
  /** HH:MM — saatli etkinlikte dolu. */
  startsAt?: string;
  endsAt?: string;
  color?: string;
  /** Boş = projenin tüm ekibi. */
  participantIds: string[];
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  /** İsteyen kullanıcı düzenleyip silebilir mi (yazan ya da proje sahibi). */
  duzenlenebilir: boolean;
}

export interface ProjeEtkinlikGirdisi {
  title?: string;
  note?: string | null;
  location?: string | null;
  kind?: ProjeEtkinlikTuru;
  eventDate?: string;
  endDate?: string | null;
  allDay?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  color?: string | null;
  participantIds?: string[];
}

/** Proje takviminin tek istekle beslenmesi. */
export interface ProjeTakvimGorunumu {
  from: string;
  to: string;
  events: ProjeEtkinligi[];
  /** Bakan kişinin bu projenin görevlerine ayırdığı KENDİ plan blokları. */
  myBlocks: PlanTimeBlock[];
}

/**
 * Etkinlik `from`–`to` aralığına (ikisi de dahil) değiyor mu? Çok günlü
 * etkinlik aralıktan önce başlayıp içine taşabilir; yalnızca başlangıç günüyle
 * süzmek onu takvimden düşürürdü.
 */
export function projeEtkinligiAraliktaMi(
  e: Pick<ProjeEtkinligi, "eventDate" | "endDate">,
  from: string,
  to: string
): boolean {
  const son = e.endDate ?? e.eventDate;
  return e.eventDate <= to && son >= from;
}

/**
 * Kişisel takvimde kim görür: katılımcı listesi boşsa projenin tüm ekibi,
 * doluysa katılımcılar ve etkinliği yazan. Proje takviminin kendisinde bu
 * süzgeç YOK — orada projeyi görebilen herkes her etkinliği görür.
 */
export function kisiselTakvimdeGorunurMu(
  e: Pick<ProjeEtkinligi, "participantIds" | "createdBy">,
  userId: string
): boolean {
  if (e.participantIds.length === 0) return true;
  return e.participantIds.includes(userId) || e.createdBy === userId;
}

/**
 * Proje etkinliği → ızgaranın salt okunur kutusu.
 *
 * Saatler yerel saattir; `new Date("YYYY-MM-DDTHH:MM:00")` de yerel saat
 * olarak yorumlanır ve ızgara parçalarken yine yerel saate döner — böylece
 * etkinlik yazıldığı saatte görünür. Tüm gün etkinlikte Google'ın kuralı
 * izleniyor: bitiş HARİÇ, yani son günün ertesi gece yarısı (UTC).
 */
export function projeEtkinliginiTakvimOgesine(e: ProjeEtkinligi): GoogleTakvimEtkinligi {
  const ortak = {
    id: `p:${e.id}`,
    takvimId: e.projectId,
    takvimAdi: e.projectTitle,
    takvimRengi: projeEtkinlikRengi(e),
    baslik: e.title,
    aciklama: e.note,
    konum: e.location,
    kaynak: "proje" as const,
    isleme: "yeni" as const,
    projeId: e.projectId,
    projeEtkinlikId: e.id,
  };
  if (e.allDay || !e.startsAt || !e.endsAt) {
    return {
      ...ortak,
      baslangic: `${e.eventDate}T00:00:00.000Z`,
      bitis: `${takvimGunEkle(e.endDate ?? e.eventDate, 1)}T00:00:00.000Z`,
      tumGun: true,
    };
  }
  return {
    ...ortak,
    baslangic: new Date(`${e.eventDate}T${e.startsAt}:00`).toISOString(),
    bitis: new Date(`${e.eventDate}T${e.endsAt}:00`).toISOString(),
    tumGun: false,
  };
}

/**
 * Kullanıcının kendi plan bloğu → proje takviminde salt okunur kutu.
 *
 * `planBlokId` bilerek DOLDURULMUYOR: o alan "bu Google etkinliği bir plan
 * bloğunun kopyası" demek ve ızgara öyle işaretli kutuları çizmiyor
 * (bkz. web lib/googleTakvimGorunum.ts). Burada blok ızgarada değil, kutu
 * olarak çizilmesi gereken tek kopya.
 */
export function planBlogunuTakvimOgesine(b: PlanTimeBlock): GoogleTakvimEtkinligi {
  return {
    id: `b:${b.id}`,
    takvimId: "plan",
    baslik: b.title ?? b.linkedTitle ?? "",
    aciklama: b.note,
    baslangic: new Date(`${b.blockDate}T${b.startsAt}:00`).toISOString(),
    bitis: new Date(`${b.blockDate}T${b.endsAt}:00`).toISOString(),
    tumGun: false,
    kaynak: "plan",
    isleme: b.status === "skipped" ? "yoksay" : "yeni",
    gorevId: b.taskId,
    gorevBasligi: b.linkedTitle,
  };
}

/**
 * Görevin bitiş günü → tüm gün kutusu. Bitiş saati olsa da tüm gün şeridine
 * konur: görev bir zaman aralığı değil bir son an, ızgarada 15 dakikalık bir
 * kutu olarak çizilse "o saatte bir şey var" diye okunurdu.
 */
export function gorevBitisiniTakvimOgesine(g: {
  id: string;
  title: string;
  deadline?: string;
  deadlineTime?: string;
  status?: string;
}): GoogleTakvimEtkinligi | null {
  if (!g.deadline) return null;
  const gun = g.deadline.slice(0, 10);
  return {
    id: `g:${g.id}`,
    takvimId: "gorev",
    baslik: g.deadlineTime ? `${g.deadlineTime} · ${g.title}` : g.title,
    baslangic: `${gun}T00:00:00.000Z`,
    bitis: `${takvimGunEkle(gun, 1)}T00:00:00.000Z`,
    tumGun: true,
    kaynak: "gorev",
    // Bitmiş görev soluk çizilir (ızgara "yoksay"ı soluk gösteriyor).
    isleme: g.status === "completed" ? "yoksay" : "yeni",
    gorevId: g.id,
    gorevBasligi: g.title,
  };
}
