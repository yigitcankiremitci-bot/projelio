import { useCallback, useEffect, useState } from "react";
import type { GoogleTakvimDurumu } from "@projelio/shared";
import { googleTakvimApi } from "../../api/googleTakvim";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { bicimDili } from "../../lib/i18n/depo";
import { takvimAraligi } from "./takvimAraligi";

/**
 * Ayarlar › Bağlı hesaplar'daki Google Takvim kartı.
 *
 * Drive kartından (CloudAccountsCard) AYRI: takvim bağlantısı kendi
 * tablosunda duruyor, farklı bir Google hesabıyla bile bağlanabilir (bkz.
 * migration 133). Hangi takvimlerin görüneceği ve Projelio'dan eklenenlerin
 * hangi takvime yazılacağı da burada seçilir.
 */
export default function GoogleTakvimKarti() {
  const c = useThemeColors();
  const t = useT();
  const [durum, setDurum] = useState<GoogleTakvimDurumu | null>(null);
  const [hata, setHata] = useState("");
  const [mesgul, setMesgul] = useState(false);

  const yukle = useCallback(() => {
    googleTakvimApi
      .durum()
      .then((d) => {
        setDurum(d);
        setHata("");
      })
      .catch((e: any) => setHata(e?.message ?? t("Google Takvim durumu alınamadı.")));
  }, []);

  useEffect(yukle, [yukle]);

  const calistir = async (is: () => Promise<GoogleTakvimDurumu | unknown>) => {
    setMesgul(true);
    setHata("");
    try {
      const sonuc = await is();
      if (sonuc && typeof sonuc === "object" && "bagli" in (sonuc as object)) setDurum(sonuc as GoogleTakvimDurumu);
      else yukle();
    } catch (e: any) {
      setHata(e?.message ?? t("İşlem tamamlanamadı."));
    } finally {
      setMesgul(false);
    }
  };

  const baglan = async () => {
    setMesgul(true);
    try {
      const { url } = await googleTakvimApi.baglantiAdresi("/settings?sekme=baglantilar");
      window.location.href = url;
    } catch (e: any) {
      setHata(e?.message ?? t("Google'a yönlendirilemedi."));
      setMesgul(false);
    }
  };

  if (!durum && !hata) return null;

  const dugme = (birincil: boolean) => ({
    padding: "8px 14px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    border: birincil ? "none" : `1px solid ${c.border}`,
    background: birincil ? c.primary : c.surface,
    color: birincil ? c.onPrimary : c.textPrimary,
    cursor: mesgul ? "default" : "pointer",
    opacity: mesgul ? 0.6 : 1,
  });

  const seciliSayisi = durum?.takvimler.filter((k) => k.secili).length ?? 0;

  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <TakvimSimgesi />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: c.textPrimary }}>{t("Google Takvim")}</div>
          <div style={{ fontSize: 14, color: c.textSecondary }}>
            {t("Toplantıların Projelio takviminde görünsün, planın Google Takvim'e gitsin")}
          </div>
        </div>
      </div>

      {hata && <p style={{ fontSize: 14, color: c.danger, margin: "0 0 10px" }}>{hata}</p>}

      {durum && !durum.yapilandirildi ? (
        <p style={{ fontSize: 15, color: c.textSecondary, margin: 0 }}>{t("Bu özellik sunucuda henüz yapılandırılmamış.")}</p>
      ) : durum && !durum.bagli ? (
        <>
          <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>
            {t("Bağladığında takvimindeki etkinlikler Projelio takviminde görünür; zaman bloklarını Google Takvim'e ekleyebilir, Lio'dan etkinliklerini göreve çevirmesini isteyebilirsin.")}
          </p>
          <button type="button" onClick={baglan} disabled={mesgul} style={dugme(true)}>
            {t("Google Takvim'i bağla")}
          </button>
        </>
      ) : durum ? (
        <>
          <div style={{ fontSize: 14, color: c.textSecondary, marginBottom: 12 }}>
            {t("Bağlı hesap:")} <strong style={{ fontWeight: 500, color: c.textPrimary }}>{durum.eposta}</strong>
          </div>

          {durum.kopuk && (
            <div style={{ fontSize: 14, color: c.danger, marginBottom: 12, lineHeight: 1.5 }}>
              {t("Google bu bağlantının erişimini kaldırmış. Etkinliklerin güncellenmesi için yeniden bağlan.")}{" "}
              <button type="button" onClick={baglan} disabled={mesgul} style={{ ...dugme(true), marginTop: 8 }}>
                {t("Yeniden bağlan")}
              </button>
            </div>
          )}

          <div style={{ fontSize: 13, fontWeight: 500, color: c.textSecondary, marginBottom: 6 }}>{t("Gösterilen takvimler")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {durum.takvimler.map((k) => (
              <label key={k.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: c.textPrimary }}>
                <input
                  type="checkbox"
                  checked={k.secili}
                  // Son seçili takvimin işareti kaldırılamaz: sunucu da reddediyor.
                  disabled={mesgul || (k.secili && seciliSayisi === 1)}
                  onChange={(e) => {
                    const secili = durum.takvimler
                      .filter((x) => (x.id === k.id ? e.target.checked : x.secili))
                      .map((x) => x.id);
                    void calistir(() => googleTakvimApi.ayarlar({ seciliTakvimler: secili }));
                  }}
                />
                <span style={{ width: 10, height: 10, borderRadius: 3, background: k.renk ?? c.primary, flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.ad}</span>
                {k.birincil && <span style={{ fontSize: 12, color: c.textSecondary }}>{t("(birincil)")}</span>}
              </label>
            ))}
          </div>

          <div style={{ fontSize: 13, fontWeight: 500, color: c.textSecondary, marginBottom: 6 }}>
            {t("Projelio'dan eklenenler şu takvime yazılsın")}
          </div>
          <select
            value={durum.hedefTakvimId}
            disabled={mesgul}
            onChange={(e) => void calistir(() => googleTakvimApi.ayarlar({ hedefTakvimId: e.target.value }))}
            style={{
              width: "100%",
              maxWidth: 360,
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: c.surface,
              color: c.textPrimary,
              fontSize: 14,
              marginBottom: 14,
            }}
          >
            {durum.takvimler
              .filter((k) => k.yazilabilir)
              .map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ad}
                </option>
              ))}
          </select>

          <div style={{ fontSize: 13, color: c.textSecondary, marginBottom: 12 }}>
            {durum.sonEsitleme
              ? `${t("Son eşitleme:")} ${new Date(durum.sonEsitleme).toLocaleString(bicimDili(), { dateStyle: "short", timeStyle: "short" })}`
              : t("Henüz eşitlenmedi.")}
            {durum.sonHata && <div style={{ color: c.danger, marginTop: 4 }}>{durum.sonHata}</div>}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={mesgul || durum.kopuk}
              onClick={() => {
                const { from, to } = takvimAraligi();
                void calistir(() => googleTakvimApi.esitle(from, to, true));
              }}
              style={dugme(false)}
            >
              {t("Şimdi eşitle")}
            </button>
            <button
              type="button"
              disabled={mesgul || durum.kopuk}
              onClick={() => void calistir(() => googleTakvimApi.takvimleriYenile())}
              style={dugme(false)}
            >
              {t("Takvim listesini yenile")}
            </button>
            <button
              type="button"
              disabled={mesgul}
              onClick={() => {
                if (!window.confirm(t("Google Takvim bağlantısı kesilsin mi? Projelio'dan eklediğin etkinlikler Google Takvim'de kalır."))) return;
                void calistir(() => googleTakvimApi.kes());
              }}
              style={{ ...dugme(false), color: c.danger }}
            >
              {t("Bağlantıyı kes")}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Nötr takvim simgesi — marka logosu değil. */
function TakvimSimgesi() {
  const c = useThemeColors();
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="3" stroke={c.primary} strokeWidth="1.6" />
      <path d="M3 10h18" stroke={c.primary} strokeWidth="1.6" />
      <path d="M8 3v4M16 3v4" stroke={c.accent} strokeWidth="1.6" strokeLinecap="round" />
      <rect x="7" y="13" width="4" height="3.5" rx="1" fill={c.accent} />
    </svg>
  );
}
