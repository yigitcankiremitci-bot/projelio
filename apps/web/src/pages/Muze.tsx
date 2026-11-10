import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { muzeOzeti, plaketYili, type MuzePlaketi } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { IconArchive } from "../components/icons";
import { PlaketDetay, PlaketKucuk } from "../components/muze/Plaket";

/**
 * MÜZE — biten projelerin plaketleri (migration 189, packages/shared/src/muze.ts).
 *
 * Plaket bitiş anının kopyasıdır ve değiştirilemez; bu sayfada düzenleme yok.
 * Projenin düzenlenebilir hâli Arşiv > Biten projeler'de (plaketteki
 * "Arşivde aç" ve sayfanın başındaki "Arşive git" oraya götürür).
 * 3D ofisteki müze odası aynı veriyi gösterir.
 *
 * `?plaket=<plaket ya da proje kimliği>` plaketi doğrudan büyük açar (Arşiv'den
 * ve 3D'den gelen bağlantılar).
 */
export default function Muze() {
  const c = useThemeColors();
  const t = useT();
  const [plaketler, setPlaketler] = useState<MuzePlaketi[] | null>(null);
  const [hata, setHata] = useState(false);
  const [is, setIs] = useState("");
  const [yil, setYil] = useState("");
  const [arama, setArama] = useSearchParams();
  const acikId = arama.get("plaket");

  useEffect(() => {
    api
      .get<MuzePlaketi[]>("/muze")
      .then(setPlaketler)
      .catch(() => setHata(true));
  }, []);

  const isler = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of plaketler ?? []) if (p.jobId && p.isAdi) m.set(p.jobId, p.isAdi);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "tr"));
  }, [plaketler]);

  const yillar = useMemo(
    () => [...new Set((plaketler ?? []).map((p) => plaketYili(p.bitis)))].sort((a, b) => b - a),
    [plaketler]
  );

  const gorunen = useMemo(
    () =>
      (plaketler ?? []).filter(
        (p) => (!is || p.jobId === is) && (!yil || String(plaketYili(p.bitis)) === yil)
      ),
    [plaketler, is, yil]
  );

  const ozet = muzeOzeti(gorunen);
  const acik = acikId ? plaketler?.find((p) => p.id === acikId || p.projectId === acikId) : undefined;

  const ac = (p: MuzePlaketi) => setArama({ plaket: p.id });
  const kapat = useCallback(() => setArama({}, { replace: true }), [setArama]);

  const secim: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
    fontSize: 14,
    maxWidth: "100%",
  };

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: "28px 16px 120px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 28, color: c.textPrimary, fontFamily: "Georgia, serif" }}>{t("Müze")}</h1>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: c.textSecondary, lineHeight: 1.5, maxWidth: 620 }}>
              {t(
                "Biten projelerin plaketleri. Her plaket projenin bittiği anın kopyasıdır ve değiştirilemez; projenin düzenlenebilir hâli Arşiv'de."
              )}
            </p>
          </div>
          <Link
            to="/settings/archive"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: c.surface,
              color: c.textPrimary,
              fontSize: 15,
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            <IconArchive size={16} color={c.textPrimary} />
            {t("Arşive git")}
          </Link>
        </div>

        {hata && <p style={{ color: c.danger, fontSize: 15, marginTop: 24 }}>{t("Müze yüklenemedi. Sayfayı yenileyip tekrar dene.")}</p>}
        {!plaketler && !hata && <p style={{ color: c.textSecondary, fontSize: 15, marginTop: 24 }}>{t("Yükleniyor…")}</p>}

        {plaketler && plaketler.length === 0 && (
          <div
            style={{
              marginTop: 28,
              border: `1px dashed ${c.border}`,
              borderRadius: 12,
              padding: 40,
              textAlign: "center",
              color: c.textSecondary,
              fontSize: 16,
            }}
          >
            {t("Müzede henüz plaket yok. Bir projeyi tamamladığında plaketi burada yerini alır.")}
          </div>
        )}

        {plaketler && plaketler.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "22px 0 8px" }}>
              {[
                t("{n} proje", { n: ozet.proje }),
                t("{n} kişinin emeği", { n: ozet.kisi }),
                t("{n} görev", { n: ozet.gorev }),
                t("toplam {n} gün", { n: ozet.gun }),
              ].map((m) => (
                <span
                  key={m}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    background: c.surface,
                    border: `1px solid ${c.border}`,
                    color: c.textPrimary,
                    fontSize: 14,
                  }}
                >
                  {m}
                </span>
              ))}
            </div>

            {(isler.length > 1 || yillar.length > 1) && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "14px 0 6px" }}>
                {isler.length > 1 && (
                  <select value={is} onChange={(e) => setIs(e.target.value)} style={secim} aria-label={t("İş")}>
                    <option value="">{t("Tüm işler")}</option>
                    {isler.map(([id, ad]) => (
                      <option key={id} value={id}>
                        {ad}
                      </option>
                    ))}
                  </select>
                )}
                {yillar.length > 1 && (
                  <select value={yil} onChange={(e) => setYil(e.target.value)} style={secim} aria-label={t("Yıl")}>
                    <option value="">{t("Tüm yıllar")}</option>
                    {yillar.map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="muze-izgara" style={{ marginTop: 18 }}>
              {gorunen.map((p) => (
                <PlaketKucuk key={p.id} p={p} onAc={() => ac(p)} />
              ))}
            </div>
          </>
        )}
      </div>

      {acik && <PlaketDetay p={acik} onKapat={kapat} />}
    </div>
  );
}
