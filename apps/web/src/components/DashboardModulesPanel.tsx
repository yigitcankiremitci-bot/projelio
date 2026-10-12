import { useEffect, useMemo, useState } from "react";
import type { Job, JobModule, ModuleCatalogEntry } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useUndo } from "../lib/undo";
import { IconSparkle, IconX } from "./icons";
import { useT } from "../lib/i18n";
import {
  DIGER_KATEGORI,
  KATEGORILER,
  VARSAYILAN_FILTRE,
  kategoriAnahtari,
  kategoriyeGoreGrupla,
  modulleriSuz,
  type ModulDurumu,
  type ModulFiltresi,
  type ModulSiralama,
} from "../lib/serbestModuller";

interface Props {
  jobs: Job[];
}

// Anasayfadaki "Modüller" sekmesi: serbest çalışana uygun modülleri (module_catalog,
// applies_to_freelancer=true) listeler; kullanıcı istediği modülü istediği işe atar.
// Bir şirket/işletme kurduğunda bu sekme yerini departman modüllerine bırakır
// (bkz. OrganizationDetail > Departmanlar).
export default function DashboardModulesPanel({ jobs }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [catalog, setCatalog] = useState<ModuleCatalogEntry[]>([]);
  const [byJob, setByJob] = useState<Record<string, JobModule[]>>({});
  const [loading, setLoading] = useState(true);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filtre, setFiltre] = useState<ModulFiltresi>(VARSAYILAN_FILTRE);
  const { pushUndo } = useUndo();

  const loadAssignments = () => {
    if (jobs.length === 0) {
      setByJob({});
      return;
    }
    Promise.all(
      jobs.map((j) =>
        api
          .get<JobModule[]>(`/jobs/${j.id}/modules`)
          .then((list) => [j.id, list] as const)
          .catch(() => [j.id, []] as const)
      )
    ).then((entries) => setByJob(Object.fromEntries(entries)));
  };

  useEffect(() => {
    setLoading(true);
    api
      .get<ModuleCatalogEntry[]>("/module-catalog?freelancer=true")
      .then(setCatalog)
      .finally(() => setLoading(false));
  }, []);

  useEffect(loadAssignments, [jobs]);

  const assignedJobsFor = (moduleKey: string) => jobs.filter((j) => (byJob[j.id] ?? []).some((m) => m.moduleKey === moduleKey));

  const atamaSayisi = useMemo(() => {
    const sayac = new Map<string, number>();
    for (const liste of Object.values(byJob)) for (const m of liste) sayac.set(m.moduleKey, (sayac.get(m.moduleKey) ?? 0) + 1);
    return (key: string) => sayac.get(key) ?? 0;
  }, [byJob]);

  const gorunen = useMemo(() => modulleriSuz(catalog, filtre, atamaSayisi), [catalog, filtre, atamaSayisi]);

  // Yalnızca katalogda modülü olan kategoriler, kendi sıralarında + sayılarıyla.
  const kategoriler = useMemo(() => {
    const sayac = new Map<string, number>();
    for (const m of catalog) sayac.set(kategoriAnahtari(m), (sayac.get(kategoriAnahtari(m)) ?? 0) + 1);
    return [...KATEGORILER, DIGER_KATEGORI].filter((k) => sayac.has(k.key)).map((k) => ({ ...k, sayi: sayac.get(k.key)! }));
  }, [catalog]);
  const kategoriAdi = (key: string) => t([...KATEGORILER, DIGER_KATEGORI].find((k) => k.key === key)?.ad ?? DIGER_KATEGORI.ad);
  const filtreDegisti =
    filtre.arama.trim() !== "" || filtre.kategori !== "hepsi" || filtre.durum !== "hepsi" || filtre.siralama !== "onerilen";
  const guncelle = (parca: Partial<ModulFiltresi>) => setFiltre((f) => ({ ...f, ...parca }));

  // Modül atama/kaldırma tersine çevrilebilir bir eşleştirme olduğu için geri
  // alma basit: karşıt isteği at ve listeyi tazele (kayıtlar silinmiyor).
  const assign = async (moduleKey: string, jobId: string) => {
    setBusy(true);
    try {
      await api.post(`/jobs/${jobId}/modules`, { moduleKey });
      setPickerFor(null);
      loadAssignments();
      pushUndo({
        label: t("Modül atama"),
        run: async () => {
          await api.delete(`/jobs/${jobId}/modules/${moduleKey}`);
          loadAssignments();
        },
        redo: async () => {
          await api.post(`/jobs/${jobId}/modules`, { moduleKey });
          loadAssignments();
        },
      });
    } finally {
      setBusy(false);
    }
  };

  const unassign = async (moduleKey: string, jobId: string) => {
    setBusy(true);
    try {
      await api.delete(`/jobs/${jobId}/modules/${moduleKey}`);
      loadAssignments();
      pushUndo({
        label: t("Modül kaldırma"),
        run: async () => {
          await api.post(`/jobs/${jobId}/modules`, { moduleKey });
          loadAssignments();
        },
        redo: async () => {
          await api.delete(`/jobs/${jobId}/modules/${moduleKey}`);
          loadAssignments();
        },
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Yükleniyor…")}</p>;

  if (catalog.length === 0) {
    return (
      <div
        style={{
          border: `1px dashed ${c.border}`,
          borderRadius: 12,
          padding: 40,
          textAlign: "center",
          color: c.textSecondary,
          fontSize: 16,
        }}
      >
        {t("Serbest çalışanlar için henüz açılmış bir modül yok.")}
      </div>
    );
  }

  const kartCiz = (entry: ModuleCatalogEntry) => {
    const assignedJobs = assignedJobsFor(entry.key);
    return (
          <div key={entry.key} style={{ border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface, padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: c.background,
                  flexShrink: 0,
                }}
              >
                <IconSparkle size={13} color={c.textSecondary} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, color: c.textPrimary }}>{entry.name}</div>
                {entry.description && (
                  <div
                    title={entry.description}
                    style={{
                      fontSize: 13,
                      color: c.textSecondary,
                      marginTop: 2,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {entry.description}
                  </div>
                )}
              </div>
              {jobs.length > 0 && (
                <button
                  onClick={() => setPickerFor(pickerFor === entry.key ? null : entry.key)}
                  style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", flexShrink: 0 }}
                >
                  {t("+ İşe ata")}
                </button>
              )}
            </div>

            {pickerFor === entry.key && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {jobs
                  .filter((j) => !assignedJobs.some((aj) => aj.id === j.id))
                  .map((j) => (
                    <button
                      key={j.id}
                      disabled={busy}
                      onClick={() => assign(entry.key, j.id)}
                      style={{ fontSize: 13, padding: "5px 10px", borderRadius: 20, border: `1px solid ${c.border}`, background: c.background, color: c.textPrimary }}
                    >
                      {j.title}
                    </button>
                  ))}
              </div>
            )}

            {assignedJobs.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {assignedJobs.map((j) => (
                  <span
                    key={j.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 13,
                      padding: "4px 6px 4px 10px",
                      borderRadius: 20,
                      background: `${c.primary}18`,
                      color: c.primaryDark,
                    }}
                  >
                    {j.title}
                    <button
                      onClick={() => unassign(entry.key, j.id)}
                      disabled={busy}
                      aria-label={t("İşten kaldır")}
                      style={{ display: "flex", background: "transparent", border: "none" }}
                    >
                      <IconX size={11} color={c.primaryDark} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
    );
  };

  const secimDugmesi = (aktif: boolean) =>
    ({
      fontSize: 13,
      padding: "5px 11px",
      borderRadius: 20,
      border: `1px solid ${aktif ? c.primary : c.border}`,
      background: aktif ? `${c.primary}18` : c.surface,
      color: aktif ? c.primaryDark : c.textPrimary,
      cursor: "pointer",
      whiteSpace: "nowrap",
    }) as const;
  const alan = {
    fontSize: 14,
    padding: "7px 10px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
  } as const;

  const gruplu = kategoriyeGoreGrupla(filtre);
  const gruplar: { key: string; moduller: ModuleCatalogEntry[] }[] = [];
  if (gruplu) {
    for (const m of gorunen) {
      const key = kategoriAnahtari(m);
      const son = gruplar[gruplar.length - 1];
      if (son?.key === key) son.moduller.push(m);
      else gruplar.push({ key, moduller: [m] });
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 4px" }}>
        {t("Aşağıdaki modülleri istediğin işe atayabilirsin. Bir şirket ya da işletme kurduğunda bu görünüm yerini departmanlara bırakır.")}
      </p>

      {/* ------------------------------------------------ Arama + durum + sıralama */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <input
          type="search"
          value={filtre.arama}
          onChange={(e) => guncelle({ arama: e.target.value })}
          placeholder={t("Modül ara: fatura, müşteri, sosyal medya…")}
          aria-label={t("Modül ara")}
          style={{ ...alan, flex: "1 1 220px", minWidth: 0 }}
        />
        <select
          value={filtre.durum}
          onChange={(e) => guncelle({ durum: e.target.value as ModulDurumu })}
          aria-label={t("Durum")}
          style={{ ...alan, flex: "0 1 auto" }}
        >
          <option value="hepsi">{t("Tüm modüller")}</option>
          <option value="atanmis">{t("İşe atadıklarım")}</option>
          <option value="atanmamis">{t("Henüz atanmamış")}</option>
        </select>
        <select
          value={filtre.siralama}
          onChange={(e) => guncelle({ siralama: e.target.value as ModulSiralama })}
          aria-label={t("Sıralama")}
          style={{ ...alan, flex: "0 1 auto" }}
        >
          <option value="onerilen">{t("Sıra: önerilen")}</option>
          <option value="ad">{t("Sıra: A-Z")}</option>
          <option value="kullanim">{t("Sıra: en çok kullandığım")}</option>
        </select>
      </div>

      {/* ------------------------------------------------ Kategoriler */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        <button onClick={() => guncelle({ kategori: "hepsi" })} style={secimDugmesi(filtre.kategori === "hepsi")}>
          {t("Hepsi")} · {catalog.length}
        </button>
        {kategoriler.map((k) => (
          <button key={k.key} onClick={() => guncelle({ kategori: k.key })} style={secimDugmesi(filtre.kategori === k.key)}>
            {t(k.ad)} · {k.sayi}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: c.textSecondary }}>
        <span>{t("{n} modül gösteriliyor", { n: gorunen.length })}</span>
        {filtreDegisti && (
          <button
            onClick={() => setFiltre(VARSAYILAN_FILTRE)}
            style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
          >
            {t("Filtreyi temizle")}
          </button>
        )}
      </div>

      {gorunen.length === 0 ? (
        <div style={{ border: `1px dashed ${c.border}`, borderRadius: 12, padding: 24, textAlign: "center", color: c.textSecondary, fontSize: 14 }}>
          {t("Bu filtreye uyan modül yok.")}
        </div>
      ) : gruplu ? (
        gruplar.map((g) => (
          <div key={g.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.3,
                color: c.textSecondary,
                marginTop: 6,
                textTransform: "uppercase",
              }}
            >
              {kategoriAdi(g.key)} · {g.moduller.length}
            </div>
            {g.moduller.map(kartCiz)}
          </div>
        ))
      ) : (
        gorunen.map(kartCiz)
      )}
    </div>
  );
}
