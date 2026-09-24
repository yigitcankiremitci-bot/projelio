import { useThemeColors } from "../theme/useThemeColors";

/**
 * İki seçenekli düğme çifti (ör. "Arkadaşlar / Herkes"). Seçili olan dolu,
 * diğeri çerçeveli. Bir açılır menü yerine iki düğme: seçenek yalnızca iki
 * tane ve hangisinin seçili olduğu tek bakışta görünmeli.
 */
export default function IkiliSecim<T extends string>({
  secenekler,
  deger,
  onChange,
  etiket,
  kucuk,
}: {
  secenekler: readonly [{ deger: T; etiket: string }, { deger: T; etiket: string }];
  deger: T;
  onChange: (deger: T) => void;
  etiket?: string;
  kucuk?: boolean;
}) {
  const c = useThemeColors();
  return (
    <div role="radiogroup" aria-label={etiket} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {etiket && <span style={{ fontSize: 13, color: c.textSecondary }}>{etiket}</span>}
      <span style={{ display: "inline-flex", border: `1px solid ${c.border}`, borderRadius: 8, overflow: "hidden" }}>
        {secenekler.map((s) => {
          const secili = s.deger === deger;
          return (
            <button
              key={s.deger}
              type="button"
              role="radio"
              aria-checked={secili}
              onClick={() => onChange(s.deger)}
              style={{
                padding: kucuk ? "4px 10px" : "6px 14px",
                fontSize: kucuk ? 13 : 14,
                fontWeight: 500,
                border: "none",
                background: secili ? c.primary : c.surface,
                color: secili ? c.onPrimary : c.textPrimary,
              }}
            >
              {s.etiket}
            </button>
          );
        })}
      </span>
    </div>
  );
}
