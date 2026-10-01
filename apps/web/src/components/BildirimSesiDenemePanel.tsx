import { useState, type CSSProperties } from "react";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import {
  kabukSesBildirimiGonder,
  kabukSesDenemesiniTemizle,
  kabukSesDenemesiVarMi,
  kabukSesiCal,
  kabuktaMi,
} from "../lib/mobilKabuk";

/**
 * Admin > Bildirim sesi — aday sesleri telefonda gerçek bildirim olarak duyup
 * karşılaştırmak için.
 *
 * NEDEN: 1.2.0'daki ses bazı Android telefonlarda patlıyordu. Bilgisayarda
 * dinlemek bunu göstermez (hoparlör ve ses yolu farklı); karar telefonda,
 * bildirim ses düzeyinde verilmeli. Asıl iş kabuktaki eklentide
 * (BildirimSesiPlugin.java) — burası yalnızca düğmeleri.
 *
 * Seçim hiçbir kullanıcının bildirim sesini DEĞİŞTİRMEZ: Android'de kanal sesi
 * sonradan değişmiyor, kazanan ses bir sonraki sürüme gömülecek.
 */

const SESLER = [
  { key: "mevcut", ad: "Mevcut ses (1.2.0)", dosya: "/sounds/bildirim.mp3" }, // dil:anahtar
  { key: "ses2", ad: "Ses 2", dosya: "/sounds/bildirim-ses2.mp3" }, // dil:anahtar
  { key: "ses3", ad: "Ses 3", dosya: "/sounds/bildirim-ses3.mp3" }, // dil:anahtar
  // 4 ve 5: aynı melodi bir/iki oktav yukarıda, telefon hoparlörüne uygun
  // (1–3 kHz, tek kanal, -3 dBFS). 1–3 telefonda bu yüzden cızırdıyordu —
  // bkz. BildirimSesiPlugin.java.
  { key: "ses4", ad: "Ses 4 (1 oktav tiz)", dosya: "/sounds/bildirim-ses4.wav" }, // dil:anahtar
  { key: "ses5", ad: "Ses 5 (2 oktav tiz)", dosya: "/sounds/bildirim-ses5.wav" }, // dil:anahtar
  // 10–15: telefon ölçüsüne göre (1–4 kHz, mono, -3 dBFS) elle hazırlanan adaylar.
  { key: "noti10", ad: "Ses 10", dosya: "/sounds/bildirim-noti10.wav" }, // dil:anahtar
  { key: "noti11", ad: "Ses 11", dosya: "/sounds/bildirim-noti11.wav" }, // dil:anahtar
  { key: "noti12", ad: "Ses 12", dosya: "/sounds/bildirim-noti12.wav" }, // dil:anahtar
  { key: "noti13", ad: "Ses 13", dosya: "/sounds/bildirim-noti13.wav" }, // dil:anahtar
  { key: "noti14", ad: "Ses 14", dosya: "/sounds/bildirim-noti14.wav" }, // dil:anahtar
  { key: "noti15", ad: "Ses 15", dosya: "/sounds/bildirim-noti15.wav" }, // dil:anahtar
  { key: "noti16", ad: "Ses 16", dosya: "/sounds/bildirim-noti16.wav" }, // dil:anahtar
] as const;

type SesAnahtari = (typeof SESLER)[number]["key"];

const GECIKMELER = [0, 5, 15] as const;

const SECIM_ANAHTARI = "projelio_admin_ses_denemesi";

function sonSecim(): SesAnahtari {
  try {
    const v = localStorage.getItem(SECIM_ANAHTARI);
    if (SESLER.some((s) => s.key === v)) return v as SesAnahtari;
  } catch {
    /* depo kapalı: varsayılan */
  }
  return "ses2";
}

let tarayiciSesi: HTMLAudioElement | null = null;

export default function BildirimSesiDenemePanel() {
  const t = useT();
  const c = useThemeColors();
  const [secili, setSecili] = useState<SesAnahtari>(sonSecim);
  const [gecikme, setGecikme] = useState<number>(5);
  const [durum, setDurum] = useState<{ tur: "bilgi" | "hata"; metin: string } | null>(null);

  const kabukta = kabuktaMi();
  const eklentiVar = kabukSesDenemesiVarMi();
  const ses = SESLER.find((s) => s.key === secili)!;

  const sec = (key: SesAnahtari) => {
    setSecili(key);
    setDurum(null);
    try {
      localStorage.setItem(SECIM_ANAHTARI, key);
    } catch {
      /* yalnızca kolaylık */
    }
  };

  const dinle = async () => {
    setDurum(null);
    if (eklentiVar) {
      const hata = await kabukSesiCal(secili);
      if (hata) setDurum({ tur: "hata", metin: hata });
      return;
    }
    try {
      tarayiciSesi?.pause();
      tarayiciSesi = new Audio(ses.dosya);
      await tarayiciSesi.play();
    } catch {
      setDurum({ tur: "hata", metin: t("Ses çalınamadı.") });
    }
  };

  const gonder = async () => {
    setDurum(null);
    const hata = await kabukSesBildirimiGonder(secili, gecikme);
    if (hata) setDurum({ tur: "hata", metin: hata });
    else
      setDurum({
        tur: "bilgi",
        metin:
          gecikme === 0
            ? t("Bildirim gönderildi.")
            : t("Bildirim {n} saniye sonra gelecek — ekranı kilitleyebilirsin.", { n: gecikme }),
      });
  };

  const temizle = async () => {
    const hata = await kabukSesDenemesiniTemizle();
    setDurum(hata ? { tur: "hata", metin: hata } : { tur: "bilgi", metin: t("Deneme kanalları silindi.") });
  };

  const kart: CSSProperties = {
    background: c.surface,
    border: `1px solid ${c.border}`,
    borderRadius: 12,
    padding: "16px 18px",
    display: "grid",
    gap: 14,
  };
  const secenek = (aktif: boolean): CSSProperties => ({
    padding: "8px 14px",
    borderRadius: 8,
    fontSize: 14,
    cursor: "pointer",
    border: `1px solid ${aktif ? c.primary : c.border}`,
    background: aktif ? c.primary : "transparent",
    color: aktif ? "#fff" : c.textPrimary,
  });
  const dugme = (ana: boolean): CSSProperties => ({
    padding: "9px 16px",
    borderRadius: 9,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    border: ana ? "none" : `1px solid ${c.border}`,
    background: ana ? c.accent : "transparent",
    color: ana ? "#fff" : c.textPrimary,
  });
  const etiket: CSSProperties = { fontSize: 12, fontWeight: 500, color: c.textSecondary, margin: "0 0 6px" };

  return (
    <section style={{ width: "100%" }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: c.textPrimary, margin: "0 0 6px" }}>{t("Bildirim sesi denemesi")}</h2>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
        {t(
          "Aday sesleri telefonda gerçek bildirim olarak dinleyip karşılaştır. Seçim kimsenin bildirim sesini değiştirmez; kazanan ses bir sonraki uygulama sürümüne konacak."
        )}
      </p>

      {!kabukta && (
        <p style={{ margin: "0 0 14px", fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
          {t("Tarayıcıdasın: sesler yalnızca bilgisayarda dinlenebilir. Patlama sorunu telefonda olduğu için asıl denemeyi Android uygulamasından (1.4.0 ve üstü) yap.")}
        </p>
      )}
      {kabukta && !eklentiVar && (
        <p style={{ margin: "0 0 14px", fontSize: 13, color: c.danger, lineHeight: 1.5 }}>
          {t("Bu uygulama sürümünde ses denemesi yok. 1.4.0 ve üstünü kur.")}
        </p>
      )}

      <div style={kart}>
        <div>
          <p style={etiket}>{t("Aday ses")}</p>
          <div role="radiogroup" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SESLER.map((s) => (
              <button key={s.key} type="button" role="radio" aria-checked={secili === s.key} onClick={() => sec(s.key)} style={secenek(secili === s.key)}>
                {t(s.ad)}
              </button>
            ))}
          </div>
        </div>

        {eklentiVar && (
          <div>
            <p style={etiket}>{t("Gecikme")}</p>
            <div role="radiogroup" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {GECIKMELER.map((g) => (
                <button key={g} type="button" role="radio" aria-checked={gecikme === g} onClick={() => setGecikme(g)} style={secenek(gecikme === g)}>
                  {g === 0 ? t("Hemen") : t("{n} sn", { n: g })}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {eklentiVar && (
            <button type="button" onClick={gonder} style={dugme(true)}>
              {t("Bildirim olarak gönder")}
            </button>
          )}
          <button type="button" onClick={dinle} style={dugme(!eklentiVar)}>
            {t("Hemen dinle")}
          </button>
        </div>

        {durum && (
          <p style={{ margin: 0, fontSize: 13, color: durum.tur === "hata" ? c.danger : c.textSecondary }}>{durum.metin}</p>
        )}
      </div>

      {eklentiVar && (
        <div style={{ marginTop: 14, fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
          <p style={{ margin: "0 0 8px" }}>
            {t("Her ses telefonda kendi bildirim kanalında çalar (Android kanal sesini sonradan değiştirmiyor). Karar verince deneme kanallarını telefon ayarlarından kaldırabilirsin.")}
          </p>
          <button type="button" onClick={temizle} style={dugme(false)}>
            {t("Deneme kanallarını sil")}
          </button>
        </div>
      )}
    </section>
  );
}
