import { useEffect, useMemo, useState } from "react";
import {
  siparisDurumu,
  tahsilatRaporu,
  type MusteriSiparisi,
  type TahsilatRaporSatiri,
} from "@projelio/shared";
import { siparisApi } from "../../api/party";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { fmtPara } from "../butce/butceBicim";
import SiparisKarti from "./SiparisKarti";
import { ayEtiketi, bugunYerel } from "./siparisOrtak";

type DurumSuzgeci = "acik" | "gecikti" | "tahsil_edildi" | "hepsi";

/**
 * Tahsilat takibi — Müşteriler ekranının ikinci görünümü.
 *
 * Çalışan için: bu ay vadesi gelen, kendisine atanmış müşterilerin
 * siparişleri; "tahsil et" tek tık. Yönetici için ek olarak çalışan × ay
 * raporu ve sorumlu süzgeci. Kimin neyi göreceğine SUNUCU karar veriyor
 * (bkz. backend party/siparis-erisim.ts); burada yalnızca gösterim var.
 *
 * Ay, VADE ayıdır: "Ekim'de ne gelmeliydi, ne geldi". Tahsilat raporuyla
 * (tahsilatRaporu) aynı eksen — ikisi farklı ay tanımı kullansaydı liste ile
 * rapor aynı ay için farklı rakam gösterirdi.
 */
export default function TahsilatTakibi({ kapsamYolu, departmentId }: { kapsamYolu: string; departmentId?: string }) {
  const c = useThemeColors();
  const t = useT();
  const bugun = bugunYerel();
  const buAy = bugun.slice(0, 7);

  const [siparisler, setSiparisler] = useState<MusteriSiparisi[] | null>(null);
  const [yonetici, setYonetici] = useState(false);
  const [hata, setHata] = useState("");
  const [ay, setAy] = useState(buAy);
  const [durum, setDurum] = useState<DurumSuzgeci>("acik");
  const [sorumlu, setSorumlu] = useState("");

  useEffect(() => {
    let iptal = false;
    setSiparisler(null);
    siparisApi
      .kapsamdakiler(kapsamYolu, departmentId)
      .then((r) => {
        if (iptal) return;
        setSiparisler(r.siparisler);
        setYonetici(r.yonetici);
      })
      .catch((err) => {
        if (iptal) return;
        setSiparisler([]);
        setHata(err instanceof Error ? err.message : t("Yüklenemedi"));
      });
    return () => {
      iptal = true;
    };
  }, [kapsamYolu, departmentId]);

  const tumu = siparisler ?? [];

  const aylar = useMemo(() => {
    const set = new Set<string>([buAy]);
    for (const s of tumu) set.add(s.vadeTarihi.slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [siparisler]);

  const sorumlular = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of tumu) m.set(s.sorumluId ?? "", s.sorumluAdi ?? t("Sorumlu yok"));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "tr"));
  }, [siparisler]);

  // Ay + sorumlu süzgeci: rapor ve özet bunun üzerinden, durum süzgecinden
  // BAĞIMSIZ — "yalnızca açıkları göster" demek raporun tahsil edilen
  // sütununu sıfırlamamalı.
  const kapsamda = useMemo(
    () =>
      tumu.filter(
        (s) => (!ay || s.vadeTarihi.startsWith(ay)) && (!sorumlu || (s.sorumluId ?? "") === sorumlu)
      ),
    [siparisler, ay, sorumlu]
  );

  const liste = useMemo(
    () =>
      kapsamda.filter((s) => {
        const d = siparisDurumu(s, bugun);
        if (durum === "hepsi") return true;
        if (durum === "acik") return d !== "tahsil_edildi";
        return d === durum;
      }),
    [kapsamda, durum]
  );

  const rapor = useMemo(() => tahsilatRaporu(kapsamda, bugun), [kapsamda]);

  // Özet şeridi: para birimi başına (kur dönüşümü yok).
  const ozet = useMemo(() => {
    const m = new Map<string, { beklenen: number; tahsil: number; kalan: number; geciken: number }>();
    for (const r of rapor) {
      const k = m.get(r.paraBirimi) ?? { beklenen: 0, tahsil: 0, kalan: 0, geciken: 0 };
      k.beklenen += r.beklenen;
      k.tahsil += r.tahsilEdilen;
      k.kalan += r.kalan;
      k.geciken += r.geciken;
      m.set(r.paraBirimi, k);
    }
    return Array.from(m.entries());
  }, [rapor]);

  // Seçili ayın DIŞINDA kalmış gecikmiş alacak: ay süzgeci onu gizliyor ama
  // takip edilmesi gereken asıl şey o.
  const baskaAyGeciken = useMemo(
    () =>
      ay
        ? tumu.filter(
            (s) =>
              !s.vadeTarihi.startsWith(ay) &&
              (!sorumlu || (s.sorumluId ?? "") === sorumlu) &&
              siparisDurumu(s, bugun) === "gecikti"
          ).length
        : 0,
    [siparisler, ay, sorumlu]
  );

  const degisti = (s: MusteriSiparisi) => setSiparisler((l) => (l ?? []).map((x) => (x.id === s.id ? s : x)));

  const raporuIndir = () => {
    const baslik = [t("Çalışan"), t("Vade ayı"), t("Para birimi"), t("Sipariş"), t("Beklenen"), t("Tahsil edilen"), t("Kalan"), t("Geciken")];
    const satirlar = rapor.map((r) => [
      r.sorumluAdi ?? t("Sorumlu yok"),
      r.ay,
      r.paraBirimi,
      r.siparisSayisi,
      r.beklenen,
      r.tahsilEdilen,
      r.kalan,
      r.geciken,
    ]);
    const hucre = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    // Excel'in Türkçe karakterleri doğru açması için BOM; ayraç ";" çünkü
    // Türkçe Excel virgülü ondalık ayırıcı sayıyor.
    const csv = "\uFEFF" + [baslik, ...satirlar].map((r) => r.map(hucre).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t("tahsilat-raporu")}-${ay || t("tum-aylar")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!siparisler) return <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>;

  const secim: React.CSSProperties = { fontSize: 13, padding: "5px 6px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <select value={ay} onChange={(e) => setAy(e.target.value)} style={secim} aria-label={t("Vade ayı")}>
          <option value="">{t("Tüm aylar")}</option>
          {aylar.map((a) => (
            <option key={a} value={a}>
              {ayEtiketi(a)}
            </option>
          ))}
        </select>
        <select value={durum} onChange={(e) => setDurum(e.target.value as DurumSuzgeci)} style={secim} aria-label={t("Durum")}>
          <option value="acik">{t("Açık olanlar")}</option>
          <option value="gecikti">{t("Gecikenler")}</option>
          <option value="tahsil_edildi">{t("Tahsil edilenler")}</option>
          <option value="hepsi">{t("Hepsi")}</option>
        </select>
        {yonetici && sorumlular.length > 1 && (
          <select value={sorumlu} onChange={(e) => setSorumlu(e.target.value)} style={secim} aria-label={t("Sorumlu")}>
            <option value="">{t("Tüm çalışanlar")}</option>
            {sorumlular.map(([id, ad]) => (
              <option key={id || "yok"} value={id}>
                {ad}
              </option>
            ))}
          </select>
        )}
      </div>

      {!yonetici && (
        <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Yalnızca sana atanmış müşterilerin siparişleri görünüyor.")}</span>
      )}

      {ozet.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ozet.map(([para, o]) => (
            <div key={para} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Kutu etiket={t("Beklenen")} deger={fmtPara(o.beklenen, para)} />
              <Kutu etiket={t("Tahsil edilen")} deger={fmtPara(o.tahsil, para)} renk={c.success} />
              <Kutu etiket={t("Kalan")} deger={fmtPara(o.kalan, para)} />
              {o.geciken > 0 && <Kutu etiket={t("Geciken")} deger={fmtPara(o.geciken, para)} renk={c.danger} />}
            </div>
          ))}
        </div>
      )}

      {baskaAyGeciken > 0 && (
        <button
          onClick={() => {
            setAy("");
            setDurum("gecikti");
          }}
          style={{
            alignSelf: "flex-start",
            fontSize: 12,
            padding: "5px 10px",
            borderRadius: 8,
            border: `1px solid ${c.danger}55`,
            background: "transparent",
            color: c.danger,
            cursor: "pointer",
          }}
        >
          {t("Başka aylarda {n} gecikmiş sipariş var — göster", { n: baskaAyGeciken })}
        </button>
      )}

      {hata && <p style={{ color: c.danger, fontSize: 12, margin: 0 }}>{hata}</p>}

      {liste.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>
          {tumu.length === 0
            ? t("Henüz sipariş yok. Siparişler müşteri kartındaki Siparişler sekmesinden eklenir.")
            : t("Bu süzgeçle eşleşen sipariş yok.")}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {liste.map((s) => (
            <SiparisKarti
              key={s.id}
              siparis={s}
              // Liste zaten sunucunun izin verdiği siparişler: yönetici hepsine,
              // çalışan yalnızca kendi müşterilerine yazar.
              yazabilir
              musteriAdiGoster
              sorumluGoster={yonetici}
              onDegisti={degisti}
              onSilindi={(id) => setSiparisler((l) => (l ?? []).filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}

      {yonetici && rapor.length > 0 && <Rapor rapor={rapor} onIndir={raporuIndir} />}
    </div>
  );
}

function Kutu({ etiket, deger, renk }: { etiket: string; deger: string; renk?: string }) {
  const c = useThemeColors();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "6px 12px",
        borderRadius: 8,
        background: c.background,
        border: `1px solid ${c.border}`,
        minWidth: 96,
      }}
    >
      <span style={{ fontSize: 11, color: c.textSecondary }}>{etiket}</span>
      <span style={{ fontSize: 15, fontWeight: 500, color: renk ?? c.textPrimary }}>{deger}</span>
    </div>
  );
}

/** Yönetici raporu: çalışan × vade ayı × para birimi. */
function Rapor({ rapor, onIndir }: { rapor: TahsilatRaporSatiri[]; onIndir: () => void }) {
  const c = useThemeColors();
  const t = useT();
  const th: React.CSSProperties = { textAlign: "right", fontWeight: 500, color: c.textSecondary, padding: "4px 6px", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { textAlign: "right", padding: "4px 6px", whiteSpace: "nowrap", color: c.textPrimary };
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h6 style={{ fontSize: 13, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{t("Çalışan bazında tahsilat raporu")}</h6>
        <button
          onClick={onIndir}
          style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
        >
          {t("CSV indir")}
        </button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${c.border}` }}>
              <th style={{ ...th, textAlign: "left" }}>{t("Çalışan")}</th>
              <th style={{ ...th, textAlign: "left" }}>{t("Vade ayı")}</th>
              <th style={th}>{t("Sipariş")}</th>
              <th style={th}>{t("Beklenen")}</th>
              <th style={th}>{t("Tahsil edilen")}</th>
              <th style={th}>{t("Kalan")}</th>
              <th style={th}>{t("Geciken")}</th>
            </tr>
          </thead>
          <tbody>
            {rapor.map((r) => (
              <tr key={`${r.sorumluId}|${r.ay}|${r.paraBirimi}`} style={{ borderBottom: `1px solid ${c.border}` }}>
                <td style={{ ...td, textAlign: "left" }}>{r.sorumluAdi ?? t("Sorumlu yok")}</td>
                <td style={{ ...td, textAlign: "left" }}>{ayEtiketi(r.ay)}</td>
                <td style={td}>{r.siparisSayisi}</td>
                <td style={td}>{fmtPara(r.beklenen, r.paraBirimi)}</td>
                <td style={{ ...td, color: c.success }}>{fmtPara(r.tahsilEdilen, r.paraBirimi)}</td>
                <td style={td}>{fmtPara(r.kalan, r.paraBirimi)}</td>
                <td style={{ ...td, color: r.geciken > 0 ? c.danger : c.textSecondary }}>{fmtPara(r.geciken, r.paraBirimi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
