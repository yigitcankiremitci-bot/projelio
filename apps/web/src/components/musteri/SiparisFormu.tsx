import { useState } from "react";
import {
  ODEME_YONTEMI_ETIKET,
  ODEME_YONTEMLERI,
  evrakliMi,
  tahsilEdilen,
  vadeTarihiHesapla,
  type MusteriSiparisi,
  type OdemeYontemi,
} from "@projelio/shared";
import { siparisApi, type SiparisGovdesi } from "../../api/party";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { PARA_BIRIMLERI, fmtTarih } from "../butce/butceBicim";
import { Alan, TAM_GENISLIK, bugunYerel } from "./siparisOrtak";

/** Sık kullanılan vadeler; listede olmayan gün sayısı elle yazılır. */
const HAZIR_VADELER = [0, 15, 30, 45, 60, 90, 120];

/**
 * Sipariş ekleme / düzenleme formu.
 *
 * Vade GÜN olarak girilir, tarih hesaplanıp önizlenir: satışta konuşulan dil
 * "60 gün vade", takvim tarihi değil. Veritabanı da aynı hesabı kendi yapıyor
 * (vade_tarihi hesaplanan sütun) — burada yalnızca gösteriliyor.
 */
export default function SiparisFormu({
  partyId,
  mevcut,
  onKaydedildi,
  onVazgec,
}: {
  partyId: string;
  mevcut?: MusteriSiparisi;
  onKaydedildi: (s: MusteriSiparisi) => void;
  onVazgec: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [f, setF] = useState(() => ({
    siparisNo: mevcut?.siparisNo ?? "",
    aciklama: mevcut?.aciklama ?? "",
    miktar: mevcut?.miktar !== undefined ? String(mevcut.miktar) : "",
    birim: mevcut?.birim ?? "",
    tutar: mevcut ? String(mevcut.tutar) : "",
    paraBirimi: mevcut?.paraBirimi ?? "TRY",
    siparisTarihi: mevcut?.siparisTarihi ?? bugunYerel(),
    vadeGun: String(mevcut?.vadeGun ?? 30),
    odemeYontemi: (mevcut?.odemeYontemi ?? "havale") as OdemeYontemi,
    evrakNo: mevcut?.evrakNo ?? "",
    evrakVadesi: mevcut?.evrakVadesi ?? "",
    notlar: mevcut?.notlar ?? "",
  }));
  const [hata, setHata] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const vadeGun = Math.max(0, Math.floor(Number(f.vadeGun) || 0));
  const tahsilatVar = !!mevcut && tahsilEdilen(mevcut) > 0;

  const kaydet = async () => {
    const tutar = Number(f.tutar.replace(",", "."));
    if (!Number.isFinite(tutar) || tutar <= 0) {
      setHata(t("Tutar sıfırdan büyük olmalı"));
      return;
    }
    const miktar = f.miktar.trim() === "" ? null : Number(f.miktar.replace(",", "."));
    if (miktar !== null && (!Number.isFinite(miktar) || miktar < 0)) {
      setHata(t("Miktar geçerli bir sayı olmalı"));
      return;
    }
    const govde: SiparisGovdesi = {
      siparisNo: f.siparisNo,
      aciklama: f.aciklama,
      miktar,
      birim: f.birim,
      tutar,
      paraBirimi: f.paraBirimi,
      siparisTarihi: f.siparisTarihi,
      vadeGun,
      odemeYontemi: f.odemeYontemi,
      evrakNo: f.evrakNo,
      evrakVadesi: f.evrakVadesi || undefined,
      notlar: f.notlar,
    };
    setHata("");
    setKaydediliyor(true);
    try {
      const s = mevcut ? await siparisApi.guncelle(mevcut.id, govde) : await siparisApi.ekle(partyId, govde);
      onKaydedildi(s);
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setKaydediliyor(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, background: c.background, borderRadius: 10, padding: 10 }}>
      <Alan label={t("Ne satıldı")}>
        <input
          value={f.aciklama}
          onChange={(e) => set("aciklama", e.target.value)}
          placeholder={t("Örn. 200 koli A4 kağıt")}
          style={TAM_GENISLIK}
        />
      </Alan>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Alan label={t("Sipariş no")} style={{ flex: "1 1 120px" }}>
          <input value={f.siparisNo} onChange={(e) => set("siparisNo", e.target.value)} style={TAM_GENISLIK} />
        </Alan>
        <Alan label={t("Miktar")} style={{ flex: "1 1 80px" }}>
          <input inputMode="decimal" value={f.miktar} onChange={(e) => set("miktar", e.target.value)} style={TAM_GENISLIK} />
        </Alan>
        <Alan label={t("Birim")} style={{ flex: "1 1 80px" }}>
          <input
            value={f.birim}
            onChange={(e) => set("birim", e.target.value)}
            placeholder={t("adet, kg, koli")}
            style={TAM_GENISLIK}
          />
        </Alan>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Alan label={t("Tutar *")} style={{ flex: "2 1 140px" }}>
          <input inputMode="decimal" value={f.tutar} onChange={(e) => set("tutar", e.target.value)} style={TAM_GENISLIK} />
        </Alan>
        <Alan label={t("Para birimi")} style={{ flex: "1 1 90px" }}>
          <select
            value={f.paraBirimi}
            onChange={(e) => set("paraBirimi", e.target.value)}
            // Tahsilat defterde bu birimle duruyor; sunucu da değiştirmeyi reddediyor.
            disabled={tahsilatVar}
            style={TAM_GENISLIK}
          >
            {(PARA_BIRIMLERI.includes(f.paraBirimi) ? PARA_BIRIMLERI : [f.paraBirimi, ...PARA_BIRIMLERI]).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Alan>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Alan label={t("Sipariş tarihi")} style={{ flex: "1 1 140px" }}>
          <input type="date" value={f.siparisTarihi} onChange={(e) => set("siparisTarihi", e.target.value)} style={TAM_GENISLIK} />
        </Alan>
        <Alan label={t("Vade (gün)")} style={{ flex: "1 1 110px" }}>
          <input
            type="number"
            min={0}
            list="projelio-hazir-vadeler"
            value={f.vadeGun}
            onChange={(e) => set("vadeGun", e.target.value)}
            style={TAM_GENISLIK}
          />
          <datalist id="projelio-hazir-vadeler">
            {HAZIR_VADELER.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Alan>
      </div>
      {f.siparisTarihi && (
        <span style={{ fontSize: 12, color: c.textSecondary, marginTop: -4 }}>
          {t("Vade tarihi: {tarih}", { tarih: fmtTarih(vadeTarihiHesapla(f.siparisTarihi, vadeGun)) })}
        </span>
      )}

      <Alan label={t("Ödeme yöntemi")}>
        <select
          value={f.odemeYontemi}
          onChange={(e) => set("odemeYontemi", e.target.value as OdemeYontemi)}
          style={TAM_GENISLIK}
        >
          {ODEME_YONTEMLERI.map((y) => (
            <option key={y} value={y}>
              {t(ODEME_YONTEMI_ETIKET[y])}
            </option>
          ))}
        </select>
      </Alan>

      {evrakliMi(f.odemeYontemi) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Alan label={f.odemeYontemi === "cek" ? t("Çek no") : t("Senet no")} style={{ flex: "1 1 120px" }}>
            <input value={f.evrakNo} onChange={(e) => set("evrakNo", e.target.value)} style={TAM_GENISLIK} />
          </Alan>
          <Alan label={f.odemeYontemi === "cek" ? t("Çek vadesi") : t("Senet vadesi")} style={{ flex: "1 1 140px" }}>
            <input type="date" value={f.evrakVadesi} onChange={(e) => set("evrakVadesi", e.target.value)} style={TAM_GENISLIK} />
          </Alan>
        </div>
      )}

      <Alan label={t("Not")}>
        <textarea
          value={f.notlar}
          onChange={(e) => set("notlar", e.target.value)}
          rows={2}
          style={{ ...TAM_GENISLIK, resize: "vertical", fontFamily: "inherit" }}
        />
      </Alan>

      {hata && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{hata}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={kaydet}
          disabled={kaydediliyor}
          style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 14 }}
        >
          {kaydediliyor ? t("Kaydediliyor…") : mevcut ? t("Güncelle") : t("Siparişi kaydet")}
        </button>
        <button
          onClick={onVazgec}
          style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary, fontSize: 14 }}
        >
          {t("Vazgeç")}
        </button>
      </div>
    </div>
  );
}
