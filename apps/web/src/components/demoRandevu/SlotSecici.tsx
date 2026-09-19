import { useEffect, useMemo, useState } from "react";
import type { DemoMusaitlik } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useLocale, useT } from "../../lib/i18n";
import { farkliDilimde, gunAnahtari, gunEtiketi, saatMetni } from "./demoBicim";

/**
 * Gün şeridi + o günün 40 dakikalık blokları.
 *
 * Herkese açık sayfada, Ayarlar'daki üye penceresinde, yönetim bağlantısındaki
 * taşımada ve admin panelinde AYNI bileşen: bloğun nasıl göründüğü tek yerde.
 * Yalnızca boş blok olan günler şeritte çıkar — tıklayıp "bu gün dolu"
 * görmek, takvim ızgarasının boş kareleri kadar yorucuydu.
 */
export default function SlotSecici({
  musaitlik,
  secili,
  onSec,
}: {
  musaitlik: DemoMusaitlik;
  secili: string | null;
  onSec: (baslangic: string) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const { locale } = useLocale();
  const tz = musaitlik.saatDilimi;

  const gunler = useMemo(() => {
    const harita = new Map<string, DemoMusaitlik["slotlar"]>();
    for (const s of musaitlik.slotlar) {
      const k = gunAnahtari(s.baslangic, tz);
      harita.set(k, [...(harita.get(k) ?? []), s]);
    }
    return [...harita.entries()];
  }, [musaitlik, tz]);

  const [gun, setGun] = useState<string | null>(null);
  useEffect(() => {
    const seciliGun = secili ? gunAnahtari(secili, tz) : null;
    setGun((g) => (g && gunler.some(([k]) => k === g) ? g : seciliGun ?? gunler[0]?.[0] ?? null));
  }, [gunler, secili, tz]);

  if (!gunler.length) {
    return (
      <p style={{ margin: 0, fontSize: 14, color: c.textSecondary, lineHeight: 1.6 }}>
        {t("Önümüzdeki günlerde boş saat kalmadı. Birkaç gün sonra tekrar bakabilirsin.")}
      </p>
    );
  }

  const bloklar = gunler.find(([k]) => k === gun)?.[1] ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div role="listbox" aria-label={t("Gün")} style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {gunler.map(([k, s]) => {
          const e = gunEtiketi(s[0].baslangic, tz, locale);
          const aktif = k === gun;
          return (
            <button
              key={k}
              type="button"
              role="option"
              aria-selected={aktif}
              onClick={() => setGun(k)}
              style={{
                flexShrink: 0,
                width: 64,
                padding: "8px 0",
                borderRadius: 10,
                border: `1px solid ${aktif ? c.accent : c.border}`,
                background: aktif ? c.accent : c.surface,
                color: aktif ? c.onPrimary : c.textPrimary,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
              }}
            >
              <span style={{ fontSize: 12, opacity: 0.85 }}>{e.hafta}</span>
              <span style={{ fontSize: 18, fontWeight: 600 }}>{e.gun}</span>
              <span style={{ fontSize: 12, opacity: 0.85 }}>{e.ay}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 8 }}>
        {bloklar.map((s) => {
          const aktif = s.baslangic === secili;
          return (
            <button
              key={s.baslangic}
              type="button"
              onClick={() => onSec(s.baslangic)}
              aria-pressed={aktif}
              style={{
                padding: "10px 0",
                borderRadius: 9,
                border: `1px solid ${aktif ? c.primary : c.border}`,
                background: aktif ? c.primary : c.surface,
                color: aktif ? c.onPrimary : c.textPrimary,
                fontSize: 15,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {saatMetni(s.baslangic, tz, locale)}
            </button>
          );
        })}
      </div>

      <p style={{ margin: 0, fontSize: 12, color: c.textSecondary }}>
        {tz === "Europe/Istanbul" ? t("Saatler Türkiye saatiyle (GMT+3).") : t("Saatler {dilim} saat dilimiyle.", { dilim: tz })}
        {farkliDilimde(tz) ? ` ${t("Bulunduğun yerin saati farklı olabilir.")}` : ""}
      </p>
    </div>
  );
}
