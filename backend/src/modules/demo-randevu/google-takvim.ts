import { randomUUID } from "node:crypto";
import { fetchWithTimeout } from "../../common/http/fetch-with-timeout";

/**
 * Google Calendar API çağrıları — erişim jetonu dışarıdan verilir.
 *
 * SERVİSTEN AYRI: Nest servisleri bu repoda doğrudan test edilemiyor (test
 * koşucusu tip silmeyle çalışıyor, yapıcı parametre özelliklerini tanımıyor).
 * Google'a ne gönderdiğimiz — Meet isteği, davetli, "davet gönderme" — hatası
 * sessiz kalan türden; bu yüzden ayrı ve testli.
 */

/**
 * Takvim izni. `calendar.events` Google'ın "hassas" saydığı izinlerden: onay
 * ekranında doğrulanmamış uygulama uyarısı çıkabilir. Bunu yalnızca demo yapan
 * birkaç Pist çalışanı veriyor, müşteriler değil — o yüzden kabul edilebilir.
 */
export const DEMO_TAKVIM_IZNI = "https://www.googleapis.com/auth/calendar.events";

const TAKVIM_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export interface DemoMeetEtkinligi {
  baslangic: string;
  bitis: string;
  baslik: string;
  aciklama: string;
  katilimciEposta: string;
  /** Takvim dosyamızdaki UID: Gmail aynı etkinliği iki kez göstermesin. */
  icalUid: string;
}

/**
 * Google onay ekranında izinler tek tek seçilebiliyor; takvim kutusunun işareti
 * kaldırılırsa token gelir ama etkinlik açamaz. Bağlantı o hâlde kaydedilmemeli.
 */
export function takvimIzniVerildi(izinler: string[]): boolean {
  return izinler.includes(DEMO_TAKVIM_IZNI);
}

export type MeetSonucu = { etkinlikId: string; link: string } | { hata: string };

function istek(token: string, url: string, method: string, body?: unknown) {
  return fetchWithTimeout(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export function meetIstekGovdesi(e: DemoMeetEtkinligi, icalUidIle: boolean) {
  return {
    summary: e.baslik,
    description: e.aciklama,
    start: { dateTime: e.baslangic },
    end: { dateTime: e.bitis },
    // Davetli olan katılımcı Meet'e "katılma isteği" göndermeden girer.
    attendees: [{ email: e.katilimciEposta }],
    ...(icalUidIle ? { iCalUID: e.icalUid } : {}),
    guestsCanInviteOthers: false,
    guestsCanSeeOtherGuests: false,
    // Sunucunun kendi takvimi için: 1 gün ve 1 saat önce, katılımcınınkiyle aynı.
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 1440 }, { method: "popup", minutes: 60 }] },
    conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
  };
}

/**
 * Etkinlik + Meet odası açar.
 *
 * sendUpdates=none: katılımcı bizim e-postamızı alıyor; Google'ın ikinci,
 * İngilizce daveti kafa karıştırırdı.
 */
export async function meetEtkinligiAc(token: string, e: DemoMeetEtkinligi): Promise<MeetSonucu> {
  const url = `${TAKVIM_API}?conferenceDataVersion=1&sendUpdates=none`;
  let res = await istek(token, url, "POST", meetIstekGovdesi(e, true));
  // iCalUID çakışırsa (aynı randevu daha önce bu takvime yazıldı ve silindi)
  // Google 409 döner; UID'siz yeniden dene — tek kopya olmasa da oda açılsın.
  if (res.status === 409 || res.status === 400) res = await istek(token, url, "POST", meetIstekGovdesi(e, false));
  if (!res.ok) return { hata: `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` };

  let etkinlik = (await res.json()) as { id: string; hangoutLink?: string };
  // Oda üretimi nadiren "pending" kalır: bağlantı boş gelir. Bir kez daha oku.
  if (!etkinlik.hangoutLink) {
    await new Promise((r) => setTimeout(r, 1500));
    const tekrar = await istek(token, `${TAKVIM_API}/${encodeURIComponent(etkinlik.id)}`, "GET");
    if (tekrar.ok) etkinlik = (await tekrar.json()) as typeof etkinlik;
  }
  if (!etkinlik.hangoutLink) {
    // Workspace yöneticisi Meet'i kapatmış olabilir: boş etkinlik takvimde kalmasın.
    await etkinligiSil(token, etkinlik.id);
    return { hata: "Meet odası üretilmedi (hesapta Meet kapalı olabilir)" };
  }
  return { etkinlikId: etkinlik.id, link: etkinlik.hangoutLink };
}

/** Randevu taşındı: saat kayar, Meet odası aynı kalır. */
export async function etkinlikSaatiniGuncelle(token: string, etkinlikId: string, baslangic: string, bitis: string): Promise<boolean> {
  const res = await istek(token, `${TAKVIM_API}/${encodeURIComponent(etkinlikId)}?sendUpdates=none`, "PATCH", {
    start: { dateTime: baslangic },
    end: { dateTime: bitis },
  });
  return res.ok;
}

/** 404/410: sunucu etkinliği elle silmiş — sorun değil. */
export async function etkinligiSil(token: string, etkinlikId: string): Promise<boolean> {
  const res = await istek(token, `${TAKVIM_API}/${encodeURIComponent(etkinlikId)}?sendUpdates=none`, "DELETE");
  return res.ok || res.status === 404 || res.status === 410;
}
