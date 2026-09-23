import { useState } from "react";
import {
  ODEME_YONTEMI_ETIKET,
  ODEME_YONTEMLERI,
  evrakliMi,
  kalanTutar,
  siparisDurumu,
  tahsilatTutariHatasi,
  tahsilEdilen,
  type MusteriSiparisi,
  type OdemeYontemi,
} from "@projelio/shared";
import { siparisApi } from "../../api/party";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { fmtPara, fmtTarih } from "../butce/butceBicim";
import { IconTrash } from "../icons";
import SiparisFormu from "./SiparisFormu";
import { Alan, DurumRozeti, TAM_GENISLIK, bugunYerel } from "./siparisOrtak";

/**
 * Tek sipariş: özet satırı + açılınca tahsilatlar, "tahsil et", düzenle, sil.
 *
 * Hem müşteri kartındaki Siparişler sekmesi hem Tahsilat takibi görünümü
 * bunu kullanır; `musteriAdiGoster` ikincisinde satırın kime ait olduğunu yazar.
 */
export default function SiparisKarti({
  siparis,
  yazabilir,
  musteriAdiGoster = false,
  sorumluGoster = false,
  onDegisti,
  onSilindi,
}: {
  siparis: MusteriSiparisi;
  yazabilir: boolean;
  musteriAdiGoster?: boolean;
  sorumluGoster?: boolean;
  onDegisti: (s: MusteriSiparisi) => void;
  onSilindi: (id: string) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [acik, setAcik] = useState(false);
  const [mod, setMod] = useState<"tahsil" | "duzenle" | null>(null);
  const [hata, setHata] = useState("");

  const bugun = bugunYerel();
  const durum = siparisDurumu(siparis, bugun);
  const kalan = kalanTutar(siparis);
  const odenen = tahsilEdilen(siparis);
  const para = siparis.paraBirimi;

  const baslik = [
    musteriAdiGoster ? siparis.partyName : undefined,
    siparis.aciklama || (siparis.siparisNo ? `#${siparis.siparisNo}` : undefined),
  ]
    .filter(Boolean)
    .join(" · ");

  const geriAl = async (tahsilatId: string) => {
    if (!window.confirm(t("Bu tahsilat geri alınsın mı? Kasadaki gelir kaydı da silinir."))) return;
    setHata("");
    try {
      onDegisti(await siparisApi.tahsilatiGeriAl(tahsilatId));
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("İşlem başarısız"));
    }
  };

  const sil = async () => {
    if (!window.confirm(t("Sipariş silinsin mi?"))) return;
    setHata("");
    try {
      await siparisApi.sil(siparis.id);
      onSilindi(siparis.id);
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Silinemedi"));
    }
  };

  const kucukDugme: React.CSSProperties = {
    fontSize: 12,
    padding: "3px 10px",
    borderRadius: 7,
    border: `1px solid ${c.border}`,
    background: "transparent",
    color: c.textSecondary,
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", background: c.background, borderRadius: 8 }}>
      <button
        type="button"
        onClick={() => setAcik((x) => !x)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          width: "100%",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis" }}>
              {baslik || t("Sipariş")}
            </span>
            <DurumRozeti durum={durum} />
          </div>
          <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
            {[
              t("Vade {tarih}", { tarih: fmtTarih(siparis.vadeTarihi) }),
              siparis.miktar !== undefined ? `${siparis.miktar}${siparis.birim ? ` ${siparis.birim}` : ""}` : undefined,
              t(ODEME_YONTEMI_ETIKET[siparis.odemeYontemi]),
              sorumluGoster ? siparis.sorumluAdi ?? t("Sorumlu yok") : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary }}>{fmtPara(siparis.tutar, para)}</div>
          {odenen > 0 && kalan > 0 && (
            <div style={{ fontSize: 11, color: durum === "gecikti" ? c.danger : c.textSecondary }}>
              {t("Kalan {tutar}", { tutar: fmtPara(kalan, para) })}
            </div>
          )}
        </div>
      </button>

      {acik && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 10px 10px" }}>
          <div style={{ fontSize: 12, color: c.textSecondary, display: "flex", flexWrap: "wrap", gap: "2px 12px" }}>
            <span>{t("Sipariş tarihi: {tarih}", { tarih: fmtTarih(siparis.siparisTarihi) })}</span>
            <span>{t("{gun} gün vade", { gun: siparis.vadeGun })}</span>
            {siparis.siparisNo && <span>#{siparis.siparisNo}</span>}
            {evrakliMi(siparis.odemeYontemi) && (siparis.evrakNo || siparis.evrakVadesi) && (
              <span>
                {[siparis.evrakNo ? `No ${siparis.evrakNo}` : undefined, siparis.evrakVadesi ? fmtTarih(siparis.evrakVadesi) : undefined]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
          </div>
          {siparis.notlar && <div style={{ fontSize: 12, color: c.textPrimary, whiteSpace: "pre-wrap" }}>{siparis.notlar}</div>}

          {siparis.tahsilatlar.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 500, color: c.textPrimary }}>
                {t("Tahsilatlar")} · {fmtPara(odenen, para)}
              </span>
              {siparis.tahsilatlar.map((x) => (
                <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <span style={{ flex: 1, color: c.textPrimary, minWidth: 0 }}>
                    {fmtTarih(x.tarih)} · {fmtPara(x.tutar, para)} · {t(ODEME_YONTEMI_ETIKET[x.odemeYontemi])}
                    {x.evrakNo && <span style={{ color: c.textSecondary }}> · No {x.evrakNo}</span>}
                    {x.evrakVadesi && <span style={{ color: c.textSecondary }}> · {fmtTarih(x.evrakVadesi)}</span>}
                    {x.createdByName && <span style={{ color: c.textSecondary }}> — {x.createdByName}</span>}
                  </span>
                  {yazabilir && (
                    <button onClick={() => geriAl(x.id)} style={{ ...kucukDugme, padding: "1px 8px", fontSize: 11 }}>
                      {t("Geri al")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {mod === "tahsil" ? (
            <TahsilatFormu
              siparis={siparis}
              onKaydedildi={(s) => {
                setMod(null);
                onDegisti(s);
              }}
              onVazgec={() => setMod(null)}
            />
          ) : mod === "duzenle" ? (
            <SiparisFormu
              partyId={siparis.partyId}
              mevcut={siparis}
              onKaydedildi={(s) => {
                setMod(null);
                onDegisti(s);
              }}
              onVazgec={() => setMod(null)}
            />
          ) : (
            yazabilir && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {kalan > 0 && (
                  <button
                    onClick={() => setMod("tahsil")}
                    style={{ ...kucukDugme, border: "none", background: c.primary, color: c.onPrimary }}
                  >
                    {t("Tahsil et")}
                  </button>
                )}
                <button onClick={() => setMod("duzenle")} style={kucukDugme}>
                  {t("Düzenle")}
                </button>
                {siparis.tahsilatlar.length === 0 && (
                  <button
                    onClick={sil}
                    aria-label={t("Siparişi sil")}
                    title={t("Siparişi sil")}
                    style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", padding: 3 }}
                  >
                    <IconTrash size={14} color={c.textSecondary} />
                  </button>
                )}
              </div>
            )
          )}
          {hata && <p style={{ color: c.danger, fontSize: 12, margin: 0 }}>{hata}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Tahsilat girişi. Tutar kalanla dolu gelir — en sık iş "tamamı geldi";
 * kısmi ödemede kullanıcı rakamı değiştirir. Kalanı aşan tutar hem burada
 * hem sunucuda reddedilir (aynı fonksiyon: tahsilatTutariHatasi).
 */
function TahsilatFormu({
  siparis,
  onKaydedildi,
  onVazgec,
}: {
  siparis: MusteriSiparisi;
  onKaydedildi: (s: MusteriSiparisi) => void;
  onVazgec: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [tutar, setTutar] = useState(String(kalanTutar(siparis)));
  const [tarih, setTarih] = useState(bugunYerel());
  const [yontem, setYontem] = useState<OdemeYontemi>(siparis.odemeYontemi);
  const [evrakNo, setEvrakNo] = useState(siparis.evrakNo ?? "");
  const [evrakVadesi, setEvrakVadesi] = useState(siparis.evrakVadesi ?? "");
  const [hata, setHata] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const kaydet = async () => {
    const sayi = Number(tutar.replace(",", "."));
    const h = tahsilatTutariHatasi(siparis, sayi);
    if (h) {
      setHata(t(h));
      return;
    }
    setHata("");
    setKaydediliyor(true);
    try {
      onKaydedildi(
        await siparisApi.tahsilEt(siparis.id, {
          tutar: sayi,
          tarih,
          odemeYontemi: yontem,
          evrakNo: evrakliMi(yontem) ? evrakNo : undefined,
          evrakVadesi: evrakliMi(yontem) && evrakVadesi ? evrakVadesi : undefined,
        })
      );
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setKaydediliyor(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, border: `1px solid ${c.border}`, borderRadius: 8, padding: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Alan label={t("Gelen tutar ({para})", { para: siparis.paraBirimi })} style={{ flex: "1 1 120px" }}>
          <input inputMode="decimal" value={tutar} onChange={(e) => setTutar(e.target.value)} style={TAM_GENISLIK} />
        </Alan>
        <Alan label={t("Tarih")} style={{ flex: "1 1 130px" }}>
          <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} style={TAM_GENISLIK} />
        </Alan>
        <Alan label={t("Ödeme yöntemi")} style={{ flex: "1 1 130px" }}>
          <select value={yontem} onChange={(e) => setYontem(e.target.value as OdemeYontemi)} style={TAM_GENISLIK}>
            {ODEME_YONTEMLERI.map((y) => (
              <option key={y} value={y}>
                {t(ODEME_YONTEMI_ETIKET[y])}
              </option>
            ))}
          </select>
        </Alan>
      </div>
      {evrakliMi(yontem) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Alan label={yontem === "cek" ? t("Çek no") : t("Senet no")} style={{ flex: "1 1 120px" }}>
            <input value={evrakNo} onChange={(e) => setEvrakNo(e.target.value)} style={TAM_GENISLIK} />
          </Alan>
          <Alan label={yontem === "cek" ? t("Çek vadesi") : t("Senet vadesi")} style={{ flex: "1 1 130px" }}>
            <input type="date" value={evrakVadesi} onChange={(e) => setEvrakVadesi(e.target.value)} style={TAM_GENISLIK} />
          </Alan>
        </div>
      )}
      <span style={{ fontSize: 12, color: c.textSecondary }}>
        {t("Kasaya gelir olarak işlenir. Kalan: {tutar}", { tutar: fmtPara(kalanTutar(siparis), siparis.paraBirimi) })}
      </span>
      {hata && <p style={{ color: c.danger, fontSize: 12, margin: 0 }}>{hata}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={kaydet}
          disabled={kaydediliyor}
          style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 13 }}
        >
          {kaydediliyor ? t("Kaydediliyor…") : t("Tahsilatı kaydet")}
        </button>
        <button
          onClick={onVazgec}
          style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary, fontSize: 13 }}
        >
          {t("Vazgeç")}
        </button>
      </div>
    </div>
  );
}
