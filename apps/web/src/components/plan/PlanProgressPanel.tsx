import type { PlanPeriodProgress } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { formatDuration } from "../../lib/planGrid";
import { useT } from "../../lib/i18n";

interface Props {
  progress: PlanPeriodProgress;
  onEditTargets: () => void;
  onBumpCount: (targetId: string, delta: number) => void;
}

/**
 * "Haftayı verimli kullanma yüzdeleri" paneli.
 *
 * Üç ayrı soruyu tek bakışta cevaplar ve bunları karıştırmamaya özen gösterir:
 *   Doluluk        — kapasitenin ne kadarını takvime doldurdum?
 *   Plana sadakat  — takvime koyduğumun ne kadarını gerçekten yaptım?
 *   Dağılım        — hedeflediğim yüzdelerle gerçekleşen yüzdeler örtüşüyor mu?
 *
 * Tek bir "verimlilik" rakamı vermiyoruz. Az planlayıp hepsini yapan biriyle
 * çok planlayıp yarısını yapan biri aynı skoru alırdı ve rakam anlamsızlaşırdı.
 */
export default function PlanProgressPanel({ progress, onEditTargets, onBumpCount }: Props) {
  const c = useThemeColors();
  const t = useT();
  const rows = progress.rows;
  const hasTargets = rows.some((r) => r.sharePct != null || r.targetMinutes != null || r.targetCount != null);

  return (
    <div
      style={{
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: c.textPrimary }}>{t("Dağılım")}</h2>
        <button
          onClick={onEditTargets}
          style={{
            padding: "5px 11px",
            fontSize: 13,
            borderRadius: 7,
            border: `1px solid ${c.border}`,
            background: c.surface,
            color: c.textPrimary,
            cursor: "pointer",
          }}
        >
          {t("Hedefleri düzenle")}
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <Stat label="Doluluk" value={`%${Math.round(progress.fillPct)}`} hint={`${formatDuration(progress.plannedMinutes)} / ${formatDuration(progress.capacityMinutes)}`} />
        <Stat label="Plana sadakat" value={`%${Math.round(progress.adherencePct)}`} hint={`${formatDuration(progress.doneMinutes)} tamamlandı`} />
      </div>

      {progress.sharePctTotal > 100 && (
        <div
          style={{
            fontSize: 12,
            color: c.danger,
            background: "rgba(193,52,52,0.07)",
            border: `1px solid rgba(193,52,52,0.25)`,
            borderRadius: 8,
            padding: "7px 10px",
            marginBottom: 12,
          }}
        >
          Hedef yüzdelerinin toplamı %{Math.round(progress.sharePctTotal)} — haftanda olmayan bir zamanı bölüştürüyorsun.
        </div>
      )}

      {!hasTargets && rows.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
          Bu dönem için henüz hedef yok. Vaktini hangi alanlara yüzde kaç ayıracağını belirlersen takvim
          dağılımı buradan takip edilir.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((row) => {
          const name = row.focusAreaName ?? row.targetTitle ?? "Kategorisiz";
          const color = row.focusAreaColor ?? c.primary;
          // Hedefi olmayan satır "plan dışı çalışma"dır: takvimde var ama
          // kullanıcı bu döneme onu koymayı planlamamıştı.
          const unplanned = row.sharePct == null && row.targetMinutes == null && row.targetCount == null;

          return (
            <div key={row.targetId ?? row.focusAreaId ?? name}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: c.textPrimary, fontWeight: 500 }}>{name}</span>
                {unplanned && <span style={{ fontSize: 11, color: c.textSecondary }}>{t("plan dışı")}</span>}
                <span style={{ marginLeft: "auto", fontSize: 12, color: c.textSecondary }}>
                  {row.sharePct != null && `hedef %${Math.round(row.sharePct)} · `}
                  {formatDuration(row.doneMinutes)} / {formatDuration(row.plannedMinutes)}
                </span>
              </div>

              {/* Hedef çubuğu ile gerçekleşen çubuk üst üste değil ALT ALTA:
                  üst üste bindirilince "hangisi hangisi" sorusu her seferinde
                  yeniden soruluyordu. */}
              <Bar
                label="takvimde"
                pct={row.plannedSharePct ?? 0}
                targetPct={row.sharePct}
                color={color}
                muted
              />
              <Bar label={t("yapılan")} pct={row.doneSharePct ?? 0} targetPct={row.sharePct} color={color} />

              {row.targetCount != null && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
                  <span style={{ fontSize: 12, color: c.textSecondary }}>
                    {row.doneCount} / {row.targetCount} {row.unit ?? "adet"}
                  </span>
                  {row.targetId && (
                    <>
                      <CountButton onClick={() => onBumpCount(row.targetId!, -1)} label="−" />
                      <CountButton onClick={() => onBumpCount(row.targetId!, 1)} label="+" />
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  const c = useThemeColors();
  return (
    <div
      style={{
        flex: "1 1 130px",
        border: `1px solid ${c.border}`,
        borderRadius: 9,
        padding: "9px 11px",
        background: c.background,
      }}
    >
      <div style={{ fontSize: 11, color: c.textSecondary }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 600, color: c.textPrimary, lineHeight: "27px" }}>{value}</div>
      <div style={{ fontSize: 11, color: c.textSecondary }}>{hint}</div>
    </div>
  );
}

/**
 * Tek bir dağılım çubuğu. `targetPct` verilirse hedefin nerede olduğunu
 * gösteren dikey bir çentik çizilir — sapma "az/çok" diye tarif edilmek yerine
 * doğrudan görülür.
 */
function Bar({
  label,
  pct,
  targetPct,
  color,
  muted,
}: {
  label: string;
  pct: number;
  targetPct?: number;
  color: string;
  muted?: boolean;
}) {
  const c = useThemeColors();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3 }}>
      <span style={{ fontSize: 10, color: c.textSecondary, width: 52, flexShrink: 0 }}>{label}</span>
      <div style={{ position: "relative", flex: 1, height: 8, borderRadius: 4, background: c.background, overflow: "hidden" }}>
        <div
          style={{
            width: `${Math.min(100, Math.max(0, pct))}%`,
            height: "100%",
            background: color,
            opacity: muted ? 0.35 : 1,
            borderRadius: 4,
          }}
        />
        {targetPct != null && targetPct > 0 && targetPct <= 100 && (
          <div
            title={`Hedef %${Math.round(targetPct)}`}
            style={{
              position: "absolute",
              top: -1,
              bottom: -1,
              left: `${targetPct}%`,
              width: 2,
              background: c.textPrimary,
              opacity: 0.55,
            }}
          />
        )}
      </div>
      <span style={{ fontSize: 10, color: c.textSecondary, width: 32, textAlign: "right", flexShrink: 0 }}>
        %{Math.round(pct)}
      </span>
    </div>
  );
}

function CountButton({ onClick, label }: { onClick: () => void; label: string }) {
  const c = useThemeColors();
  return (
    <button
      onClick={onClick}
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        border: `1px solid ${c.border}`,
        background: c.surface,
        color: c.textPrimary,
        fontSize: 14,
        lineHeight: "20px",
        padding: 0,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
