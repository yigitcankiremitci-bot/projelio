import { useEffect, useMemo, useState } from "react";
import type {
  Department,
  Job,
  ModuleCatalogEntry,
  Organization,
  OrganizationModule,
  Output,
  Project,
  Task,
  WorkLogEntry,
  WorkLogTargetKind,
} from "@projelio/shared";
import { getModuleRecordConfig } from "@projelio/shared";
import { api } from "../api/client";
import { worklog, type WorkLogPushInput } from "../api/worklog";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import Modal from "./Modal";

/**
 * "Nereye ait?" — bir Yaptım kaydını sisteme geçirme penceresi.
 *
 * İKİ FARKLI ŞEY VAR ve karıştırılmamalı:
 *
 *   AKTAR (push): hedefte GERÇEK bir kayıt açar — tamamlanmış bir görev, bir
 *   kasa hareketi, bir modül satırı. Ekip görür, defterlere yazılır.
 *
 *   BAĞLA (link): hiçbir yerde kayıt açmaz, kimseye bir şey göstermez. Yalnızca
 *   kullanıcının kendi günlüğündeki satıra "bu şu projeyle ilgiliydi" notu
 *   düşer. Kişisel bir yer imidir.
 *
 * Kullanıcıya bu ayrımı "push/link" diye anlatmıyoruz; menüdeki eylemin adı
 * ne yapacağını zaten söylüyor ("Görev olarak ekle" / "Sadece işaretle").
 *
 * GÖREVE BAĞLAMA (link) BU PENCEREDE YOK: bir görevi seçtirmek proje seçimi +
 * görev araması demek ve asıl ihtiyacı zaten "Görev olarak ekle" karşılıyor.
 * Gerekirse Lio'nun link_work_log aracı her hedef türünü bağlayabiliyor.
 */

type Adim = "menu" | "task" | "budget" | "module" | "link";

/** Bir açılır listedeki tek satır. */
export interface Secenek {
  id: string;
  label: string;
}

/**
 * Departman listesini etiketler.
 *
 * ŞİRKET ADI ŞART: iki şirkette aynı adlı departman olması (Muhasebe, Satış)
 * istisna değil kural ve şirket adı olmadan liste iki özdeş satır gösteriyor —
 * kullanıcı hangisini seçtiğini bilmeden seçiyor.
 */
export function departmanlariEtiketle(departments: Department[], organizations: Organization[]): Secenek[] {
  const sirketAdlari = new Map(organizations.map((o) => [o.id, o.name]));
  return departments.map((d) => {
    const sirket = sirketAdlari.get(d.organizationId);
    return { id: d.id, label: sirket ? `${d.name} · ${sirket}` : d.name };
  });
}

interface Props {
  entry: WorkLogEntry;
  onClose: () => void;
  /** Güncellenmiş kayıt + (aktarma yapıldıysa) kullanıcının gidebileceği sayfa. */
  onDone: (entry: WorkLogEntry, path?: string) => void;
}

export default function WorkLogTargetModal({ entry, onClose, onDone }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [adim, setAdim] = useState<Adim>("menu");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState("");

  // Hedef listeleri. Hepsi kullanıcının ERİŞEBİLDİKLERİ — yetkiyi sunucu
  // ayrıca uyguluyor, bu listeler yalnızca kolaylık.
  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  // Departman etiketleri şirket adını da taşımalı: iki şirkette aynı adlı
  // departman ("Muhasebe") olduğunda liste ayırt edilemez hâle geliyordu.
  const departmanSecenekleri = useMemo(() => departmanlariEtiketle(departments, organizations), [departments, organizations]);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    Promise.all([
      api.get<Project[]>("/projects", ac.signal).catch(() => []),
      api.get<Department[]>("/departments", ac.signal).catch(() => []),
      api.get<Job[]>("/jobs", ac.signal).catch(() => []),
      api.get<Organization[]>("/organizations", ac.signal).catch(() => []),
    ])
      .then(([p, d, j, o]) => {
        setProjects(p);
        setDepartments(d);
        setJobs(j);
        setOrganizations(o);
      })
      .finally(() => {
        if (!ac.signal.aborted) setYukleniyor(false);
      });
    return () => ac.abort();
  }, []);

  const aktar = async (body: WorkLogPushInput) => {
    setKaydediliyor(true);
    setHata("");
    try {
      const sonuc = await worklog.push(entry.id, body);
      onDone(sonuc.entry, sonuc.path);
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Aktarılamadı");
      setKaydediliyor(false);
    }
  };

  const bagla = async (targetKind: WorkLogTargetKind | null, targetId?: string, targetLabel?: string) => {
    setKaydediliyor(true);
    setHata("");
    try {
      const guncel = await worklog.link(entry.id, {
        targetKind,
        targetId: targetId ?? null,
        targetLabel: targetLabel ?? null,
      });
      // Bağlama bir yer imi; kullanıcıyı başka bir sayfaya SÜRÜKLEMİYORUZ.
      onDone(guncel);
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Bağlanamadı");
      setKaydediliyor(false);
    }
  };

  return (
    <Modal title={t("Nereye ait?")} onClose={onClose} maxWidth={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div
          style={{
            padding: "9px 12px",
            borderRadius: 9,
            background: c.background,
            border: `1px solid ${c.border}`,
            fontSize: 14,
            color: c.textPrimary,
          }}
        >
          {entry.title}
        </div>

        {adim !== "menu" && (
          <button
            type="button"
            onClick={() => {
              setAdim("menu");
              setHata("");
            }}
            style={{
              alignSelf: "flex-start",
              background: "transparent",
              border: "none",
              color: c.textSecondary,
              fontSize: 13.5,
              padding: 0,
            }}
          >
            ← {t("Geri")}
          </button>
        )}

        {adim === "menu" && (
          <Menu
            entry={entry}
            onSec={setAdim}
            onBaglantiyiKaldir={() => void bagla(null)}
            onYapilacaklara={() => void aktar({ kind: "personal_todo" })}
            kaydediliyor={kaydediliyor}
          />
        )}

        {adim === "task" && (
          <GorevAdimi
            projects={projects}
            departmanSecenekleri={departmanSecenekleri}
            yukleniyor={yukleniyor}
            kaydediliyor={kaydediliyor}
            onAktar={aktar}
          />
        )}

        {adim === "budget" && (
          <KasaAdimi
            projects={projects}
            departmanSecenekleri={departmanSecenekleri}
            yukleniyor={yukleniyor}
            kaydediliyor={kaydediliyor}
            onAktar={aktar}
          />
        )}

        {adim === "module" && (
          <ModulAdimi
            organizations={organizations}
            departments={departments}
            yukleniyor={yukleniyor}
            kaydediliyor={kaydediliyor}
            entry={entry}
            onAktar={aktar}
          />
        )}

        {adim === "link" && (
          <BaglaAdimi
            projects={projects}
            jobs={jobs}
            departmanSecenekleri={departmanSecenekleri}
            yukleniyor={yukleniyor}
            kaydediliyor={kaydediliyor}
            onBagla={bagla}
          />
        )}

        {hata && (
          <p style={{ margin: 0, color: c.danger, fontSize: 13 }} role="alert">
            {hata}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------- Menü

function Menu({
  entry,
  onSec,
  onBaglantiyiKaldir,
  onYapilacaklara,
  kaydediliyor,
}: {
  entry: WorkLogEntry;
  onSec: (adim: Adim) => void;
  onBaglantiyiKaldir: () => void;
  onYapilacaklara: () => void;
  kaydediliyor: boolean;
}) {
  const c = useThemeColors();
  const t = useT();

  const secenekler: { label: string; aciklama: string; onClick: () => void }[] = [
    {
      label: t("Görev olarak ekle"),
      aciklama: t("Seçtiğin projeye ya da departmana TAMAMLANMIŞ bir görev açar; ekip görür."),
      onClick: () => onSec("task"),
    },
    {
      label: t("Kasaya işle"),
      aciklama: t("Yapılan işi bir gelir ya da gider satırı olarak deftere yazar."),
      onClick: () => onSec("budget"),
    },
    {
      label: t("Modül defterine yaz"),
      aciklama: t("Şirketin bir modülüne kayıt satırı ekler."),
      onClick: () => onSec("module"),
    },
    {
      label: t("Yapılacaklarıma ekle"),
      aciklama: t("Kişisel panonda tamamlanmış bir kart olarak görünür."),
      onClick: onYapilacaklara,
    },
    {
      label: t("Sadece işaretle"),
      aciklama: t("Hiçbir yerde kayıt açmaz. Yalnızca bu satıra “şu işle ilgiliydi” notu düşer."),
      onClick: () => onSec("link"),
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {secenekler.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={s.onClick}
          disabled={kaydediliyor}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 2,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 9,
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.textPrimary,
            fontSize: 15,
            textAlign: "left",
          }}
        >
          <span style={{ fontWeight: 500 }}>{s.label}</span>
          <span style={{ fontSize: 12.5, color: c.textSecondary, lineHeight: 1.45 }}>{s.aciklama}</span>
        </button>
      ))}

      {entry.targetKind && (
        <button
          type="button"
          onClick={onBaglantiyiKaldir}
          disabled={kaydediliyor}
          style={{
            marginTop: 6,
            padding: "9px 12px",
            borderRadius: 9,
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.textSecondary,
            fontSize: 14,
          }}
        >
          {t("Bağlantıyı kaldır")} ({entry.targetLabel ?? entry.targetKind})
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------ Görev adımı

function GorevAdimi({
  projects,
  departmanSecenekleri,
  yukleniyor,
  kaydediliyor,
  onAktar,
}: {
  projects: Project[];
  departmanSecenekleri: Secenek[];
  yukleniyor: boolean;
  kaydediliyor: boolean;
  onAktar: (body: WorkLogPushInput) => void;
}) {
  const t = useT();
  const [tur, setTur] = useState<"project" | "department">("project");
  const [hedef, setHedef] = useState("");
  const [outputId, setOutputId] = useState("");
  const [parentTaskId, setParentTaskId] = useState("");
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [gorevler, setGorevler] = useState<Task[]>([]);
  const secenekler =
    tur === "project" ? projects.map((p) => ({ id: p.id, label: p.title })) : departmanSecenekleri;

  /**
   * Seçilen kapsamın çıktıları ve görevleri.
   *
   * NEDEN BURADA, ARAMA KUTUSUNDA DEĞİL: çıktı bir projenin İÇİNDE yaşıyor ve
   * hepsini birden listeleyen bir uç yok — genel listede göstermek proje başına
   * bir istek demekti. Kapsam belli olduğunda tek istekle geliyor.
   */
  useEffect(() => {
    if (!hedef) {
      setOutputs([]);
      setGorevler([]);
      return;
    }
    const kok = tur === "project" ? `/projects/${hedef}` : `/departments/${hedef}`;
    const ac = new AbortController();
    setOutputId("");
    setParentTaskId("");
    Promise.all([
      api.get<Output[]>(`${kok}/outputs`, ac.signal).catch(() => []),
      api.get<Task[]>(`${kok}/tasks`, ac.signal).catch(() => []),
    ]).then(([c, g]) => {
      setOutputs(c);
      // Üst görev yalnızca KÖK görevlerden seçilebilir: alt görevin alt görevi
      // hiyerarşiyi bir kat daha derinleştirirdi ve panolar iki kat gösteriyor.
      setGorevler(g.filter((x) => !x.parentTaskId));
    });
    return () => ac.abort();
  }, [hedef, tur]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <TurSecici
        secili={tur}
        secenekler={[
          { value: "project", label: t("Proje") },
          { value: "department", label: t("Departman") },
        ]}
        onSec={(v) => {
          setTur(v as "project" | "department");
          setHedef("");
        }}
      />
      <Secim
        label={tur === "project" ? t("Hedef proje") : t("Hedef departman")}
        value={hedef}
        onChange={setHedef}
        yukleniyor={yukleniyor}
        secenekler={secenekler}
      />
      {hedef && outputs.length > 0 && (
        <Secim
          label={t("Çıktı (opsiyonel)")}
          value={outputId}
          onChange={setOutputId}
          yukleniyor={false}
          secenekler={outputs.map((o) => ({ id: o.id, label: o.title }))}
        />
      )}

      {hedef && gorevler.length > 0 && (
        <Secim
          label={t("Üst görev (opsiyonel)")}
          value={parentTaskId}
          onChange={setParentTaskId}
          yukleniyor={false}
          secenekler={gorevler.map((g) => ({ id: g.id, label: g.title }))}
        />
      )}

      <Aciklama>
        {parentTaskId
          ? t("Seçtiğin görevin ALT GÖREVİ olarak, tamamlanmış şekilde açılır.")
          : t("Görev TAMAMLANMIŞ olarak açılır — bu iş zaten yapıldı; ayrıca kapatman gerekmez.")}
      </Aciklama>
      <Onayla
        disabled={!hedef || kaydediliyor}
        kaydediliyor={kaydediliyor}
        label={t("Görev olarak ekle")}
        onClick={() =>
          onAktar({
            kind: "task",
            ...(tur === "project" ? { projectId: hedef } : { departmentId: hedef }),
            outputId: outputId || undefined,
            parentTaskId: parentTaskId || undefined,
          })
        }
      />
    </div>
  );
}

// ------------------------------------------------------------- Kasa adımı

function KasaAdimi({
  projects,
  departmanSecenekleri,
  yukleniyor,
  kaydediliyor,
  onAktar,
}: {
  projects: Project[];
  departmanSecenekleri: Secenek[];
  yukleniyor: boolean;
  kaydediliyor: boolean;
  onAktar: (body: WorkLogPushInput) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [kapsam, setKapsam] = useState<"own" | "project" | "department">("own");
  const [hedef, setHedef] = useState("");
  const [tutar, setTutar] = useState("");
  const [tur, setTur] = useState<"income" | "expense">("expense");

  const tutarSayi = Number(tutar.replace(",", "."));
  const gecerli = Number.isFinite(tutarSayi) && tutarSayi > 0 && (kapsam === "own" || Boolean(hedef));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <TurSecici
        secili={tur}
        secenekler={[
          { value: "expense", label: t("Gider") },
          { value: "income", label: t("Gelir") },
        ]}
        onSec={(v) => setTur(v as "income" | "expense")}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Tutar (₺)")}</label>
        <input
          value={tutar}
          onChange={(e) => setTutar(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          style={{ width: "100%" }}
        />
      </div>

      <TurSecici
        secili={kapsam}
        secenekler={[
          { value: "own", label: t("Kendi kasam") },
          { value: "project", label: t("Proje") },
          { value: "department", label: t("Departman") },
        ]}
        onSec={(v) => {
          setKapsam(v as "own" | "project" | "department");
          setHedef("");
        }}
      />

      {kapsam !== "own" && (
        <Secim
          label={kapsam === "project" ? t("Hedef proje") : t("Hedef departman")}
          value={hedef}
          onChange={setHedef}
          yukleniyor={yukleniyor}
          secenekler={
            kapsam === "project" ? projects.map((p) => ({ id: p.id, label: p.title })) : departmanSecenekleri
          }
        />
      )}

      <Aciklama>{t("Kaydın başlığı hareketin açıklaması, yapıldığı gün de tarihi olur.")}</Aciklama>

      <Onayla
        disabled={!gecerli || kaydediliyor}
        kaydediliyor={kaydediliyor}
        label={t("Kasaya işle")}
        onClick={() =>
          onAktar({
            kind: "budget",
            amount: tutarSayi,
            transactionType: tur,
            ...(kapsam === "project" ? { projectId: hedef } : kapsam === "department" ? { departmentId: hedef } : {}),
          })
        }
      />
    </div>
  );
}

// ------------------------------------------------------------ Modül adımı

function ModulAdimi({
  organizations,
  departments,
  yukleniyor,
  kaydediliyor,
  entry,
  onAktar,
}: {
  organizations: Organization[];
  departments: Department[];
  yukleniyor: boolean;
  kaydediliyor: boolean;
  entry: WorkLogEntry;
  onAktar: (body: WorkLogPushInput) => void;
}) {
  const t = useT();
  const [organizationId, setOrganizationId] = useState("");
  const [moduleKey, setModuleKey] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [acikModuller, setAcikModuller] = useState<OrganizationModule[]>([]);
  const [katalog, setKatalog] = useState<ModuleCatalogEntry[]>([]);
  const [modullerYukleniyor, setModullerYukleniyor] = useState(false);

  // Katalog modül ADLARINI taşıyor; açık modüller yalnızca anahtarları.
  useEffect(() => {
    api
      .get<ModuleCatalogEntry[]>("/module-catalog")
      .then(setKatalog)
      .catch(() => setKatalog([]));
  }, []);

  useEffect(() => {
    if (!organizationId) {
      setAcikModuller([]);
      return;
    }
    setModullerYukleniyor(true);
    setModuleKey("");
    api
      .get<OrganizationModule[]>(`/organizations/${organizationId}/modules`)
      .then(setAcikModuller)
      .catch(() => setAcikModuller([]))
      .finally(() => setModullerYukleniyor(false));
  }, [organizationId]);

  const modulAdlari = useMemo(() => new Map(katalog.map((k) => [k.key, k.name])), [katalog]);
  const orgDepartmanlari = departments.filter((d) => d.organizationId === organizationId);

  /**
   * Kaydı modülün KENDİ alan adlarına eşler. Her modülün alanları farklı
   * (bkz. shared/moduleConfigs); uydurma anahtarlarla yazmak defterde
   * okunamayan bir satır bırakırdı. Karşılığı olmayan alan hiç yazılmaz.
   */
  const kayitVerisi = (): Record<string, unknown> | undefined => {
    if (!moduleKey) return undefined;
    const config = getModuleRecordConfig(moduleKey, modulAdlari.get(moduleKey) ?? moduleKey);
    const veri: Record<string, unknown> = {};
    const metinAlani = config.fields.find((f) => f.type === "text");
    const notAlani = config.fields.find((f) => f.type === "textarea");
    const tarihAlani = config.fields.find((f) => f.type === "date");
    if (metinAlani) veri[metinAlani.key] = entry.title;
    if (notAlani && entry.note) veri[notAlani.key] = entry.note;
    if (tarihAlani) veri[tarihAlani.key] = entry.doneAt.slice(0, 10);
    return Object.keys(veri).length ? veri : undefined;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Secim
        label={t("Şirket")}
        value={organizationId}
        onChange={setOrganizationId}
        yukleniyor={yukleniyor}
        secenekler={organizations.map((o) => ({ id: o.id, label: o.name }))}
      />
      {organizationId && (
        <Secim
          label={t("Modül")}
          value={moduleKey}
          onChange={setModuleKey}
          yukleniyor={modullerYukleniyor}
          bosMesaj={t("Bu şirkette açık modül yok.")}
          secenekler={acikModuller.map((m) => ({ id: m.moduleKey, label: modulAdlari.get(m.moduleKey) ?? m.moduleKey }))}
        />
      )}
      {organizationId && orgDepartmanlari.length > 0 && (
        <Secim
          label={t("Departman (opsiyonel)")}
          value={departmentId}
          onChange={setDepartmentId}
          yukleniyor={false}
          secenekler={orgDepartmanlari.map((d) => ({ id: d.id, label: d.name }))}
        />
      )}
      <Onayla
        disabled={!organizationId || !moduleKey || kaydediliyor}
        kaydediliyor={kaydediliyor}
        label={t("Deftere yaz")}
        onClick={() =>
          onAktar({
            kind: "module_record",
            organizationId,
            moduleKey,
            departmentId: departmentId || undefined,
            recordData: kayitVerisi(),
          })
        }
      />
    </div>
  );
}

// ------------------------------------------------------------- Bağla adımı

function BaglaAdimi({
  projects,
  jobs,
  departmanSecenekleri,
  yukleniyor,
  kaydediliyor,
  onBagla,
}: {
  projects: Project[];
  jobs: Job[];
  departmanSecenekleri: Secenek[];
  yukleniyor: boolean;
  kaydediliyor: boolean;
  onBagla: (kind: WorkLogTargetKind | null, id?: string, label?: string) => void;
}) {
  const t = useT();
  const [tur, setTur] = useState<"project" | "job" | "department">("project");
  const [hedef, setHedef] = useState("");

  const secenekler =
    tur === "project"
      ? projects.map((p) => ({ id: p.id, label: p.title }))
      : tur === "job"
        ? jobs.map((j) => ({ id: j.id, label: j.title }))
        : departmanSecenekleri;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <TurSecici
        secili={tur}
        secenekler={[
          { value: "project", label: t("Proje") },
          { value: "job", label: t("İş") },
          { value: "department", label: t("Departman") },
        ]}
        onSec={(v) => {
          setTur(v as "project" | "job" | "department");
          setHedef("");
        }}
      />
      <Secim label={t("Hedef")} value={hedef} onChange={setHedef} yukleniyor={yukleniyor} secenekler={secenekler} />
      <Aciklama>
        {t("Hiçbir yerde kayıt açılmaz, kimse görmez. Yalnızca bu satır “şu işle ilgiliydi” diye işaretlenir.")}
      </Aciklama>
      <Onayla
        disabled={!hedef || kaydediliyor}
        kaydediliyor={kaydediliyor}
        label={t("İşaretle")}
        onClick={() => onBagla(tur, hedef, secenekler.find((s) => s.id === hedef)?.label)}
      />
    </div>
  );
}

// --------------------------------------------------------- Ortak parçalar

function TurSecici({
  secili,
  secenekler,
  onSec,
}: {
  secili: string;
  secenekler: { value: string; label: string }[];
  onSec: (value: string) => void;
}) {
  const c = useThemeColors();
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {secenekler.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onSec(s.value)}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 8,
            border: `1.5px solid ${secili === s.value ? c.primary : c.border}`,
            background: secili === s.value ? c.background : "transparent",
            color: c.textPrimary,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function Secim({
  label,
  value,
  onChange,
  yukleniyor,
  secenekler,
  bosMesaj,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  yukleniyor: boolean;
  secenekler: { id: string; label: string }[];
  bosMesaj?: string;
}) {
  const c = useThemeColors();
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 15, color: c.textSecondary }}>{label}</label>
      {yukleniyor ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>
      ) : secenekler.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{bosMesaj ?? t("Erişebildiğin bir kayıt yok.")}</p>
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%" }}>
          <option value="">{t("Seç…")}</option>
          {secenekler.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function Aciklama({ children }: { children: React.ReactNode }) {
  const c = useThemeColors();
  return <p style={{ fontSize: 12.5, color: c.textSecondary, margin: 0, lineHeight: 1.45 }}>{children}</p>;
}

function Onayla({
  disabled,
  kaydediliyor,
  label,
  onClick,
}: {
  disabled: boolean;
  kaydediliyor: boolean;
  label: string;
  onClick: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  return (
    <button
      data-primary
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "11px 0",
        borderRadius: 8,
        border: "none",
        background: c.primary,
        color: c.onPrimary,
        fontSize: 15,
        fontWeight: 500,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {kaydediliyor ? t("Kaydediliyor…") : label}
    </button>
  );
}
