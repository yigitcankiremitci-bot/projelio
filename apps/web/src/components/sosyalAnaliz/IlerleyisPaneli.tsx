import { useEffect, useMemo, useState } from "react";
import type { SocialAccountMediaItem, SocialAnalyticsAccount, SocialProgressData } from "@projelio/shared";
import { haftalikYayin } from "@projelio/shared";
import { socialMediaApi, type SocialScope } from "../../api/socialMedia";
import { parseServerDate } from "../../lib/dates";
import { useT } from "../../lib/i18n";
import { bicimDili, yuzde } from "../../lib/i18n/depo";
import { CizgiGrafik, CubukGrafik } from "./grafikler";
import { useBolumRenkleri } from "./gezinme";
import { kisaSayi, useAnalizStilleri } from "./ortak";

interface Props {
  scope: SocialScope;
  hesaplar: SocialAnalyticsAccount[];
  medya: SocialAccountMediaItem[];
}

const DONEMLER = [30, 90, 180] as const;

/** "2026-10-05" → yerel kısa tarih ("5 Eki"). Gün UTC; saat eklenmez ki kaymasın. */
function gunYazisi(gun: string, uzun = false): string {
  return new Date(`${gun}T12:00:00Z`).toLocaleDateString(bicimDili(), {
    day: "numeric",
    month: "short",
    ...(uzun ? { weekday: "short" as const } : {}),
  });
}

/** Tarayıcının yerel saatinde haftanın pazartesisi. */
function pazartesi(iso: string): string {
  const d = parseServerDate(iso);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Sosyal Medya > Analiz > İlerleyiş.
 *
 * Üç soru:
 *   Takipçi                 hesap büyüyor mu
 *   Günlük kazanılan izlenme bütün içerikler bugün ne kadar izlendi (geçmiş
 *                           tablosundaki ardışık okumaların farkı)
 *   Haftalık yayın          hangi hafta attıklarım daha çok izlendi (gönderilerin
 *                           BUGÜNKÜ değerinden — geçmiş gerektirmez)
 *
 * İlk ikisi migration 147'den sonra birikmeye başlar; Instagram geçmiş değer
 * vermiyor. Boş grafik bunu söyler, "hata" gibi görünmez.
 */
export default function IlerleyisPaneli({ scope, hesaplar, medya }: Props) {
  const t = useT();
  const { c, kart } = useAnalizStilleri();
  const renk = useBolumRenkleri().ilerleyis;
  const [gun, setGun] = useState<(typeof DONEMLER)[number]>(30);
  const [hesap, setHesap] = useState("");
  const [veri, setVeri] = useState<SocialProgressData | null>(null);
  const [hata, setHata] = useState("");

  useEffect(() => {
    let iptal = false;
    setHata("");
    socialMediaApi
      .ilerleyis(scope, gun, hesap || undefined)
      .then((v) => !iptal && setVeri(v))
      .catch((err) => !iptal && setHata(err instanceof Error ? err.message : t("Grafikler yüklenemedi")));
    return () => {
      iptal = true;
    };
  }, [scope, gun, hesap, t]);

  const secilenMedya = useMemo(() => (hesap ? medya.filter((m) => m.accountId === hesap) : medya), [medya, hesap]);
  const haftalar = useMemo(() => haftalikYayin(secilenMedya, pazartesi, 12), [secilenMedya]);

  const gunluk = veri?.gunlukIzlenme ?? [];
  const ozet = useMemo(() => {
    const son7 = gunluk.slice(-7).reduce((t, n) => t + n.deger, 0);
    const onceki7 = gunluk.length >= 14 ? gunluk.slice(-14, -7).reduce((t, n) => t + n.deger, 0) : null;
    const degisim = onceki7 ? ((son7 - onceki7) / onceki7) * 100 : null;
    return { son7, degisim, gunSayisi: Math.min(7, gunluk.length) };
  }, [gunluk]);

  const takipciSerileri = useMemo(() => {
    const seriler = new Map<string, { gun: string; deger: number }[]>();
    for (const n of veri?.takipci ?? []) {
      const liste = seriler.get(n.accountId) ?? [];
      liste.push({ gun: n.gun, deger: n.deger });
      seriler.set(n.accountId, liste);
    }
    return hesaplar
      .filter((h) => seriler.has(h.accountId))
      .map((h) => ({ hesap: h, noktalar: seriler.get(h.accountId)! }));
  }, [veri, hesaplar]);

  const birikiyor = veri?.ilkKayit
    ? t("Geçmiş {tarih} tarihinden beri kaydediliyor; grafikler her gün dolacak.", {
        tarih: parseServerDate(veri.ilkKayit).toLocaleDateString(bicimDili(), { day: "numeric", month: "long" }),
      })
    : t("Geçmiş kaydı yeni başladı: Instagram eski günlerin değerini vermiyor, grafikler bundan sonraki her senkronla dolacak.");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {hesaplar.length > 1 && (
          <select value={hesap} onChange={(e) => setHesap(e.target.value)} style={{ fontSize: 12, padding: "4px 6px" }}>
            <option value="">{t("Tüm hesaplar")}</option>
            {hesaplar.map((h) => (
              <option key={h.accountId} value={h.accountId}>
                @{h.handle}
              </option>
            ))}
          </select>
        )}
        <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
          {DONEMLER.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setGun(d)}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 6,
                cursor: "pointer",
                border: `1px solid ${gun === d ? c.primary : c.border}`,
                background: gun === d ? `${c.primary}18` : "transparent",
                color: gun === d ? c.primary : c.textSecondary,
              }}
            >
              {t("{n} gün", { n: d })}
            </button>
          ))}
        </div>
      </div>

      {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}
      <span style={{ fontSize: 11, color: c.textSecondary }}>{birikiyor}</span>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
        <div style={{ ...kart, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 2, background: `${renk}10`, borderColor: `${renk}33`, borderLeft: `3px solid ${renk}` }}>
          <span style={{ fontSize: 11, color: c.textSecondary }}>
            {t("Son {n} günde kazanılan izlenme", { n: ozet.gunSayisi || 7 })}
          </span>
          <span style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary }}>
            {gunluk.length ? kisaSayi(ozet.son7) : "–"}
            {ozet.degisim !== null && (
              <span style={{ fontSize: 12, marginLeft: 6, color: ozet.degisim >= 0 ? c.success : c.danger }}>
                {ozet.degisim >= 0 ? "▲" : "▼"} {yuzde(Math.abs(Math.round(ozet.degisim)))}
              </span>
            )}
          </span>
          {ozet.degisim !== null && (
            <span style={{ fontSize: 11, color: c.textSecondary }}>{t("önceki 7 güne göre")}</span>
          )}
        </div>
        {takipciSerileri.map(({ hesap: h, noktalar }) => {
          const fark = noktalar[noktalar.length - 1].deger - noktalar[0].deger;
          return (
            <div key={h.accountId} style={{ ...kart, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 2, background: `${renk}10`, borderColor: `${renk}33`, borderLeft: `3px solid ${renk}` }}>
              <span style={{ fontSize: 11, color: c.textSecondary }}>
                {t("@{handle} takipçi", { handle: h.handle })}
              </span>
              <span style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary }}>
                {kisaSayi(noktalar[noktalar.length - 1].deger)}
                {noktalar.length > 1 && (
                  <span style={{ fontSize: 12, marginLeft: 6, color: fark >= 0 ? c.success : c.danger }}>
                    {fark >= 0 ? "+" : "−"}
                    {kisaSayi(Math.abs(fark))}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10 }}>
        <CubukGrafik
          renk={renk}
          baslik={t("Günlük kazanılan izlenme")}
          altBaslik={t("Bütün gönderilerin o gün eklediği izlenme")}
          noktalar={gunluk.map((n, i) => ({ x: i, y: n.deger, xYazi: gunYazisi(n.gun, true) }))}
          yBicim={kisaSayi}
          xEtiket={(n) => gunYazisi(gunluk[n.x].gun)}
          bos={t("En az iki senkron gerekiyor; yarın sabah ilk çubuklar görünür.")}
        />
        {takipciSerileri.length === 0 ? (
          <CizgiGrafik
            renk={renk}
            baslik={t("Takipçi")}
            noktalar={[]}
            yBicim={kisaSayi}
            xEtiket={(n) => n.xYazi}
            bos={t("Takipçi sayısı her gün kaydediliyor; ikinci günden itibaren çizgi görünür.")}
          />
        ) : (
          takipciSerileri.map(({ hesap: h, noktalar }) => (
            <CizgiGrafik
            renk={renk}
              key={h.accountId}
              baslik={takipciSerileri.length > 1 ? t("@{handle} takipçi", { handle: h.handle }) : t("Takipçi")}
              noktalar={noktalar.map((n) => ({
                x: Date.parse(`${n.gun}T12:00:00Z`),
                y: n.deger,
                xYazi: gunYazisi(n.gun, true),
              }))}
              yBicim={kisaSayi}
              xEtiket={(n) => gunYazisi(new Date(n.x).toISOString().slice(0, 10))}
              bos={t("Takipçi sayısı her gün kaydediliyor; ikinci günden itibaren çizgi görünür.")}
            />
          ))
        )}
        <CubukGrafik
          renk={renk}
          baslik={t("Haftalık yayın performansı")}
          altBaslik={t("O hafta paylaştığın gönderilerin bugünkü toplam izlenmesi")}
          noktalar={haftalar.map((h, i) => ({
            x: i,
            y: h.izlenme,
            xYazi: t("{tarih} haftası", { tarih: gunYazisi(h.hafta) }),
          }))}
          yBicim={kisaSayi}
          xEtiket={(n) => gunYazisi(haftalar[n.x].hafta)}
          ekIpucu={(n) => t("{n} gönderi", { n: haftalar[n.x].gonderi })}
          bos={t("Henüz gönderi verisi yok.")}
        />
      </div>
    </div>
  );
}
