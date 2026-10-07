import { useState } from "react";
import { etiketRenkleri, type PlanLabel } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { planning } from "../../api/planning";
import { useT } from "../../lib/i18n";
import { inputStyle } from "./PlanTargetsModal";

/**
 * Renkli etiket hapı. Seçili değilken yalnızca renk noktası + ad; seçiliyken
 * etiketin renginde dolgu. Takvimdeki filtre şeridi de aynı hapı kullanıyor —
 * iki yerde farklı görünseydi "bu aynı etiket mi" sorusu doğardı.
 */
export function EtiketHapi({
  label,
  secili,
  onClick,
  kucuk,
}: {
  label: PlanLabel;
  secili: boolean;
  onClick?: () => void;
  kucuk?: boolean;
}) {
  const c = useThemeColors();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={secili}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: kucuk ? "3px 9px" : "5px 11px",
        borderRadius: 999,
        fontSize: kucuk ? 12 : 13,
        border: `1px solid ${secili ? label.color : c.border}`,
        // Dolgu etiketin renginin hafif tonu: tam dolgu, yan yana birkaç
        // seçili etikette göz yoruyordu ve yazı rengini tahmin etmek gerekirdi.
        background: secili ? `${label.color}24` : c.surface,
        color: c.textPrimary,
        cursor: onClick ? "pointer" : "default",
        whiteSpace: "nowrap",
        maxWidth: "100%",
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: 5, background: label.color, flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label.name}</span>
    </button>
  );
}

/** Paletten renk seçimi — serbest renk yok (bkz. `etiketRenkleri`). */
export function RenkPaleti({ value, onChange }: { value: string; onChange: (renk: string) => void }) {
  const c = useThemeColors();
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("Etiket rengi")} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {etiketRenkleri.map((renk) => {
        const secili = renk.toUpperCase() === value.toUpperCase();
        return (
          <button
            key={renk}
            type="button"
            role="radio"
            aria-checked={secili}
            aria-label={renk}
            onClick={() => onChange(renk)}
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              background: renk,
              border: "none",
              padding: 0,
              cursor: "pointer",
              // Seçili renk, zemine göre görünür kalan çift halkayla işaretlenir.
              boxShadow: secili ? `0 0 0 2px ${c.surface}, 0 0 0 4px ${renk}` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Yeni etiket formu (ad + renk). `<form>` olması bilinçli: Modal Enter'ı
 * odağın içinde olduğu forma yönlendiriyor, yoksa etiket adını yazıp Enter'a
 * basmak bloğun kendisini kaydedip pencereyi kapatırdı.
 */
export function YeniEtiketFormu({
  onCreated,
  onCancel,
  varsayilanRenk,
}: {
  onCreated: (label: PlanLabel) => void;
  onCancel?: () => void;
  varsayilanRenk?: string;
}) {
  const c = useThemeColors();
  const t = useT();
  const [ad, setAd] = useState("");
  const [renk, setRenk] = useState(varsayilanRenk ?? etiketRenkleri[0]);
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const kaydet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ad.trim() || busy) return;
    setBusy(true);
    setHata(null);
    try {
      onCreated(await planning.createLabel({ name: ad.trim(), color: renk }));
      setAd("");
    } catch (err: any) {
      setHata(String(err?.message ?? t("Etiket oluşturulamadı.")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={kaydet}
      style={{ border: `1px solid ${c.border}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}
    >
      <input
        autoFocus
        value={ad}
        maxLength={40}
        onChange={(e) => setAd(e.target.value)}
        placeholder={t("Etiket adı (ör. Acil, Müşteri A)")}
        style={inputStyle(c)}
      />
      <RenkPaleti value={renk} onChange={setRenk} />
      {hata && <div style={{ fontSize: 12, color: c.danger }}>{hata}</div>}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: "5px 11px", fontSize: 13, borderRadius: 7, border: `1px solid ${c.border}`, background: c.surface, color: c.textPrimary, cursor: "pointer" }}
          >
            {t("Vazgeç")}
          </button>
        )}
        <button
          type="submit"
          disabled={!ad.trim() || busy}
          style={{
            padding: "5px 11px",
            fontSize: 13,
            borderRadius: 7,
            border: "none",
            background: c.primary,
            color: c.onPrimary,
            cursor: !ad.trim() || busy ? "default" : "pointer",
            opacity: !ad.trim() || busy ? 0.6 : 1,
          }}
        >
          {t("Etiket ekle")}
        </button>
      </div>
    </form>
  );
}

/**
 * Blok penceresindeki çoklu etiket seçimi. Yeni etiket buradan da açılabilir —
 * etiket ihtiyacı çoğu zaman bir bloğu düzenlerken doğuyor, ayrı bir yönetim
 * ekranına gidip geri dönmek o anı kaçırtıyordu.
 */
export default function PlanEtiketSecici({
  labels,
  seciliIdler,
  onChange,
  onLabelCreated,
}: {
  labels: PlanLabel[];
  seciliIdler: string[];
  onChange: (ids: string[]) => void;
  onLabelCreated: (label: PlanLabel) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [formAcik, setFormAcik] = useState(false);

  const degistir = (id: string) =>
    onChange(seciliIdler.includes(id) ? seciliIdler.filter((x) => x !== id) : [...seciliIdler, id]);

  // Yeni etiketin varsayılan rengi, henüz kullanılmayan ilk palet rengi:
  // art arda açılan etiketlerin hepsi kırmızı olmasın.
  const kullanilan = new Set(labels.map((l) => l.color.toUpperCase()));
  const siradakiRenk = etiketRenkleri.find((r) => !kullanilan.has(r.toUpperCase()));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {labels.map((l) => (
          <EtiketHapi key={l.id} label={l} secili={seciliIdler.includes(l.id)} onClick={() => degistir(l.id)} kucuk />
        ))}
        {!formAcik && (
          <button
            type="button"
            onClick={() => setFormAcik(true)}
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 12,
              border: `1px dashed ${c.border}`,
              background: "transparent",
              color: c.textSecondary,
              cursor: "pointer",
            }}
          >
            + {t("Yeni etiket")}
          </button>
        )}
      </div>
      {formAcik && (
        <YeniEtiketFormu
          varsayilanRenk={siradakiRenk}
          onCancel={() => setFormAcik(false)}
          onCreated={(label) => {
            onLabelCreated(label);
            onChange([...seciliIdler, label.id]);
            setFormAcik(false);
          }}
        />
      )}
    </div>
  );
}
