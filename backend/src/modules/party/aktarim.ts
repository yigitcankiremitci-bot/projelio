import { MUSTERI_MODUL_KEY, type Party, type PartyAktarimHedefi, type PartyRole } from "@projelio/shared";

/**
 * Bağlantı kartını başka bir modüle AKTARMA — saf tanımlar.
 *
 * Rol bir etiket; aktarım kartı o rolün yaşadığı modüle taşır:
 *  - Müşteri / potansiyel müşteri / tedarikçi → Müşteriler defteri (party.modules).
 *    Tedarikçinin ayrı modülü yok: ürün kartının tedarikçi seçicisi, fatura ve
 *    tedarik ekranları kişi seçimini Müşteriler defterinden yapıyor — tedarikçi
 *    oraya girmezse hiçbir yerde seçilemez.
 *  - Rakip → Rakip ve Sektör Analizi'nde bir kayıt (module_records).
 *  - İşbirliği / bayi → Ortaklık ve Dağıtım'da bir kayıt.
 *
 * İlişki notu HİÇBİR hedefe kopyalanmaz: yalnızca Bağlantılar'ın yetkisiyle
 * görülür (party_baglanti) ve rakip analizi pazarlama ekibine açık.
 */

export interface AktarimTanimi {
  hedef: PartyAktarimHedefi;
  /** Kartın aldığı rol (rol eklenir, silinmez). */
  rol: PartyRole;
  /** Defter aktarımıysa hedef defter; modül kaydıysa modül anahtarı. */
  modul: string;
  tur: "defter" | "kayit";
}

export const AKTARIM_TANIMLARI: readonly AktarimTanimi[] = [
  { hedef: "musteri", rol: "customer", modul: MUSTERI_MODUL_KEY, tur: "defter" },
  { hedef: "potansiyel", rol: "lead", modul: MUSTERI_MODUL_KEY, tur: "defter" },
  { hedef: "tedarikci", rol: "supplier", modul: MUSTERI_MODUL_KEY, tur: "defter" },
  { hedef: "rakip", rol: "competitor", modul: "pd_rakip_sektor_analizi", tur: "kayit" },
  { hedef: "ortaklik", rol: "collaborator", modul: "spd_ortaklik_dagitim", tur: "kayit" },
];

export function aktarimTanimi(hedef: string): AktarimTanimi | undefined {
  return AKTARIM_TANIMLARI.find((t) => t.hedef === hedef);
}

/**
 * Modül kaydına aktarımda kaydın verisi. `kaynakKart` kartın kimliği: aynı
 * kartın ikinci kez aktarılmasını yakalamak ve kayıttan karta dönebilmek için.
 */
export function aktarimKaydiVerisi(party: Party, hedef: PartyAktarimHedefi): Record<string, unknown> {
  const iletisim = [party.phone, party.email].filter(Boolean).join(" · ") || undefined;
  if (hedef === "rakip") {
    return pruneBos({
      competitorName: party.displayName,
      // Kişi kartıysa çalıştığı kurum segmentin en yakın ipucu.
      segment: party.partyType === "person" ? party.kurum : undefined,
      threatLevel: "medium",
      kaynakKart: party.id,
    });
  }
  // Ortaklık: bayi rolündeyse bayi, değilse stratejik ortak.
  return pruneBos({
    partnerName: party.displayName,
    partnerType: party.roles.includes("distributor") ? "dealer" : "strategic",
    contactInfo: iletisim,
    region: party.address?.city,
    status: "talking",
    kaynakKart: party.id,
  });
}

function pruneBos(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));
}

/** Defter aktarımı yapılmış mı: kart o defterde ve rolü taşıyor. */
export function defterAktarimiYapildi(party: Pick<Party, "modules" | "roles">, t: AktarimTanimi): boolean {
  return party.modules.includes(t.modul as any) && party.roles.includes(t.rol);
}
