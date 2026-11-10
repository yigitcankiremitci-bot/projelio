import AddModuleModal from "./AddModuleModal";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ModuleCatalogEntry, OrganizationModule } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { FAB_PRIORITY, useFabAvailable, useProjectFabAction } from "../lib/projectFab";
import { MODULE_RECORD_CONFIGS } from "../lib/moduleRecordConfigs";
import { isOpenableModule } from "../lib/entityModules";
import { kartModaldaAcilir } from "../lib/moduleSurfaces";
import { useUndo } from "../lib/undo";
import ModuleModal from "./ModuleModal";
import ModuleCard from "./ModuleCard";
import { IconX } from "./icons";
import { useT } from "../lib/i18n";
import { notifySidebarChanged } from "../lib/sidebarEvents";
import { departmanKatalogunuYukle } from "../lib/departmanModulleri";

interface Props {
  organizationId: string;
  departmentId: string;
  // Standart departman kataloğundaki anahtar (bkz. Department.catalogKey). Özel
  // (custom) departmanların önceden tanımlı bir modül listesi yoktur.
  departmentKey?: string;
}

// Bir departmanın kullanabileceği araç/modül listesi. Etkinleştirilenler
// ("Etkin Modüller") burada gösterilir; içlerinden bazıları (moduleRecordConfigs.ts'te
// tanımlı olanlar — Gelir-Gider, Fatura, Müşteri, İşe Alım) tıklanınca açılıp
// gerçek veri girişi yapılabilen bir çalışma alanına dönüşür. Yeni modül ekleme,
// departmanlar/ürünlerle aynı desende global "+" düğmesiyle yapılır (bkz.
// BottomNav.tsx) — bu yüzden bu panel departman sayfasındayken FAB'ı yönetir.
// Etkinleştirme durumu organizasyon genelinde tutulur (organization_modules) —
// burada yalnızca bu departmana ait olanlar gösterilir.
export default function DepartmentModulesPanel({ organizationId, departmentId, departmentKey }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [catalog, setCatalog] = useState<ModuleCatalogEntry[]>([]);
  const [enabled, setEnabled] = useState<OrganizationModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Modüller kart olarak listelenir ve kart modalde açılır; yalnızca çekirdek
  // modüller kendi sayfasına gider (bkz. lib/moduleSurfaces.ts kartModaldaAcilir).
  const [modalKey, setModalKey] = useState<string | null>(null);
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const { pushUndo } = useUndo();

  // Şirket sayfasındaki modül kartından gelindiyse (?module=<key>) o modül
  // doğrudan açılır — kullanıcı tıkladığı modülü bir de listeden aramasın.
  // Parametre bir kez kullanılıp URL'den düşürülür, yoksa kullanıcı modülü
  // kapattığında sayfa yenilenince geri açılırdı.
  useEffect(() => {
    const requested = searchParams.get("module");
    if (!requested) return;
    // Henüz veri girişi olmayan modüller (analiz/raporlama gibi panel modülleri)
    // açılamıyor; sessizce hiçbir şey olmasın diye sebebini yazıyoruz.
    const next = new URLSearchParams(searchParams);
    next.delete("module");
    setSearchParams(next, { replace: true });

    if (!isOpenableModule(requested, Boolean(MODULE_RECORD_CONFIGS[requested]))) {
      setNotice(t("Bu modül henüz veri girişine açık değil — diğer modüllerin verisinden gösterge üretecek."));
      return;
    }
    // Kartlar gibi modalde açılır; çekirdek modül kendi sayfasına (sekmeye) gider.
    if (kartModaldaAcilir(requested)) setModalKey(requested);
    // replace: bu sekme yalnızca bir aktarma durağı. Yeni kayıt açılsaydı modül
    // sayfasının geri düğmesi kullanıcıyı geldiği yere (anasayfa) değil, hiç
    // görmediği departman Modüller sekmesine götürürdü.
    else navigate(`/departments/${departmentId}/modules/${encodeURIComponent(requested)}`, { replace: true });
  }, [searchParams, setSearchParams, departmentId, navigate]);

  const load = () => {
    if (!departmentKey) {
      setCatalog([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      departmanKatalogunuYukle(organizationId, departmentKey),
      api.get<OrganizationModule[]>(`/organizations/${organizationId}/modules`).catch(() => []),
    ])
      .then(([cat, org]) => {
        setCatalog(cat);
        setEnabled(org);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [organizationId, departmentKey]);


  // Özel (kataloğa dayanmayan) departmanların önceden tanımlı modülü yok, o
  // yüzden bu sayfalarda "+" düğmesi devreye girmez.
  const fabAvailable = useFabAvailable();
  useProjectFabAction(
    departmentKey && fabAvailable ? { label: t("Modül ekle"), onClick: () => setAdding((v) => !v) } : null,
    [organizationId, departmentKey, fabAvailable],
    // Panel önceliği: aynı sekmedeki Ürün/Hizmet paneliyle tek menüde birleşsin
    // (bkz. lib/projectFab.tsx mergeActions).
    FAB_PRIORITY.panel
  );

  const isEnabled = (moduleKey: string) => enabled.some((m) => m.moduleKey === moduleKey);

  const toggleOff = async (moduleKey: string) => {
    setBusyKey(moduleKey);
    try {
      if (modalKey === moduleKey) setModalKey(null);
      await api.delete(`/organizations/${organizationId}/modules/${moduleKey}`);
      // Sidebar ağacı departmanın altında modülleri listeliyor.
      notifySidebarChanged();
      load();
      // Modülü kapatmak kayıtları silmez, sadece etkinliği kaldırır — geri alma
      // basitçe aynı modülü yeniden etkinleştirir.
      pushUndo({
        label: t("Modül kaldırma"),
        run: async () => {
          await api.post(`/organizations/${organizationId}/modules`, { moduleKeys: [moduleKey] });
          notifySidebarChanged();
          load();
        },
        redo: async () => {
          await api.delete(`/organizations/${organizationId}/modules/${moduleKey}`);
          notifySidebarChanged();
          load();
        },
      });
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) return <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>;

  if (!departmentKey) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h4 style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{t("Modüller")}</h4>
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
          {t("Bu özel departman için önceden tanımlı bir modül listesi yok.")}
        </p>
      </div>
    );
  }

  const activeCatalog = catalog.filter((e) => isEnabled(e.key));
  const modalEntry = modalKey ? catalog.find((e) => e.key === modalKey) ?? null : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h4 style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{t("Modüller")}</h4>

      {notice && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: c.textSecondary,
            background: c.background,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            padding: "8px 10px",
          }}
        >
          <span style={{ flex: 1 }}>{notice}</span>
          <button
            onClick={() => setNotice("")}
            aria-label={t("Kapat")}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2 }}
          >
            <IconX size={13} color={c.textSecondary} />
          </button>
        </div>
      )}

      {adding && (
        // Ayrıntılı ekleme ekranı (tanıtım + kategori) tek yerde: AddModuleModal.
        <AddModuleModal
          organizationId={organizationId}
          fixedDepartmentId={departmentId}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      )}

      {catalog.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Bu departman için henüz modül tanımlı değil.")}</p>
      ) : activeCatalog.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
          {t("Henüz etkinleştirilmiş modül yok. Sayfadaki \"+\" ile ekleyebilirsin.")}
        </p>
      ) : (
        // Şirket anasayfasındaki modül kartlarıyla aynı görünüm: sabit boy,
        // eşit kart. Liste hâli modülleri "ayar satırı" gibi gösteriyordu;
        // oysa bunlar açılıp içinde çalışılan araçlar.
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          {activeCatalog.map((entry) => {
            const config = MODULE_RECORD_CONFIGS[entry.key];
            // Müşteri gibi ortak varlığa yazan modüllerin kendi paneli var,
            // module_records tanımı yok — yine de açılabilir olmalı.
            const openable = isOpenableModule(entry.key, Boolean(config));
            // Kart modalde açılır (yetki ve ekip ModuleModal'da çözülür);
            // çekirdek modül kendi sayfasına gider (bkz. kartModaldaAcilir).
            const opensInModal = kartModaldaAcilir(entry.key);
            return (
              <ModuleCard
                key={entry.key}
                entry={entry}
                onClick={openable && opensInModal ? () => setModalKey(entry.key) : undefined}
                to={
                  openable && !opensInModal
                    ? `/departments/${departmentId}/modules/${encodeURIComponent(entry.key)}`
                    : undefined
                }
                onRemove={() => toggleOff(entry.key)}
                removeDisabled={busyKey === entry.key}
              />
            );
          })}
        </div>
      )}

      {/* Modül satır içinde açılmaz: modalde çalışılır, kapatınca kullanıcı
          listedeki yerine döner. */}
      {modalEntry && (
        <ModuleModal
          moduleKey={modalEntry.key}
          moduleName={modalEntry.name}
          description={modalEntry.description}
          organizationId={organizationId}
          departmentId={departmentId}
          departmentKey={departmentKey}
          onClose={() => setModalKey(null)}
        />
      )}
    </div>
  );
}

