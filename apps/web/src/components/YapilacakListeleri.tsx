import { useCallback, useEffect, useState } from "react";
import type { PersonalBoardItem, YapilacakListesi } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { IconPlus, IconX } from "./icons";
import { onayla } from "../lib/onay";

/**
 * Yapılacaklar listeleri (migration 185): kanban sayfasının ve anasayfadaki
 * Yapılacaklar kartının sekmeleri. İkisi de bu dosyadan çizilir ki listeler
 * iki yerde aynı görünsün ve aynı davransın (kullanıcı isteği, 2026-11-09:
 * "anasayfa ve kanban bütünlük içinde olsun").
 *
 * Bir kart birden çok listede olabilir (oynatma listesi gibi); "Tümü" listesiz
 * görünümdür. Liste açıkken eklenen kart o listeye girer.
 */

export const yapilacakListeApi = {
  listele: () => api.get<YapilacakListesi[]>("/todos/listeler"),
  olustur: (ad: string) => api.post<YapilacakListesi>("/todos/listeler", { ad }),
  adlandir: (id: string, ad: string) => api.patch(`/todos/listeler/${id}`, { ad }),
  sil: (id: string) => api.delete(`/todos/listeler/${id}`),
  ekle: (id: string, ogeler: { source: string; itemId: string }[]) => api.post<{ eklenen: number }>(`/todos/listeler/${id}/ekle`, { ogeler }),
  cikar: (id: string, ogeler: { source: string; itemId: string }[]) => api.post(`/todos/listeler/${id}/cikar`, { ogeler }),
};

export function useYapilacakListeleri() {
  const [listeler, setListeler] = useState<YapilacakListesi[]>([]);
  const yukle = useCallback(() => {
    // Migration uygulanmamışsa uç boş döner ya da düşer: sekme şeridi yalnızca "Tümü" olur.
    yapilacakListeApi.listele().then(setListeler).catch(() => setListeler([]));
  }, []);
  useEffect(yukle, [yukle]);
  return {
    listeler,
    yukle,
    olustur: async (ad: string) => {
      const yeni = await yapilacakListeApi.olustur(ad);
      setListeler((l) => [...l, yeni]);
      return yeni;
    },
    adlandir: async (id: string, ad: string) => {
      setListeler((l) => l.map((x) => (x.id === id ? { ...x, ad } : x)));
      await yapilacakListeApi.adlandir(id, ad).catch(yukle);
    },
    sil: async (id: string) => {
      setListeler((l) => l.filter((x) => x.id !== id));
      await yapilacakListeApi.sil(id).catch(yukle);
    },
  };
}

/** Açık listeye göre kartlar; "" = Tümü. */
export function listedekiler<T extends Pick<PersonalBoardItem, "listeIdleri">>(ogeler: T[], listeId: string): T[] {
  return listeId ? ogeler.filter((o) => o.listeIdleri?.includes(listeId)) : ogeler;
}

/**
 * Sekme şeridi. `kucuk`: anasayfa kartındaki çip boyu; değilse sayfa boyu.
 * Seçili listeye çift tıklayınca adı değişir, yanındaki çarpı listeyi siler
 * (kartlar silinmez, yalnızca listeden çıkar).
 */
export function YapilacakListeSekmeleri({
  listeler,
  secili,
  onSec,
  sayilar,
  kucuk = false,
  onOlustur,
  onAdlandir,
  onSil,
}: {
  listeler: YapilacakListesi[];
  secili: string;
  onSec: (id: string) => void;
  /** Liste kimliği → kart sayısı; "" Tümü'nün sayısı. */
  sayilar?: Record<string, number>;
  kucuk?: boolean;
  onOlustur?: (ad: string) => Promise<YapilacakListesi>;
  onAdlandir?: (id: string, ad: string) => void;
  onSil?: (id: string) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [yeniAcik, setYeniAcik] = useState(false);
  const [yeniAd, setYeniAd] = useState("");
  const [duzenlenen, setDuzenlenen] = useState<string | null>(null);
  const [duzenAdi, setDuzenAdi] = useState("");

  const cip = (secik: boolean) =>
    ({
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      gap: 5,
      padding: kucuk ? "3px 10px" : "6px 13px",
      borderRadius: 999,
      border: `1px solid ${secik ? c.accent : c.border}`,
      background: secik ? c.accent : kucuk ? "transparent" : c.surface,
      color: secik ? c.surface : c.textSecondary,
      fontSize: kucuk ? 12 : 14,
      whiteSpace: "nowrap",
      maxWidth: 200,
    }) as const;
  const girdi = { ...cip(false), outline: "none", color: c.textPrimary, fontFamily: "inherit", width: kucuk ? 110 : 150 } as const;

  const yeniKaydet = async () => {
    const ad = yeniAd.trim();
    setYeniAcik(false);
    setYeniAd("");
    if (!ad || !onOlustur) return;
    try {
      const liste = await onOlustur(ad);
      onSec(liste.id);
    } catch {
      // Açılamadıysa (tavan, bağlantı) şerit eski hâlinde kalır.
    }
  };
  const adKaydet = () => {
    const ad = duzenAdi.trim();
    if (duzenlenen && ad) onAdlandir?.(duzenlenen, ad);
    setDuzenlenen(null);
  };

  const sekmeler = [{ id: "", ad: t("Tümü") }, ...listeler.map((l) => ({ id: l.id, ad: l.ad }))];
  return (
    <div className={`no-drag ${kucuk ? "pano-cipler" : "yapilacak-listeleri"}`} role="tablist" aria-label={t("Yapılacak listeleri")} style={kucuk ? undefined : { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, marginBottom: 14, alignItems: "center" }}>
      {sekmeler.map((s) => {
        const secik = s.id === secili;
        if (duzenlenen === s.id) {
          return (
            <input
              key={s.id}
              autoFocus
              value={duzenAdi}
              maxLength={60}
              onChange={(e) => setDuzenAdi(e.target.value)}
              onBlur={adKaydet}
              onKeyDown={(e) => {
                if (e.key === "Enter") adKaydet();
                if (e.key === "Escape") setDuzenlenen(null);
              }}
              aria-label={t("Liste adı")}
              style={girdi}
            />
          );
        }
        return (
          <span key={s.id || "tumu"} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <button
              type="button"
              role="tab"
              aria-selected={secik}
              title={s.id && onAdlandir ? t("Adını değiştirmek için çift tıkla") : s.ad}
              onClick={() => onSec(s.id)}
              onDoubleClick={() => {
                if (!s.id || !onAdlandir) return;
                setDuzenlenen(s.id);
                setDuzenAdi(s.ad);
              }}
              style={{ ...cip(secik), overflow: "hidden", textOverflow: "ellipsis" }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{s.ad}</span>
              {sayilar?.[s.id] !== undefined && <span style={{ opacity: 0.75 }}>{sayilar[s.id]}</span>}
            </button>
            {/* Çarpı ayrı düğme: sekme düğmesinin içinde ikinci bir tıklanır öğe olmasın. */}
            {secik && s.id && onSil && (
              <button
                type="button"
                aria-label={t("Listeyi sil")}
                title={t("Listeyi sil")}
                onClick={async () => {
                  if ((await onayla(t("\"{ad}\" listesi silinsin mi? İçindeki yapılacaklar silinmez.", { ad: s.ad })))) {
                    onSil(s.id);
                    onSec("");
                  }
                }}
                style={{ marginLeft: 3, width: kucuk ? 20 : 26, height: kucuk ? 20 : 26, padding: 0, borderRadius: "50%", border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >
                <IconX size={kucuk ? 10 : 12} color="currentColor" />
              </button>
            )}
          </span>
        );
      })}
      {onOlustur &&
        (yeniAcik ? (
          <input
            autoFocus
            value={yeniAd}
            maxLength={60}
            placeholder={t("Liste adı")}
            onChange={(e) => setYeniAd(e.target.value)}
            onBlur={() => void yeniKaydet()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void yeniKaydet();
              if (e.key === "Escape") {
                setYeniAcik(false);
                setYeniAd("");
              }
            }}
            aria-label={t("Liste adı")}
            style={girdi}
          />
        ) : (
          <button type="button" onClick={() => setYeniAcik(true)} title={t("Yeni liste")} aria-label={t("Yeni liste")} style={{ ...cip(false), borderStyle: "dashed" }}>
            <IconPlus size={kucuk ? 11 : 13} color="currentColor" />
            {!kucuk && t("Yeni liste")}
          </button>
        ))}
    </div>
  );
}
