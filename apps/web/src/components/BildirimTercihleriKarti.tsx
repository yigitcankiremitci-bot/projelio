import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  BILDIRIM_KANALI_ETIKETI,
  BILDIRIM_KATEGORILERI,
  KILITLI_BILDIRIM_TIPLERI,
  VARSAYILAN_BILDIRIM_TERCIHLERI,
  WHATSAPP_GIDEN_TIPLER,
  bildirimKanaliAcikMi,
  type BildirimKanali,
  type BildirimKategorisi,
  type BildirimTercihleri,
  type BildirimTipi,
} from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { kabuktaMi } from "../lib/mobilKabuk";
import { bildirimSesiniAyarla, bildirimSesiniDene } from "../lib/bildirimSesi";
import { initPush } from "../push";
import { IconChevronDown, IconChevronRight } from "./icons";

/**
 * BİLDİRİM TERCİHLERİ — hangi bildirim, hangi kanaldan (bkz. migration 135).
 *
 * Kategori satırı kategorinin TÜM tiplerini birlikte değiştirir; "Ayrıntılar"
 * tek tek tipleri açar. Kayıt tip başına, yani kategori düğmesi yalnızca bir
 * kısayol — karışık durumda (bazı tipler açık) düğme "Bazıları" der ve
 * basınca hepsini açar.
 *
 * Kanal listesi ve karar fonksiyonu sunucuyla ORTAK (shared/bildirimTercihleri):
 * burada gösterilen, sunucunun uyguladığıyla aynı kuraldan geçiyor.
 */

/** Uygulama kanalı ana anahtar; kanal çipleri onun altında. */
const YAN_KANALLAR: BildirimKanali[] = ["anlik", "eposta", "whatsapp"];

type Durum = "acik" | "kapali" | "karisik";

function kanalGecerliMi(tip: BildirimTipi, kanal: BildirimKanali): boolean {
  return kanal !== "whatsapp" || WHATSAPP_GIDEN_TIPLER.has(tip);
}

function durumu(tercih: BildirimTercihleri, tipler: BildirimTipi[], kanal: BildirimKanali): Durum | null {
  const gecerli = tipler.filter((tip) => kanalGecerliMi(tip, kanal));
  if (!gecerli.length) return null;
  const acik = gecerli.filter((tip) => bildirimKanaliAcikMi(tercih, tip, kanal)).length;
  return acik === gecerli.length ? "acik" : acik === 0 ? "kapali" : "karisik";
}

function tarayiciIzni(): NotificationPermission | "desteklenmiyor" {
  if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) return "desteklenmiyor";
  return Notification.permission;
}

export default function BildirimTercihleriKarti() {
  const c = useThemeColors();
  const t = useT();
  const [tercih, setTercih] = useState<BildirimTercihleri | null>(null);
  const [acikKategori, setAcikKategori] = useState<string | null>(null);
  const [hata, setHata] = useState("");
  const [izin, setIzin] = useState(tarayiciIzni());
  const kabukta = kabuktaMi();

  useEffect(() => {
    api
      .get<BildirimTercihleri>("/notifications/preferences")
      .then(setTercih)
      // Okunamazsa varsayılan (hepsi açık) gösterilir ama uyarılır: kullanıcı
      // gördüğünün kayıtlı hâl olmadığını bilsin.
      .catch(() => {
        setTercih(VARSAYILAN_BILDIRIM_TERCIHLERI);
        setHata(t("Bildirim ayarların yüklenemedi. Değişiklik yaparsan kaydedilmeyi dener."));
      });
  }, []);

  const kaydet = async (yeni: BildirimTercihleri) => {
    const onceki = tercih;
    setTercih(yeni);
    bildirimSesiniAyarla(yeni.ses);
    setHata("");
    try {
      setTercih(await api.patch<BildirimTercihleri>("/notifications/preferences", yeni));
    } catch {
      setTercih(onceki);
      if (onceki) bildirimSesiniAyarla(onceki.ses);
      setHata(t("Ayar kaydedilemedi. Tekrar dene."));
    }
  };

  /** Verilen tiplerde bir kanalı aç/kapat. Kilitli tipin "uygulama"sı dokunulmaz. */
  const degistir = (tipler: BildirimTipi[], kanal: BildirimKanali, acik: boolean) => {
    if (!tercih) return;
    const yeniTipler = { ...tercih.tipler };
    for (const tip of tipler) {
      if (!kanalGecerliMi(tip, kanal)) continue;
      if (kanal === "uygulama" && KILITLI_BILDIRIM_TIPLERI.has(tip)) continue;
      const mevcut = { ...(yeniTipler[tip] ?? {}) };
      if (acik) delete mevcut[kanal];
      else mevcut[kanal] = false;
      // Ana anahtar yeniden açıldıysa alt kanallar da açık gelsin: kullanıcı
      // "bunu istiyorum" dedi, eskiden kapattığı telefon anahtarını hatırlamaz.
      if (kanal === "uygulama" && acik) for (const k of YAN_KANALLAR) delete mevcut[k];
      if (Object.keys(mevcut).length) yeniTipler[tip] = mevcut;
      else delete yeniTipler[tip];
    }
    void kaydet({ ...tercih, tipler: yeniTipler });
  };

  const izinIste = async () => {
    await initPush();
    setIzin(tarayiciIzni());
  };

  const kutu: CSSProperties = { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: "16px 20px" };
  const baslik: CSSProperties = { fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: 0 };
  const aciklama: CSSProperties = { fontSize: 13, color: c.textSecondary, margin: "4px 0 0", lineHeight: 1.45 };

  const anaAnahtar = (durum: Durum, onChange: (acik: boolean) => void, kilitli = false) => (
    <button
      type="button"
      disabled={kilitli}
      onClick={() => onChange(durum !== "acik")}
      aria-pressed={durum === "acik"}
      style={{
        flexShrink: 0,
        minWidth: 76,
        padding: "6px 12px",
        borderRadius: 999,
        border: `1px solid ${durum === "kapali" ? c.border : c.accent}`,
        background: durum === "acik" ? c.accent : "transparent",
        color: durum === "acik" ? c.surface : durum === "karisik" ? c.accent : c.textSecondary,
        fontSize: 13,
        fontWeight: 500,
        cursor: kilitli ? "default" : "pointer",
        opacity: kilitli ? 0.7 : 1,
      }}
    >
      {kilitli ? t("Her zaman") : durum === "acik" ? t("Açık") : durum === "kapali" ? t("Kapalı") : t("Bazıları")}
    </button>
  );

  const kanalCipleri = (tipler: BildirimTipi[], pasif: boolean) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10, opacity: pasif ? 0.45 : 1 }}>
      {YAN_KANALLAR.map((kanal) => {
        const d = tercih ? durumu(tercih, tipler, kanal) : null;
        if (!d) return null;
        const acik = d !== "kapali";
        return (
          <button
            key={kanal}
            type="button"
            disabled={pasif}
            onClick={() => degistir(tipler, kanal, d !== "acik")}
            aria-pressed={d === "acik"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 8,
              border: `1px solid ${acik ? c.primary : c.border}`,
              background: acik ? c.background : "transparent",
              color: acik ? c.textPrimary : c.textSecondary,
              fontSize: 13,
              cursor: pasif ? "default" : "pointer",
              textDecoration: acik ? "none" : "line-through",
            }}
          >
            <span aria-hidden style={{ fontSize: 11 }}>{d === "acik" ? "✓" : d === "karisik" ? "–" : "✕"}</span>
            {t(BILDIRIM_KANALI_ETIKETI[kanal])}
          </button>
        );
      })}
    </div>
  );

  const kategoriKutusu = (k: BildirimKategorisi) => {
    if (!tercih) return null;
    const tipler = k.tipler.map((x) => x.tip);
    const tumuKilitli = tipler.every((tip) => KILITLI_BILDIRIM_TIPLERI.has(tip));
    const ana = durumu(tercih, tipler, "uygulama") ?? "acik";
    const acik = acikKategori === k.kimlik;
    return (
      <section key={k.kimlik} style={kutu}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={baslik}>{t(k.baslik)}</h3>
            <p style={aciklama}>{t(k.aciklama)}</p>
          </div>
          {anaAnahtar(ana, (on) => degistir(tipler, "uygulama", on), tumuKilitli)}
        </div>
        {kanalCipleri(tipler, ana === "kapali")}
        <button
          type="button"
          onClick={() => setAcikKategori(acik ? null : k.kimlik)}
          aria-expanded={acik}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            marginTop: 10,
            padding: 0,
            border: "none",
            background: "transparent",
            color: c.textSecondary,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {acik ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          {acik ? t("Ayrıntıları gizle") : t("Tek tek seç")}
        </button>
        {acik && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column" }}>
            {k.tipler.map(({ tip, etiket }) => {
              const kilitli = KILITLI_BILDIRIM_TIPLERI.has(tip);
              const tipAna: Durum = bildirimKanaliAcikMi(tercih, tip, "uygulama") ? "acik" : "kapali";
              return (
                <div key={tip} style={{ borderTop: `1px solid ${c.border}`, padding: "10px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontSize: 14, color: c.textPrimary, minWidth: 0 }}>{t(etiket)}</span>
                    {anaAnahtar(tipAna, (on) => degistir([tip], "uygulama", on), kilitli)}
                  </div>
                  {kanalCipleri([tip], tipAna === "kapali")}
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <section style={kutu}>
        <h3 style={baslik}>{t("Bu cihaz")}</h3>
        {kabukta ? (
          <p style={aciklama}>
            {t("Telefon bildirimleri açık. Sesi ve titreşimi telefonunun Ayarlar > Uygulamalar > Projelio > Bildirimler bölümünden değiştirebilirsin.")}
          </p>
        ) : izin === "granted" ? (
          <p style={aciklama}>{t("Bu tarayıcıya bildirim gönderilebiliyor. Sekme kapalıyken de gelir.")}</p>
        ) : izin === "denied" ? (
          <p style={{ ...aciklama, color: c.danger }}>
            {t("Bu tarayıcıda bildirimler engellenmiş. Adres çubuğundaki kilit simgesinden Projelio için bildirimlere izin ver.")}
          </p>
        ) : izin === "default" ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 4 }}>
            <p style={{ ...aciklama, margin: 0 }}>{t("Bu tarayıcıya henüz bildirim izni verilmedi. Sekme kapalıyken haber alamazsın.")}</p>
            <button
              type="button"
              onClick={() => void izinIste()}
              style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 8, border: "none", background: c.accent, color: c.surface, fontSize: 13, fontWeight: 500 }}
            >
              {t("İzin ver")}
            </button>
          </div>
        ) : (
          <p style={aciklama}>{t("Bu tarayıcı sistem bildirimlerini desteklemiyor; bildirimler uygulamada ve e-postada görünür.")}</p>
        )}

        {!kabukta && tercih && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              marginTop: 14,
              paddingTop: 12,
              borderTop: `1px solid ${c.border}`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, color: c.textPrimary }}>{t("Bildirim sesi")}</div>
              <div style={{ fontSize: 13, color: c.textSecondary }}>{t("Uygulama açıkken yeni bildirim geldiğinde çalar.")}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                onClick={bildirimSesiniDene}
                style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary, fontSize: 13 }}
              >
                {t("Dinle")}
              </button>
              {anaAnahtar(tercih.ses ? "acik" : "kapali", (on) => void kaydet({ ...tercih, ses: on }))}
            </div>
          </div>
        )}
      </section>

      {hata && <p style={{ color: c.danger, fontSize: 14, margin: 0 }}>{hata}</p>}

      {tercih ? BILDIRIM_KATEGORILERI.map(kategoriKutusu) : <p style={{ ...aciklama, margin: 0 }}>{t("Yükleniyor…")}</p>}
    </div>
  );
}
