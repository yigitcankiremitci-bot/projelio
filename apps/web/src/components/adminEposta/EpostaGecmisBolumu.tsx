import { useEffect, useState } from "react";
import type { EpostaHedefi, EpostaKampanyasi } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useLocale, useT } from "../../lib/i18n";
import { epostaYonetimi } from "../../api/epostaYonetimi";
import { birimYaz, dugme, kart, rozet } from "./stiller";
import { tarihYaz } from "./EpostaGonderBolumu";

/**
 * Admin > E-posta > Geçmiş: gönderilen ve kuyrukta bekleyen e-postalar.
 * Gönderim sürerken liste kendini 10 saniyede bir tazeliyor.
 */
export default function EpostaGecmisBolumu({ yenile }: { yenile: number }) {
  const c = useThemeColors();
  const t = useT();
  const { locale } = useLocale();
  const [liste, setListe] = useState<EpostaKampanyasi[] | null>(null);
  const [hata, setHata] = useState("");

  const yukle = () =>
    epostaYonetimi
      .kampanyalar()
      .then(setListe)
      .catch((err) => setHata(err instanceof Error ? err.message : t("Geçmiş yüklenemedi.")));

  useEffect(() => {
    void yukle();
  }, [yenile]);

  const suruyor = liste?.some((k) => k.durum === "bekliyor" || k.durum === "gonderiliyor");
  useEffect(() => {
    if (!suruyor) return;
    const z = setInterval(() => void yukle(), 10_000);
    return () => clearInterval(z);
  }, [suruyor]);

  const hedefYaz = (k: EpostaKampanyasi): string => {
    const h: EpostaHedefi = k.hedef;
    if (k.tur === "tekil") return k.aliciAdi || t("Tek kişi");
    if (h.tur === "herkes") return t("Herkes");
    if (h.tur === "yeni") return t("Son {gun} günde kayıt olanlar", { gun: h.gun });
    if (h.tur === "pasif") return t("{gun} gündür girmeyenler", { gun: h.gun });
    return t("{n} seçili kişi", { n: k.aliciSayisi });
  };

  const DURUM: Record<EpostaKampanyasi["durum"], string> = {
    bekliyor: t("Kuyrukta"),
    gonderiliyor: t("Gönderiliyor"),
    bitti: t("Bitti"),
    iptal: t("İptal edildi"),
  };

  if (hata) return <p style={{ color: c.danger, fontSize: 14 }}>{hata}</p>;
  if (!liste) return <span style={{ fontSize: 14, color: c.textSecondary }}>{t("Yükleniyor…")}</span>;
  if (liste.length === 0) return <p style={{ fontSize: 14, color: c.textSecondary }}>{t("Henüz e-posta gönderilmedi.")}</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {liste.map((k) => (
        <section key={k.id} style={{ ...kart(c), padding: 14 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <strong style={{ fontSize: 15, color: c.textPrimary }}>{k.konu}</strong>
            <span style={rozet(c, k.durum === "gonderiliyor" || planliBekliyor(k))}>
              {planliBekliyor(k)
                ? t("Planlandı: {zaman}", { zaman: tarihYaz(k.planlananAt!, locale) })
                : DURUM[k.durum]}
            </span>
            {k.lioIle && <span style={rozet(c, true)}>{t("Lio")}</span>}
          </div>
          <div style={{ fontSize: 13, color: c.textSecondary, marginTop: 4, lineHeight: 1.6 }}>
            {new Date(k.createdAt).toLocaleString(locale === "en" ? "en-GB" : "tr-TR")} · {hedefYaz(k)} ·{" "}
            {t("{g}/{n} gönderildi", { g: k.gonderilen, n: k.aliciSayisi })}
            {k.basarisiz > 0 && ` · ${t("{n} başarısız", { n: k.basarisiz })}`}
            {k.atlanan > 0 && ` · ${t("{n} atlandı", { n: k.atlanan })}`}
            {k.lioIle && ` · ${t("{birim} birim", { birim: birimYaz(k.birim ?? 0, locale) })}`}
          </div>
          {(k.durum === "bekliyor" || k.durum === "gonderiliyor") && (k.tur === "toplu" || planliBekliyor(k)) && (
            <button
              type="button"
              style={{ ...dugme(c, "tehlike"), padding: "5px 10px", fontSize: 13, marginTop: 8 }}
              onClick={() => {
                const soru = planliBekliyor(k)
                  ? t("Planlanan gönderim iptal edilsin mi?")
                  : t("Kalan alıcılara gönderim durdurulsun mu?");
                if (window.confirm(soru))
                  void epostaYonetimi.kampanyaIptal(k.id).then(() => yukle());
              }}
            >
              {planliBekliyor(k) ? t("Planı iptal et") : t("Gönderimi durdur")}
            </button>
          )}
        </section>
      ))}
    </div>
  );
}

/** Zamanı henüz gelmemiş planlı gönderim. */
function planliBekliyor(k: EpostaKampanyasi): boolean {
  if (k.durum !== "bekliyor" || !k.planlananAt) return false;
  const an = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(k.planlananAt) ? k.planlananAt : `${k.planlananAt}Z`);
  return an.getTime() > Date.now();
}
