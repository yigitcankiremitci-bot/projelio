import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { accentPresets, sidebarColorPresets, sidebarPatterns } from "@projelio/shared";
import type { SidebarColorKey, SidebarPatternKey } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useTheme } from "../../theme/ThemeProvider";
import { useAppPrefs } from "../../lib/appPrefs";
import {
  FONT_SCALE_LABELS,
  FONT_SCALE_OPTIONS,
  getFontScaleOption,
  setFontScaleOption,
  type FontScaleOption,
} from "../../lib/fontScale";
import { useHomeTarget } from "../../lib/homeTarget";
import type { AnasayfaPano } from "../../lib/useAnasayfaPano";
import { useT } from "../../lib/i18n";
import { IconCheck, IconPlus } from "../icons";
import HomeTargetModal from "../HomeTargetModal";
import type { PanoKartTanimi } from "./ozetKartlari";

type Sekme = "kartlar" | "gorunum" | "davranis";
const SEKMELER: { key: Sekme; label: string }[] = [
  { key: "kartlar", label: "Kartlar" }, // dil:anahtar
  { key: "gorunum", label: "Görünüm" }, // dil:anahtar
  { key: "davranis", label: "Davranış" }, // dil:anahtar
];

function Baslik({ children }: { children: ReactNode }) {
  const c = useThemeColors();
  return <div style={{ fontSize: 13, color: c.textSecondary, margin: "12px 0 6px" }}>{children}</div>;
}

function Secenek({
  secili,
  onClick,
  swatch,
  children,
}: {
  secili: boolean;
  onClick: () => void;
  swatch?: CSSProperties;
  children: ReactNode;
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
        padding: "6px 10px",
        borderRadius: 9,
        border: `1px solid ${secili ? c.accent : c.border}`,
        background: "transparent",
        color: c.textPrimary,
        fontSize: 13,
        whiteSpace: "nowrap",
      }}
    >
      {swatch && <span style={{ width: 13, height: 13, borderRadius: "50%", flexShrink: 0, ...swatch }} />}
      {children}
    </button>
  );
}

function Satirlar({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>;
}

function Anahtar({ ad, acik, onChange }: { ad: string; acik: boolean; onChange: (v: boolean) => void }) {
  const c = useThemeColors();
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0", fontSize: 14, color: c.textPrimary, cursor: "pointer" }}>
      {ad}
      <input type="checkbox" checked={acik} onChange={(e) => onChange(e.target.checked)} style={{ width: 16, height: 16, flexShrink: 0 }} />
    </label>
  );
}

/**
 * Kişiselleştirmenin tek adresi: anasayfanın üstünde yerinde açılır.
 *
 * Pencere değil bilerek: kişi kart eklerken panoyu görmeli ve bu sırada
 * kartları sürükleyebilmeli; pencere ikisini de örterdi.
 */
export default function PanoOzellestir({
  pano,
  katalog,
  onKapat,
}: {
  pano: AnasayfaPano;
  katalog: PanoKartTanimi[];
  onKapat: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const theme = useTheme();
  const prefs = useAppPrefs();
  const homeTarget = useHomeTarget();
  const [sekme, setSekme] = useState<Sekme>("kartlar");
  const [yaziBoyu, setYaziBoyu] = useState<FontScaleOption>(getFontScaleOption());
  const [sifirlaOnay, setSifirlaOnay] = useState(false);
  const [hedefSeciliyor, setHedefSeciliyor] = useState(false);

  const paneldeki = new Set(pano.kartlar.map((k) => k.id));
  const kartDugmeleri = (grup: PanoKartTanimi["grup"]) =>
    katalog
      .filter((k) => k.grup === grup)
      .map((k) => {
        const var_ = paneldeki.has(k.id);
        return (
          <Secenek key={k.id} secili={var_} onClick={() => (var_ ? pano.kaldir(k.id) : pano.ekle(k.id, k.boyut))}>
            {var_ ? <IconCheck size={12} color={c.accentDark} /> : <IconPlus size={12} color={c.textSecondary} />}
            {k.ad}
          </Secenek>
        );
      });
  const moduller = kartDugmeleri("modul");
  const isKartlari = kartDugmeleri("is");
  const projeKartlari = kartDugmeleri("proje");

  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {SEKMELER.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSekme(s.key)}
            aria-pressed={sekme === s.key}
            style={{
              padding: "5px 11px",
              borderRadius: 8,
              border: "none",
              background: sekme === s.key ? c.background : "transparent",
              color: sekme === s.key ? c.textPrimary : c.textSecondary,
              fontSize: 14,
            }}
          >
            {t(s.label)}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={onKapat} style={{ padding: "5px 11px", borderRadius: 8, border: "none", background: c.accent, color: c.surface, fontSize: 14 }}>
          {t("Bitti")}
        </button>
      </div>

      {sekme === "kartlar" && (
        <>
          <Baslik>{t("Kartları sürükleyerek taşı; boyutu kartın altından seç.")}</Baslik>
          <Satirlar>{kartDugmeleri("temel")}</Satirlar>
          <Baslik>{t("Küçük araçlar")}</Baslik>
          <Satirlar>{kartDugmeleri("arac")}</Satirlar>
          {isKartlari.length > 0 && (
            <>
              <Baslik>{t("İş kartları")}</Baslik>
              <Satirlar>{isKartlari}</Satirlar>
            </>
          )}
          {projeKartlari.length > 0 && (
            <>
              <Baslik>{t("Proje kartları")}</Baslik>
              <Satirlar>{projeKartlari}</Satirlar>
            </>
          )}
          {moduller.length > 0 && (
            <>
              <Baslik>{t("Modül özetleri")}</Baslik>
              <Satirlar>{moduller}</Satirlar>
            </>
          )}
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={() => {
                if (!sifirlaOnay) return setSifirlaOnay(true);
                pano.sifirla();
                setSifirlaOnay(false);
              }}
              onBlur={() => setSifirlaOnay(false)}
              style={{ padding: 0, border: "none", background: "transparent", fontSize: 13, color: sifirlaOnay ? c.danger : c.textSecondary, textDecoration: "underline" }}
            >
              {sifirlaOnay ? t("Düzenin silinecek, emin misin?") : t("Varsayılan düzene dön")}
            </button>
          </div>
        </>
      )}

      {sekme === "gorunum" && (
        <>
          <Baslik>{t("Tema")}</Baslik>
          <Satirlar>
            <Secenek secili={theme.preference === "light"} onClick={() => theme.setPreference("light")}>{t("Aydınlık")}</Secenek>
            <Secenek secili={theme.preference === "dark"} onClick={() => theme.setPreference("dark")}>{t("Karanlık")}</Secenek>
            <Secenek secili={theme.preference === "system"} onClick={() => theme.setPreference("system")}>{t("Sistem")}</Secenek>
          </Satirlar>
          <Baslik>{t("Vurgu rengi")}</Baslik>
          <Satirlar>
            {(Object.keys(accentPresets) as (keyof typeof accentPresets)[]).map((key) => (
              <Secenek key={key} secili={theme.accentKey === key} onClick={() => theme.setAccentKey(key)} swatch={{ background: accentPresets[key][theme.mode].accent }}>
                {accentPresets[key].label}
              </Secenek>
            ))}
          </Satirlar>
          <Baslik>{t("Yazı boyutu")}</Baslik>
          <Satirlar>
            {FONT_SCALE_OPTIONS.map((o) => (
              <Secenek
                key={o}
                secili={yaziBoyu === o}
                onClick={() => {
                  setYaziBoyu(o);
                  setFontScaleOption(o);
                }}
              >
                {t(FONT_SCALE_LABELS[o])}
              </Secenek>
            ))}
          </Satirlar>
          <Baslik>{t("Kenar çubuğu rengi")}</Baslik>
          <Satirlar>
            <Secenek secili={theme.sidebarColorKey === "default"} onClick={() => theme.setSidebarColorKey("default")} swatch={{ background: c.primaryDark }}>
              {t("Varsayılan")}
            </Secenek>
            {(Object.keys(sidebarColorPresets) as Exclude<SidebarColorKey, "default">[]).map((key) => (
              <Secenek key={key} secili={theme.sidebarColorKey === key} onClick={() => theme.setSidebarColorKey(key)} swatch={{ background: sidebarColorPresets[key].value }}>
                {sidebarColorPresets[key].label}
              </Secenek>
            ))}
          </Satirlar>
          <Baslik>{t("Kenar çubuğu deseni")}</Baslik>
          <Satirlar>
            {(Object.keys(sidebarPatterns) as SidebarPatternKey[]).map((key) => (
              <Secenek key={key} secili={theme.sidebarPatternKey === key} onClick={() => theme.setSidebarPatternKey(key)}>
                {sidebarPatterns[key].label}
              </Secenek>
            ))}
          </Satirlar>
        </>
      )}

      {sekme === "davranis" && (
        <div style={{ marginTop: 8, maxWidth: 460 }}>
          <Anahtar ad={t("Kenar çubuğu açık başlasın")} acik={prefs.sidebarDefaultOpen} onChange={prefs.setSidebarDefaultOpen} />
          <Anahtar ad={t("Özet sayılar açık başlasın")} acik={prefs.statsOpen} onChange={prefs.setStatsOpen} />
          <Anahtar ad={t("Lio yardımcısı")} acik={prefs.showLio} onChange={prefs.setShowLio} />
          <Anahtar ad={t("Kim bu sayfada şeridi")} acik={prefs.showPresence} onChange={prefs.setShowPresence} />
          <Anahtar ad={t("Hareketi azalt")} acik={prefs.reduceMotion} onChange={prefs.setReduceMotion} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "7px 0", fontSize: 14, color: c.textPrimary }}>
            {t("Ana Sayfa düğmesi")}
            <Secenek secili={false} onClick={() => setHedefSeciliyor(true)}>{homeTarget.label}</Secenek>
          </div>
          <Link to="/settings" style={{ fontSize: 13, color: c.textSecondary, textDecoration: "underline" }}>
            {t("Tüm ayarlar")}
          </Link>
        </div>
      )}

      {hedefSeciliyor && <HomeTargetModal onClose={() => setHedefSeciliyor(false)} />}
    </div>
  );
}
