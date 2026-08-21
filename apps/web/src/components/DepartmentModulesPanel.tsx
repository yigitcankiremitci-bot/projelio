import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ModuleAccess, ModuleCatalogEntry, OrganizationModule } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useProjectFabAction } from "../lib/projectFab";
import { MODULE_RECORD_CONFIGS } from "../lib/moduleRecordConfigs";
import { isOpenableModule } from "../lib/entityModules";
import { moduleSurface } from "../lib/moduleSurfaces";
import { useUndo } from "../lib/undo";
import ModuleModal from "./ModuleModal";
import ModuleCard from "./ModuleCard";
import { IconX } from "./icons";

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
  const [catalog, setCatalog] = useState<ModuleCatalogEntry[]>([]);
  const [enabled, setEnabled] = useState<OrganizationModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Modüller artık kart olarak listelenir; sayfa yüzeyli olanlar kendi
  // sayfasına gider, modal yüzeyli olanlar burada açılır
  // (bkz. lib/moduleSurfaces.ts ve pages/ModulePage.tsx).
  const [modalKey, setModalKey] = useState<string | null>(null);
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  // Açılan modüldeki yetki bir kez çözülüp hem ekip paneline hem kayıt paneline
  // veriliyor — her ikisi ayrı ayrı sormasın.
  const [access, setAccess] = useState<ModuleAccess | null>(null);
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
      setNotice("Bu modül henüz veri girişine açık değil — diğer modüllerin verisinden gösterge üretecek.");
      return;
    }
    // Sayfa yüzeyli modül kendi sayfasında açılır; modal yüzeyli olan burada.
    if (moduleSurface(requested) === "modal") setModalKey(requested);
    else navigate(`/departments/${departmentId}/modules/${encodeURIComponent(requested)}`);
  }, [searchParams, setSearchParams, departmentId, navigate]);

  const load = () => {
    if (!departmentKey) {
      setCatalog([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      api.get<ModuleCatalogEntry[]>(`/module-catalog?departmentKey=${encodeURIComponent(departmentKey)}`).catch(() => []),
      api.get<OrganizationModule[]>(`/organizations/${organizationId}/modules`).catch(() => []),
    ])
      .then(([cat, org]) => {
        setCatalog(cat);
        setEnabled(org);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [organizationId, departmentKey]);

  // Modül açıldığında o modüldeki yetkiyi çöz. Kapanınca sıfırlanır ki bir
  // sonraki modül eski yetkiyle render edilmesin.
  //
  // Yetki modal yüzeyli modüller için de çözülmeli, yoksa (ör. Kimlik ve
  // Yön'de) onay düğmesi hiç görünmez. Sayfa yüzeyli modüller yetkisini kendi
  // sayfasında çözer (bkz. pages/ModulePage.tsx).
  useEffect(() => {
    if (!modalKey) {
      setAccess(null);
      return;
    }
    let cancelled = false;
    api
      .get<ModuleAccess>(
        `/organizations/${organizationId}/module-access?moduleKey=${encodeURIComponent(modalKey)}&departmentId=${departmentId}`
      )
      .then((a) => {
        if (!cancelled) setAccess(a);
      })
      .catch(() => {
        if (!cancelled) setAccess(null);
      });
    return () => {
      cancelled = true;
    };
  }, [modalKey, organizationId, departmentId]);

  // Özel (kataloğa dayanmayan) departmanların önceden tanımlı modülü yok, o
  // yüzden bu sayfalarda "+" düğmesi devreye girmez.
  useProjectFabAction(
    departmentKey ? { label: "Modül ekle", onClick: () => setAdding((v) => !v) } : null,
    [organizationId, departmentKey]
  );

  const isEnabled = (moduleKey: string) => enabled.some((m) => m.moduleKey === moduleKey);

  const toggleOff = async (moduleKey: string) => {
    setBusyKey(moduleKey);
    try {
      if (modalKey === moduleKey) setModalKey(null);
      await api.delete(`/organizations/${organizationId}/modules/${moduleKey}`);
      load();
      // Modülü kapatmak kayıtları silmez, sadece etkinliği kaldırır — geri alma
      // basitçe aynı modülü yeniden etkinleştirir.
      pushUndo({
        label: "Modül kaldırma",
        run: async () => {
          await api.post(`/organizations/${organizationId}/modules`, { moduleKeys: [moduleKey] });
          load();
        },
        redo: async () => {
          await api.delete(`/organizations/${organizationId}/modules/${moduleKey}`);
          load();
        },
      });
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) return <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>Yükleniyor…</p>;

  if (!departmentKey) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h4 style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Modüller</h4>
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
          Bu özel departman için önceden tanımlı bir modül listesi yok.
        </p>
      </div>
    );
  }

  const activeCatalog = catalog.filter((e) => isEnabled(e.key));
  const modalEntry = modalKey ? catalog.find((e) => e.key === modalKey) ?? null : null;
  const availableCatalog = catalog.filter((e) => !isEnabled(e.key));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h4 style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Modüller</h4>

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
            aria-label="Kapat"
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2 }}
          >
            <IconX size={13} color={c.textSecondary} />
          </button>
        </div>
      )}

      {adding && (
        <AddModulesForm
          organizationId={organizationId}
          availableCatalog={availableCatalog}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      )}

      {catalog.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>Bu departman için henüz modül tanımlı değil.</p>
      ) : activeCatalog.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
          Henüz etkinleştirilmiş modül yok. Sağ alttaki "+" ile ekleyebilirsin.
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
            // Yüzey modülün tanımından gelir: kısa iş modalde biter, çalışma
            // alanı olan modül kendi sayfasında açılır (bkz. lib/moduleSurfaces.ts).
            const opensInModal = moduleSurface(entry.key) === "modal";
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

      {/* Modal yüzeyli modüller satır içinde açılmaz: iş tek ekranda biter ve
          kullanıcı kapatınca listedeki yerine döner. */}
      {modalEntry && (
        <ModuleModal
          moduleKey={modalEntry.key}
          moduleName={modalEntry.name}
          description={modalEntry.description}
          organizationId={organizationId}
          departmentId={departmentId}
          departmentKey={departmentKey}
          access={access}
          onClose={() => setModalKey(null)}
        />
      )}
    </div>
  );
}

function AddModulesForm({
  organizationId,
  availableCatalog,
  onClose,
  onAdded,
}: {
  organizationId: string;
  availableCatalog: ModuleCatalogEntry[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const c = useThemeColors();
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleSave = async () => {
    if (selectedKeys.length === 0) {
      setError("En az bir modül seç");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await api.post(`/organizations/${organizationId}/modules`, { moduleKeys: selectedKeys });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Modül eklenemedi");
      setSaving(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>Bu departmana modül ekle</span>
        <button onClick={onClose} aria-label="Kapat" style={{ background: "transparent", border: "none" }}>
          <IconX size={16} color={c.textSecondary} />
        </button>
      </div>

      {availableCatalog.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>Bu departmanın modüllerinin hepsi zaten etkin.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
          {availableCatalog.map((entry) => {
            const active = selectedKeys.includes(entry.key);
            return (
              <button
                key={entry.key}
                onClick={() => toggleKey(entry.key)}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1.5px solid ${active ? c.primary : c.border}`,
                  background: active ? c.background : "transparent",
                  fontSize: 13,
                  color: c.textPrimary,
                }}
              >
                {entry.name}
              </button>
            );
          })}
        </div>
      )}

      {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}

      {availableCatalog.length > 0 && (
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: "9px 0", borderRadius: 8, border: "none", background: c.primary, color: "#fff", fontSize: 14, fontWeight: 500 }}
        >
          {saving ? "Ekleniyor…" : "Modülleri ekle"}
        </button>
      )}
    </div>
  );
}
