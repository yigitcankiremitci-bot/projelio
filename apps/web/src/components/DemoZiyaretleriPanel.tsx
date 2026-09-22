import { useEffect, useState, type CSSProperties } from "react";
import {
  demoOzellikAnahtari,
  etkinlikSuresiYaz,
  type DemoAdim,
  type DemoSayac,
  type DemoZiyaretOzeti,
} from "@projelio/shared";
import { demoZiyaretleri, type DemoZiyaretAnalitigi } from "../api/demoZiyaretleri";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { bicimDili, yuzde } from "../lib/i18n/depo";

/**
 * Admin > Demo ziyaretleri — demoya girenler önce neyi merak ediyor?
 *
 * Kişi değil ziyaret gösterilir; kimlik, IP ya da e-posta tutulmuyor
 * (bkz. packages/shared/src/demoZiyaret.ts). "İlk ilgi" ana pano dışında
 * açılan ilk özellik: demo panoda açıldığı için pano her ziyarette birinci.
 */

const OZELLIK_ADLARI: Record<string, string> = {
  pano: "Ana pano",
  lio: "Lio (asistan)",
  is: "İşler", // dil:anahtar
  proje: "Projeler", // dil:anahtar
  rutin: "Rutinler",
  organizasyon: "Organizasyonlar",
  departman: "Departmanlar",
  holding: "Holdingler",
  takvim: "Takvim", // dil:anahtar
  gorevler: "Görevler", // dil:anahtar
  yaptim: "Yaptım", // dil:anahtar
  ayarlar: "Ayarlar", // dil:anahtar
  "lio-bakiyesi": "Lio Bakiyesi",
  abonelik: "Abonelik",
  arsiv: "Arşiv", // dil:anahtar
};

function ozellikAdi(anahtar: string): string {
  if (anahtar.startsWith("modul:")) return `Modül · ${anahtar.slice(6)}`;
  return OZELLIK_ADLARI[anahtar] ?? anahtar;
}

const SAYFA_ADLARI: Record<string, string> = {
  "/": "Ana pano",
  "/jobs/:id": "İş kapağı", // dil:anahtar
  "/projects/:id": "Proje", // dil:anahtar
  "/operations/:id": "Rutin",
  "/organizations": "Organizasyon listesi",
  "/organizations/:id": "Organizasyon",
  "/departments/:id": "Departman",
  "/groups": "Holding listesi",
  "/groups/:id": "Holding",
  "/calendar": "Takvim", // dil:anahtar
  "/tasks": "Görevler", // dil:anahtar
  "/worklog": "Yaptım", // dil:anahtar
  "/settings": "Ayarlar", // dil:anahtar
};

function sayfaAdi(sayfa: string): string {
  if (SAYFA_ADLARI[sayfa]) return SAYFA_ADLARI[sayfa];
  const oz = demoOzellikAnahtari(sayfa);
  return oz ? ozellikAdi(oz) : sayfa;
}

const yuzdeYaz = (oran: number) => yuzde(Math.round(oran * 100));
const tarih = (iso: string) =>
  new Date(/[zZ]$/.test(iso) ? iso : `${iso}Z`).toLocaleString(bicimDili(), {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

const CIHAZ_ADI = { mobil: "Telefon", tablet: "Tablet", masaustu: "Masaüstü" } as const; // dil:anahtar
const DONEMLER = [7, 30, 90] as const;

export default function DemoZiyaretleriPanel() {
  const t = useT();
  const c = useThemeColors();
  const [gun, setGun] = useState<number>(30);
  const [veri, setVeri] = useState<DemoZiyaretAnalitigi | null>(null);
  const [hata, setHata] = useState("");
  const [acik, setAcik] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;
    setHata("");
    demoZiyaretleri
      .ozet(gun)
      .then((v) => !iptal && setVeri(v))
      .catch((e) => !iptal && setHata(e instanceof Error ? e.message : t("Demo ziyaretleri okunamadı.")));
    return () => {
      iptal = true;
    };
  }, [gun]);

  const kart: CSSProperties = {
    background: c.surface,
    border: `1px solid ${c.border}`,
    borderRadius: 12,
    padding: "16px 18px",
  };
  const baslik: CSSProperties = { fontSize: 14, fontWeight: 600, color: c.textPrimary, margin: "0 0 12px" };
  const hucre: CSSProperties = { padding: "7px 8px", borderBottom: `1px solid ${c.border}`, fontSize: 14, color: c.textPrimary };
  const sayiHucre: CSSProperties = { ...hucre, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const baslikHucre: CSSProperties = { ...hucre, color: c.textSecondary, fontSize: 12, fontWeight: 500, textAlign: "left" };

  const cubuklar = (liste: DemoSayac[], bos: string, ad: (anahtar: string) => string = ozellikAdi) =>
    liste.length === 0 ? (
      <p style={{ margin: 0, fontSize: 14, color: c.textSecondary }}>{bos}</p>
    ) : (
      <div style={{ display: "grid", gap: 8 }}>
        {liste.map((s) => (
          <div key={s.anahtar}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, color: c.textPrimary }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad(s.anahtar)}</span>
              <span style={{ color: c.textSecondary, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {s.ziyaret} · {yuzdeYaz(s.oran)}
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: c.background, marginTop: 4 }}>
              <div style={{ width: `${Math.max(s.oran * 100, 2)}%`, height: "100%", borderRadius: 3, background: c.accent }} />
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <section style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: "0 0 6px" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: c.textPrimary, margin: 0 }}>{t("Demo ziyaretleri")}</h2>
        <div role="tablist" style={{ display: "flex", gap: 4 }}>
          {DONEMLER.map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={gun === d}
              onClick={() => setGun(d)}
              style={{
                padding: "5px 12px",
                borderRadius: 8,
                fontSize: 13,
                border: `1px solid ${gun === d ? c.primary : c.border}`,
                background: gun === d ? c.primary : "transparent",
                color: gun === d ? "#fff" : c.textSecondary,
              }}
            >
              Son {d} gün
            </button>
          ))}
        </div>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
        {t("Demo hesabına girenlerin anonim gezinmesi: kişi değil ziyaret sayılır, kimlik ve yazılan içerik tutulmaz. Kayıtlar 90 gün saklanır (gizlilik politikası §14).")}
      </p>

      {hata && <p style={{ color: c.danger, fontSize: 14 }}>{hata}</p>}
      {!veri && !hata && <p style={{ color: c.textSecondary, fontSize: 14 }}>{t("Yükleniyor…")}</p>}

      {veri && (
        <div style={{ display: "grid", gap: 14 }}>
          {veri.kesildi && (
            <p style={{ margin: 0, fontSize: 13, color: c.textSecondary }}>
              Olay sayısı okuma tavanına dayandı; en eski günler eksik görünebilir. Daha kısa bir dönem seç.
            </p>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            {[
              ["Ziyaret", String(veri.ziyaret)],
              [t("Ortanca süre"), etkinlikSuresiYaz(veri.medyanSureSn)],
              [t("Ortalama süre"), etkinlikSuresiYaz(veri.ortSureSn)],
              [t("Ziyaret başına sayfa"), veri.ortSayfa.toLocaleString(bicimDili())],
              [t("Panodan öteye geçmeyen"), veri.ziyaret ? yuzdeYaz(veri.hemenCikma) : "—"],
              [t("Tanıtım sitesinden"), veri.ziyaret ? yuzdeYaz(veri.kaynak.tanitim / veri.ziyaret) : "—"],
              ["Telefondan", veri.ziyaret ? yuzdeYaz(veri.cihaz.mobil / veri.ziyaret) : "—"],
            ].map(([ad, deger]) => (
              <div key={ad} style={{ ...kart, padding: "12px 14px" }}>
                <div style={{ fontSize: 12, color: c.textSecondary }}>{ad}</div>
                <div style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                  {deger}
                </div>
              </div>
            ))}
          </div>

          <div style={kart}>
            <h3 style={baslik}>{t("Günlük ziyaret")}</h3>
            <GunlukCubuk seri={veri.gunluk} renk={c.accent} zemin={c.background} yazi={c.textSecondary} />
          </div>

          {veri.ziyaret === 0 ? (
            <p style={{ margin: 0, fontSize: 14, color: c.textSecondary }}>
              {t("Bu dönemde demo ziyareti yok. Ölçüm, migration 116 uygulandıktan sonraki ilk demo girişiyle başlar.")}
            </p>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
                <div style={kart}>
                  <h3 style={baslik}>İlk neyi merak ettiler?</h3>
                  {cubuklar(veri.ilkIlgi, t("Hiçbir ziyaret panodan öteye geçmedi."))}
                </div>
                <div style={kart}>
                  <h3 style={baslik}>Neye baktılar? (ziyaretlerin yüzdesi)</h3>
                  {cubuklar(veri.ozellikler, t("Kayıt yok."))}
                </div>
                <div style={kart}>
                  <h3 style={baslik}>Nerede bıraktılar?</h3>
                  {cubuklar(veri.sonSayfa, t("Kayıt yok."), sayfaAdi)}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>
                <div style={{ ...kart, overflowX: "auto" }}>
                  <h3 style={baslik}>{t("Sayfalar ve kalma süresi")}</h3>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={baslikHucre}>{t("Sayfa")}</th>
                        <th style={{ ...baslikHucre, textAlign: "right" }}>{t("Ziyaret")}</th>
                        <th style={{ ...baslikHucre, textAlign: "right" }}>{t("Ort. süre")}</th>
                        <th style={{ ...baslikHucre, textAlign: "right" }}>{t("Toplam")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {veri.sayfalar.map((s) => (
                        <tr key={s.sayfa}>
                          <td style={hucre} title={s.sayfa}>{sayfaAdi(s.sayfa)}</td>
                          <td style={sayiHucre}>{s.ziyaret}</td>
                          <td style={sayiHucre}>{etkinlikSuresiYaz(s.ortSn)}</td>
                          <td style={sayiHucre}>{etkinlikSuresiYaz(s.toplamSn)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ ...kart, overflowX: "auto" }}>
                  <h3 style={baslik}>Ne tıkladılar?</h3>
                  {veri.tiklamalar.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 14, color: c.textSecondary }}>{t("Kayıt yok.")}</p>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <th style={baslikHucre}>{t("Düğme")}</th>
                          <th style={baslikHucre}>{t("Sayfa")}</th>
                          <th style={{ ...baslikHucre, textAlign: "right" }}>{t("Ziyaret")}</th>
                          <th style={{ ...baslikHucre, textAlign: "right" }}>{t("Tıklama")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {veri.tiklamalar.map((t) => (
                          <tr key={`${t.sayfa}|${t.anahtar}`}>
                            <td style={hucre}>{t.anahtar.startsWith("→ ") ? `→ ${sayfaAdi(t.anahtar.slice(2))}` : t.anahtar}</td>
                            <td style={{ ...hucre, color: c.textSecondary }}>{sayfaAdi(t.sayfa)}</td>
                            <td style={sayiHucre}>{t.ziyaret}</td>
                            <td style={sayiHucre}>{t.sayi}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div style={kart}>
                <h3 style={baslik}>{t("Son ziyaretler")}</h3>
                <div style={{ display: "grid" }}>
                  {veri.sonZiyaretler.map((z) => (
                    <ZiyaretSatiri
                      key={z.id}
                      z={z}
                      acik={acik === z.id}
                      degistir={() => setAcik(acik === z.id ? null : z.id)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function GunlukCubuk({
  seri,
  renk,
  zemin,
  yazi,
}: {
  seri: { gun: string; ziyaret: number }[];
  renk: string;
  zemin: string;
  yazi: string;
}) {
  const t = useT();
  const enYuksek = Math.max(1, ...seri.map((g) => g.ziyaret));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 90 }}>
        {seri.map((g) => (
          <div
            key={g.gun}
            title={`${new Date(`${g.gun}T12:00:00Z`).toLocaleDateString(bicimDili(), { day: "numeric", month: "short" })}: ${g.ziyaret} ziyaret`}
            style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", background: zemin, borderRadius: 2 }}
          >
            <div style={{ width: "100%", height: `${(g.ziyaret / enYuksek) * 100}%`, background: renk, borderRadius: 2 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: yazi, marginTop: 4 }}>
        <span>{seri[0] && new Date(`${seri[0].gun}T12:00:00Z`).toLocaleDateString(bicimDili(), { day: "numeric", month: "short" })}</span>
        <span>en yüksek: {enYuksek}</span>
        <span>{t("bugün")}</span>
      </div>
    </div>
  );
}

function adimMetni(a: DemoAdim): string {
  if (a.tur === "sayfa") return sayfaAdi(a.anahtar);
  if (a.tur === "ozellik") return `${ozellikAdi(a.anahtar)} açıldı`;
  return a.anahtar.startsWith("→ ") ? `bağlantı → ${sayfaAdi(a.anahtar.slice(2))}` : `“${a.anahtar}” tıklandı`;
}

function ZiyaretSatiri({ z, acik, degistir }: { z: DemoZiyaretOzeti; acik: boolean; degistir: () => void }) {
  const t = useT();
  const c = useThemeColors();
  return (
    <div style={{ borderBottom: `1px solid ${c.border}` }}>
      <button
        onClick={degistir}
        aria-expanded={acik}
        style={{
          width: "100%",
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 14px",
          alignItems: "baseline",
          padding: "9px 2px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          fontSize: 14,
          color: c.textPrimary,
          cursor: "pointer",
        }}
      >
        <span style={{ minWidth: 110, fontVariantNumeric: "tabular-nums" }}>{tarih(z.basladiAt)}</span>
        <span style={{ color: c.textSecondary }}>{CIHAZ_ADI[z.cihaz]}</span>
        <span style={{ color: c.textSecondary }}>{z.kaynak === "tanitim" ? t("tanıtım sitesi") : z.kaynak === "giris" ? t("giriş ekranı") : "—"}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{etkinlikSuresiYaz(z.sureSn)}</span>
        <span>
          {t("İlk ilgi:")} <strong style={{ fontWeight: 500 }}>{z.ilkIlgi ? ozellikAdi(z.ilkIlgi) : t("panoda kaldı")}</strong>
        </span>
        <span style={{ marginLeft: "auto", color: c.textSecondary }}>
          {z.adimSayisi} adım {acik ? "▴" : "▾"}
        </span>
      </button>
      {acik && (
        <ol style={{ margin: "0 0 10px", paddingLeft: 22, display: "grid", gap: 3 }}>
          {z.adimlar.map((a, i) => (
            <li key={i} style={{ fontSize: 13, color: a.tur === "sayfa" ? c.textPrimary : c.textSecondary }}>
              <span style={{ fontVariantNumeric: "tabular-nums", color: c.textSecondary, marginRight: 8 }}>
                {new Date(/[zZ]$/.test(a.at) ? a.at : `${a.at}Z`).toLocaleTimeString(bicimDili(), { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              {adimMetni(a)}
              {a.tur === "sayfa" && a.sureSn != null && (
                <span style={{ color: c.textSecondary }}> · {etkinlikSuresiYaz(a.sureSn)}</span>
              )}
            </li>
          ))}
          {z.adimSayisi > z.adimlar.length && (
            <li style={{ fontSize: 13, color: c.textSecondary, listStyle: "none" }}>
              … ve {z.adimSayisi - z.adimlar.length} adım daha
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
