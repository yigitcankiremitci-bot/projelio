import { useState } from "react";
import type { ReactNode } from "react";
import { accentPresets } from "@projelio/shared";
import { useT } from "../../lib/i18n";
import { useTheme } from "../../theme/ThemeProvider";
import { useThemeColors } from "../../theme/useThemeColors";
import { IconInfo, IconX } from "../icons";

/**
 * Sosyal medya modülünün gezinme parçaları: renkli ana sekmeler, ikonlu alt
 * sekmeler, bölüm başlığı ve ilk kullanım rehberi.
 *
 * NEDEN: modül büyüdükçe (takvim, hesaplar, analiz, ilerleyiş, rakipler, ilham,
 * fikirler) her şey aynı gri tonda, 12 px'lik çiplerle ayrılıyordu; ilk kez
 * gelen biri hangi düğmenin sekme, hangisinin eylem olduğunu ayırt edemiyordu
 * (kullanıcı geri bildirimi, 2026-10-06). Her bölümün KENDİ rengi var ve o
 * renk sekmesinde, başlığında ve vurgularında tekrar ediyor — renk "neredeyim"
 * sorusunun cevabı.
 *
 * Renkler sabit hex değil: theme.ts'deki vurgu ön ayarlarının (bronz, lacivert,
 * çam, bordo) etkin tema modundaki tonları. Böylece koyu temada da okunur
 * kalıyorlar ve paletin dışına çıkılmıyor.
 */

export type Bolum = "takvim" | "hesaplar" | "analiz" | "gonderiler" | "ilerleyis" | "rakipler" | "ilham" | "fikirler";

export function useBolumRenkleri(): Record<Bolum, string> {
  const { mode } = useTheme();
  const c = useThemeColors();
  const ton = (k: keyof typeof accentPresets) => accentPresets[k][mode].accent;
  return {
    takvim: ton("indigo"),
    hesaplar: ton("pine"),
    analiz: ton("bronze"),
    gonderiler: ton("bronze"),
    ilerleyis: ton("indigo"),
    rakipler: ton("wine"),
    ilham: ton("pine"),
    fikirler: c.success,
  };
}

export interface SekmeSecenegi<T extends string> {
  deger: T;
  baslik: string;
  aciklama?: string;
  ikon: ReactNode;
  renk: string;
  /** Başlığın yanındaki küçük sayı (ör. hesap sayısı). */
  rozet?: string | number;
}

/**
 * Ana sekmeler: kart gibi, ikon + başlık + tek satır açıklama. Seçili olan
 * kendi renginde dolgulu ve üstünde renkli şerit — çipten çok "bölüm".
 */
export function AnaSekmeler<T extends string>({
  secenekler,
  secili,
  onSec,
}: {
  secenekler: SekmeSecenegi<T>[];
  secili: T;
  onSec: (deger: T) => void;
}) {
  const c = useThemeColors();
  return (
    <div
      role="tablist"
      style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 }}
    >
      {secenekler.map((s) => {
        const aktif = s.deger === secili;
        return (
          <button
            key={s.deger}
            type="button"
            role="tab"
            aria-selected={aktif}
            onClick={() => onSec(s.deger)}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 12,
              cursor: "pointer",
              textAlign: "left",
              overflow: "hidden",
              border: `1px solid ${aktif ? s.renk : c.border}`,
              background: aktif ? `${s.renk}1F` : c.surface,
              boxShadow: aktif ? `0 2px 10px ${s.renk}26` : "none",
              transition: "background 120ms, border-color 120ms",
            }}
          >
            {/* Seçili sekmenin üst kenarı: rengin en belirgin olduğu yer. */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                height: 3,
                background: aktif ? s.renk : "transparent",
              }}
            />
            <span
              style={{
                width: 34,
                height: 34,
                flexShrink: 0,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: aktif ? s.renk : `${s.renk}1F`,
                color: aktif ? c.surface : s.renk,
              }}
            >
              {s.ikon}
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: aktif ? s.renk : c.textPrimary,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {s.baslik}
                {s.rozet !== undefined && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "0 6px",
                      borderRadius: 999,
                      background: `${s.renk}26`,
                      color: s.renk,
                    }}
                  >
                    {s.rozet}
                  </span>
                )}
              </span>
              {s.aciklama && (
                <span
                  style={{
                    fontSize: 11,
                    color: c.textSecondary,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {s.aciklama}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Alt sekmeler: ikonlu hap düğmeler; seçilinin açıklaması altta bir satır
 * olarak durur — "bu bölümde ne yapılır" sorusu sekmeye tıklamadan cevaplanır.
 */
export function AltSekmeler<T extends string>({
  secenekler,
  secili,
  onSec,
}: {
  secenekler: SekmeSecenegi<T>[];
  secili: T;
  onSec: (deger: T) => void;
}) {
  const c = useThemeColors();
  const aktif = secenekler.find((s) => s.deger === secili);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div role="tablist" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {secenekler.map((s) => {
          const secilmis = s.deger === secili;
          return (
            <button
              key={s.deger}
              type="button"
              role="tab"
              aria-selected={secilmis}
              onClick={() => onSec(s.deger)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: secilmis ? 600 : 500,
                padding: "6px 12px",
                borderRadius: 999,
                cursor: "pointer",
                border: `1px solid ${secilmis ? s.renk : c.border}`,
                background: secilmis ? s.renk : "transparent",
                color: secilmis ? c.surface : c.textPrimary,
              }}
            >
              <span style={{ display: "flex", color: secilmis ? c.surface : s.renk }}>{s.ikon}</span>
              {s.baslik}
              {s.rozet !== undefined && (
                <span style={{ fontSize: 11, opacity: 0.8 }}>{s.rozet}</span>
              )}
            </button>
          );
        })}
      </div>
      {aktif?.aciklama && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            fontSize: 12,
            lineHeight: 1.5,
            color: c.textSecondary,
            padding: "8px 10px",
            borderRadius: 8,
            background: `${aktif.renk}12`,
            borderLeft: `3px solid ${aktif.renk}`,
          }}
        >
          <span style={{ display: "flex", color: aktif.renk, marginTop: 1 }}>
            <IconInfo size={14} />
          </span>
          <span>{aktif.aciklama}</span>
        </div>
      )}
    </div>
  );
}

/** Kartın başlığı: renkli ikon kutusu + başlık + isteğe bağlı açıklama ve sağ eylem. */
export function BolumBasligi({
  ikon,
  renk,
  baslik,
  aciklama,
  sag,
}: {
  ikon: ReactNode;
  renk: string;
  baslik: string;
  aciklama?: string;
  sag?: ReactNode;
}) {
  const c = useThemeColors();
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${renk}1F`,
          color: renk,
        }}
      >
        {ikon}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, flex: "1 1 200px", minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary }}>{baslik}</span>
        {aciklama && <span style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.45 }}>{aciklama}</span>}
      </div>
      {sag}
    </div>
  );
}

/**
 * İlk kullanım rehberi: numaralı kısa adımlar, kapatılabilir. Kapatma bu
 * tarayıcıda hatırlanır (yalnızca kolaylık — silinirse rehber yeniden görünür).
 */
export function IlkKullanimRehberi({
  anahtar,
  baslik,
  adimlar,
  renk,
}: {
  anahtar: string;
  baslik: string;
  adimlar: { baslik: string; aciklama: string }[];
  renk: string;
}) {
  const c = useThemeColors();
  const t = useT();
  const depoAnahtari = `projelio.rehber.${anahtar}`;
  const [kapali, setKapali] = useState(() => {
    try {
      return window.localStorage.getItem(depoAnahtari) === "1";
    } catch {
      return false;
    }
  });
  if (kapali) return null;
  const kapat = () => {
    setKapali(true);
    try {
      window.localStorage.setItem(depoAnahtari, "1");
    } catch {
      // gizli pencere vb.: yalnızca bu oturumda kapalı kalır
    }
  };
  return (
    <div
      style={{
        border: `1px solid ${renk}55`,
        background: `${renk}10`,
        borderRadius: 12,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary, flex: 1 }}>{baslik}</span>
        <button
          type="button"
          onClick={kapat}
          aria-label={t("Kapat")}
          style={{ display: "flex", background: "transparent", border: "none", cursor: "pointer", color: c.textSecondary }}
        >
          <IconX size={16} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        {adimlar.map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                background: renk,
                color: c.surface,
              }}
            >
              {i + 1}
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>{a.baslik}</span>
              <span style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.45 }}>{a.aciklama}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
