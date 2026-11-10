import { useEffect, useMemo, useState } from "react";
import type { Department, ModuleCatalogEntry, OrganizationModule } from "@projelio/shared";
import { modulAktifMi } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import ModuleEmblem from "./ModuleEmblem";
import { PasifRozeti } from "./ModuleCard";
import { useT } from "../lib/i18n";
import { notifySidebarChanged } from "../lib/sidebarEvents";
import { departmanAdi } from "../lib/departmanAdi";
import { departmaninKatalogu, modulDepartmani } from "../lib/modulYeri";
import { isCekirdekModul } from "../lib/cekirdekModuller";
import { MODUL_KATEGORI_SIRASI, MODUL_TANITIMLARI } from "../lib/modulTanitimlari";
import ModulHakkiBilgisi, { hakkiAsiyor, useModulHakki } from "./ModulHakkiBilgisi";
import { IconCheck, IconChevronRight } from "./icons";

interface Props {
  organizationId: string;
  onClose: () => void;
  onAdded: () => void;
  /**
   * Departman sayfasından açıldığında o departman: yalnızca o departmanın
   * eklenebilir modülleri listelenir.
   */
  fixedDepartmentId?: string;
}

/**
 * "Modül ekle" (şirket "+" menüsü, Modüller sekmesi, departman sayfası).
 *
 * Eskiden önce departman seçtiriyor, sonra yalnızca ad + simgeden oluşan bir
 * ızgara gösteriyordu: kullanıcı modülün ne yaptığını açmadan bilemiyordu ve
 * departman seçimi gereksiz bir adımdı — modül zaten şirket genelinde açılır,
 * evi kendiliğinden bulunur (ilgili departman açıksa o, değilse Yönetim; bkz.
 * lib/modulYeri.ts). Artık tek ekran: modüller kategoriye göre gruplu, her
 * kartta özet, "neler yapabilirsin" maddeleri ve nerede açılacağı yazıyor.
 *
 * Yalnızca kullanıcılara açık modüller listelenir (sunucu katalogu süzer, bkz.
 * shared aktifModuller.ts). Platform yöneticisi pasif modülleri de görür;
 * onlar ayrı bir "Geliştirmede" bölümünde durur.
 */
export default function AddModuleModal({ organizationId, onClose, onAdded, fixedDepartmentId }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [fullCatalog, setFullCatalog] = useState<ModuleCatalogEntry[]>([]);
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [acikKart, setAcikKart] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const hak = useModulHakki(organizationId);
  const asiyor = hakkiAsiyor(hak, selectedKeys);

  useEffect(() => {
    Promise.all([
      api.get<Department[]>(`/organizations/${organizationId}/departments`).catch(() => []),
      api.get<OrganizationModule[]>(`/organizations/${organizationId}/modules`).catch(() => []),
      api.get<ModuleCatalogEntry[]>("/module-catalog").catch(() => []),
    ])
      .then(([depts, mods, cat]) => {
        setDepartments(depts.filter((d) => d.catalogKey));
        setFullCatalog(cat);
        setEnabledKeys(new Set(mods.map((m) => m.moduleKey)));
      })
      .finally(() => setLoading(false));
  }, [organizationId]);

  // Holding modülleri şirkette eklenmez; çekirdek modüllerin (proje, görev,
  // dosya) ayrıca açılacak bir yüzeyi yok — uygulamanın kendi sekmeleri.
  const liste = useMemo(() => {
    const sabitDept = fixedDepartmentId ? departments.find((d) => d.id === fixedDepartmentId) : undefined;
    const kaynak = fixedDepartmentId
      ? departmaninKatalogu(fullCatalog, sabitDept?.catalogKey, departments)
      : fullCatalog;
    return kaynak.filter((e) => e.scope !== "holding" && !isCekirdekModul(e.key));
  }, [fullCatalog, departments, fixedDepartmentId]);

  const gruplar = useMemo(() => {
    const sonuc: { baslik: string; aciklama?: string; moduller: ModuleCatalogEntry[] }[] = [];
    for (const kategori of MODUL_KATEGORI_SIRASI) {
      const moduller = liste.filter((e) => MODUL_TANITIMLARI[e.key]?.kategori === kategori);
      if (moduller.length) sonuc.push({ baslik: t(kategori), moduller });
    }
    // Tanıtımı olmayan aktif modül (yeni eklenmiş olabilir) kaybolmasın.
    const digerleri = liste.filter((e) => !MODUL_TANITIMLARI[e.key] && modulAktifMi(e.key));
    if (digerleri.length) sonuc.push({ baslik: t("Diğer"), moduller: digerleri });
    // Pasif modüller: katalog bunları yalnızca platform yöneticisine döner.
    const pasif = liste.filter((e) => !modulAktifMi(e.key));
    if (pasif.length) {
      sonuc.push({
        baslik: t("Geliştirmede"),
        aciklama: t("Yalnızca yöneticiler görür; kullanıcılara kapalı."),
        moduller: pasif,
      });
    }
    return sonuc;
  }, [liste, t]);

  const eklenebilirSayisi = liste.filter((e) => !enabledKeys.has(e.key)).length;

  const toggleKey = (key: string) => {
    setError("");
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleSave = async () => {
    if (selectedKeys.length === 0) {
      setError(t("En az bir modül seç"));
      return;
    }
    setError("");
    setSaving(true);
    try {
      await api.post(`/organizations/${organizationId}/modules`, { moduleKeys: selectedKeys });
      // Sidebar ağacı departmanın altında modülleri listeliyor.
      notifySidebarChanged();
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Modül eklenemedi"));
      setSaving(false);
    }
  };

  const evAdi = (entry: ModuleCatalogEntry): string | null => {
    const id = modulDepartmani(entry, departments);
    const dept = departments.find((d) => d.id === id);
    return dept ? departmanAdi(dept.name, t) : null;
  };

  const kaydetDugmesi = (
    <button
      data-primary
      onClick={handleSave}
      disabled={saving || selectedKeys.length === 0 || asiyor}
      style={{
        width: "100%",
        padding: "11px 0",
        borderRadius: 8,
        border: "none",
        background: c.primary,
        color: c.onPrimary,
        fontSize: 15,
        fontWeight: 500,
        opacity: selectedKeys.length === 0 || asiyor ? 0.6 : 1,
      }}
    >
      {saving
        ? t("Ekleniyor…")
        : selectedKeys.length === 0
          ? t("Eklemek istediğin modülleri seç")
          : selectedKeys.length === 1
            ? t("Modülü ekle")
            : t("{n} modülü ekle", { n: selectedKeys.length })}
    </button>
  );

  return (
    <Modal
      title={t("Modül ekle")}
      subtitle={t("Her modülün ne yaptığını gör, işine yarayanları tek tıkla aç.")}
      onClose={onClose}
      maxWidth={720}
      mobileFullScreen
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ModulHakkiBilgisi durum={hak} secilen={selectedKeys} />
          {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}
          {kaydetDugmesi}
        </div>
      }
    >
      {loading ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>
      ) : liste.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
          {fixedDepartmentId ? t("Bu departmana eklenebilecek modül yok.") : t("Eklenebilecek modül yok.")}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {eklenebilirSayisi === 0 && (
            <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Bütün modüller zaten açık.")}</p>
          )}
          {gruplar.map((grup) => (
            <section key={grup.baslik} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, margin: 0, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  {grup.baslik}
                </h3>
                {grup.aciklama && <p style={{ fontSize: 12, color: c.textSecondary, margin: "2px 0 0" }}>{grup.aciklama}</p>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 8 }}>
                {grup.moduller.map((entry) => (
                  <ModulKarti
                    key={entry.key}
                    entry={entry}
                    acik={enabledKeys.has(entry.key)}
                    secili={selectedKeys.includes(entry.key)}
                    detayAcik={acikKart === entry.key}
                    evAdi={evAdi(entry)}
                    onSec={() => toggleKey(entry.key)}
                    onDetay={() => setAcikKart((k) => (k === entry.key ? null : entry.key))}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

function ModulKarti({
  entry,
  acik,
  secili,
  detayAcik,
  evAdi,
  onSec,
  onDetay,
}: {
  entry: ModuleCatalogEntry;
  /** Şirkette zaten açık. */
  acik: boolean;
  secili: boolean;
  detayAcik: boolean;
  evAdi: string | null;
  onSec: () => void;
  onDetay: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const tanitim = MODUL_TANITIMLARI[entry.key];
  const pasif = !modulAktifMi(entry.key);
  const ozet = tanitim ? t(tanitim.ozet) : entry.description ? t(entry.description) : "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 12,
        borderRadius: 10,
        border: `1.5px ${pasif && !secili ? "dashed" : "solid"} ${secili ? c.primary : c.border}`,
        background: secili || pasif ? c.background : c.surface,
        opacity: acik ? 0.7 : 1,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <ModuleEmblem moduleKey={entry.key} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 600, color: pasif ? c.textSecondary : c.textPrimary }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{entry.name}</span>
            {pasif && <PasifRozeti />}
          </div>
          {ozet && <div style={{ fontSize: 13, color: c.textSecondary, lineHeight: 1.45, marginTop: 2 }}>{ozet}</div>}
        </div>
      </div>

      {detayAcik && tanitim && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: c.textPrimary }}>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3, lineHeight: 1.4 }}>
            {tanitim.neler.map((madde) => (
              <li key={madde}>{t(madde)}</li>
            ))}
          </ul>
          <div style={{ color: c.textSecondary, lineHeight: 1.4 }}>
            <strong style={{ fontWeight: 500 }}>{t("Kimin için:")}</strong> {t(tanitim.kimIcin)}
          </div>
          {evAdi && (
            <div style={{ color: c.textSecondary, lineHeight: 1.4 }}>
              <strong style={{ fontWeight: 500 }}>{t("Nerede açılır:")}</strong> {evAdi}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: "auto" }}>
        {tanitim && (
          <button
            type="button"
            onClick={onDetay}
            aria-expanded={detayAcik}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: "none",
              padding: 0,
              fontSize: 13,
              color: c.textSecondary,
              cursor: "pointer",
            }}
          >
            <span style={{ display: "inline-flex", transform: detayAcik ? "rotate(90deg)" : "none", transition: "transform 120ms" }}>
              <IconChevronRight size={13} color={c.textSecondary} />
            </span>
            {detayAcik ? t("Daha az") : t("Neler var?")}
          </button>
        )}
        <span style={{ flex: 1 }} />
        {acik ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: c.textSecondary }}>
            <IconCheck size={14} color={c.textSecondary} />
            {t("Zaten açık")}
          </span>
        ) : (
          <button
            type="button"
            onClick={onSec}
            aria-pressed={secili}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "6px 12px",
              borderRadius: 8,
              border: `1.5px solid ${c.primary}`,
              background: secili ? c.primary : "transparent",
              color: secili ? c.onPrimary : c.primary,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {secili && <IconCheck size={13} color={c.onPrimary} />}
            {secili ? t("Seçildi") : t("Seç")}
          </button>
        )}
      </div>
    </div>
  );
}
