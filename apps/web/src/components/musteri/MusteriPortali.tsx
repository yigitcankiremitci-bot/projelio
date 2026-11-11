import { useEffect, useState } from "react";
import type { MusteriPortalOzeti, Party, PortalKullanicisi, PortalYetkisi } from "@projelio/shared";
import { api } from "../../api/client";
import { portalApi } from "../../api/party";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { TAM_GENISLIK } from "./siparisOrtak";

const YETKILER: PortalYetkisi[] = ["siparis_ver", "fiyat_gor", "siparis_gecmisi"];

/**
 * Müşteri kartının "Web portalı" bölümü (web sitesi eklentisi, migration 188).
 * Şirkette etkin web sitesi bağlantısı yoksa HİÇ görünmez.
 *
 * Projelio şifre tutmaz: hesap açılınca portala imzalı bildirim gider, şifre
 * belirleme e-postasını portal kendisi gönderir. Burada yalnızca kim, hangi
 * yetkiyle, açık mı kapalı mı.
 *
 * İskonto müşteriye ait (party.iskonto_orani): liste fiyatı herkese aynı,
 * portal bu müşterinin fiyatını sunucudan hesaplanmış alır.
 */
export default function MusteriPortali({
  party,
  ozet,
  onOzet,
  yeniAcik = false,
  onYeniKapandi,
}: {
  party: Party;
  /** Kart okur (sekmeyi ve üstteki düğmeyi göstermek için); burada değişir. */
  ozet: MusteriPortalOzeti;
  onOzet: (o: MusteriPortalOzeti) => void;
  /** Kartın üstündeki "Portal hesabı aç" düğmesi formu doğrudan açar. */
  yeniAcik?: boolean;
  onYeniKapandi?: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [hata, setHata] = useState("");
  const [iskonto, setIskonto] = useState(party.iskontoOrani === undefined ? "" : String(party.iskontoOrani));
  const [iskontoKayitli, setIskontoKayitli] = useState(iskonto);
  const [yeni, setYeniYerel] = useState(yeniAcik);
  const [calisiyor, setCalisiyor] = useState(false);
  const setYeni = (v: boolean) => {
    setYeniYerel(v);
    if (!v) onYeniKapandi?.();
  };
  useEffect(() => {
    if (yeniAcik) setYeniYerel(true);
  }, [yeniAcik]);

  const etiket: Record<PortalYetkisi, string> = {
    siparis_ver: t("Sipariş verebilir"),
    fiyat_gor: t("Fiyat görebilir"),
    siparis_gecmisi: t("Sipariş geçmişini görebilir"),
  };

  const iskontoKaydet = async () => {
    if (iskonto === iskontoKayitli) return;
    const n = iskonto.trim() === "" ? null : Number(iskonto.replace(",", "."));
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100)) {
      setHata(t("İskonto oranı 0 ile 100 arasında olmalı"));
      return;
    }
    setHata("");
    try {
      const p = await api.patch<Party>(`/party/${party.id}`, { iskontoOrani: n });
      const yeniDeger = p.iskontoOrani === undefined ? "" : String(p.iskontoOrani);
      setIskonto(yeniDeger);
      setIskontoKayitli(yeniDeger);
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    }
  };

  const degisti = (k: PortalKullanicisi) =>
    onOzet({ ...ozet, kullanicilar: ozet.kullanicilar.some((x) => x.id === k.id) ? ozet.kullanicilar.map((x) => (x.id === k.id ? k : x)) : [...ozet.kullanicilar, k] });

  const guncelle = async (k: PortalKullanicisi, govde: Parameters<typeof portalApi.guncelle>[1]) => {
    setHata("");
    setCalisiyor(true);
    try {
      degisti(await portalApi.guncelle(k.id, govde));
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("İşlem başarısız"));
    } finally {
      setCalisiyor(false);
    }
  };

  const kucuk: React.CSSProperties = {
    fontSize: 13,
    padding: "2px 8px",
    borderRadius: 7,
    border: `1px solid ${c.border}`,
    background: "transparent",
    color: c.textSecondary,
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 10, border: `1px solid ${c.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, flex: 1 }}>{t("Web portalı")}</span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: c.textSecondary }}>
          {t("Müşteri iskontosu (%)")}
          <input
            inputMode="decimal"
            value={iskonto}
            disabled={!ozet.yazabilir}
            placeholder="0"
            onChange={(e) => setIskonto(e.target.value)}
            onBlur={iskontoKaydet}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            style={{ width: 64, fontSize: 13 }}
          />
        </label>
      </div>
      <span style={{ fontSize: 12, color: c.textSecondary }}>
        {t("İskonto KDV hariç liste fiyatına uygulanır, sonra KDV eklenir. Portal fiyatı sunucudan hesaplanmış alır.")}
      </span>

      {ozet.kullanicilar.length === 0 && !yeni && (
        <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Bu müşterinin henüz portal hesabı yok.")}</span>
      )}
      {ozet.kullanicilar.map((k) => (
        <div key={k.id} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, opacity: k.durum === "aktif" ? 1 : 0.6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ color: c.textPrimary, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
              {k.ad ? `${k.ad} · ${k.eposta}` : k.eposta}
              {ozet.baglantilar.length > 1 && <span style={{ color: c.textSecondary }}> · {k.baglantiAdi}</span>}
              {k.durum === "kapali" && <span style={{ color: c.textSecondary }}> · {t("Kapalı")}</span>}
            </span>
            {ozet.yazabilir &&
              (k.durum === "aktif" ? (
                <button
                  disabled={calisiyor}
                  style={kucuk}
                  onClick={() => window.confirm(t("Portal hesabı kapatılsın mı? Kişi portala giremez.")) && guncelle(k, { durum: "kapali" })}
                >
                  {t("Hesabı kapat")}
                </button>
              ) : (
                <button disabled={calisiyor} style={kucuk} onClick={() => guncelle(k, { durum: "aktif" })}>
                  {t("Yeniden aç")}
                </button>
              ))}
          </div>
          {k.durum === "aktif" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", color: c.textSecondary }}>
              {YETKILER.map((y) => (
                <label key={y} style={{ display: "flex", alignItems: "center", gap: 4, cursor: ozet.yazabilir ? "pointer" : "default" }}>
                  <input
                    type="checkbox"
                    checked={k.yetkiler.includes(y)}
                    disabled={!ozet.yazabilir || calisiyor}
                    onChange={(e) =>
                      guncelle(k, { yetkiler: e.target.checked ? [...k.yetkiler, y] : k.yetkiler.filter((x) => x !== y) })
                    }
                  />
                  {etiket[y]}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}

      {yeni ? (
        <YeniPortalKullanicisi
          party={party}
          ozet={ozet}
          etiket={etiket}
          onAcildi={(k) => {
            degisti(k);
            setYeni(false);
          }}
          onVazgec={() => setYeni(false)}
        />
      ) : (
        ozet.yazabilir && (
          <button
            onClick={() => setYeni(true)}
            style={{ alignSelf: "flex-start", fontSize: 14, fontWeight: 500, padding: "6px 14px", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, cursor: "pointer" }}
          >
            {ozet.kullanicilar.length === 0 ? t("Portal hesabı aç") : t("+ Portal kullanıcısı oluştur")}
          </button>
        )
      )}
      {hata && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{hata}</p>}
    </div>
  );
}

function YeniPortalKullanicisi({
  party,
  ozet,
  etiket,
  onAcildi,
  onVazgec,
}: {
  party: Party;
  ozet: MusteriPortalOzeti;
  etiket: Record<PortalYetkisi, string>;
  onAcildi: (k: PortalKullanicisi) => void;
  onVazgec: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  // Varsayılan e-posta müşteri kartındaki (yönerge, 2026-11-09).
  const [eposta, setEposta] = useState(party.email ?? "");
  const [ad, setAd] = useState("");
  const [yetkiler, setYetkiler] = useState<PortalYetkisi[]>([...YETKILER]);
  const [baglantiId, setBaglantiId] = useState(ozet.baglantilar[0]?.id ?? "");
  const [hata, setHata] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const kaydet = async () => {
    setHata("");
    setKaydediliyor(true);
    try {
      onAcildi(await portalApi.ac(party.id, { baglantiId, eposta: eposta.trim(), ad: ad.trim() || undefined, yetkiler }));
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setKaydediliyor(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
      {ozet.baglantilar.length > 1 && (
        <select value={baglantiId} onChange={(e) => setBaglantiId(e.target.value)} style={TAM_GENISLIK}>
          {ozet.baglantilar.map((b) => (
            <option key={b.id} value={b.id}>
              {b.ad}
            </option>
          ))}
        </select>
      )}
      <input type="email" placeholder={t("E-posta")} value={eposta} onChange={(e) => setEposta(e.target.value)} style={TAM_GENISLIK} />
      <input placeholder={t("Ad (isteğe bağlı)")} value={ad} onChange={(e) => setAd(e.target.value)} style={TAM_GENISLIK} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", color: c.textSecondary }}>
        {YETKILER.map((y) => (
          <label key={y} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={yetkiler.includes(y)}
              onChange={(e) => setYetkiler((l) => (e.target.checked ? YETKILER.filter((x) => x === y || l.includes(x)) : l.filter((x) => x !== y)))}
            />
            {etiket[y]}
          </label>
        ))}
      </div>
      <span style={{ color: c.textSecondary }}>
        {t("Şifre Projelio'da tutulmaz: portal bu adrese şifre belirleme e-postası gönderir.")}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          disabled={kaydediliyor || !eposta.trim()}
          onClick={kaydet}
          style={{ fontSize: 13, padding: "4px 12px", borderRadius: 7, border: "none", background: c.primary, color: c.onPrimary, cursor: "pointer" }}
        >
          {t("Hesabı oluştur")}
        </button>
        <button
          onClick={onVazgec}
          style={{ fontSize: 13, padding: "4px 12px", borderRadius: 7, border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary, cursor: "pointer" }}
        >
          {t("Vazgeç")}
        </button>
      </div>
      {hata && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{hata}</p>}
    </div>
  );
}
