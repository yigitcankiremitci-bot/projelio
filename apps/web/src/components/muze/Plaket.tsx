import { useEffect } from "react";
import { Link } from "react-router-dom";
import { katkilariDiz, teslimSonucu, type MuzePlaketi, type Translate } from "@projelio/shared";
import { coverBackground, hasCover } from "../../lib/covers";
import { useT } from "../../lib/i18n";
import { bicimDili } from "../../lib/i18n/depo";
import { Z } from "../../lib/layout";
import "./Muze.css";

/**
 * Müze plaketi (bkz. packages/shared/src/muze.ts). Plaket değiştirilemez:
 * burada hiçbir düzenleme düğmesi yok, tek çıkış "Arşivde aç" — projenin
 * düzenlenebilir hâli.
 */

function tarihYaz(iso: string | undefined, gunlu = true): string {
  if (!iso) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return d.toLocaleDateString(bicimDili(), gunlu ? { day: "numeric", month: "long", year: "numeric" } : { month: "long", year: "numeric" });
}

export function teslimMetni(p: Pick<MuzePlaketi, "teslimFarkiGun" | "tahminiTarih">, t: Translate): string | null {
  // Bitiş anı tahminse teslime göre fark da tahmindir: plakete yazılmaz.
  if (p.tahminiTarih) return null;
  const s = teslimSonucu(p.teslimFarkiGun);
  if (!s) return null;
  if (s.tur === "tam") return t("Teslim gününde bitti");
  return s.tur === "erken" ? t("Teslimden {n} gün önce bitti", { n: s.gun }) : t("Teslimden {n} gün sonra bitti", { n: s.gun });
}

function Madalyon({ p }: { p: MuzePlaketi }) {
  const foto = hasCover(p.kapak) && !p.kapak?.startsWith("preset:");
  return (
    <div
      className="muze-madalyon"
      style={{ background: foto ? `center / cover no-repeat url("${p.kapak}")` : coverBackground(p.kapak, p.projectId) }}
      aria-hidden
    >
      {foto ? null : (p.projeAdi.trim()[0] ?? "").toLocaleUpperCase("tr")}
    </div>
  );
}

/** Müze ızgarasındaki plaket. Tıklanınca büyük hâli açılır. */
export function PlaketKucuk({ p, onAc }: { p: MuzePlaketi; onAc: () => void }) {
  const t = useT();
  const teslim = teslimMetni(p, t);
  return (
    <button type="button" className="muze-levha muze-kucuk" onClick={onAc} aria-label={t("{ad} plaketini aç", { ad: p.projeAdi })}>
      <div className="muze-plaket">
        <span className="muze-vida-alt" />
        <Madalyon p={p} />
        <div className="muze-baslik muze-kazi" style={{ fontSize: 18 }}>
          {p.projeAdi}
        </div>
        {p.isAdi && (
          <div className="muze-kazi" style={{ fontSize: 13, opacity: 0.85 }}>
            {p.isAdi}
          </div>
        )}
        <div className="muze-cizgi" />
        <div className="muze-kazi" style={{ fontSize: 14, fontWeight: 600 }}>
          {t("{n} gün sürdü", { n: p.sureGun })}
        </div>
        {teslim && (
          <div className="muze-kazi" style={{ fontSize: 13, marginTop: 2 }}>
            {teslim}
          </div>
        )}
        <div className="muze-kazi muze-ust-yazi" style={{ marginTop: 10 }}>
          {tarihYaz(p.bitis, !p.tahminiTarih)}
        </div>
      </div>
    </button>
  );
}

/** Plaketin büyük, okunur hâli: bütün bilgiler kazılı yazı gibi. */
export function PlaketDetay({ p, onKapat }: { p: MuzePlaketi; onKapat: () => void }) {
  const t = useT();
  const teslim = teslimMetni(p, t);
  const katkilar = katkilariDiz(p.katkilar);

  useEffect(() => {
    const kapat = (e: KeyboardEvent) => e.key === "Escape" && onKapat();
    window.addEventListener("keydown", kapat);
    return () => window.removeEventListener("keydown", kapat);
  }, [onKapat]);

  const arsivYolu =
    p.projeDurumu === "tamamlandi" || p.projeDurumu === "yeniden_acildi"
      ? `/projects/${p.projectId}`
      : p.projeDurumu === "arsivde"
        ? "/settings/archive"
        : null;

  const sayilar = [
    t("{n} görev", { n: p.gorevSayisi }),
    p.ciktiSayisi ? t("{n} çıktı", { n: p.ciktiSayisi }) : null,
    p.paylasimSayisi ? t("{n} paylaşım", { n: p.paylasimSayisi }) : null,
  ].filter(Boolean);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={p.projeAdi}
      onClick={onKapat}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z.modal,
        background: "rgba(12, 8, 4, 0.62)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        overflowY: "auto",
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 520, margin: "auto" }}>
        <div className="muze-levha" style={{ padding: 14 }}>
          <div className="muze-plaket" style={{ padding: "30px 26px 24px" }}>
            <span className="muze-vida-alt" />
            <div className="muze-kazi muze-ust-yazi">{t("Projelio Müzesi")}</div>
            <div style={{ height: 14 }} />
            <Madalyon p={p} />
            <div className="muze-baslik muze-kazi" style={{ fontSize: 26 }}>
              {p.projeAdi}
            </div>
            {p.isAdi && (
              <div className="muze-kazi" style={{ fontSize: 15, opacity: 0.85 }}>
                {p.isAdi}
              </div>
            )}

            <div className="muze-cizgi" />

            <div className="muze-kazi" style={{ fontSize: 15 }}>
              {p.baslangic ? `${tarihYaz(p.baslangic)} – ` : ""}
              {tarihYaz(p.bitis, !p.tahminiTarih)}
            </div>
            <div className="muze-kazi" style={{ fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif", marginTop: 6 }}>
              {t("{n} gün sürdü", { n: p.sureGun })}
            </div>
            {teslim && (
              <div className="muze-kazi" style={{ fontSize: 15, marginTop: 2 }}>
                {teslim}
              </div>
            )}
            <div className="muze-kazi" style={{ fontSize: 14, marginTop: 8 }}>
              {sayilar.join(" · ")}
            </div>

            {katkilar.length > 0 && (
              <>
                <div className="muze-cizgi" />
                <div className="muze-kazi muze-ust-yazi" style={{ marginBottom: 8 }}>
                  {t("Emeği geçenler")}
                </div>
                <div className="muze-katkilar muze-kazi">
                  {katkilar.map((k, i) => (
                    <span key={k.userId ?? `eski-${i}`}>
                      {k.userId ? k.ad : t("Eski ekip üyesi")}
                      {k.gorev > 0 && (
                        <span style={{ fontSize: 12, opacity: 0.75 }}> · {t("{n} görev", { n: k.gorev })}</span>
                      )}
                    </span>
                  ))}
                </div>
              </>
            )}

            {p.sira && p.siraKapsami && (
              <>
                <div className="muze-cizgi" />
                <div className="muze-kazi" style={{ fontSize: 14, fontStyle: "italic", fontFamily: "Georgia, serif" }}>
                  {p.siraKapsami === "organizasyon"
                    ? t("Bu şirketin {n}. tamamlanan projesi", { n: p.sira })
                    : t("Bu işin {n}. tamamlanan projesi", { n: p.sira })}
                </div>
              </>
            )}

            {p.tahminiTarih && (
              <div className="muze-kazi" style={{ fontSize: 11, marginTop: 12, opacity: 0.7 }}>
                {t("Bu proje müzeden önce bittiği için bitiş tarihi son biten görevden tahmin edildi.")}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          {arsivYolu && (
            <Link to={arsivYolu} style={dugme(true)}>
              {t("Arşivde aç")}
            </Link>
          )}
          <button type="button" onClick={onKapat} style={dugme(false)}>
            {t("Kapat")}
          </button>
        </div>
        {p.projeDurumu === "yeniden_acildi" && (
          <p style={{ textAlign: "center", color: "#f1e2c8", fontSize: 13, margin: "10px 0 0" }}>
            {t("Proje sonradan yeniden açıldı; plaket bittiği günkü hâliyle duruyor.")}
          </p>
        )}
      </div>
    </div>
  );
}

function dugme(birincil: boolean): React.CSSProperties {
  return {
    padding: "9px 18px",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
    border: birincil ? "none" : "1px solid rgba(241, 226, 200, 0.5)",
    background: birincil ? "linear-gradient(135deg, #dcb27a, #a0703a)" : "transparent",
    color: birincil ? "#2c1b0e" : "#f1e2c8",
  };
}
