import { useEffect, useMemo, useState } from "react";
import type { Department, ModuleCatalogEntry, OrganizationModule } from "@projelio/shared";
import { modulAktifMi } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import ModuleEmblem from "./ModuleEmblem";
import { ModulTanitimMetni, PasifRozeti } from "./ModuleCard";
import { useT } from "../lib/i18n";
import { notifySidebarChanged } from "../lib/sidebarEvents";
import { departmanAdi } from "../lib/departmanAdi";
import { departmaninKatalogu, modulDepartmani } from "../lib/modulYeri";
import { isCekirdekModul } from "../lib/cekirdekModuller";
import { MODUL_KATEGORI_SIRASI, MODUL_TANITIMLARI } from "../lib/modulTanitimlari";
import ModulHakkiBilgisi, { hakkiAsiyor, useModulHakki } from "./ModulHakkiBilgisi";
import { IconCheck } from "./icons";

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

type Sekme = "acik" | "gelistirmede";

/** Türkçe büyük/küçük harf ve aksan farkını yok sayan arama biçimi. */
function aramaBicimi(metin: string): string {
  return metin
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}

/**
 * "Modül ekle" (şirket "+" menüsü, Modüller sekmesi, departman sayfası).
 *
 * Eskiden önce departman seçtiriyor, sonra yalnızca ad + simgeden oluşan bir
 * ızgara gösteriyordu: kullanıcı modülün ne yaptığını açmadan bilemiyordu ve
 * departman seçimi gereksiz bir adımdı — modül zaten şirket genelinde açılır,
 * evi kendiliğinden bulunur (ilgili departman açıksa o, değilse Yönetim; bkz.
 * lib/modulYeri.ts). Artık tek ekran: arama, kategoriye göre gruplu büyük
 * kartlar; her kartta özet, nasıl çalıştığı, "neler yapabilirsin" maddeleri ve
 * nerede açılacağı yazıyor (metinler lib/modulTanitimlari.ts).
 *
 * Yalnızca kullanıcılara açık modüller listelenir (sunucu katalogu süzer, bkz.
 * shared aktifModuller.ts). Platform yöneticisi pasif modülleri de görür;
 * onlar ayrı "Geliştirmede" sekmesinde durur, açık modüllerle karışmasın.
 */
export default function AddModuleModal({ organizationId, onClose, onAdded, fixedDepartmentId }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [fullCatalog, setFullCatalog] = useState<ModuleCatalogEntry[]>([]);
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [arama, setArama] = useState("");
  const [sekme, setSekme] = useState<Sekme>("acik");
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

  const evAdi = (entry: ModuleCatalogEntry): string | null => {
    const id = modulDepartmani(entry, departments);
    const dept = departments.find((d) => d.id === id);
    return dept ? departmanAdi(dept.name, t) : null;
  };

  const aktifler = liste.filter((e) => modulAktifMi(e.key));
  // Katalog pasif modülleri yalnızca platform yöneticisine döner; başkasında
  // bu liste boş ve sekme çubuğu hiç çıkmaz.
  const pasifler = liste.filter((e) => !modulAktifMi(e.key));
  const gecerliSekme: Sekme = pasifler.length ? sekme : "acik";

  // Arama ad, özet, açıklama, maddeler ve departman adında; çevrilmiş metinle
  // yapılır ki İngilizce arayüzde de bulunsun.
  const eslesir = (e: ModuleCatalogEntry): boolean => {
    const q = aramaBicimi(arama.trim());
    if (!q) return true;
    const tn = MODUL_TANITIMLARI[e.key];
    const parcalar = [
      e.name,
      e.description ? t(e.description) : "",
      evAdi(e) ?? "",
      ...(tn ? [t(tn.ozet), t(tn.detay), t(tn.kimIcin), t(tn.kategori), ...tn.neler.map((m) => t(m))] : []),
    ];
    return aramaBicimi(parcalar.join(" ")).includes(q);
  };

  // Küçük liste (≈10 modül): her çizimde süzmek ucuz, önbelleğe gerek yok.
  const gruplar = (() => {
    const kaynak = (gecerliSekme === "acik" ? aktifler : pasifler).filter(eslesir);
    if (gecerliSekme === "gelistirmede") return kaynak.length ? [{ baslik: "", moduller: kaynak }] : [];
    const sonuc: { baslik: string; moduller: ModuleCatalogEntry[] }[] = [];
    for (const kategori of MODUL_KATEGORI_SIRASI) {
      const moduller = kaynak.filter((e) => MODUL_TANITIMLARI[e.key]?.kategori === kategori);
      if (moduller.length) sonuc.push({ baslik: t(kategori), moduller });
    }
    // Tanıtımı olmayan aktif modül (yeni eklenmiş olabilir) kaybolmasın.
    const digerleri = kaynak.filter((e) => !MODUL_TANITIMLARI[e.key]);
    if (digerleri.length) sonuc.push({ baslik: t("Diğer"), moduller: digerleri });
    return sonuc;
  })();

  const eklenebilirSayisi = aktifler.filter((e) => !enabledKeys.has(e.key)).length;

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

  const sekmeDugmesi = (anahtar: Sekme, etiket: string, sayi: number) => {
    const secili = gecerliSekme === anahtar;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={secili}
        onClick={() => setSekme(anahtar)}
        style={{
          padding: "8px 2px",
          marginBottom: -1,
          background: "transparent",
          border: "none",
          borderBottom: `2px solid ${secili ? c.primary : "transparent"}`,
          color: secili ? c.textPrimary : c.textSecondary,
          fontSize: 14,
          fontWeight: secili ? 600 : 500,
          cursor: "pointer",
        }}
      >
        {etiket} <span style={{ color: c.textSecondary, fontWeight: 400 }}>({sayi})</span>
      </button>
    );
  };

  return (
    <Modal
      title={t("Modül ekle")}
      subtitle={t("Her modülün ne yaptığını gör, işine yarayanları tek tıkla aç.")}
      onClose={onClose}
      maxWidth={900}
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
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input
            type="search"
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder={t("Modül ara: fatura, müşteri, Instagram…")}
            aria-label={t("Modül ara")}
            autoFocus
            style={{ width: "100%", fontSize: 15, padding: "10px 12px" }}
          />

          {pasifler.length > 0 && (
            <div role="tablist" style={{ display: "flex", gap: 18, borderBottom: `1px solid ${c.border}` }}>
              {sekmeDugmesi("acik", t("Kullanıma açık"), aktifler.length)}
              {sekmeDugmesi("gelistirmede", t("Geliştirmede"), pasifler.length)}
            </div>
          )}

          {gecerliSekme === "gelistirmede" && (
            <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>{t("Yalnızca yöneticiler görür; kullanıcılara kapalı.")}</p>
          )}
          {gecerliSekme === "acik" && !arama && eklenebilirSayisi === 0 && (
            <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Bütün modüller zaten açık.")}</p>
          )}
          {gruplar.length === 0 && arama && (
            <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Aramana uyan modül yok.")}</p>
          )}

          {gruplar.map((grup) => (
            <section key={grup.baslik || "tumu"} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {grup.baslik && (
                <h3 style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary, margin: 0, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  {grup.baslik}
                </h3>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 380px), 1fr))", gap: 12 }}>
                {grup.moduller.map((entry) => (
                  <ModulKarti
                    key={entry.key}
                    entry={entry}
                    acik={enabledKeys.has(entry.key)}
                    secili={selectedKeys.includes(entry.key)}
                    evAdi={evAdi(entry)}
                    onSec={() => toggleKey(entry.key)}
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
  evAdi,
  onSec,
}: {
  entry: ModuleCatalogEntry;
  /** Şirkette zaten açık. */
  acik: boolean;
  secili: boolean;
  evAdi: string | null;
  onSec: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const pasif = !modulAktifMi(entry.key);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 18,
        borderRadius: 14,
        border: `1.5px ${pasif && !secili ? "dashed" : "solid"} ${secili ? c.primary : c.border}`,
        background: secili || pasif ? c.background : c.surface,
        opacity: acik ? 0.75 : 1,
      }}
    >
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <ModuleEmblem moduleKey={entry.key} size={60} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: pasif ? c.textSecondary : c.textPrimary }}>{entry.name}</span>
          {pasif && <PasifRozeti />}
        </div>
      </div>

      <ModulTanitimMetni entry={entry} evAdi={evAdi} />

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: "auto" }}>
        {acik ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, color: c.textSecondary }}>
            <IconCheck size={15} color={c.textSecondary} />
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
              gap: 5,
              padding: "8px 16px",
              borderRadius: 8,
              border: `1.5px solid ${c.primary}`,
              background: secili ? c.primary : "transparent",
              color: secili ? c.onPrimary : c.primary,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {secili && <IconCheck size={14} color={c.onPrimary} />}
            {secili ? t("Seçildi") : t("Seç")}
          </button>
        )}
      </div>
    </div>
  );
}
