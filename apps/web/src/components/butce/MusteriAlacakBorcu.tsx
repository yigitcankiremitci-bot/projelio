import { useEffect, useMemo, useState } from "react";
import type { ModuleAccess, ModuleRecord, Party } from "@projelio/shared";
import { api } from "../../api/client";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import AddModuleRecordModal from "../AddModuleRecordModal";
import VadeRozeti from "../VadeRozeti";
import { fmtPara } from "./butceBicim";

/** Bkz. AlacakBorcBolumu — alacak/borç hâlâ bir modül. */
const RP_KEY = "fm_alacak_borc";

type Tur = "receivable" | "payable";

/**
 * Kayıt bu müşteriye mi ait.
 *
 * "Kimden / Kime" alanında iki biçim yaşıyor: kartın KİMLİĞİ (listeden seçilen
 * ya da Lio'nun karta bağladığı kayıtlar) ve düz ad (alan referansa
 * çevrilmeden önce girilenler, ya da kartı olmayan bir adla açılanlar). Yalnızca
 * kimliğe bakılsaydı eski kayıtların hepsi kartta görünmezdi; ad eşleşmesi
 * bilerek BİREBİR (büyük/küçük harf hariç) — "ABC" ile "ABC Lojistik"i aynı
 * müşteri saymak başkasının borcunu bu karta yazmak olurdu.
 */
function buMusterininMi(r: ModuleRecord, party: Party): boolean {
  const v = r.data.counterparty;
  if (typeof v !== "string" || !v.trim()) return false;
  if (v === party.id) return true;
  const ad = v.trim().toLocaleLowerCase("tr");
  return ad === party.displayName.trim().toLocaleLowerCase("tr") ||
    (!!party.legalName && ad === party.legalName.trim().toLocaleLowerCase("tr"));
}

/**
 * Müşteri kartındaki alacak/borç sekmesinin verisi.
 *
 * Kayıtlar Bütçe sekmesinin kullandığı uçtan okunuyor, ayrı bir "müşterinin
 * alacakları" ucu açılmadı: o uç okuma yetkisini fm_alacak_borc modülünden
 * çözüyor. Müşteri kartını görmek (crm_musteri) şirketin alacaklarını görmeye
 * YETMEZ — satış ekibindeki biri kartı açabilir ama kasayı görmemeli.
 *
 * Yetki ÖNCE module-access'ten soruluyor: kayıt ucu yetkisi olmayana hata değil
 * BOŞ liste döndürüyor, o yüzden boş liste "kayıt yok" ile "göremezsin"i
 * ayırmıyor — sekme yetkisiz kullanıcıya "kayıt yok" diye yalan söylerdi.
 * `null` = sekme hiç gösterilmez.
 */
export function useMusteriAlacakBorcu(party: Party, organizationId?: string) {
  const [kayitlar, setKayitlar] = useState<ModuleRecord[] | null>(null);
  const [yazabilir, setYazabilir] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Serbest çalışan işlerinde alacak/borç defteri yok (yalnızca şirket Bütçesi).
    if (!organizationId) return;
    let iptal = false;
    (async () => {
      try {
        const yetki = await api.get<ModuleAccess>(`/organizations/${organizationId}/module-access?moduleKey=${RP_KEY}`);
        if (!yetki.canRead) {
          if (!iptal) setKayitlar(null);
          return;
        }
        const rows = await api.get<ModuleRecord[]>(`/organizations/${organizationId}/module-records?moduleKey=${RP_KEY}`);
        if (iptal) return;
        setYazabilir(yetki.canWrite);
        setKayitlar(rows.filter((r) => buMusterininMi(r, party)));
      } catch {
        if (!iptal) setKayitlar(null);
      }
    })();
    return () => {
      iptal = true;
    };
  }, [organizationId, party.id, party.displayName, party.legalName, tick]);

  return { kayitlar, yazabilir, yenile: () => setTick((t) => t + 1) };
}

/** Para birimi başına ayrı toplam — kur dönüşümü YOK (bkz. CLAUDE.md, Bütçe). */
function acikToplamlar(kayitlar: ModuleRecord[], tur: Tur): string {
  const toplam = new Map<string, number>();
  for (const r of kayitlar) {
    if (r.data.status === "settled") continue;
    if ((r.data.type === "payable" ? "payable" : "receivable") !== tur) continue;
    const birim = (r.data.currency as string) || "TRY";
    toplam.set(birim, (toplam.get(birim) ?? 0) + (Number(r.data.amount) || 0));
  }
  return [...toplam].map(([birim, tutar]) => fmtPara(tutar, birim)).join(" + ");
}

export default function MusteriAlacakBorcu({
  party,
  organizationId,
  kayitlar,
  yazabilir,
  yenile,
}: {
  party: Party;
  organizationId: string;
  kayitlar: ModuleRecord[];
  yazabilir: boolean;
  yenile: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [ekle, setEkle] = useState<Tur | null>(null);
  const [kapananlarGorunsun, setKapananlarGorunsun] = useState(false);

  const sirali = useMemo(
    () =>
      [...kayitlar].sort((a, b) =>
        String(a.data.dueDate ?? "9999-12-31").localeCompare(String(b.data.dueDate ?? "9999-12-31"))
      ),
    [kayitlar]
  );
  const acik = sirali.filter((r) => r.data.status !== "settled");
  const kapanan = sirali.filter((r) => r.data.status === "settled");
  const acikAlacak = acikToplamlar(kayitlar, "receivable");
  const acikBorc = acikToplamlar(kayitlar, "payable");

  const ekleDugmesi = (tur: Tur) => (
    <button
      onClick={() => setEkle(tur)}
      style={{
        fontSize: 12,
        padding: "3px 10px",
        borderRadius: 6,
        border: `1px solid ${c.border}`,
        background: "transparent",
        color: c.textPrimary,
        cursor: "pointer",
      }}
    >
      {tur === "payable" ? t("+ Borç") : t("+ Alacak")}
    </button>
  );

  const satir = (r: ModuleRecord) => {
    const borc = r.data.type === "payable";
    const kapali = r.data.status === "settled";
    return (
      <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: kapali ? 0.6 : 1 }}>
        <span style={{ color: borc ? c.danger : c.success, flexShrink: 0 }}>{borc ? t("Borç") : t("Alacak")}</span>
        <span style={{ color: c.textPrimary, fontWeight: 600, flexShrink: 0 }}>
          {fmtPara(Number(r.data.amount) || 0, (r.data.currency as string) || "TRY")}
        </span>
        <span style={{ flex: 1, minWidth: 0, color: c.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[r.data.category, r.data.description].filter(Boolean).join(" · ")}
        </span>
        {kapali ? (
          <span style={{ color: c.textSecondary, flexShrink: 0 }}>{borc ? t("Ödendi") : t("Tahsil edildi")}</span>
        ) : r.data.dueDate ? (
          <VadeRozeti tarih={String(r.data.dueDate).slice(0, 10)} />
        ) : null}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 160, fontSize: 12, color: c.textSecondary }}>
          {acikAlacak && (
            <>
              {t("Açık alacak")}: <b style={{ color: c.success }}>{acikAlacak}</b>
            </>
          )}
          {acikAlacak && acikBorc && " · "}
          {acikBorc && (
            <>
              {t("Açık borç")}: <b style={{ color: c.danger }}>{acikBorc}</b>
            </>
          )}
        </span>
        {yazabilir && ekleDugmesi("receivable")}
        {yazabilir && ekleDugmesi("payable")}
      </div>

      {kayitlar.length === 0 ? (
        <p style={{ fontSize: 12, color: c.textSecondary, margin: 0 }}>{t("Bu müşteriyle kayıtlı alacak ya da borç yok.")}</p>
      ) : (
        <>
          {acik.map(satir)}
          {kapanan.length > 0 && (
            <button
              onClick={() => setKapananlarGorunsun((v) => !v)}
              style={{ alignSelf: "flex-start", fontSize: 12, padding: 0, border: "none", background: "transparent", color: c.textSecondary, cursor: "pointer" }}
            >
              {kapananlarGorunsun ? t("Kapananları gizle") : `${t("Kapananlar")} (${kapanan.length})`}
            </button>
          )}
          {kapananlarGorunsun && kapanan.map(satir)}
        </>
      )}

      {ekle && (
        <AddModuleRecordModal
          organizationId={organizationId}
          moduleKey={RP_KEY}
          // Karşı taraf bu kart: alan formdan gizlenir, kayıt karta bağlı açılır.
          presetData={{ type: ekle, status: "open", counterparty: party.id }}
          titleOverride={ekle === "payable" ? t("Borç ekle") : t("Alacak ekle")}
          onClose={() => setEkle(null)}
          onSaved={() => {
            setEkle(null);
            yenile();
          }}
        />
      )}
    </div>
  );
}
