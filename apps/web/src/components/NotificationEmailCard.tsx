import { useEffect, useState } from "react";
import type { NotificationEmailFrequency, NotificationEmailPrefs } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { IconChevronRight } from "./icons";

/**
 * BİLDİRİM E-POSTALARI — katlanmış kart.
 *
 * NEDEN KAPALI BAŞLIYOR: bu ayarın doğru değeri çoğu kullanıcı için varsayılan
 * (günde bir özet, 09:00). Kartı açık göstermek, Yardımcılar sekmesinin en
 * uzun bloğunu hiç dokunulmayacak bir ayara ayırmak demekti. Katlanmış satır
 * hem yer kaplamıyor hem de arayan kişinin bulabileceği bir yerde duruyor.
 *
 * SAAT DİLİMİ SORULMAZ, ALGILANIR: "hangi saat diliminde yaşıyorsun" sorusu
 * kullanıcıya hiçbir şey kazandırmaz ve yanlış cevaplanması özeti gece yarısına
 * taşır. Tarayıcıdan okunup kaydın içinde sessizce gönderiliyor; ekranda
 * yalnızca bilgi olarak yazıyor.
 */

const SIKLIKLAR: { value: NotificationEmailFrequency; label: string; aciklama: string }[] = [
  {
    value: "anlik",
    label: "Her bildirimde", // dil:anahtar
    aciklama: "Bildirim oluştukça gelir. Arka arkaya gelenler tek e-postada toplanır.", // dil:anahtar
  },
  {
    value: "gunluk",
    label: "Günde bir özet", // dil:anahtar
    aciklama: "Seçtiğin saatte, o güne ait her şey tek e-postada.", // dil:anahtar
  },
  {
    value: "kapali",
    label: "Kapalı", // dil:anahtar
    aciklama: "Hiç e-posta gönderilmez. Bildirimler uygulamada görünmeye devam eder.", // dil:anahtar
  },
];

/** 00:00 … 23:00 */
const SAATLER = Array.from({ length: 24 }, (_, saat) => saat);

function saatEtiketi(saat: number): string {
  return `${String(saat).padStart(2, "0")}:00`;
}

/** Tarayıcının saat dilimi; okunamazsa sunucu varsayılanı. */
function cihazZamanDilimi(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Istanbul";
  } catch {
    return "Europe/Istanbul";
  }
}

export default function NotificationEmailCard() {
  const c = useThemeColors();
  const t = useT();
  const [acik, setAcik] = useState(false);
  const [prefs, setPrefs] = useState<NotificationEmailPrefs | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState("");
  const [bilgi, setBilgi] = useState("");
  const [denemeGonderiliyor, setDenemeGonderiliyor] = useState(false);

  // Yükleme kart AÇILINCA: kapalı duran bir kart için her ayarlar ziyaretinde
  // istek atmanın anlamı yok.
  useEffect(() => {
    if (!acik || prefs) return;
    api
      .get<NotificationEmailPrefs>("/notifications/email-prefs")
      .then(setPrefs)
      .catch(() => setHata(t("Bildirim e-postası ayarları yüklenemedi.")));
  }, [acik, prefs]);

  const kaydet = async (degisiklik: Partial<NotificationEmailPrefs>) => {
    if (!prefs) return;
    const yeni = { ...prefs, ...degisiklik };
    setPrefs(yeni);
    setHata("");
    setBilgi("");
    setKaydediliyor(true);
    try {
      const sonuc = await api.patch<NotificationEmailPrefs>("/notifications/email-prefs", {
        ...yeni,
        // Saat dilimi her kayıtta tazelenir: kullanıcı taşınırsa ya da seyahat
        // ederse özet yine kendi sabahında gelsin.
        timezone: cihazZamanDilimi(),
      });
      setPrefs(sonuc);
      setBilgi(t("Kaydedildi."));
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Ayar kaydedilemedi."));
      // Sunucu reddettiyse ekran gerçeği göstermeli: son bilinen hâle dön.
      api
        .get<NotificationEmailPrefs>("/notifications/email-prefs")
        .then(setPrefs)
        .catch(() => undefined);
    } finally {
      setKaydediliyor(false);
    }
  };

  const denemeGonder = async () => {
    setHata("");
    setBilgi("");
    setDenemeGonderiliyor(true);
    try {
      const { sent } = await api.post<{ sent: boolean }>("/notifications/email-prefs/test", {});
      setBilgi(
        sent
          ? t("Deneme e-postası gönderildi. Birkaç dakika içinde gelmezse spam klasörüne bak.")
          : t("Deneme e-postası gönderilemedi. E-posta adresin doğrulanmamış olabilir.")
      );
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Deneme e-postası gönderilemedi."));
    } finally {
      setDenemeGonderiliyor(false);
    }
  };

  const gunluk = prefs?.frequency === "gunluk";

  return (
    <section style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setAcik((o) => !o)}
        aria-expanded={acik}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "14px 16px",
          background: "transparent",
          border: "none",
          textAlign: "left",
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary }}>{t("Bildirim e-postaları")}</span>
          <span style={{ fontSize: 13, color: c.textSecondary }}>
            {t("Bildirimlerin e-posta olarak da gelsin — sıklığını ve saatini sen seç.")}
          </span>
        </span>
        <span style={{ flexShrink: 0, transform: acik ? "rotate(90deg)" : "none", transition: "transform .15s" }}>
          <IconChevronRight size={16} color={c.textSecondary} />
        </span>
      </button>

      {acik && (
        <div style={{ borderTop: `1px solid ${c.border}`, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {!prefs && !hata && <span style={{ fontSize: 14, color: c.textSecondary }}>{t("Yükleniyor…")}</span>}

          {prefs && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {SIKLIKLAR.map((secenek) => {
                  const secili = prefs.frequency === secenek.value;
                  return (
                    <button
                      key={secenek.value}
                      type="button"
                      onClick={() => void kaydet({ frequency: secenek.value })}
                      aria-pressed={secili}
                      disabled={kaydediliyor}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 2,
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: `1.5px solid ${secili ? c.primary : c.border}`,
                        background: secili ? c.background : "transparent",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: secili ? 500 : 400, color: c.textPrimary }}>
                        {t(secenek.label)}
                      </span>
                      <span style={{ fontSize: 13, color: c.textSecondary, lineHeight: 1.4 }}>
                        {t(secenek.aciklama)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {gunluk && (
                <>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, color: c.textPrimary }}>{t("Her gün saat")}</span>
                    <select
                      value={prefs.dailyHour}
                      onChange={(e) => void kaydet({ dailyHour: Number(e.target.value) })}
                      disabled={kaydediliyor}
                      style={{
                        padding: "7px 10px",
                        borderRadius: 8,
                        border: `1px solid ${c.border}`,
                        background: c.background,
                        color: c.textPrimary,
                        fontSize: 14,
                      }}
                    >
                      {SAATLER.map((saat) => (
                        <option key={saat} value={saat}>
                          {saatEtiketi(saat)}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: 13, color: c.textSecondary }}>
                      {t("({zamanDilimi} saatiyle)", { zamanDilimi: cihazZamanDilimi() })}
                    </span>
                  </label>

                  <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={prefs.includeTasks}
                      onChange={(e) => void kaydet({ includeTasks: e.target.checked })}
                      disabled={kaydediliyor}
                      style={{ width: 17, height: 17, marginTop: 2 }}
                    />
                    <span style={{ fontSize: 14, color: c.textPrimary, lineHeight: 1.4 }}>
                      {t("O gün biten görevlerim de listelensin")}
                    </span>
                  </label>
                </>
              )}

              {prefs.frequency !== "kapali" && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void denemeGonder()}
                    disabled={denemeGonderiliyor}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: `1px solid ${c.border}`,
                      background: c.background,
                      color: c.textPrimary,
                      fontSize: 14,
                    }}
                  >
                    {denemeGonderiliyor ? t("Gönderiliyor…") : t("Deneme e-postası gönder")}
                  </button>
                  <span style={{ fontSize: 13, color: c.textSecondary }}>
                    {t("Kurulumun çalıştığını hemen görmek için.")}
                  </span>
                </div>
              )}
            </>
          )}

          {bilgi && <span style={{ fontSize: 13, color: c.success }}>{bilgi}</span>}
          {hata && <span style={{ fontSize: 13, color: c.danger }}>{hata}</span>}
        </div>
      )}
    </section>
  );
}
