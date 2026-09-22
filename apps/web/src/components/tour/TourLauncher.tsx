/**
 * Her sayfada sağ üstte duran "?" düğmesi: en üstte başlangıç rehberi (örnek
 * iş kartlarını ve temel kavramları anlatan yardım listesi), altında sesli
 * anlatımlar — önce bu sayfaya ait olanlar, sonra diğerleri.
 *
 * Menü yeni üyelerde ve çok az vakit geçirmiş, geri dönen kullanıcılarda
 * KENDİLİĞİNDEN açılır (kural: lib/baslangicRehberi.ts). Uygulamayı biraz
 * kullanmış biri rehberi ancak "?"ye basınca görür.
 */

import { useEffect, useRef, useState } from "react";
import { TOP_CHROME, Z, safeTop } from "../../lib/layout";
import { useThemeColors } from "../../theme/useThemeColors";
import { useTour } from "../../lib/tour/TourContext";
import { AREA_LABELS, tourAnchor } from "../../lib/tour/types";
import { IconCheck, IconX } from "../icons";
import { useT } from "../../lib/i18n";
import { api } from "../../api/client";
import {
  ILK_TUR_KIMLIGI,
  REHBER_KAPALI_KIMLIGI,
  rehberKendiligindenAcilsinMi,
} from "../../lib/baslangicRehberi";
import BaslangicRehberi from "./BaslangicRehberi";

/** Rehberin bu tarayıcı oturumunda kendiliğinden açıldığını tutan anahtar. */
const OTURUM_ANAHTARI = "projelio_rehber_acildi_v1";

function oturumdaAcildiMi(): boolean {
  try {
    return sessionStorage.getItem(OTURUM_ANAHTARI) === "1";
  } catch {
    return false;
  }
}

export default function TourLauncher() {
  const c = useThemeColors();
  const t = useT();
  const { toursHere, allTours, seen, markSeen, start, tour, voiceEnabled, setVoiceEnabled } = useTour();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [toplamSaniye, setToplamSaniye] = useState<number | null>(null);
  const [kendiligindenAcildi, setKendiligindenAcildi] = useState(false);
  const rehberKapali = seen.includes(REHBER_KAPALI_KIMLIGI);

  useEffect(() => {
    api
      .get<{ toplamSaniye: number }>("/users/me/yardim-durumu")
      .then((r) => setToplamSaniye(r.toplamSaniye))
      // Sunucu cevap vermezse kendiliğinden açılmıyor: emin olmadığımız bir
      // durumda her girişte açılan bir liste, açılmamasından daha kötü.
      .catch(() => setToplamSaniye(null));
  }, []);

  useEffect(() => {
    const ac = rehberKendiligindenAcilsinMi({
      toplamSaniye,
      kapatildi: rehberKapali,
      buOturumdaAcildi: oturumdaAcildiMi(),
      turSuruyor: Boolean(tour),
      ilkTurGoruldu: seen.includes(ILK_TUR_KIMLIGI),
    });
    if (!ac) return;
    try {
      sessionStorage.setItem(OTURUM_ANAHTARI, "1");
    } catch {
      /* depolama kapalıysa bu oturumda bir kez daha açılabilir; zararsız */
    }
    setKendiligindenAcildi(true);
    setOpen(true);
  }, [toplamSaniye, rehberKapali, tour, seen]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Tur başlarken liste kapanmalı, aksi halde spot ışığının önünde duruyor.
  useEffect(() => {
    if (tour) setOpen(false);
  }, [tour]);

  const others = allTours.filter((t) => !toursHere.some((x) => x.id === t.id));

  const renderRow = (id: string, title: string, description: string, area: string) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setOpen(false);
        start(id);
      }}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        border: "none",
        borderRadius: 10,
        background: "transparent",
        cursor: "pointer",
      }}
    >
      <span
        aria-hidden
        style={{
          marginTop: 2,
          width: 22,
          height: 22,
          borderRadius: 6,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: seen.includes(id) ? "transparent" : c.accent,
          border: seen.includes(id) ? `1px solid ${c.border}` : "none",
        }}
      >
        {seen.includes(id) ? <IconCheck size={12} color={c.textSecondary} /> : <span style={{ color: "#fff", fontSize: 12 }}>▶</span>}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: c.textPrimary }}>{title}</span>
        <span style={{ display: "block", fontSize: 12.5, color: c.textSecondary, marginTop: 2 }}>{description}</span>
        <span style={{ display: "block", fontSize: 11, color: c.textSecondary, marginTop: 3, opacity: 0.8 }}>{area}</span>
      </span>
    </button>
  );

  return (
    <div ref={ref} style={{ position: "fixed", top: safeTop(TOP_CHROME.top), right: 62, zIndex: Z.topChrome }}>
      <button
        type="button"
        {...tourAnchor("tour-launcher")}
        onClick={() => setOpen((v) => !v)}
        aria-label={t("Yardım")}
        title={t("Yardım")}
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: c.surface,
          border: `1px solid ${c.border}`,
          boxShadow: "0 2px 8px rgba(26,31,41,0.12)",
          cursor: "pointer",
          color: c.textSecondary,
          fontSize: 18,
          fontWeight: 600,
          padding: 0,
        }}
      >
        ?
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 48,
            right: 0,
            width: 360,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "75vh",
            overflowY: "auto",
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 14,
            boxShadow: "0 12px 32px rgba(15,18,25,0.18)",
            padding: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 8px" }}>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: c.textPrimary }}>{t("Yardım")}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("Kapat")}
              style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4, lineHeight: 0 }}
            >
              <IconX size={15} color={c.textSecondary} />
            </button>
          </div>

          <div style={{ fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", color: c.textSecondary, padding: "2px 10px 4px" }}>
            {t("Başlangıç rehberi")}
          </div>
          <BaslangicRehberi onEylem={() => setOpen(false)} turuBaslat={start} />
          {kendiligindenAcildi && !rehberKapali && (
            <button
              type="button"
              onClick={() => {
                markSeen(REHBER_KAPALI_KIMLIGI);
                setOpen(false);
              }}
              style={{
                display: "block",
                margin: "4px 10px 2px",
                padding: 0,
                border: "none",
                background: "transparent",
                color: c.textSecondary,
                fontSize: 12.5,
                textDecoration: "underline",
                cursor: "pointer",
              }}
            >
              {t("Bu listeyi bir daha kendiliğinden açma")}
            </button>
          )}

          <div style={{ height: 1, background: c.border, margin: "10px 8px 8px" }} />
          <div style={{ fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", color: c.textSecondary, padding: "2px 10px 6px" }}>
            {t("Sesli anlatım")}
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              margin: "0 2px 6px",
              borderRadius: 10,
              background: c.background,
              fontSize: 13,
              color: c.textSecondary,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={voiceEnabled}
              onChange={(e) => setVoiceEnabled(e.target.checked)}
              style={{ width: 15, height: 15, margin: 0 }}
            />
            {t("Anlatımı sesli dinle")}
          </label>

          {toursHere.length > 0 && (
            <>
              <div style={{ fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", color: c.textSecondary, padding: "6px 10px 4px" }}>
                {t("Bu sayfa")}
              </div>
              {toursHere.map((tur) => renderRow(tur.id, t(tur.title), t(tur.description), t(AREA_LABELS[tur.area])))}
            </>
          )}

          {others.length > 0 && (
            <>
              <div style={{ fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", color: c.textSecondary, padding: "10px 10px 4px" }}>
                {t("Diğer anlatımlar")}
              </div>
              {others.map((tur) => renderRow(tur.id, t(tur.title), t(tur.description), t(AREA_LABELS[tur.area])))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
