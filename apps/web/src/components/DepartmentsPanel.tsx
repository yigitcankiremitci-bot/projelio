import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  DepartmanKuraliDurumu,
  Department,
  DepartmentCatalogEntry,
  DepartmentMemberRole,
  SirketEkibi,
  SirketEkibiUyesi,
} from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { FAB_PRIORITY, useFabAvailable, useProjectFabAction } from "../lib/projectFab";
import { onEnter } from "../lib/enterAction";
import { useSortableList } from "../lib/useSortableList";
import { useLatestRef, useRefreshOnUndo, useReorderUndo } from "../lib/undo";
import DepartmentCard from "./DepartmentCard";
import { IconBuilding, IconListCheck } from "./icons";
import Modal from "./Modal";
import { useDragScroll } from "../lib/useDragScroll";
import { notifySidebarChanged } from "../lib/sidebarEvents";
import { useT } from "../lib/i18n";
import { departmanAdi } from "../lib/departmanAdi";
import { useIsDesktop } from "../lib/useIsDesktop";
import ListRowLink, { ListRowStack } from "./ListRowLink";
import { ROL_ETIKETI } from "./ekipHesaplari/KadroSecimi";
import SectionToggle from "./SectionToggle";
import { useKatlanirBolum } from "../lib/useKatlanirBolum";
import { getDepartmentCoverUrl } from "../lib/departmentCovers";
import { coverBackground } from "../lib/covers";

export interface DepartmentsPanelHandle {
  openAdd: () => void;
}

interface Props {
  organizationId: string;
  // Şirket anasayfasında "+" beş kısayolu birden taşıyan tek bir menü açıyor
  // (bkz. OrganizationDetail HomeAddFabRegistrar) ve "Departman ekle" orada zaten
  // var; ikinci kez kaydedilmesin diye orada useFab=false verilir ve ekleme
  // DepartmentsPanelHandle.openAdd ile tetiklenir (ProductsPanel'deki desenin aynısı).
  useFab?: boolean;
  // "scroll" (varsayılan): Anasayfa özetindeki gibi tek satır, yana kaydırmalı,
  // kompakt kartlar. "grid": ayrı Departmanlar sekmesindeki gibi satıra sığdığı
  // kadar yan yana dizilip taşınca alt satıra geçen, daha büyük kartlar —
  // burada basılı tutup sürükleyerek sıralama da açık (bkz. useSortableList).
  layout?: "scroll" | "grid";
  // Başlık satırının en sağına konan ek öğe — şirket anasayfasında bölümü
  // yukarı/aşağı taşıyan oklar (bkz. OrganizationDetail, lib/anasayfaSirasi).
  basliktaSag?: ReactNode;
}

// Anasayfa özetinde (layout="scroll") departmanlar tek satırda, sabit genişlikli
// kartlarla listelenir; sığmadığında yana kaydırarak seçilebilir. Departmanlar
// sekmesinde (layout="grid") kartlar daha büyük ve satıra sığdığı kadar yan yana
// dizilip taşınca alt satıra geçer, yana kaydırma yok. Her karta tıklamak
// departmanın kendi sayfasına (kadro yönetimi, varsa ürünler) götürür.
const DepartmentsPanel = forwardRef<DepartmentsPanelHandle, Props>(function DepartmentsPanel(
  { organizationId, useFab = true, layout = "scroll", basliktaSag },
  ref
) {
  const c = useThemeColors();
  const t = useT();
  const isDesktop = useIsDesktop();
  // Anasayfada ürün/hizmet şeridi gibi başlıktan kapatılabilir; ayrı
  // Departmanlar sekmesinde (grid) hep açık.
  const [collapsed, toggleCollapsed] = useKatlanirBolum("projelio.anasayfa-departmanlar-kapali", layout === "scroll");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [catalog, setCatalog] = useState<DepartmentCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useDragScroll<HTMLDivElement>(layout === "scroll");
  const registerReorderUndo = useReorderUndo();
  const departmentsRef = useLatestRef(departments);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<Department[]>(`/organizations/${organizationId}/departments`).catch(() => []),
      api.get<DepartmentCatalogEntry[]>("/department-catalog").catch(() => []),
    ])
      .then(([depts, cat]) => {
        setDepartments(depts);
        setCatalog(cat);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [organizationId]);
  // Geri/ileri alma sunucu durumunu değiştirir; liste kendini tazelemeli.
  useRefreshOnUndo(load);

  useImperativeHandle(ref, () => ({ openAdd: () => setAdding(true) }));

  // Yalnızca grid görünümünde (Departmanlar sekmesi) basılı tutup sürükleyerek
  // sıralama açık — listRef yalnızca o modda DOM öğesine bağlanır (bkz. JSX),
  // scroll modunda containerRef.current null kalır ve hook no-op olur.
  useSortableList(
    listRef,
    {
      onEnd: () => {
        const el = listRef.current;
        if (!el) return;
        const ids = Array.from(el.children)
          .map((node) => (node as HTMLElement).dataset.id!)
          .filter(Boolean);
        const endpoint = `/organizations/${organizationId}/departments/reorder`;
        const previousIds = departmentsRef.current.map((d) => d.id);
        setDepartments((prev) => {
          const byId = new Map(prev.map((d) => [d.id, d]));
          return ids.map((id) => byId.get(id)!).filter(Boolean);
        });
        api.patch(endpoint, { ids }).catch(() => load());
        registerReorderUndo(endpoint, previousIds, ids, load);
      },
    },
    [layout, departments.length === 0]
  );

  const fabAvailable = useFabAvailable();
  useProjectFabAction(
    useFab && fabAvailable ? { label: t("Departman ekle"), onClick: () => setAdding((v) => !v) } : null,
    [useFab, fabAvailable, organizationId],
    FAB_PRIORITY.panel
  );

  const existingKeys = new Set(departments.map((d) => d.catalogKey).filter(Boolean));
  const availableCatalog = catalog.filter((entry) => !existingKeys.has(entry.key));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* Başlığa çift dokunmak da "Departman ekle" penceresini açar — "+"
            menüsündeki eylemin kısayolu, görünür bir düğme eklemeden. */}
        <h2
          onDoubleClick={() => setAdding(true)}
          title={t("Eklemek için çift tıkla")}
          style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: 0, userSelect: "none", cursor: "default", touchAction: "manipulation" }}
        >
          {t("Departmanlar")}
        </h2>
        {layout === "scroll" && (
          <SectionToggle
            collapsed={collapsed}
            onToggle={toggleCollapsed}
            count={loading ? undefined : departments.length}
            showLabel={t("Departmanları göster")}
            hideLabel={t("Departmanları gizle")}
          />
        )}
        {basliktaSag && <div style={{ marginLeft: "auto" }}>{basliktaSag}</div>}
      </div>

      {adding && (
        <AddDepartmentModal
          organizationId={organizationId}
          availableCatalog={availableCatalog}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      )}

      {/* Ekleme formu kapalı bölümde de açılır: "+" menüsünden gelinmiş olabilir. */}
      {collapsed ? null : loading ? (
        <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Yükleniyor…")}</p>
      ) : departments.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${c.border}`,
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            color: c.textSecondary,
            fontSize: 15,
          }}
        >
          {t("Henüz departman yok. Küçük ekipte işler yöneticide yürür; ekip büyüdükçe departmanı ilk kişisiyle birlikte açarsın.")}
        </div>
      ) : layout === "scroll" && !isDesktop ? (
        // Telefonda anasayfa özeti: kapaklı kartlar yerine alt alta tek
        // satırlık düğmeler (bkz. ListRowLink). Zemin departman kartının
        // kapağıyla aynı — kart ile satır aynı departman olarak tanınsın.
        <ListRowStack>
          {departments.map((dept) => (
            <ListRowLink
              key={dept.id}
              to={`/departments/${dept.id}`}
              background={coverBackground(getDepartmentCoverUrl(dept), dept.id)}
              icon={<IconBuilding size={18} color="rgba(255,255,255,0.85)" />}
              label={departmanAdi(dept.name, t)}
              // Kişi sayısı yerine iş durumu: satır bir bakışta "bu departman
              // ne kadar ilerledi?" sorusunu cevaplasın.
              trailing={
                <span
                  title={t("Biten / toplam görev")}
                  aria-label={t("{biten} / {toplam} görev bitti", {
                    biten: dept.completedTaskCount ?? 0,
                    toplam: dept.taskCount ?? 0,
                  })}
                  style={{ display: "flex", alignItems: "center", gap: 4 }}
                >
                  <IconListCheck size={13} color="rgba(255,255,255,0.8)" />
                  {dept.completedTaskCount ?? 0}/{dept.taskCount ?? 0}
                </span>
              }
            />
          ))}
        </ListRowStack>
      ) : (
        <div
          ref={layout === "grid" ? listRef : scrollRef}
          style={
            layout === "grid"
              ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }
              : {
                  display: "flex",
                  flexWrap: "nowrap",
                  gap: 14,
                  overflowX: "auto",
                  paddingBottom: 6,
                  WebkitOverflowScrolling: "touch",
                }
          }
        >
          {departments.map((dept) => (
            <div
              key={dept.id}
              data-id={dept.id}
              style={layout === "grid" ? undefined : { flex: "0 0 260px", width: 260 }}
            >
              <DepartmentCard
                department={dept}
                onCoverUpdated={(coverImageUrl) =>
                  setDepartments((prev) => prev.map((d) => (d.id === dept.id ? { ...d, coverImageUrl } : d)))
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default DepartmentsPanel;

// Departman İLK KİŞİSİYLE açılır (bkz. shared departmanKurali.ts): burada ilk
// kişi şirketin mevcut ekibinden seçilir. Yeni biriyle açılış Ekip Hesapları
// ve İşe al formlarındaki "Kişiyle birlikte yeni departman aç" seçeneğinden.
// Departman kişisiyle birlikte doğduğu için pencere artık tek seferde TEK
// departman açıyor — eskiden çoklu seçim, kimsesi olmayan departman yığınının
// kaynağıydı.
function AddDepartmentModal({
  organizationId,
  availableCatalog,
  onClose,
  onAdded,
}: {
  organizationId: string;
  availableCatalog: DepartmentCatalogEntry[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [kural, setKural] = useState<DepartmanKuraliDurumu | null>(null);
  const [ekip, setEkip] = useState<SirketEkibiUyesi[] | null>(null);
  const [ilkKisi, setIlkKisi] = useState("");
  const [rol, setRol] = useState<DepartmentMemberRole>("employee");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get<DepartmanKuraliDurumu>(`/organizations/${organizationId}/departman-kurali`)
      .then(setKural)
      .catch(() => setKural(null));
    api
      .get<SirketEkibi>(`/organizations/${organizationId}/ekip`)
      .then(({ uyeler }) => setEkip(uyeler.filter((u) => !u.kurucu)))
      .catch(() => setEkip([]));
  }, [organizationId]);

  const kapaliSebep = kural && "sebep" in kural.mevcutKisiyle ? kural.mevcutKisiyle.sebep : null;
  const engel = ekip && ekip.length === 0 ? t("Departman ilk kişisiyle açılır: yönetici dışında birini ekip olarak eklediğinde departman açabilirsin.") : kapaliSebep ? t(kapaliSebep) : null;

  const handleSave = async () => {
    if (!selectedKey && !customName.trim()) {
      setError(t("Bir departman seç ya da özel bir isim gir"));
      return;
    }
    if (!ilkKisi) {
      setError(t("Departmanın ilk kişisini seç"));
      return;
    }
    setError("");
    setSaving(true);
    try {
      await api.post(`/organizations/${organizationId}/departments`, {
        ...(selectedKey ? { catalogKey: selectedKey } : { name: customName.trim() }),
        ilkKisi: { userId: ilkKisi, role: rol },
      });
      notifySidebarChanged();
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Departman eklenemedi"));
      setSaving(false);
    }
  };

  return (
    <Modal title={t("Departman ekle")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {engel ? (
          <>
            <p style={{ fontSize: 14, color: c.textPrimary, margin: 0, lineHeight: 1.5 }}>{engel}</p>
            <p style={{ fontSize: 13, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
              {t("Yeni birini eklerken departmanı onunla birlikte açabilirsin: şirket sayfasındaki Ekip Hesapları ya da İşe al formunda \"Kişiyle birlikte yeni departman aç\"ı işaretle. O zamana kadar modüller yöneticide çalışır.")}
            </p>
          </>
        ) : (
          <>
            <span style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>{t("Standart departmanlardan seç")}</span>

            {availableCatalog.length === 0 ? (
              <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Standart departmanların hepsi zaten eklenmiş.")}</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
                {availableCatalog.map((entry) => {
                  const active = selectedKey === entry.key;
                  return (
                    <button
                      key={entry.key}
                      onClick={() => {
                        setSelectedKey(active ? null : entry.key);
                        setCustomName("");
                      }}
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

            <div>
              <label style={{ fontSize: 13, color: c.textSecondary }}>{t("Ya da özel departman adı")}</label>
              <input
                value={customName}
                onChange={(e) => {
                  setCustomName(e.target.value);
                  if (e.target.value) setSelectedKey(null);
                }}
                onKeyDown={onEnter(() => void handleSave())}
                placeholder={t("Örn. Ar-Ge")}
                style={{ width: "100%", marginTop: 4 }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 13, color: c.textSecondary }}>{t("İlk kişi")}</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={ilkKisi} onChange={(e) => setIlkKisi(e.target.value)} style={{ flex: "1 1 200px" }}>
                  <option value="">{ekip === null ? t("Yükleniyor…") : t("Ekipten birini seç…")}</option>
                  {(ekip ?? []).map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.fullName}
                      {u.title ? ` · ${u.title}` : ""}
                    </option>
                  ))}
                </select>
                <select value={rol} onChange={(e) => setRol(e.target.value as DepartmentMemberRole)}>
                  {(Object.keys(ROL_ETIKETI) as DepartmentMemberRole[]).map((r) => (
                    <option key={r} value={r}>
                      {t(ROL_ETIKETI[r])}
                    </option>
                  ))}
                </select>
              </div>
              <span style={{ fontSize: 12, color: c.textSecondary }}>
                {t("Departman ilk kişisiyle açılır. 10 kişiden küçük şirketlerde departman sayısı, yönetici dışındaki kişi sayısını geçemez.")}
              </span>
            </div>
          </>
        )}

        {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}

        {!engel && (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: "9px 0", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 14, fontWeight: 500 }}
          >
            {saving ? t("Ekleniyor…") : t("Departmanı aç")}
          </button>
        )}
      </div>
    </Modal>
  );
}
