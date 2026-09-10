import { useEffect, useMemo, useState } from "react";
import type { Department, Job, Organization, Project, WorkLogTargetKind } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { departmanlariEtiketle, type Secenek } from "./WorkLogTargetModal";
import { IconX } from "./icons";

/**
 * Kaydı KAYDETMEDEN ÖNCE bir yere iliştirme.
 *
 * Önce kaydetmek, sonra satırdaki zincir düğmesine basmak gerekiyordu: iki
 * adım, iki farklı ekran ve arada "acaba kaydettim mi" duraksaması. Oysa
 * kullanıcı çoğu zaman işi yazarken nereye ait olduğunu ZATEN biliyor.
 *
 * Burada yalnızca BAĞLAMA var (yer imi), aktarma yok. Aktarma hedefte gerçek
 * bir kayıt açıyor (tamamlanmış görev, kasa hareketi) ve tutar/modül gibi ek
 * alanlar istiyor; onu tek satırlık bir giriş kutusuna sıkıştırmak, hızlı
 * girişi yavaş bir forma çevirirdi. Aktarma kaydedildikten sonra, satırdaki
 * zincir düğmesinden yapılıyor.
 */

export interface SecilenHedef {
  targetKind: WorkLogTargetKind;
  targetId: string;
  targetLabel: string;
  targetPath: string;
}

type Tur = "project" | "job" | "department";

interface Props {
  secilen: SecilenHedef | null;
  onSec: (hedef: SecilenHedef | null) => void;
}

export default function WorkLogHedefSecici({ secilen, onSec }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [acik, setAcik] = useState(false);
  const [tur, setTur] = useState<Tur>("project");
  const [projects, setProjects] = useState<Project[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  // Listeler yalnızca seçici AÇILDIĞINDA çekiliyor: Yaptım kayıtlarının çoğu
  // hiçbir yere bağlanmıyor ve sayfa açılışını dört istekle yavaşlatmak
  // gereksiz.
  useEffect(() => {
    if (!acik || projects.length || jobs.length || departments.length) return;
    const ac = new AbortController();
    Promise.all([
      api.get<Project[]>("/projects", ac.signal).catch(() => []),
      api.get<Job[]>("/jobs", ac.signal).catch(() => []),
      api.get<Department[]>("/departments", ac.signal).catch(() => []),
      api.get<Organization[]>("/organizations", ac.signal).catch(() => []),
    ]).then(([p, j, d, o]) => {
      setProjects(p);
      setJobs(j);
      setDepartments(d);
      setOrganizations(o);
    });
    return () => ac.abort();
  }, [acik]);

  const secenekler: Secenek[] = useMemo(() => {
    if (tur === "project") return projects.map((p) => ({ id: p.id, label: p.title }));
    if (tur === "job") return jobs.map((j) => ({ id: j.id, label: j.title }));
    return departmanlariEtiketle(departments, organizations);
  }, [tur, projects, jobs, departments, organizations]);

  if (secilen) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 6px 3px 9px",
          borderRadius: 999,
          background: c.background,
          border: `1px solid ${c.border}`,
          color: c.textSecondary,
          maxWidth: "100%",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {secilen.targetLabel}
        </span>
        <button
          type="button"
          onClick={() => onSec(null)}
          aria-label={t("Bağlantıyı kaldır")}
          title={t("Bağlantıyı kaldır")}
          style={{ border: "none", background: "transparent", padding: 0, display: "flex" }}
        >
          <IconX size={12} color={c.textSecondary} />
        </button>
      </span>
    );
  }

  if (!acik) {
    return (
      <button
        type="button"
        onClick={() => setAcik(true)}
        style={{ border: "none", background: "transparent", color: c.textSecondary, fontSize: 13, padding: 0 }}
      >
        {t("Bir yere bağla")}
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <select value={tur} onChange={(e) => setTur(e.target.value as Tur)} style={{ fontSize: 13 }}>
        <option value="project">{t("Proje")}</option>
        <option value="job">{t("İş")}</option>
        <option value="department">{t("Departman")}</option>
      </select>
      <select
        value=""
        onChange={(e) => {
          const secim = secenekler.find((s) => s.id === e.target.value);
          if (!secim) return;
          onSec({
            targetKind: tur,
            targetId: secim.id,
            targetLabel: secim.label,
            targetPath: adres(tur, secim.id),
          });
          setAcik(false);
        }}
        style={{ fontSize: 13, maxWidth: 260 }}
      >
        <option value="">{secenekler.length ? t("Seç…") : t("Yükleniyor…")}</option>
        {secenekler.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setAcik(false)}
        style={{ border: "none", background: "transparent", color: c.textSecondary, fontSize: 13, padding: 0 }}
      >
        {t("Vazgeç")}
      </button>
    </span>
  );
}

/** Hedefin uygulama içi adresi; listede bağlantıyı tıklanabilir yapan şey. */
function adres(tur: Tur, id: string): string {
  if (tur === "project") return `/projects/${id}`;
  if (tur === "job") return `/jobs/${id}`;
  return `/departments/${id}`;
}
