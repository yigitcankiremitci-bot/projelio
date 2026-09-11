import { useEffect, useMemo, useState } from "react";
import type { Department, Job, Organization, Project, SchedulableTask } from "@projelio/shared";
import { gorevleriAra } from "@projelio/shared";
import { api, isAbortError } from "../api/client";

/** Öneri listesinde gösterilecek en fazla satır. */
const TAVAN = 8;
/** Bir kerede çekilen aday görev sayısı. */
const ADAY_TAVANI = 300;

export type OneriTuru = "task" | "project" | "job" | "department";

/** Giriş kutusunun açılır listesindeki tek satır. */
export interface Oneri {
  tur: OneriTuru;
  id: string;
  baslik: string;
  /** Nerede yaşadığı: projesi, şirketi… */
  altBaslik?: string;
  /** Bağlantı için uygulama içi adres. */
  path: string;
  /** tur === "task" ise görevin kendisi; seçenekler (yapıldı/takvim) buna bağlı. */
  task?: SchedulableTask;
}

/**
 * Yaptım'ın giriş kutusundaki "nereye" araması.
 *
 * TEK LİSTE, ÇOK TÜR. Önce yalnızca görevler aranıyordu; proje/iş/departmana
 * bağlamak için kutunun yanında ayrı, küçük bir düğme vardı — kimse görmüyordu.
 * Oysa kullanıcının sorusu tek: "bu iş nereye ait". Cevabın bir görev mi yoksa
 * bir proje mi olduğu onun derdi değil. Hepsi aynı listede, aynı yerden
 * tıklanıyor.
 *
 * GÖREVLER ÖNDE: "rapor" yazan biri büyük ihtimalle "Rapor" adlı GÖREVİ
 * kastediyor, "Raporlama" adlı projeyi değil (bkz. AranabilirGorev.oncelik).
 *
 * ÇIKTILAR BU LİSTEDE YOK: bir projenin içinde yaşıyorlar ve genel bir uçları
 * da yok — hepsini çekmek proje başına bir istek demekti. Çıktı seçimi,
 * projenin belli olduğu AKTARMA adımında yapılıyor.
 *
 * LİSTE BİR KEZ ÇEKİLİYOR, EŞLEŞTİRME TARAYICIDA: her tuşta sunucuya gitmek
 * hem yavaştı hem de `ilike` ile ek/yazım toleransı yazılamıyordu
 * (bkz. shared/taskSearch.ts).
 */
export function useTaskSearch(query: string, enabled = true) {
  const [gorevler, setGorevler] = useState<SchedulableTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");
  const [deneme, setDeneme] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setYukleniyor(true);
    setHata("");
    // Kapsayıcı listeleri (proje/iş/departman) küçük ve hepsi tek turda
    // geliyor. Biri düşerse arama o tür olmadan çalışmaya devam etsin diye
    // ayrı ayrı yutuluyor; GÖREV listesi düşerse arama anlamını yitirdiği
    // için hata yüzeye çıkıyor.
    Promise.all([
      api.get<SchedulableTask[]>(`/planning/schedulable-tasks?limit=${ADAY_TAVANI}`, ac.signal),
      api.get<Project[]>("/projects", ac.signal).catch(() => []),
      api.get<Job[]>("/jobs", ac.signal).catch(() => []),
      api.get<Department[]>("/departments", ac.signal).catch(() => []),
      api.get<Organization[]>("/organizations", ac.signal).catch(() => []),
    ])
      .then(([t, p, j, d, o]) => {
        setGorevler(t);
        setProjects(p);
        setJobs(j);
        setDepartments(d);
        setOrganizations(o);
        setHata("");
      })
      .catch((err) => {
        if (isAbortError(err) || ac.signal.aborted) return;
        // HATAYI YUTMUYORUZ: sessizce boş kalan liste, kullanıcıya "arama
        // çalışmıyor" dedirtiyor ve nedenini görebileceği hiçbir yer olmuyor.
        setHata(err instanceof Error ? err.message : "Görevlerin yüklenemedi");
      })
      .finally(() => {
        if (!ac.signal.aborted) setYukleniyor(false);
      });
    return () => ac.abort();
  }, [deneme]);

  const adaylar = useMemo<Oneri[]>(() => {
    const sirketAdlari = new Map(organizations.map((o) => [o.id, o.name]));
    return [
      ...gorevler.map<Oneri>((g) => ({
        tur: "task",
        id: g.id,
        baslik: g.title,
        altBaslik: [
          g.parentTaskId ? "alt görev" : null,
          g.projectTitle ?? departmanEtiketi(g.departmentName, g.departmentOrganizationName) ?? g.operationTitle,
          g.jobTitle,
        ]
          .filter(Boolean)
          .join(" · "),
        path: g.projectId ? `/projects/${g.projectId}` : `/departments/${g.departmentId}?tab=tasks`,
        task: g,
      })),
      ...projects.map<Oneri>((p) => ({
        tur: "project",
        id: p.id,
        baslik: p.title,
        path: `/projects/${p.id}`,
      })),
      ...jobs.map<Oneri>((j) => ({ tur: "job", id: j.id, baslik: j.title, path: `/jobs/${j.id}` })),
      ...departments.map<Oneri>((d) => ({
        tur: "department",
        id: d.id,
        baslik: d.name,
        // Şirket adı ŞART: iki şirkette "Muhasebe" olması kural, istisna değil.
        altBaslik: sirketAdlari.get(d.organizationId),
        path: `/departments/${d.id}`,
      })),
    ];
  }, [gorevler, projects, jobs, departments, organizations]);

  const aranan = query.trim();

  const oneriler = useMemo(() => {
    // Tek harfte liste neredeyse her şeyi getiriyor; kullanıcı daha yazmayı
    // bitirmeden ekranı doldurmak yardımcı olmuyor.
    if (!enabled || aranan.length < 2) return [];
    return gorevleriAra(
      aranan,
      adaylar,
      (o) => ({
        baslik: o.baslik,
        baglam: [o.altBaslik],
        // Görevler öne: "rapor" arayan çoğunlukla görevi kastediyor.
        oncelik: o.tur === "task" ? 40 : 0,
      }),
      TAVAN
    );
  }, [aranan, adaylar, enabled]);

  return {
    oneriler,
    loading: yukleniyor,
    hata,
    adaySayisi: adaylar.length,
    tekrarDene: () => setDeneme((n) => n + 1),
  };
}

function departmanEtiketi(ad?: string, sirket?: string): string | undefined {
  if (!ad) return undefined;
  return sirket ? `${ad} · ${sirket}` : ad;
}
