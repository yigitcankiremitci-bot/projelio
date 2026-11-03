// Yeni Projelio arayüzü — deneme ana sayfası (adres: /yeni).
//
// Düzen kullanıcının verdiği referans görselden: solda sade menü, ortada ofis,
// sağda genel durum / bugünün odağı / yaklaşan etkinlikler / Lio kartı, altta
// öne çıkan projeler. Ofis gerçek zamanlı bir 3D sahne (components/ofis3d/):
// her departman bir oda, her üye masasında bir karakter; departman yoksa odası
// da yok, üye ayrılınca karakteri de gider. Tamamlanan görevler puan getirir,
// puanla mağazadan eşya alınıp ofise yerleştirilir.
//
// Mevcut ekranların yerine geçmez; App.tsx bu adreste uygulamanın kenar
// çubuğunu gizler (bu sayfa kendi menüsünü çiziyor). Tüm okuma/yazma mevcut
// uçlardan; backend'de değişiklik yok. Görev seçme kuralları lib/sakin.ts'te.

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { Department, DepartmentMember, Job, JobMember, Organization, PersonalBoardItem, Project, ProjeEtkinligi, Task, TaskStatus, User } from "@projelio/shared";
import { api } from "../api/client";
import { askLio } from "../lib/askLio";
import { usePresence } from "../lib/liveRoom";
import { hamleleriSec, yerelTarih } from "../lib/sakin";
import OfisOyunu, { type OyunDepartmani, type OyunHareketi } from "../components/ofis3d/OfisOyunu";
import { useSidebarStyle } from "../theme/useSidebarStyle";
import { coverBackground } from "../lib/covers";
import { getDepartmentCoverUrl } from "../lib/departmentCovers";
import { notifySidebarChanged } from "../lib/sidebarEvents";
import { useUndo } from "../lib/undo";
import Modal from "../components/Modal";
import OrgBudgetPanel from "../components/OrgBudgetPanel";
import ScopeBudgetPanel from "../components/butce/ScopeBudgetPanel";
import ModuleModal from "../components/ModuleModal";
import { isOpenableModule } from "../lib/entityModules";
import { MODULE_RECORD_CONFIGS } from "../lib/moduleRecordConfigs";
import { kartModaldaAcilir } from "../lib/moduleSurfaces";
import { serbestIsMi, studyoOdalari, type StudyoIsi } from "../lib/studyoOfisi";
import { KASA_MODULU, KUPA_RAFI, PROJE_ONEKI } from "../lib/ofisOyunu";
import "./Yeni.css";

// Proje sayfası büyük: yalnızca ofisteki bir panodan açılınca yüklenir.
const ProjectDetail = lazy(() => import("./ProjectDetail"));

type Ton = "mor" | "mavi" | "turuncu" | "kirmizi" | "yesil" | "pembe" | "gri";

// ------------------------------------------------------------------ yardımcılar

interface Etkinlik {
  id: string;
  baslik: string;
  alt: string;
  tarih: string;
  saat?: string;
  tur: "toplanti" | "gorusme" | "teslim";
}

interface GoogleEtkinlik {
  id: string;
  baslik: string;
  konum?: string;
  baslangic: string;
  tumGun: boolean;
  meetLink?: string;
}

function gunEkle(tarih: string, gun: number): string {
  const d = new Date(`${tarih}T00:00:00`);
  d.setDate(d.getDate() + gun);
  return yerelTarih(d);
}

function bas(ad?: string): string {
  if (!ad) return "?";
  const p = ad.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toLocaleUpperCase("tr");
}

function hataMetni(e: unknown): string {
  return e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu";
}

function gorevKisileri(gorevler: Task[]): { ad: string; foto?: string }[] {
  const m = new Map<string, { ad: string; foto?: string }>();
  for (const t of gorevler) {
    if (t.assignees?.length) {
      for (const a of t.assignees) if (a.fullName && !m.has(a.userId)) m.set(a.userId, { ad: a.fullName, foto: a.avatarUrl });
    } else if (t.assignedTo && t.assignedToName && !m.has(t.assignedTo)) {
      m.set(t.assignedTo, { ad: t.assignedToName });
    }
  }
  return [...m.values()];
}

const GUN_ADI = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

function gunEtiketi(tarih: string, bugun: string): string {
  if (tarih === bugun) return "";
  if (tarih === gunEkle(bugun, 1)) return "Yarın";
  return GUN_ADI[new Date(`${tarih}T00:00:00`).getDay()];
}

// ------------------------------------------------------------------ sayfa

/** Ofis seçicisinde stüdyonun değeri (şirket kimlikleriyle çakışmaz). */
const STUDYO = "__studyo";

export default function Yeni() {
  const navigate = useNavigate();
  const { pushUndo } = useUndo();
  const location = useLocation();
  const cevrimici = usePresence();
  const kenar = useSidebarStyle();
  const kenarStili = { background: kenar.background, backgroundImage: kenar.backgroundImage, backgroundSize: kenar.backgroundSize };
  const [ben, setBen] = useState<User | null>(null);
  const [pano, setPano] = useState<PersonalBoardItem[] | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState("");
  const [departmanlar, setDepartmanlar] = useState<Department[] | null>(null);
  const [orgGorevleri, setOrgGorevleri] = useState<Task[] | null>(null);
  const [uyeler, setUyeler] = useState<Record<string, DepartmentMember[]>>({});
  // Modüller: katalog (hangi modül hangi departmanın) + şirkette açık olanlar.
  const [katalog, setKatalog] = useState<{ key: string; name: string; description?: string; departmentKeys?: string[] }[]>([]);
  const [acikModuller, setAcikModuller] = useState<Set<string> | null>(null);
  // Yönetim odasındaki kasa yalnızca şirketin Kasa sekmesini görebilene konur.
  // null: henüz bilinmiyor (ofis açılışı bunu da bekler, bkz. ofisHazir).
  const [kasaYetkisi, setKasaYetkisi] = useState<boolean | null>(null);
  const [katalogHazir, setKatalogHazir] = useState(false);
  const [uyelerHazir, setUyelerHazir] = useState(false);
  // Açık kasa: şirketin kasası ("org") ya da stüdyoda bir işin bütçesi (iş kimliği).
  const [kasaAcik, setKasaAcik] = useState<string | null>(null);
  // Ofisten tıklanan modül sayfaya gitmeden, neredeyse tam ekran modalde açılır.
  const [acikModul, setAcikModul] = useState<{ odaId: string; key: string } | null>(null);
  /** Ofisteki proje panosundan (ya da kupa rafındaki plaketten) açılan proje: sayfaya gitmeden modalda. */
  const [acikProje, setAcikProje] = useState<string | null>(null);
  // Stüdyom: serbest çalışanın işleri ofiste oda olur (bkz. lib/studyoOfisi.ts).
  // Şirketi olmayan kullanıcı doğrudan stüdyoyu görür.
  const [studyo, setStudyo] = useState(false);
  const [serbestIsler, setSerbestIsler] = useState<Job[] | null>(null);
  const [studyoIsleri, setStudyoIsleri] = useState<StudyoIsi[] | null>(null);
  const [serbestKatalog, setSerbestKatalog] = useState<{ key: string; name: string; description?: string }[]>([]);
  const [projeler, setProjeler] = useState<Project[] | null>(null);
  const [projeGorevMap, setProjeGorevMap] = useState<Record<string, Task[]>>({});
  const [etkinlikler, setEtkinlikler] = useState<Etkinlik[] | null>(null);
  const [arama, setArama] = useState("");
  const [aramaAcik, setAramaAcik] = useState(false);
  const [lioSoru, setLioSoru] = useState("");
  const [mesaj, setMesaj] = useState<{ metin: string; hata?: boolean } | null>(null);
  const [mesgul, setMesgul] = useState<string | null>(null);
  const zamanlayici = useRef<number | undefined>(undefined);

  const bugun = useMemo(() => yerelTarih(new Date()), []);

  const soyle = useCallback((metin: string, hata = false) => {
    window.clearTimeout(zamanlayici.current);
    setMesaj({ metin, hata });
    zamanlayici.current = window.setTimeout(() => setMesaj(null), 3600);
  }, []);
  useEffect(() => () => window.clearTimeout(zamanlayici.current), []);

  // ------------------------------------------------------------ yükleme
  useEffect(() => {
    api.get<User>("/auth/me").then(setBen).catch(() => undefined);
    api
      .get<PersonalBoardItem[]>("/todos/board?source=all&completedWithinDays=7")
      .then((d) => setPano(d ?? []))
      .catch(() => setPano([]));
    api
      .get<Organization[]>("/organizations")
      .then((d) => {
        const liste = (d ?? []).filter((o) => !o.archivedAt);
        setOrgs(liste);
        // Ana sayfalardaki davet kartı (components/OfisDavetKarti.tsx) hangi
        // ofisin açılacağını ?ofis= ile söyler: şirket kimliği ya da "studyo".
        const istenen = new URLSearchParams(location.search).get("ofis");
        const istenenSirket = liste.find((o) => o.id === istenen);
        if (istenen === "studyo" && liste[0]) {
          setOrgId(liste[0].id);
          setStudyo(true);
        } else if (istenenSirket) setOrgId(istenenSirket.id);
        else if (liste[0]) setOrgId(liste[0].id);
        else {
          setStudyo(true);
          setDepartmanlar([]);
          setOrgGorevleri([]);
        }
      })
      .catch(() => {
        setDepartmanlar([]);
        setOrgGorevleri([]);
      });
    api
      .get<Job[]>("/jobs")
      .then((d) => setSerbestIsler((d ?? []).filter(serbestIsMi)))
      .catch(() => setSerbestIsler([]));
    api
      .get<Project[]>("/projects")
      .then((d) => setProjeler((d ?? []).filter((p) => !p.archivedAt && p.status !== "archived" && p.status !== "completed")))
      .catch(() => setProjeler([]));

    const son = gunEkle(bugun, 7);
    const projeEtk = api
      .get<ProjeEtkinligi[]>(`/calendar/mine?from=${bugun}&to=${son}`)
      .then((d) =>
        (d ?? []).map<Etkinlik>((e) => ({
          id: `p-${e.id}`,
          baslik: e.title,
          alt: e.location || e.projectTitle || "",
          tarih: e.eventDate,
          saat: e.allDay ? undefined : e.startsAt?.slice(0, 5),
          tur: e.kind === "meeting" ? "toplanti" : e.kind === "delivery" || e.kind === "milestone" ? "teslim" : "gorusme",
        }))
      )
      .catch(() => [] as Etkinlik[]);
    // Google Takvim bağlı değilse uç hata döner; o durumda yalnızca proje takvimi.
    const googleEtk = api
      .get<GoogleEtkinlik[]>(`/google-takvim/etkinlikler?from=${bugun}&to=${son}`)
      .then((d) =>
        (d ?? []).map<Etkinlik>((e) => {
          const t = new Date(e.baslangic);
          return {
            id: `g-${e.id}`,
            baslik: e.baslik,
            alt: e.meetLink ? "Google Meet" : e.konum || "Google Takvim",
            tarih: e.tumGun ? e.baslangic.slice(0, 10) : yerelTarih(t),
            saat: e.tumGun ? undefined : t.toTimeString().slice(0, 5),
            tur: e.meetLink ? "toplanti" : "gorusme",
          };
        })
      )
      .catch(() => [] as Etkinlik[]);
    Promise.all([projeEtk, googleEtk]).then(([a, b]) => {
      const simdi = new Date().toTimeString().slice(0, 5);
      setEtkinlikler(
        [...a, ...b]
          .filter((e) => e.tarih > bugun || (e.tarih === bugun && (!e.saat || e.saat >= simdi)))
          .sort((x, y) => (x.tarih + (x.saat ?? "00:00")).localeCompare(y.tarih + (y.saat ?? "00:00")))
      );
    });
  }, [bugun]);

  useEffect(() => {
    if (!orgId) return;
    const ac = new AbortController();
    setDepartmanlar(null);
    setOrgGorevleri(null);
    api
      .get<Department[]>(`/organizations/${orgId}/departments`, ac.signal)
      .then((d) => setDepartmanlar((d ?? []).filter((x) => !x.archivedAt)))
      .catch(() => setDepartmanlar([]));
    api
      .get<Task[]>(`/organizations/${orgId}/tasks`, ac.signal)
      .then((d) => setOrgGorevleri((d ?? []).filter((t) => !t.archivedAt)))
      .catch(() => setOrgGorevleri([]));
    setKasaYetkisi(null);
    api
      .get<Organization>(`/organizations/${orgId}`, ac.signal)
      .then((o) => setKasaYetkisi(o?.viewerAccess?.canViewBudget === true))
      .catch(() => !ac.signal.aborted && setKasaYetkisi(false));
    setAcikModuller(null);
    api
      .get<{ moduleKey: string }[]>(`/organizations/${orgId}/modules`, ac.signal)
      .then((d) => setAcikModuller(new Set((d ?? []).map((m) => m.moduleKey))))
      .catch(() => setAcikModuller(new Set()));
    return () => ac.abort();
  }, [orgId]);

  useEffect(() => {
    api
      .get<{ key: string; name: string; description?: string; departmentKeys?: string[] }[]>("/module-catalog")
      .then((d) => setKatalog(d ?? []))
      .catch(() => setKatalog([]))
      .finally(() => setKatalogHazir(true));
  }, []);

  // Stüdyo seçilince (bir kez) her işin ekibi, modülleri ve aktif projelerinin görevleri.
  useEffect(() => {
    if (!studyo || !serbestIsler || studyoIsleri) return;
    let iptal = false;
    api
      .get<{ key: string; name: string; description?: string }[]>("/module-catalog?freelancer=true")
      .then((d) => !iptal && setSerbestKatalog(d ?? []))
      .catch(() => undefined);
    Promise.all(
      serbestIsler.map(async (job): Promise<StudyoIsi> => {
        const [uyeler, moduller, projeler] = await Promise.all([
          api.get<JobMember[]>(`/jobs/${job.id}/members`).catch(() => [] as JobMember[]),
          api.get<{ moduleKey: string }[]>(`/jobs/${job.id}/modules`).catch(() => [] as { moduleKey: string }[]),
          api.get<Project[]>(`/jobs/${job.id}/projects`).catch(() => [] as Project[]),
        ]);
        const aktif = (projeler ?? []).filter((p) => !p.archivedAt && p.status !== "archived" && p.status !== "completed");
        const gorevler = (
          await Promise.all(aktif.map((p) => api.get<Task[]>(`/projects/${p.id}/tasks`).catch(() => [] as Task[])))
        ).flat();
        return {
          job,
          uyeler: uyeler ?? [],
          moduller: (moduller ?? []).map((m) => m.moduleKey),
          projeler: projeler ?? [],
          gorevler: gorevler.filter((t) => !t.archivedAt),
        };
      })
    ).then((l) => !iptal && setStudyoIsleri(l));
    return () => {
      iptal = true;
    };
  }, [studyo, serbestIsler, studyoIsleri]);

  // Odalardaki karakterler: departmanların onaylı üyeleri.
  useEffect(() => {
    setUyelerHazir(false);
    if (!departmanlar) return;
    if (!departmanlar.length) {
      setUyelerHazir(true);
      return;
    }
    const ac = new AbortController();
    Promise.all(
      departmanlar.map((d) =>
        api
          .get<DepartmentMember[]>(`/departments/${d.id}/members`, ac.signal)
          .then((l) => [d.id, (l ?? []).filter((u) => u.status === "approved" && u.userId)] as const)
          .catch(() => [d.id, []] as const)
      )
    ).then((liste) => {
      if (ac.signal.aborted) return;
      setUyeler(Object.fromEntries(liste));
      setUyelerHazir(true);
    });
    return () => ac.abort();
  }, [departmanlar]);

  // Öne çıkan projeler: teslimi en yakın 3 aktif proje.
  const oneCikan = useMemo(
    () =>
      (projeler ?? [])
        .slice()
        .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"))
        .slice(0, 3),
    [projeler]
  );
  useEffect(() => {
    oneCikan.forEach((p) => {
      if (projeGorevMap[p.id]) return;
      api
        .get<Task[]>(`/projects/${p.id}/tasks`)
        .then((d) => setProjeGorevMap((m) => ({ ...m, [p.id]: (d ?? []).filter((t) => !t.archivedAt && !t.parentTaskId) })))
        .catch(() => setProjeGorevMap((m) => ({ ...m, [p.id]: [] })));
    });
  }, [oneCikan, projeGorevMap]);

  // ------------------------------------------------------------ türetilenler
  const [odakIdleri, setOdakIdleri] = useState<string[] | null>(null);
  useEffect(() => {
    // Odak sabitlenir: tamamlanan iş listeden düşüp yerine başkası gelmesin.
    if (pano && odakIdleri === null) setOdakIdleri(hamleleriSec(pano, bugun, 3).map((h) => h.itemId));
  }, [pano, bugun, odakIdleri]);
  const odak = useMemo(
    () => (pano && odakIdleri ? odakIdleri.map((id) => pano.find((p) => p.itemId === id)).filter((x): x is PersonalBoardItem => !!x) : []),
    [pano, odakIdleri]
  );

  // Genel durum: şirket görevleri; şirket yoksa kişisel pano.
  const genel = useMemo(() => {
    const gecmisMi = (d?: string) => !!d && d.slice(0, 10) < bugun;
    if (!studyo && orgGorevleri && orgGorevleri.length) {
      const biten = orgGorevleri.filter((t) => t.status === "completed").length;
      const geciken = orgGorevleri.filter((t) => t.status !== "completed" && gecmisMi(t.deadline)).length;
      return { biten, geciken, devam: orgGorevleri.length - biten - geciken };
    }
    const liste = (pano ?? []).filter((i) => !i.isHidden);
    const biten = liste.filter((i) => i.status === "completed").length;
    const geciken = liste.filter((i) => i.status !== "completed" && gecmisMi(i.effectiveDueDate)).length;
    return { biten, geciken, devam: liste.length - biten - geciken };
  }, [orgGorevleri, pano, bugun, studyo]);
  const genelToplam = genel.biten + genel.devam + genel.geciken;
  const genelYuzde = genelToplam ? Math.round((genel.biten / genelToplam) * 100) : 0;
  const genelYuklendi = pano !== null && orgGorevleri !== null;

  // Kim ne kadar çalışıyor: şirkette tamamladığı görev sayısı (ofiste yol verme kuralında kullanılır).
  const emek = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of orgGorevleri ?? []) if (t.status === "completed" && t.completedBy) m.set(t.completedBy, (m.get(t.completedBy) ?? 0) + 1);
    return m;
  }, [orgGorevleri]);
  // Ofis açılışta ilk veriler TAMAMLANINCA tek seferde kurulur. Önce boş planla
  // kurulunca yalnızca ortak alan görünüyor, departmanlar/üyeler/modüller
  // geldikçe odalar birer birer belirip kamera yeniden kadraj yapıyordu.
  // Bir istek asılı kalırsa ofis yine de 8 sn sonra eldekiyle açılır.
  const [beklemeBitti, setBeklemeBitti] = useState(false);
  useEffect(() => {
    setBeklemeBitti(false);
    const t = window.setTimeout(() => setBeklemeBitti(true), 8000);
    return () => window.clearTimeout(t);
  }, [orgId, studyo]);
  const ofisHazir =
    beklemeBitti ||
    (studyo
      ? studyoIsleri !== null && ben !== null && katalogHazir
      : departmanlar !== null && uyelerHazir && acikModuller !== null && katalogHazir && kasaYetkisi !== null);
  const studyoDepartmanlari: OyunDepartmani[] = useMemo(() => {
    if (!studyoIsleri) return [];
    const ad = new Map([...katalog, ...serbestKatalog].map((m) => [m.key, m.name]));
    const kapaklar = new Map(studyoIsleri.map((i) => [i.job.id, i.job.coverImageUrl]));
    return studyoOdalari(studyoIsleri, { benId: ben?.id, benAd: ben?.fullName, benAktifGorev: ben?.activeTaskId, bugun, modulAdi: (k) => ad.get(k) }).map((o) => ({
      ...o,
      kapak: coverBackground(kapaklar.get(o.id), o.id),
    }));
  }, [studyoIsleri, katalog, serbestKatalog, ben, bugun]);
  const oyunDepartmanlari: OyunDepartmani[] = useMemo(
    () =>
      (departmanlar ?? [])
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((d) => {
          const acik = (orgGorevleri ?? []).filter((t) => t.departmentId === d.id && t.status !== "completed");
          return {
            id: d.id,
            ad: d.name,
            // Departman kartındaki kapağın aynısı (DepartmentsPanel): özel kapak,
            // yoksa katalog varsayılanı, o da yoksa kimlikten türeyen hazır kapak.
            kapak: coverBackground(getDepartmentCoverUrl(d), d.id),
            // Departmanın modülleri: katalogda bu departmana ait ve şirkette açık olanlar.
            moduller: [
              ...katalog
                .filter((m) => d.catalogKey && m.departmentKeys?.includes(d.catalogKey) && acikModuller?.has(m.key))
                .map((m) => ({ key: m.key, ad: m.name })),
              // Para kasası Yönetim odasında durur; tıklanınca şirketin Kasa'sı açılır.
              ...(kasaYetkisi && d.catalogKey === "yonetim" ? [{ key: KASA_MODULU, ad: "Kasa" }] : []),
            ],
            kisiler: (uyeler[d.id] ?? []).map((u) => ({
              id: u.userId as string,
              ad: u.fullName || u.username || "Ekip üyesi",
              emek: emek.get(u.userId as string) ?? 0,
              yonetici: u.role === "manager",
            })),
            acikGorev: acik.length,
            gecikmis: acik.filter((t) => t.deadline && t.deadline.slice(0, 10) < bugun).length,
          };
        }),
    [departmanlar, orgGorevleri, uyeler, bugun, emek, katalog, acikModuller, kasaYetkisi]
  );
  const bitenGorev = useMemo(
    () => (orgGorevleri?.length ? orgGorevleri : []).filter((t) => t.status === "completed").length || (pano ?? []).filter((i) => i.status === "completed").length,
    [orgGorevleri, pano]
  );
  const hareketler: OyunHareketi[] = useMemo(
    () =>
      (orgGorevleri ?? [])
        .filter((t) => t.status === "completed" && t.completedAt)
        .sort((a, b) => (b.completedAt as string).localeCompare(a.completedAt as string))
        .slice(0, 4)
        .map((t) => ({ id: t.id, kim: t.completedByName || t.assignedToName || "Ekip", ne: t.title })),
    [orgGorevleri]
  );
  const cevrimiciIdler = useMemo(() => new Set(cevrimici.map((k) => k.userId)), [cevrimici]);

  const bugunToplanti = (etkinlikler ?? []).filter((e) => e.tarih === bugun && e.tur === "toplanti").length;

  // Arama: yüklenmiş veride, istemcide.
  const sonuclar = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    if (q.length < 2) return [];
    const eslesir = (s?: string) => !!s && s.toLocaleLowerCase("tr").includes(q);
    const r: { tur: string; ad: string; git: string }[] = [];
    (projeler ?? []).filter((p) => eslesir(p.title)).forEach((p) => r.push({ tur: "Proje", ad: p.title, git: `/projects/${p.id}` }));
    (departmanlar ?? []).filter((d) => eslesir(d.name)).forEach((d) => r.push({ tur: "Departman", ad: d.name, git: `/departments/${d.id}` }));
    (pano ?? []).filter((i) => eslesir(i.title)).forEach((i) => r.push({ tur: "Görev", ad: i.title, git: i.projectId ? `/projects/${i.projectId}` : "/tasks" }));
    (orgGorevleri ?? [])
      .filter((t) => eslesir(t.title) && !(pano ?? []).some((i) => i.itemId === t.id))
      .forEach((t) => r.push({ tur: "Görev", ad: t.title, git: t.projectId ? `/projects/${t.projectId}` : t.departmentId ? `/departments/${t.departmentId}` : "/tasks" }));
    const kisiler = new Map<string, string>();
    gorevKisileri(orgGorevleri ?? []).forEach((k) => kisiler.set(k.ad, k.ad));
    [...kisiler.keys()].filter(eslesir).forEach((k) => r.push({ tur: "Kişi", ad: k, git: orgId ? `/organizations/${orgId}` : "/" }));
    return r.slice(0, 8);
  }, [arama, projeler, departmanlar, pano, orgGorevleri, orgId]);

  // ------------------------------------------------------------ eylemler
  async function odakCevir(item: PersonalBoardItem) {
    const yeni: TaskStatus = item.status === "completed" ? "todo" : "completed";
    const onceki = pano;
    setMesgul(item.itemId);
    setPano((p) => (p ?? []).map((x) => (x.itemId === item.itemId ? { ...x, status: yeni, completedAt: yeni === "completed" ? new Date().toISOString() : undefined } : x)));
    try {
      await api.patch("/todos/status", { source: item.source, itemId: item.itemId, status: yeni });
      if (yeni === "completed") {
        const kalan = odak.filter((h) => h.itemId !== item.itemId && h.status !== "completed").length;
        soyle(kalan === 0 ? "Bugünün odağı tamam." : "Tamamlandı");
      }
    } catch (e) {
      setPano(onceki);
      soyle(hataMetni(e), true);
    } finally {
      setMesgul(null);
    }
  }

  function lioyaGonder() {
    const s = lioSoru.trim();
    if (!s) return;
    askLio(s);
    setLioSoru("");
  }

  const seciliOrg = orgs.find((o) => o.id === orgId);

  // ------------------------------------------------------------ çizim

  // Ofisteki eşyanın menüsünden modül kapatma: Departman > Modüller'deki
  // kapatmanın aynısı — kayıtlar silinmez, geri al yeniden açar.
  async function modulKapat(organizationId: string, key: string) {
    const ac = (acik: boolean) =>
      setAcikModuller((s) => {
        const y = new Set(s ?? []);
        if (acik) y.add(key);
        else y.delete(key);
        return y;
      });
    await api.delete(`/organizations/${organizationId}/modules/${key}`);
    notifySidebarChanged();
    ac(false);
    pushUndo({
      label: "Modül kapatma",
      run: async () => {
        await api.post(`/organizations/${organizationId}/modules`, { moduleKeys: [key] });
        notifySidebarChanged();
        ac(true);
      },
      redo: async () => {
        await api.delete(`/organizations/${organizationId}/modules/${key}`);
        notifySidebarChanged();
        ac(false);
      },
    });
  }

  return (
    <div className="yn">
      {/* Kenar çubuğu uygulamanınkiyle aynı: temanın koyu rengi + Ayarlar'da seçilen renk/desen. */}
      <aside className="yn-side" style={kenarStili}>
        <Link to="/yeni" className="yn-logo" aria-label="Projelio anasayfa">
          <span className="yn-logo-kutu">
            <img src="/logo.png" alt="" />
          </span>
          {/* dil:atla — marka adı hiçbir dilde çevrilmez */}
          <span>Projelio</span>
        </Link>
        <nav className="yn-nav">
          <MenuOgesi to="/yeni" ikon="ev" aktif={location.pathname === "/yeni"}>Anasayfa</MenuOgesi>
          <MenuOgesi to="/" ikon="klasor">Projeler</MenuOgesi>
          <MenuOgesi to="/tasks" ikon="liste">Görevler</MenuOgesi>
          <MenuOgesi to={orgId ? `/organizations/${orgId}` : "/organizations"} ikon="ekip">Ekibim</MenuOgesi>
          <MenuOgesi to="/calendar" ikon="takvim">Takvim</MenuOgesi>
          <MenuOgesi to="/worklog" ikon="rapor">Yaptıklarım</MenuOgesi>
          <MenuOgesi to="/sosyal" ikon="sosyal">Sosyal</MenuOgesi>
          <MenuOgesi to="/settings" ikon="ayar">Ayarlar</MenuOgesi>
        </nav>
        <Link to="/settings" className="yn-me">
          <Avatar ad={ben?.fullName} foto={ben?.avatarUrl} boy={44} />
          <span className="yn-me-txt">
            <b>{ben?.fullName ?? "…"}</b>
            <small>{seciliOrg?.name ?? ben?.title ?? ""}</small>
          </span>
          <Ikon ad="sag" />
        </Link>
      </aside>

      <div className="yn-body">
        <header className="yn-top">
          <div className="yn-search">
            <Ikon ad="ara" />
            <input
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              onFocus={() => setAramaAcik(true)}
              onBlur={() => window.setTimeout(() => setAramaAcik(false), 150)}
              placeholder="Proje, görev, kişi veya bilgi ara..."
              aria-label="Ara"
            />
            {aramaAcik && arama.trim().length >= 2 && (
              <div className="yn-search-res" role="listbox">
                {sonuclar.length === 0 ? (
                  <button type="button" onMouseDown={() => askLio(arama.trim())}>
                    <small>Lio</small>"{arama.trim()}" için Lio'ya sor
                  </button>
                ) : (
                  sonuclar.map((r, i) => (
                    <button key={i} type="button" onMouseDown={() => navigate(r.git)}>
                      <small>{r.tur}</small>
                      {r.ad}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button type="button" className="yn-ask" onClick={() => askLio("Bugün şirkette neler oluyor? Kısaca özetler misin?")}>
            <Ikon ad="isilti" />
            Lio'ya sor
          </button>
        </header>

        <div className="yn-grid">
          <main className="yn-main">
            <div className="yn-baslik">
              <div>
                <h1>Bugün neler oluyor?</h1>
                <p>{studyo ? "İşlerinin" : "Şirketin"} genel durumuna hızlıca bak ve devam et.</p>
              </div>
              {/* Şirket ofisi ↔ Stüdyom: ofisin hemen üstünde, görünür. Sağ
                  sütundaki seçici dar ekranda ofisin altına düşüyor, gözden kaçıyordu. */}
              {orgs.length + (serbestIsler?.length ? 1 : 0) > 1 && (
                <div className="yn-ofis-sec" role="group" aria-label="Ofis seç">
                  {orgs.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={!studyo && orgId === o.id}
                      onClick={() => {
                        setStudyo(false);
                        setOrgId(o.id);
                      }}
                    >
                      {o.name}
                    </button>
                  ))}
                  {!!serbestIsler?.length && (
                    <button type="button" aria-pressed={studyo} onClick={() => setStudyo(true)}>
                      Stüdyom
                    </button>
                  )}
                </div>
              )}
            </div>
            <OfisOyunu
              key={studyo ? "studyo" : orgId || "kisisel"}
              // Stüdyonun mağaza eşyaları ve (ileride) düzeni kişiseldir.
              kapsam={studyo ? "kisisel" : orgId || "kisisel"}
              studyo={studyo}
              veriHazir={ofisHazir}
              departmanlar={studyo ? studyoDepartmanlari : departmanlar === null ? [] : oyunDepartmanlari}
              bugunToplanti={etkinlikler === null ? null : bugunToplanti}
              bitenGorev={bitenGorev}
              hareketler={hareketler}
              cevrimici={cevrimiciIdler}
              benId={ben?.id}
              onOdaSayfasi={(id) => navigate(id === "toplanti" ? "/calendar" : studyo ? `/jobs/${id}` : `/departments/${id}`)}
              onModulAc={(odaId, key) =>
                key === KASA_MODULU
                  ? setKasaAcik(studyo ? odaId : "org")
                  : key.startsWith(PROJE_ONEKI)
                    ? setAcikProje(key.slice(PROJE_ONEKI.length))
                    : key === KUPA_RAFI
                      ? navigate(`/jobs/${odaId}`)
                      : isOpenableModule(key, Boolean(MODULE_RECORD_CONFIGS[key])) && kartModaldaAcilir(key)
                        ? setAcikModul({ odaId, key })
                        : navigate(studyo ? `/jobs/${odaId}/modules/${key}` : `/departments/${odaId}/modules/${key}`)
              }
              onModulKapat={orgId && !studyo ? (key) => modulKapat(orgId, key) : undefined}
            />
            {acikProje && (
              <Modal title="Proje" onClose={() => setAcikProje(null)} maxWidth={1100} mobileFullScreen>
                <Suspense fallback={null}>
                  <ProjectDetail gomuluId={acikProje} />
                </Suspense>
              </Modal>
            )}
            {acikModul &&
              (() => {
                const m = [...katalog, ...serbestKatalog].find((x) => x.key === acikModul.key);
                return (
                  <ModuleModal
                    moduleKey={acikModul.key}
                    moduleName={m?.name ?? acikModul.key}
                    description={m?.description}
                    nearlyFullScreen
                    {...(studyo
                      ? { jobId: acikModul.odaId }
                      : {
                          organizationId: orgId,
                          departmentId: acikModul.odaId,
                          departmentKey: departmanlar?.find((d) => d.id === acikModul.odaId)?.catalogKey,
                        })}
                    onClose={() => setAcikModul(null)}
                  />
                );
              })()}
            {kasaAcik === "org" && orgId && (
              <Modal title="Kasa" subtitle={seciliOrg?.name} onClose={() => setKasaAcik(null)} maxWidth={1100} mobileFullScreen>
                <OrgBudgetPanel organizationId={orgId} />
              </Modal>
            )}
            {kasaAcik && kasaAcik !== "org" && (
              <Modal title="Bütçe" subtitle={serbestIsler?.find((j) => j.id === kasaAcik)?.title} onClose={() => setKasaAcik(null)} maxWidth={1100} mobileFullScreen>
                <ScopeBudgetPanel scopeType="job" scopeId={kasaAcik} />
              </Modal>
            )}

            <section className="yn-featured">
              <div className="yn-sec-head">
                <h2>Öne çıkan projeler</h2>
                <Link to="/">
                  Tüm projeler <Ikon ad="ok" />
                </Link>
              </div>
              <div className="yn-proj-row">
                {projeler === null ? (
                  [0, 1, 2].map((i) => <div key={i} className="yn-card yn-proj yn-skel" />)
                ) : oneCikan.length === 0 ? (
                  <div className="yn-card yn-empty">Aktif proje yok.</div>
                ) : (
                  oneCikan.map((p, i) => {
                    const g = projeGorevMap[p.id];
                    const yuzde = g && g.length ? Math.round((g.filter((t) => t.status === "completed").length / g.length) * 100) : 0;
                    const kisiler = gorevKisileri(g ?? []);
                    const ton = (["mor", "turuncu", "yesil"] as Ton[])[i % 3];
                    return (
                      <Link key={p.id} to={`/projects/${p.id}`} className="yn-card yn-proj">
                        <span className={`yn-ico t-${ton}`}>
                          <Ikon ad={(["kup", "takvim", "telefon"] as const)[i % 3]} />
                        </span>
                        <span className="yn-proj-body">
                          <b>{p.title}</b>
                          <span className="yn-bar-row">
                            <span className="yn-bar">
                              <span style={{ width: `${yuzde}%` }} />
                            </span>
                            <small>%{g ? yuzde : "…"}</small>
                          </span>
                          <AvatarYigini kisiler={kisiler} en={3} boy={22} />
                        </span>
                        <span className="yn-go">
                          <Ikon ad="ok" />
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            </section>
          </main>

          <aside className="yn-right">
            <section className="yn-card yn-pad">
              <div className="yn-sec-head">
                <h3>Genel durum</h3>
                {orgs.length + (serbestIsler?.length ? 1 : 0) > 1 ? (
                  <select
                    value={studyo ? STUDYO : orgId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setStudyo(v === STUDYO);
                      if (v !== STUDYO) setOrgId(v);
                    }}
                    aria-label="Ofis seç"
                  >
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                    {!!serbestIsler?.length && <option value={STUDYO}>Stüdyom (serbest işlerim)</option>}
                  </select>
                ) : (
                  <small>{!studyo && orgGorevleri?.length ? seciliOrg?.name ?? "Tüm projeler" : "Senin işlerin"}</small>
                )}
              </div>
              <div className="yn-status">
                <div
                  className="yn-ring"
                  style={{ background: `conic-gradient(var(--yn-green) ${genelYuzde * 3.6}deg, var(--yn-ring-bg) 0deg)` }}
                  aria-label={`Tamamlanma yüzde ${genelYuzde}`}
                >
                  <div>{genelYuklendi ? `%${genelYuzde}` : "…"}</div>
                </div>
                <ul className="yn-legend">
                  <li>
                    <i className="d-green" />
                    Tamamlanan<b>{genelYuklendi ? genel.biten : "–"}</b>
                  </li>
                  <li>
                    <i className="d-blue" />
                    Devam eden<b>{genelYuklendi ? genel.devam : "–"}</b>
                  </li>
                  <li>
                    <i className="d-red" />
                    Geciken<b>{genelYuklendi ? genel.geciken : "–"}</b>
                  </li>
                </ul>
              </div>
              <Link className="yn-more-link" to={orgId ? `/organizations/${orgId}` : "/tasks"}>
                Detaylı rapor <Ikon ad="ok" />
              </Link>
            </section>

            <section className="yn-card yn-pad">
              <div className="yn-sec-head">
                <h3>Bugünün odağı</h3>
              </div>
              {pano === null ? (
                <div className="yn-skel-list" />
              ) : odak.length === 0 ? (
                <p className="yn-empty-txt">Bugün için acil iş yok. Güzel bir gün.</p>
              ) : (
                <ul className="yn-focus">
                  {odak.map((h) => {
                    const bitti = h.status === "completed";
                    const gecikmis = !bitti && !!h.effectiveDueDate && h.effectiveDueDate.slice(0, 10) < bugun;
                    return (
                      <li key={h.itemId} className={bitti ? "done" : ""}>
                        <button
                          type="button"
                          className="yn-check"
                          aria-pressed={bitti}
                          aria-label={bitti ? `${h.title}: geri al` : `${h.title}: tamamla`}
                          disabled={mesgul === h.itemId}
                          onClick={() => odakCevir(h)}
                        >
                          {bitti && <Ikon ad="tik" />}
                        </button>
                        <span className="yn-focus-txt">
                          {h.title}
                          {(h.projectTitle || h.departmentName || gecikmis) && (
                            <small className={gecikmis ? "late" : ""}>{gecikmis ? "Gecikti" : h.projectTitle || h.departmentName}</small>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link className="yn-more-link" to="/tasks">
                Tüm görevler <Ikon ad="ok" />
              </Link>
            </section>

            <section className="yn-card yn-pad">
              <div className="yn-sec-head">
                <h3>Yaklaşan etkinlikler</h3>
                <Link to="/calendar" className="yn-plus" aria-label="Takvime git">
                  <Ikon ad="arti" />
                </Link>
              </div>
              {etkinlikler === null ? (
                <div className="yn-skel-list" />
              ) : etkinlikler.length === 0 ? (
                <p className="yn-empty-txt">Önümüzdeki 7 günde etkinlik yok.</p>
              ) : (
                <ul className="yn-events">
                  {etkinlikler.slice(0, 3).map((e) => (
                    <li key={e.id}>
                      <span className="yn-ev-time">
                        {e.saat ?? "Gün boyu"}
                        {gunEtiketi(e.tarih, bugun) && <small>{gunEtiketi(e.tarih, bugun)}</small>}
                      </span>
                      <span className={`yn-ico sm t-${e.tur === "gorusme" ? "yesil" : e.tur === "teslim" ? "turuncu" : "mavi"}`}>
                        <Ikon ad={e.tur === "gorusme" ? "insanlar" : e.tur === "teslim" ? "bayrak" : "video"} />
                      </span>
                      <span className="yn-ev-txt">
                        <b>{e.baslik}</b>
                        {e.alt && <small>{e.alt}</small>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="yn-lio">
              <div className="yn-lio-head">
                <img src="/lio-mascot.png" alt="" />
                <div>
                  <h3>
                    Lio burada <Ikon ad="isilti" />
                  </h3>
                  <p>Projeler, ekip, raporlar… Ne öğrenmek istersin?</p>
                </div>
              </div>
              <form
                className="yn-lio-input"
                onSubmit={(e) => {
                  e.preventDefault();
                  lioyaGonder();
                }}
              >
                <input value={lioSoru} onChange={(e) => setLioSoru(e.target.value)} placeholder="Örn. Geciken görevleri göster" aria-label="Lio'ya sor" />
                <button type="submit" aria-label="Gönder" disabled={!lioSoru.trim()}>
                  <Ikon ad="ok" />
                </button>
              </form>
            </section>
          </aside>
        </div>
      </div>

      {mesaj && (
        <div className={mesaj.hata ? "yn-toast err" : "yn-toast"} role="status">
          {mesaj.metin}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ parçalar

function MenuOgesi({ to, ikon, aktif, children }: { to: string; ikon: string; aktif?: boolean; children: ReactNode }) {
  return (
    <Link to={to} className={aktif ? "on" : ""}>
      <Ikon ad={ikon} />
      {children}
    </Link>
  );
}

function Avatar({ ad, foto, boy }: { ad?: string; foto?: string; boy: number }) {
  const [bozuk, setBozuk] = useState(false);
  return (
    <span className="yn-av" style={{ width: boy, height: boy, fontSize: boy * 0.38 }} title={ad}>
      {foto && !bozuk ? <img src={foto} alt="" onError={() => setBozuk(true)} /> : bas(ad)}
    </span>
  );
}

function AvatarYigini({ kisiler, en, boy }: { kisiler: { ad: string; foto?: string }[]; en: number; boy: number }) {
  if (!kisiler.length) return null;
  const artan = kisiler.length - en;
  return (
    <span className="yn-avs">
      {kisiler.slice(0, en).map((k, i) => (
        <Avatar key={i} ad={k.ad} foto={k.foto} boy={boy} />
      ))}
      {artan > 0 && (
        <span className="yn-av yn-av-more" style={{ width: boy, height: boy, fontSize: boy * 0.4 }}>
          +{artan}
        </span>
      )}
    </span>
  );
}

// Referans görseldeki ince çizgili simgeler. Uygulamanın components/icons'unda
// bu setin yarısı yok; deneme sayfası için burada tutuldu.
const YOLLAR: Record<string, ReactNode> = {
  ev: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  klasor: <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />,
  liste: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </>
  ),
  ekip: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16 14c2.6 0 4.4 1.6 5 4" />
    </>
  ),
  takvim: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  rapor: <path d="M6 20V11M12 20V5M18 20v-6" />,
  sosyal: (
    <>
      <circle cx="6" cy="17" r="2.5" />
      <circle cx="18" cy="7" r="2.5" />
      <circle cx="17" cy="18" r="2" />
      <path d="M8 15.5 15.8 8.5M8.5 17.4l6.6.5" />
    </>
  ),
  ayar: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2" />
      <circle cx="12" cy="12" r="7" />
    </>
  ),
  sag: <path d="m9 6 6 6-6 6" />,
  ok: <path d="M5 12h14m-5-5 5 5-5 5" />,
  ara: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  isilti: <path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5zM19 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.2-2.2.9-2.5 2.5-.3-1.6-1-2.3-2.5-2.5 1.5-.2 2.2-.9 2.5-2.5z" />,
  arti: <path d="M12 5v14M5 12h14" />,
  tik: <path d="m5.5 12.5 4 4 9-9" />,
  kup: (
    <>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" />
    </>
  ),
  megafon: <path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1zM17 9.5a3.5 3.5 0 0 1 0 5M19.5 7a7 7 0 0 1 0 10" />,
  grafik: <path d="M5 19v-5M10 19V9M15 19v-7M20 19V5M4 21h17" />,
  disli: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
    </>
  ),
  para: (
    <>
      <ellipse cx="12" cy="6.5" rx="7" ry="3" />
      <path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </>
  ),
  insanlar: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <circle cx="16.5" cy="9.5" r="2.4" />
      <path d="M3.5 19c.5-3 2.7-4.8 5.5-4.8s5 1.8 5.5 4.8M14.5 14.6c2.8-.4 5.3 1.1 6 4.4" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6.5" width="12.5" height="11" rx="2" />
      <path d="m15.5 10.5 5.5-3v9l-5.5-3" />
    </>
  ),
  kahve: <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c-.6.8.6 1.4 0 2.5M11.5 3.5c-.6.8.6 1.4 0 2.5" />,
  telefon: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  bayrak: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
};

function Ikon({ ad }: { ad: string }) {
  return (
    <svg className="yn-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {YOLLAR[ad]}
    </svg>
  );
}
