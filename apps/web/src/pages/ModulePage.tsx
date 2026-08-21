import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Department, Job, ModuleAccess, ModuleCatalogEntry } from "@projelio/shared";
import { api } from "../api/client";
import { useLiveRoom } from "../lib/liveRoom";
import { useThemeColors } from "../theme/useThemeColors";
import ModuleSurface from "../components/ModuleSurface";
import ModuleTeamPanel from "../components/ModuleTeamPanel";
import { IconChevronLeft } from "../components/icons";

/**
 * Bir modülün kendi sayfası.
 *
 * Modüller daha önce departman sayfasında akordeon olarak açılıyordu: çalışma
 * alanı departman listesinin arasına sıkışıyor, adresi olmadığı için de
 * paylaşılamıyor ve yenilenince kayboluyordu. Sayfa yüzeyli her modül artık
 * kendi adresinde açılır (bkz. lib/moduleSurfaces.ts); modal yüzeyli olanlar
 * departman sayfasında yerinde açılmaya devam eder.
 */
export default function ModulePage() {
  // Sayfa iki bağlamda açılır: şirkette departman altında, serbest çalışanda iş
  // altında. Modülün kendisi ikisinde de aynı; değişen yalnızca sahiplik ve
  // "geri" bağlantısı.
  const { departmentId, jobId, moduleKey } = useParams();
  const c = useThemeColors();

  // Modül sayfası kendi odası: aynı departmanın iki farklı modülünde çalışan iki
  // kişi birbirinin sayfasında sayılmasın (yetki kontrolü kök kapsam üzerinden,
  // bkz. backend realtime.gateway.ts).
  useLiveRoom(
    moduleKey && departmentId
      ? `department:${departmentId}/module/${moduleKey}`
      : moduleKey && jobId
      ? `job:${jobId}/module/${moduleKey}`
      : null
  );
  const [department, setDepartment] = useState<Department | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [entry, setEntry] = useState<ModuleCatalogEntry | null>(null);
  const [access, setAccess] = useState<ModuleAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!moduleKey || (!departmentId && !jobId)) return;
    setLoading(true);
    setNotFound(false);

    const catalogPromise = api
      .get<ModuleCatalogEntry[]>(jobId ? "/module-catalog?freelancer=true" : "/module-catalog")
      .catch(() => [] as ModuleCatalogEntry[]);

    const ownerPromise = jobId
      ? api.get<Job>(`/jobs/${jobId}`).then((j) => {
          setJob(j);
          // Serbest çalışanda ayrı bir onay makamı yok: işin sahibi tam yetkili.
          setAccess(null);
        })
      : api.get<Department>(`/departments/${departmentId}`).then(async (dept) => {
          setDepartment(dept);
          const moduleAccess = await api
            .get<ModuleAccess>(
              `/organizations/${dept.organizationId}/module-access?moduleKey=${encodeURIComponent(
                moduleKey
              )}&departmentId=${departmentId}`
            )
            .catch(() => null);
          setAccess(moduleAccess);
        });

    Promise.all([ownerPromise, catalogPromise])
      .then(([, catalog]) => setEntry(catalog.find((e) => e.key === moduleKey) ?? null))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [departmentId, jobId, moduleKey]);

  const title = entry?.name ?? "Modül";
  const parent = jobId
    ? { to: `/jobs/${jobId}?tab=modules`, label: job?.title ?? "İş" }
    : { to: `/departments/${departmentId}?tab=modules`, label: department?.name ?? "Departman" };

  if (loading) {
    return <p style={{ padding: 28, fontSize: 14, color: c.textSecondary }}>Yükleniyor…</p>;
  }

  if (notFound || !moduleKey || (!department && !job)) {
    return <p style={{ padding: 28, fontSize: 14, color: c.textSecondary }}>Modül bulunamadı.</p>;
  }

  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Link
          to={parent.to}
          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: c.textSecondary }}
        >
          <IconChevronLeft size={14} color={c.textSecondary} />
          {parent.label}
        </Link>
        {/* Lio simgesi burada DEĞİL: modülün kendi yüzeyi (ModuleSurface) onu
            zaten çiziyor, buraya da koyarsak sayfada iki tane olurdu. */}
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, color: c.textPrimary }}>{title}</h1>
        {/* Katalog açıklaması BİLEREK gösterilmiyor.
            O cümle "bu modülü açarsam ne göreceğim" sorusunu yanıtlamak için
            yazıldı; yeri modül kartı ve "Modül ekle" seçim ekranı. Sayfanın
            içindeyken cevabı zaten ekranda — burada yalnızca yer kaplıyor ve
            modül geliştikçe eskiyor (E-posta modülü kampanya defteriyken
            yazılan cümle, gelen kutusu eklendikten sonra yanlış kalmıştı).
            Açıklama metni module_catalog.description'da duruyor. */}
      </div>

      <ModuleSurface
        moduleKey={moduleKey}
        moduleName={title}
        organizationId={department?.organizationId}
        departmentId={departmentId}
        departmentKey={department?.catalogKey}
        jobId={jobId}
        access={access}
      />

      {/* Ekip modülün altında: önce iş, sonra kim çalışıyor. Departman
          sayfasındaki akordeonda ekip panelinin üstte olması çalışma alanını
          aşağı itiyordu. */}
      <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 16 }}>
        <ModuleTeamPanel
          organizationId={department?.organizationId}
          departmentId={departmentId}
          jobId={jobId}
          moduleKey={moduleKey}
          access={access ?? undefined}
        />
      </div>
    </div>
  );
}
