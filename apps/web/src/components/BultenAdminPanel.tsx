import { useCallback, useEffect, useMemo, useState } from "react";
import type { BultenAbonesi } from "@projelio/shared";
import { bultenApi } from "../api/bulten";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { bicimDili } from "../lib/i18n/depo";

/**
 * Yönetici: tanıtım sitesindeki (projelio.app) bülten formundan gelen adresler.
 *
 * Bunlar üye değil — hesabı olmayan ziyaretçiler. "İptal et" satırı silmez,
 * rızanın geri alındığını kaydeder; KVKK silme talebinde "Sil" kullanılır.
 * CSV dışa aktarma yalnızca aktif aboneleri alır: iptal etmiş birine bülten
 * gitmesin diye.
 */
export default function BultenAdminPanel() {
  const c = useThemeColors();
  const t = useT();
  const [liste, setListe] = useState<BultenAbonesi[] | null>(null);
  const [hata, setHata] = useState("");
  const [ara, setAra] = useState("");
  const [iptallerGorunsun, setIptallerGorunsun] = useState(false);
  const [mesgul, setMesgul] = useState<string | null>(null);

  const yukle = useCallback(() => {
    return bultenApi
      .listele()
      .then((l) => {
        setListe(l);
        setHata("");
      })
      .catch((e: any) => setHata(e?.message ?? t("Liste alınamadı.")));
  }, [t]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  const aktifler = useMemo(() => (liste ?? []).filter((a) => !a.iptalAt), [liste]);
  const gorunen = useMemo(() => {
    const q = ara.trim().toLowerCase();
    return (liste ?? []).filter((a) => (iptallerGorunsun || !a.iptalAt) && (!q || a.eposta.includes(q)));
  }, [liste, ara, iptallerGorunsun]);

  const iptalEt = async (a: BultenAbonesi) => {
    if (!window.confirm(t("{eposta} bülten listesinden çıkarılsın mı?", { eposta: a.eposta }))) return;
    setMesgul(a.id);
    try {
      const yeni = await bultenApi.iptal(a.id);
      setListe((l) => l?.map((x) => (x.id === a.id ? yeni : x)) ?? null);
    } catch (e: any) {
      setHata(e?.message ?? t("İşlem yapılamadı."));
    } finally {
      setMesgul(null);
    }
  };

  const sil = async (a: BultenAbonesi) => {
    if (!window.confirm(t("{eposta} kalıcı olarak silinsin mi? Rıza kaydı da gider.", { eposta: a.eposta }))) return;
    setMesgul(a.id);
    try {
      await bultenApi.sil(a.id);
      setListe((l) => l?.filter((x) => x.id !== a.id) ?? null);
    } catch (e: any) {
      setHata(e?.message ?? t("İşlem yapılamadı."));
    } finally {
      setMesgul(null);
    }
  };

  const csvIndir = () => {
    const satirlar = [["eposta", "dil", "kaynak", "izin_tarihi"], ...aktifler.map((a) => [a.eposta, a.dil, a.kaynak ?? "", a.izinAt])];
    const csv = satirlar.map((s) => s.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `bulten-aboneleri-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString(bicimDili(), { dateStyle: "short", timeStyle: "short" });
  const dugme = {
    padding: "7px 12px",
    borderRadius: 9,
    border: `1px solid ${c.border}`,
    background: "transparent",
    color: c.textPrimary,
    fontSize: 14,
    cursor: "pointer",
  } as const;

  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: c.textPrimary }}>
            {t("Bülten aboneleri")} <span style={{ color: c.textSecondary, fontWeight: 400 }}>({aktifler.length})</span>
          </div>
          <div style={{ fontSize: 14, color: c.textSecondary }}>
            {t("Tanıtım sitesindeki bülten formundan abone olan adresler. Hepsi formda açık onay verdi.")}
          </div>
        </div>
        <button onClick={() => void yukle()} style={dugme}>
          {t("Yenile")}
        </button>
        <button onClick={csvIndir} disabled={aktifler.length === 0} style={{ ...dugme, opacity: aktifler.length === 0 ? 0.5 : 1 }}>
          {t("CSV indir")}
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input
          value={ara}
          onChange={(e) => setAra(e.target.value)}
          placeholder={t("E-posta ara…")}
          style={{ flex: 1, minWidth: 180, padding: "8px 10px", borderRadius: 9, border: `1px solid ${c.border}`, background: c.background, color: c.textPrimary, fontSize: 14 }}
        />
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14, color: c.textSecondary, cursor: "pointer" }}>
          <input type="checkbox" checked={iptallerGorunsun} onChange={(e) => setIptallerGorunsun(e.target.checked)} />
          {t("İptal edenleri de göster")}
        </label>
      </div>

      {hata && <p style={{ fontSize: 14, color: c.danger, margin: "0 0 10px" }}>{hata}</p>}
      {liste === null && !hata && <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>…</p>}
      {liste && gorunen.length === 0 && (
        <p style={{ fontSize: 15, color: c.textSecondary, margin: 0 }}>{t("Henüz bülten abonesi yok.")}</p>
      )}

      <div style={{ display: "grid", gap: 6 }}>
        {gorunen.map((a) => (
          <div
            key={a.id}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              border: `1px solid ${c.border}`,
              borderRadius: 10,
              padding: "9px 12px",
              opacity: a.iptalAt ? 0.6 : 1,
            }}
          >
            <span style={{ fontSize: 15, color: c.textPrimary, fontWeight: 500, wordBreak: "break-all" }}>{a.eposta}</span>
            <span style={{ fontSize: 12, color: c.textSecondary, textTransform: "uppercase" }}>{a.dil}</span>
            {a.iptalAt && <span style={{ fontSize: 12, color: c.danger }}>{t("iptal etti")}</span>}
            <span style={{ marginLeft: "auto", fontSize: 12, color: c.textSecondary }}>
              {fmt(a.createdAt)}
              {a.kaynak ? ` · ${a.kaynak}` : ""}
            </span>
            {!a.iptalAt && (
              <button onClick={() => void iptalEt(a)} disabled={mesgul === a.id} style={{ ...dugme, padding: "4px 10px", fontSize: 13 }}>
                {t("İptal et")}
              </button>
            )}
            <button
              onClick={() => void sil(a)}
              disabled={mesgul === a.id}
              style={{ ...dugme, padding: "4px 10px", fontSize: 13, color: c.danger }}
            >
              {t("Sil")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
