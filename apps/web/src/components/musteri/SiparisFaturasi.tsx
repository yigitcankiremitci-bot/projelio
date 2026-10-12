import { useState } from "react";
import { MODULE_RECORD_CONFIGS, type MusteriSiparisi } from "@projelio/shared";
import { faturalarApi } from "../../api/faturalar";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { fmtTarih } from "../butce/butceBicim";
import KayitEkleri from "../KayitEkleri";
import { Alan, TAM_GENISLIK } from "./siparisOrtak";

/**
 * Siparişin faturası (bkz. migration 166).
 *
 * Fatura burada AÇILIR ama Faturalar modülünde YAŞAR: kayıt fm_fatura'nın
 * kaydı, belgesi fatura tarihinin ay klasöründe ve ay sonu arşivinde. Yani
 * muhasebeciye giden pakete ayrıca bir şey yapmadan girer.
 *
 * Belge isteğe bağlı: fatura numarası bugün bilinip PDF'i yarın gelebilir;
 * belgeler kayıt açıldıktan sonra aşağıdaki kutudan eklenir.
 */
export default function SiparisFaturasi({
  siparis,
  yazabilir,
  onDegisti,
}: {
  siparis: MusteriSiparisi;
  yazabilir: boolean;
  onDegisti: (s: MusteriSiparisi) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [form, setForm] = useState(false);
  const [faturaNo, setFaturaNo] = useState("");
  const [tarih, setTarih] = useState(siparis.siparisTarihi);
  const [dosya, setDosya] = useState<File | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");

  const ayar = MODULE_RECORD_CONFIGS.fm_fatura?.attachments;
  const fatura = siparis.fatura;

  const kucukDugme: React.CSSProperties = {
    fontSize: 12,
    padding: "3px 10px",
    borderRadius: 7,
    border: `1px solid ${c.border}`,
    background: "transparent",
    color: c.textSecondary,
    cursor: "pointer",
  };

  const ac = async () => {
    setHata("");
    setCalisiyor(true);
    try {
      onDegisti(await faturalarApi.siparisFaturasi(siparis.id, { faturaNo: faturaNo.trim(), tarih }, dosya ?? undefined));
      setForm(false);
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Fatura eklenemedi"));
    } finally {
      setCalisiyor(false);
    }
  };

  const kaldir = async () => {
    if (!window.confirm(t("Fatura bu siparişten ayrılsın mı? Fatura kaydı ve belgesi Faturalar'da kalır."))) return;
    setHata("");
    try {
      onDegisti(await faturalarApi.siparisFaturasiniKaldir(siparis.id));
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("İşlem başarısız"));
    }
  };

  if (!fatura && !yazabilir) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: c.textPrimary, flex: 1, minWidth: 0 }}>
          {fatura
            ? [t("Fatura"), fatura.faturaNo ? `#${fatura.faturaNo}` : undefined, fatura.tarih ? fmtTarih(fatura.tarih) : undefined]
                .filter(Boolean)
                .join(" · ")
            : t("Fatura")}
        </span>
        {fatura && yazabilir && (
          <button onClick={kaldir} style={{ ...kucukDugme, padding: "1px 8px", fontSize: 11 }}>
            {t("Bağı kaldır")}
          </button>
        )}
        {!fatura && !form && (
          <button onClick={() => setForm(true)} style={kucukDugme}>
            {t("Fatura ekle")}
          </button>
        )}
      </div>

      {!fatura && form && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Alan label={t("Fatura no")} style={{ flex: "1 1 120px" }}>
              <input value={faturaNo} onChange={(e) => setFaturaNo(e.target.value)} style={TAM_GENISLIK} />
            </Alan>
            <Alan label={t("Fatura tarihi")} style={{ flex: "1 1 140px" }}>
              <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} style={TAM_GENISLIK} />
            </Alan>
          </div>
          <Alan label={t("Belge (isteğe bağlı)")}>
            <input type="file" onChange={(e) => setDosya(e.target.files?.[0] ?? null)} style={TAM_GENISLIK} />
          </Alan>
          <span style={{ fontSize: 12, color: c.textSecondary }}>
            {t("Fatura, Faturalar modülüne kaydedilir; belgesi fatura tarihinin ay klasörüne iner ve ay sonu arşivine girer.")}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={ac}
              disabled={calisiyor}
              style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 13 }}
            >
              {calisiyor ? t("Kaydediliyor…") : t("Faturayı kaydet")}
            </button>
            <button onClick={() => setForm(false)} style={{ ...kucukDugme, padding: "7px 14px", fontSize: 13 }}>
              {t("Vazgeç")}
            </button>
          </div>
        </div>
      )}

      {hata && <p style={{ color: c.danger, fontSize: 12, margin: 0 }}>{hata}</p>}

      {fatura && ayar && <KayitEkleri recordId={fatura.id} ayar={ayar} canWrite={yazabilir} />}
    </div>
  );
}
