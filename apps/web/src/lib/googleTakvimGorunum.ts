import type { GoogleTakvimEtkinligi } from "@projelio/shared";
import { saatliParcalar, tumGunGunleri } from "@projelio/shared";

/** Saatli bir etkinliğin bir güne düşen parçası — ızgarada bir kutu. */
export interface EtkinlikParcasi {
  /** Aynı etkinlik iki güne bölünebildiği için id günü de taşır. */
  id: string;
  startsAt: string;
  endsAt: string;
  etkinlik: GoogleTakvimEtkinligi;
}

export interface GunEtkinlikleri {
  saatli: EtkinlikParcasi[];
  tumGun: GoogleTakvimEtkinligi[];
}

/**
 * Etkinlikleri günlere dağıtır (tarayıcının saat diliminde).
 *
 * Plan bloğundan Google'a gönderilmiş etkinlikler DIŞARIDA: blok zaten
 * ızgarada, kopyası da çizilseydi aynı iş iki kez görünürdü.
 */
export function etkinlikleriGunlereDagit(etkinlikler: GoogleTakvimEtkinligi[]): Map<string, GunEtkinlikleri> {
  const harita = new Map<string, GunEtkinlikleri>();
  const gun = (g: string) => {
    let kayit = harita.get(g);
    if (!kayit) {
      kayit = { saatli: [], tumGun: [] };
      harita.set(g, kayit);
    }
    return kayit;
  };
  for (const e of etkinlikler) {
    if (e.planBlokId) continue;
    if (e.tumGun) {
      for (const g of tumGunGunleri(e.baslangic, e.bitis)) gun(g).tumGun.push(e);
      continue;
    }
    for (const p of saatliParcalar(e.baslangic, e.bitis)) {
      // Sıfır dakikalık (hatırlatma gibi) etkinlik 15 dakikalık bir kutu olarak çizilir.
      const endsAt = p.bitis > p.baslangic ? p.bitis : ekle15(p.baslangic);
      gun(p.gun).saatli.push({ id: `g:${e.id}:${p.gun}`, startsAt: p.baslangic, endsAt, etkinlik: e });
    }
  }
  return harita;
}

function ekle15(saat: string): string {
  const [h, m] = saat.split(":").map(Number);
  const t = Math.min(h * 60 + m + 15, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
