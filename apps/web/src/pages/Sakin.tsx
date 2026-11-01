// "Sakin Projelio" — deneme ana sayfası (adres: /sakin).
//
// Mevcut ekranların yerine geçmez; yanlarında, gerçek veriyle çalışan bir
// deneme sayfasıdır. Kendi sol menüsünü çizer (App.tsx bu adreste uygulamanın
// kenar çubuğunu gizler). Üç görünüm:
//   * Anasayfa   — ofis haritası, genel durum, bugünün odağı, yaklaşan
//                  etkinlikler, Lio kartı, öne çıkan projeler
//   * Proje yolu — seçilen projenin çıktıları bir yol üzerindeki aşamalar
//   * Depo       — Depo modülü kayıtları: Excel düzeninde tablo + raf hazneleri
//
// Kurallar lib/sakin.ts'te ve testli. Tüm okuma/yazma mevcut uçlardan;
// backend'de değişiklik yok.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  Department,
  JobMember,
  ModuleRecord,
  Organization,
  Output,
  PersonalBoardItem,
  Project,
  ProjeEtkinligi,
  Task,
  TaskStatus,
  User,
} from "@projelio/shared";
import { api } from "../api/client";
import { askLio, askLioDraft } from "../lib/askLio";
import {
  departmanDurumu,
  haftaAraligi,
  halkalariHesapla,
  hamleleriSec,
  stokDurumu,
  yerelTarih,
} from "../lib/sakin";
import {
  IconActivity,
  IconArchive,
  IconBuilding,
  IconCalendar,
  IconChevronRight,
  IconDashboard,
  IconHome,
  IconLayers,
  IconListCheck,
  IconSettings,
} from "../components/icons";
import { OfisHaritasi, type OfisOdasi } from "../components/sakin/OfisHaritasi";
import { ProjeYolu, type Asama } from "../components/sakin/ProjeYolu";
import { DepoGorunumu } from "../components/sakin/DepoGorunumu";
import { bas, hataMetni, Tik } from "../components/sakin/ortak";
import "./Sakin.css";

type Gorunum = "ana" | "proje" | "depo";
const DEPO_MODULU = "oud_depo";

interface Etkinlik {
  id: string;
  baslik: string;
  alt: string;
  tarih: string; // YYYY-MM-DD
  saat?: string; // HH:MM
  tur: "toplanti" | "teslim" | "diger";
}

interface GoogleEtkinlik {
  id: string;
  baslik: string;
  konum?: string;
  baslangic: string;
  tumGun: boolean;
  meetLink?: string;
}

const PROJE_RENKLERI = [
  { zemin: "#F1EBFC", renk: "#7C4DDB" },
  { zemin: "#FDEEE6", renk: "#E0662C" },
  { zemin: "#E5F6EF", renk: "#1F9D6B" },
];

function gunEkle(tarih: string, gun: number): string {
  const d = new Date(`${tarih}T00:00:00`);
  d.setDate(d.getDate() + gun);
  return yerelTarih(d);
}

export default function Sakin() {
  const navigate = useNavigate();
  const [gorunum, setGorunum] = useState<Gorunum>("ana");
  const [ben, setBen] = useState<User | null>(null);
  const [pano, setPano] = useState<PersonalBoardItem[] | null>(null);
  const [davetler, setDavetler] = useState<(JobMember & { yanit?: string })[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState("");
  const [departmanlar, setDepartmanlar] = useState<Department[]>([]);
  const [orgGorevleri, setOrgGorevleri] = useState<Task[] | null>(null);
  const [depo, setDepo] = useState<ModuleRecord[] | null>(null);
  const [projeler, setProjeler] = useState<Project[]>([]);
  const [projeGorevMap, setProjeGorevMap] = useState<Record<string, Task[]>>({});
  const [etkinlikler, setEtkinlikler] = useState<Etkinlik[] | null>(null);
  // proje yolu
  const [projeId, setProjeId] = useState("");
  const [ciktilar, setCiktilar] = useState<Output[]>([]);
  const [projeGorevleri, setProjeGorevleri] = useState<Task[] | null>(null);
  const [seciliAsama, setSeciliAsama] = useState("");
  // arayüz
  const [arama, setArama] = useState("");
  const [lioSoru, setLioSoru] = useState("");
  const [mesaj, setMesaj] = useState<{ metin: string; hata?: boolean } | null>(null);
  const [mesgul, setMesgul] = useState<string | null>(null);
  const zamanlayici = useRef<number | undefined>(undefined);

  const bugun = useMemo(() => yerelTarih(new Date()), []);
  const hafta = useMemo(() => haftaAraligi(new Date()), []);

  const soyle = useCallback((metin: string, hata = false) => {
    window.clearTimeout(zamanlayici.current);
    setMesaj({ metin, hata });
    zamanlayici.current = window.setTimeout(() => setMesaj(null), 3600);
  }, []);
  useEffect(() => () => window.clearTimeout(zamanlayici.current), []);

  // ------------------------------------------------------------ yükleme
  const panoyuYukle = useCallback(() => {
    api
      .get<PersonalBoardItem[]>("/todos/board?source=all&completedWithinDays=7")
      .then((d) => setPano(d ?? []))
      .catch((e) => {
        setPano([]);
        soyle(hataMetni(e), true);
      });
  }, [soyle]);

  useEffect(() => {
    api.get<User>("/auth/me").then(setBen).catch(() => undefined);
    panoyuYukle();
    api.get<JobMember[]>("/me/job-invites").then((d) => setDavetler(d ?? [])).catch(() => undefined);
    api
      .get<Organization[]>("/organizations")
      .then((d) => {
        const liste = (d ?? []).filter((o) => !(o as Organization & { archivedAt?: string }).archivedAt);
        setOrgs(liste);
        if (liste[0]) setOrgId(liste[0].id);
        else setOrgGorevleri([]);
      })
      .catch(() => setOrgGorevleri([]));
    api
      .get<Project[]>("/projects")
      .then((d) => {
        const aktif = (d ?? []).filter((p) => !p.archivedAt && p.status !== "archived" && p.status !== "completed");
        setProjeler(aktif);
        const ilk = aktif.find((p) => p.status === "active") ?? aktif[0];
        if (ilk) setProjeId(ilk.id);
      })
      .catch(() => undefined);

    const son = gunEkle(bugun, 7);
    const projeEtk = api
      .get<ProjeEtkinligi[]>(`/calendar/mine?from=${bugun}&to=${son}`)
      .then((d) =>
        (d ?? []).map<Etkinlik>((e) => ({
          id: `p-${e.id}`,
          baslik: e.title,
          alt: e.location || e.projectTitle || "",
          tarih: e.eventDate,
          saat: e.allDay ? undefined : e.startsAt,
          tur: e.kind === "meeting" ? "toplanti" : e.kind === "delivery" || e.kind === "milestone" ? "teslim" : "diger",
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
            tur: e.meetLink ? "toplanti" : "diger",
          };
        })
      )
      .catch(() => [] as Etkinlik[]);
    Promise.all([projeEtk, googleEtk]).then(([a, b]) => {
      const simdi = new Date().toTimeString().slice(0, 5);
      const hepsi = [...a, ...b]
        .filter((e) => e.tarih > bugun || (e.tarih === bugun && (!e.saat || e.saat >= simdi)))
        .sort((x, y) => (x.tarih + (x.saat ?? "00:00")).localeCompare(y.tarih + (y.saat ?? "00:00")));
      setEtkinlikler(hepsi);
    });
  }, [panoyuYukle, bugun]);

  useEffect(() => {
    if (!orgId) return;
    const ac = new AbortController();
    setDepo(null);
    setOrgGorevleri(null);
    api.get<Department[]>(`/organizations/${orgId}/departments`, ac.signal).then((d) => setDepartmanlar(d ?? [])).catch(() => setDepartmanlar([]));
    api.get<Task[]>(`/organizations/${orgId}/tasks`, ac.signal).then((d) => setOrgGorevleri((d ?? []).filter((t) => !t.archivedAt))).catch(() => setOrgGorevleri([]));
    api
      .get<ModuleRecord[]>(`/organizations/${orgId}/module-records?moduleKey=${DEPO_MODULU}`, ac.signal)
      .then((d) => setDepo((d ?? []).filter((r) => !r.archivedAt)))
      .catch(() => setDepo([]));
    return () => ac.abort();
  }, [orgId]);

  // Öne çıkan projeler: teslimi en yakın 3 aktif proje — her birinin görevleri.
  const oneCikan = useMemo(
    () =>
      projeler
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

  useEffect(() => {
    if (!projeId || gorunum !== "proje") return;
    const ac = new AbortController();
    setProjeGorevleri(null);
    setSeciliAsama("");
    api.get<Output[]>(`/projects/${projeId}/outputs`, ac.signal).then((d) => setCiktilar((d ?? []).filter((o) => !o.archivedAt))).catch(() => setCiktilar([]));
    api
      .get<Task[]>(`/projects/${projeId}/tasks`, ac.signal)
      .then((d) => setProjeGorevleri((d ?? []).filter((t) => !t.archivedAt && !t.parentTaskId)))
      .catch(() => setProjeGorevleri([]));
    return () => ac.abort();
  }, [projeId, gorunum]);

  // ------------------------------------------------------------ türetilenler
  const hamleler = useMemo(() => hamleleriSec(pano ?? [], bugun, 3), [pano, bugun]);
  const [gununOdagi, setGununOdagi] = useState<string[] | null>(null);
  useEffect(() => {
    if (pano && gununOdagi === null) setGununOdagi(hamleler.map((h) => h.itemId));
  }, [pano, hamleler, gununOdagi]);
  const odak = useMemo(
    () => (pano && gununOdagi ? gununOdagi.map((id) => pano.find((p) => p.itemId === id)).filter((x): x is PersonalBoardItem => !!x) : []),
    [pano, gununOdagi]
  );
  const odakBitti = odak.length > 0 && odak.every((h) => h.status === "completed");
  const halkalar = useMemo(() => halkalariHesapla(pano ?? [], bugun, hafta), [pano, bugun, hafta]);

  const kritikKayitlar = useMemo(
    () => (depo ?? []).filter((r) => stokDurumu(Number(r.data.quantity) || 0, Number(r.data.criticalLevel)) === "crit"),
    [depo]
  );

  // Genel durum: şirket görevleri; şirket yoksa kişisel pano.
  const genel = useMemo(() => {
    const gecmisMi = (d?: string) => !!d && d.slice(0, 10) < bugun;
    if (orgGorevleri && orgGorevleri.length) {
      const biten = orgGorevleri.filter((t) => t.status === "completed").length;
      const geciken = orgGorevleri.filter((t) => t.status !== "completed" && gecmisMi(t.deadline)).length;
      return { biten, geciken, devam: orgGorevleri.length - biten - geciken, kaynak: "Şirket geneli" };
    }
    const liste = (pano ?? []).filter((i) => !i.isHidden);
    const biten = liste.filter((i) => i.status === "completed").length;
    const geciken = liste.filter((i) => i.status !== "completed" && gecmisMi(i.effectiveDueDate)).length;
    return { biten, geciken, devam: liste.length - biten - geciken, kaynak: "Senin işlerin" };
  }, [orgGorevleri, pano, bugun]);
  const genelToplam = genel.biten + genel.devam + genel.geciken;
  const genelYuzde = genelToplam ? Math.round((genel.biten / genelToplam) * 100) : 0;

  const odalar: OfisOdasi[] = useMemo(() => {
    return departmanlar
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((d) => {
        const gorevler = (orgGorevleri ?? []).filter((t) => t.departmentId === d.id);
        const acik = gorevler.filter((t) => t.status !== "completed");
        const gecikmis = acik.filter((t) => t.deadline && t.deadline.slice(0, 10) < bugun).length;
        const kritik = kritikKayitlar.filter((r) => r.departmentId === d.id).length;
        const kisiler = Array.from(
          new Set(acik.flatMap((t) => (t.assignees?.length ? t.assignees.map((a) => a.fullName ?? "") : [t.assignedToName ?? ""])).filter(Boolean))
        );
        const parca: string[] = [];
        if (kritik) parca.push(`${kritik} kritik stok`);
        if (gecikmis) parca.push(`${gecikmis} gecikmiş görev`);
        return {
          id: d.id,
          ad: d.name,
          catalogKey: d.catalogKey,
          durum: departmanDurumu(gecikmis, kritik),
          ozet: `${acik.length} görev${kisiler.length ? ` · ${kisiler.length} kişi` : ""}`,
          not: parca.length ? parca.join(", ") : "Yolunda",
          acikIs: acik.length,
          kisiler,
        };
      });
  }, [departmanlar, orgGorevleri, kritikKayitlar, bugun]);

  // Proje yolu
  const asamalar: Asama[] = useMemo(() => {
    const gorevler = projeGorevleri ?? [];
    const liste: Asama[] = ciktilar
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((o) => ({ id: o.id, ad: o.title, gorevler: gorevler.filter((t) => t.outputId === o.id) }))
      .filter((a) => a.gorevler.length > 0);
    const ciktisiz = gorevler.filter((t) => !t.outputId || !ciktilar.some((o) => o.id === t.outputId));
    if (ciktisiz.length) liste.push({ id: "_diger", ad: liste.length ? "Diğer işler" : "Görevler", gorevler: ciktisiz });
    return liste;
  }, [ciktilar, projeGorevleri]);
  const asamaBitti = asamalar.map((a) => a.gorevler.every((t) => t.status === "completed"));
  const simdikiAsama = asamalar[Math.max(0, asamaBitti.indexOf(false))]?.id ?? "";
  const aktifAsama = asamalar.find((a) => a.id === (seciliAsama || simdikiAsama));
  const projeGorevSayisi = (projeGorevleri ?? []).length;
  const projeYuzde = projeGorevSayisi ? Math.round(((projeGorevleri ?? []).filter((t) => t.status === "completed").length / projeGorevSayisi) * 100) : 0;
  const seciliProje = projeler.find((p) => p.id === projeId);

  // Arama: yüklenmiş veride, istemcide.
  const sonuclar = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    if (q.length < 2) return [];
    const eslesir = (s?: string) => !!s && s.toLocaleLowerCase("tr").includes(q);
    const r: { tur: string; ad: string; git: () => void }[] = [];
    projeler.filter((p) => eslesir(p.title)).forEach((p) => r.push({ tur: "Proje", ad: p.title, git: () => navigate(`/projects/${p.id}`) }));
    departmanlar.filter((d) => eslesir(d.name)).forEach((d) => r.push({ tur: "Departman", ad: d.name, git: () => navigate(`/departments/${d.id}`) }));
    (pano ?? []).filter((i) => eslesir(i.title)).forEach((i) => r.push({ tur: "Görevin", ad: i.title, git: () => navigate(i.projectId ? `/projects/${i.projectId}` : "/tasks") }));
    (orgGorevleri ?? [])
      .filter((t) => eslesir(t.title) && !(pano ?? []).some((i) => i.itemId === t.id))
      .forEach((t) => r.push({ tur: "Görev", ad: t.title, git: () => navigate(t.projectId ? `/projects/${t.projectId}` : t.departmentId ? `/departments/${t.departmentId}` : "/tasks") }));
    return r.slice(0, 8);
  }, [arama, projeler, departmanlar, pano, orgGorevleri, navigate]);

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
        soyle(kalan === 0 ? "Bugünün odağı tamam. Bayrak dikildi." : "Tamamlandı");
      }
    } catch (e) {
      setPano(onceki);
      soyle(hataMetni(e), true);
    } finally {
      setMesgul(null);
    }
  }

  async function davetiYanitla(d: JobMember, kabul: boolean) {
    try {
      await api.patch(`/job-members/${d.id}/respond`, { approve: kabul });
      setDavetler((l) => l.map((x) => (x.id === d.id ? { ...x, yanit: kabul ? "Kabul ettin" : "Reddettin" } : x)));
    } catch (e) {
      soyle(hataMetni(e), true);
    }
  }

  async function gorevCevir(t: Task) {
    const yeni: TaskStatus = t.status === "completed" ? "todo" : "completed";
    const onceki = projeGorevleri;
    const sonraki = (projeGorevleri ?? []).map((x) => (x.id === t.id ? { ...x, status: yeni } : x));
    setProjeGorevleri(sonraki);
    try {
      await api.patch(`/tasks/${t.id}/status`, { status: yeni });
      if (yeni === "completed") {
        const asama = asamalar.find((a) => a.gorevler.some((g) => g.id === t.id));
        const hepsi = sonraki.every((x) => x.status === "completed");
        const asamaTamam = asama && sonraki.filter((x) => asama.gorevler.some((g) => g.id === x.id)).every((x) => x.status === "completed");
        if (hepsi) soyle("Proje teslime hazır. Ekibe tebrikler.");
        else if (asamaTamam && asama) {
          setSeciliAsama("");
          soyle(`Aşama tamamlandı: ${asama.ad}`);
        }
      }
      panoyuYukle();
    } catch (e) {
      setProjeGorevleri(onceki);
      soyle(hataMetni(e), true);
    }
  }

  async function stokKaydet(r: ModuleRecord, miktar: number) {
    if ((Number(r.data.quantity) || 0) === miktar) return;
    const onceki = depo;
    const eski = stokDurumu(Number(r.data.quantity) || 0, Number(r.data.criticalLevel));
    setDepo((l) => (l ?? []).map((x) => (x.id === r.id ? { ...x, data: { ...x.data, quantity: miktar } } : x)));
    try {
      await api.patch(`/module-records/${r.id}`, { data: { ...r.data, quantity: miktar } });
      const yeni = stokDurumu(miktar, Number(r.data.criticalLevel));
      if (eski === "crit" && yeni !== "crit") {
        const kalan = kritikKayitlar.filter((x) => x.id !== r.id).length;
        soyle(kalan === 0 ? "Kritik stok kalmadı" : `${String(r.data.itemName ?? "Kalem")} artık kritik değil`);
      } else soyle("Kaydedildi");
    } catch (e) {
      setDepo(onceki);
      soyle(hataMetni(e), true);
    }
  }

  function odaSec(o: OfisOdasi) {
    if (kritikKayitlar.some((r) => r.departmentId === o.id)) setGorunum("depo");
    else navigate(`/departments/${o.id}`);
  }

  // ------------------------------------------------------------ çizim
  const org = orgs.find((o) => o.id === orgId);
  const bekleyenDavet = davetler.filter((d) => !d.yanit);

  const menu: { ad: string; ikon: ReactNode; aktif?: boolean; git: () => void; rozet?: number }[] = [
    { ad: "Anasayfa", ikon: <IconHome size={20} />, aktif: gorunum === "ana", git: () => setGorunum("ana") },
    { ad: "Proje yolu", ikon: <IconLayers size={20} />, aktif: gorunum === "proje", git: () => setGorunum("proje") },
    { ad: "Depo", ikon: <IconArchive size={20} />, aktif: gorunum === "depo", git: () => setGorunum("depo"), rozet: kritikKayitlar.length },
    { ad: "Görevler", ikon: <IconListCheck size={20} />, git: () => navigate("/tasks") },
    { ad: "Takvim", ikon: <IconCalendar size={20} />, git: () => navigate("/calendar") },
    ...(org ? [{ ad: "Şirket", ikon: <IconBuilding size={20} />, git: () => navigate(`/organizations/${org.id}`) }] : []),
    { ad: "Yaptım", ikon: <IconActivity size={20} />, git: () => navigate("/worklog") },
    { ad: "Ayarlar", ikon: <IconSettings size={20} />, git: () => navigate("/settings") },
  ];

  return (
    <div className="sk-kabuk">
      <aside className="sk-menu" aria-label="Sakin Projelio menüsü">
        <Link to="/sakin" className="sk-logo" onClick={() => setGorunum("ana")}>
          <img src="/logo.png" alt="" width={30} height={30} />
          {/* dil:atla — marka adı hiçbir dilde çevrilmez */}
          <span>Projelio</span>
        </Link>
        <nav>
          {menu.map((m) => (
            <button key={m.ad} type="button" className={m.aktif ? "sk-menu-oge on" : "sk-menu-oge"} onClick={m.git} aria-current={m.aktif ? "page" : undefined}>
              {m.ikon}
              <span>{m.ad}</span>
              {!!m.rozet && <span className="sk-tbadge">{m.rozet}</span>}
            </button>
          ))}
          <div className="sk-menu-ayrac" />
          <Link className="sk-menu-oge" to="/">
            <IconDashboard size={20} />
            <span>Klasik görünüm</span>
          </Link>
        </nav>
        <Link to="/settings" className="sk-kullanici">
          {ben?.avatarUrl ? <img src={ben.avatarUrl} alt="" /> : <span className="sk-avatar buyuk">{bas(ben?.fullName)}</span>}
          <span className="sk-kullanici-metin">
            <b>{ben?.fullName ?? ""}</b>
            <span>{org?.name ?? ""}</span>
          </span>
          <IconChevronRight size={18} />
        </Link>
      </aside>

      <div className="sk">
        <header className="sk-ust">
          <div className="sk-ara">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#566070" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder="Proje, görev veya departman ara…" aria-label="Ara" />
            {sonuclar.length > 0 && (
              <ul className="sk-ara-sonuc" role="listbox">
                {sonuclar.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => {
                        setArama("");
                        s.git();
                      }}
                    >
                      <span className="sk-muted" style={{ fontSize: 12, minWidth: 74 }}>
                        {s.tur}
                      </span>
                      <span>{s.ad}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" className="sk-lio-dugme" onClick={() => askLioDraft("")}>
            <SparkIkon />
            Lio'ya sor
          </button>
        </header>

        {gorunum === "ana" && (
          <div className="sk-govde">
            <main className="sk-orta">
              <h1 className="sk-h1" style={{ marginBottom: 4 }}>
                Bugün neler oluyor?
              </h1>
              <p className="sk-muted" style={{ margin: "0 0 18px", fontSize: 16 }}>
                {org ? "Şirketin genel durumuna hızlıca bak ve devam et." : "İşlerinin genel durumuna hızlıca bak ve devam et."}
              </p>
              {bekleyenDavet.length > 0 && (
                <div className="sk-davet">
                  {bekleyenDavet.slice(0, 2).map((d) => (
                    <div key={d.id} className="sk-davet-satir">
                      <span>
                        <b>{d.invitedByName ?? "Biri"}</b> seni "{d.jobTitle ?? "bir iş"}" işine ekledi.
                      </span>
                      <span style={{ display: "flex", gap: 8 }}>
                        <button type="button" className="sk-btn primary" onClick={() => davetiYanitla(d, true)}>
                          Kabul et
                        </button>
                        <button type="button" className="sk-btn" onClick={() => davetiYanitla(d, false)}>
                          Reddet
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {odalar.length > 0 ? (
                <OfisHaritasi
                  odalar={odalar}
                  bayrak={odakBitti}
                  ortakAlanNotu={odakBitti ? "Bugünün odağı tamam" : `${new Set(odalar.flatMap((o) => o.kisiler)).size} kişi iş başında`}
                  onSec={odaSec}
                />
              ) : (
                <div className="sk-empty">
                  {orgGorevleri === null ? "Ofis yükleniyor…" : orgs.length ? "Bu şirkette henüz departman yok. Departman ekledikçe odalar burada belirir." : "Ofis haritası bir şirkete bağlı olduğunda departmanlardan çizilir."}
                </div>
              )}

              <div className="sk-sechead" style={{ marginTop: 28 }}>
                <h2 className="sk-h2">Öne çıkan projeler</h2>
                <button type="button" className="sk-bag" onClick={() => setGorunum("proje")}>
                  Tüm projeler →
                </button>
              </div>
              {oneCikan.length === 0 ? (
                <div className="sk-empty">Aktif projen yok.</div>
              ) : (
                <div className="sk-projeler">
                  {oneCikan.map((p, i) => {
                    const g = projeGorevMap[p.id];
                    const yuzde = g && g.length ? Math.round((g.filter((t) => t.status === "completed").length / g.length) * 100) : 0;
                    const kisiler = Array.from(new Set((g ?? []).flatMap((t) => (t.assignees ?? []).map((a) => a.fullName ?? "")).filter(Boolean)));
                    const r = PROJE_RENKLERI[i % PROJE_RENKLERI.length];
                    return (
                      <Link key={p.id} to={`/projects/${p.id}`} className="sk-proje-kart">
                        <span className="sk-proje-ikon" style={{ background: r.zemin, color: r.renk }}>
                          <IconLayers size={20} />
                        </span>
                        <span className="sk-proje-govde">
                          <b>{p.title}</b>
                          <span className="sk-proje-bar">
                            <span className="sk-bar" style={{ flex: 1, margin: 0 }}>
                              <span className="sk-bar-in" style={{ width: `${yuzde}%`, background: "#2E9A5B", display: "block" }} />
                            </span>
                            <span className="sk-muted" style={{ fontSize: 13 }}>
                              {g ? `%${yuzde}` : "…"}
                            </span>
                          </span>
                          <span className="sk-avatarlar">
                            {kisiler.slice(0, 3).map((ad, j) => (
                              <span key={j} className="sk-avatar" title={ad}>
                                {bas(ad)}
                              </span>
                            ))}
                            {kisiler.length > 3 && <span className="sk-avatar arti">+{kisiler.length - 3}</span>}
                          </span>
                        </span>
                        <IconChevronRight size={18} />
                      </Link>
                    );
                  })}
                </div>
              )}
            </main>

            <aside className="sk-sag">
              <section className="sk-card">
                <div className="sk-sechead">
                  <h2 className="sk-h2" style={{ margin: 0 }}>
                    Genel durum
                  </h2>
                  <span className="sk-muted" style={{ fontSize: 13 }}>
                    {genel.kaynak}
                  </span>
                </div>
                <div className="sk-genel">
                  <div className="sk-ring big" style={{ background: `conic-gradient(#2E9A5B ${genelYuzde * 3.6}deg, #EEE7DD 0deg)` }}>
                    <div className="sk-ring-in">
                      <span>%{genelYuzde}</span>
                    </div>
                  </div>
                  <dl className="sk-sayilar">
                    <div>
                      <dt>
                        <i className="sk-light ok" />
                        Tamamlanan
                      </dt>
                      <dd>{genel.biten}</dd>
                    </div>
                    <div>
                      <dt>
                        <i className="sk-light mavi" />
                        Devam eden
                      </dt>
                      <dd>{genel.devam}</dd>
                    </div>
                    <div>
                      <dt>
                        <i className="sk-light crit" />
                        Geciken
                      </dt>
                      <dd>{genel.geciken}</dd>
                    </div>
                  </dl>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Link className="sk-bag" to="/tasks">
                    Detaylı bak →
                  </Link>
                </div>
              </section>

              <section className="sk-card">
                <div className="sk-sechead">
                  <h2 className="sk-h2" style={{ margin: 0 }}>
                    Bugünün odağı
                  </h2>
                  <span className="sk-muted" style={{ fontSize: 13 }}>
                    Bu hafta %{halkalar.hafta.yuzde}
                  </span>
                </div>
                {!pano && <div className="sk-muted">Yükleniyor…</div>}
                {pano && odak.length === 0 && <div className="sk-muted">Acil bir işin yok.</div>}
                <ul className="sk-odak">
                  {odak.map((h) => {
                    const bitti = h.status === "completed";
                    const gec = h.effectiveDueDate && h.effectiveDueDate.slice(0, 10) < bugun && !bitti;
                    return (
                      <li key={h.itemId} className={bitti ? "done" : ""}>
                        <button type="button" className="sk-odak-tik" disabled={mesgul === h.itemId} onClick={() => odakCevir(h)} aria-label={`${bitti ? "Geri al" : "Tamamla"}: ${h.title}`}>
                          {bitti && <Tik />}
                        </button>
                        <span className="sk-odak-ad">
                          {h.title}
                          {gec && <span className="sk-odak-gec">Gecikti</span>}
                        </span>
                        <span className="sk-avatar" title={ben?.fullName}>
                          {bas(ben?.fullName)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div style={{ textAlign: "right", marginTop: 8 }}>
                  <Link className="sk-bag" to="/tasks">
                    Tüm görevler →
                  </Link>
                </div>
              </section>

              <section className="sk-card">
                <div className="sk-sechead">
                  <h2 className="sk-h2" style={{ margin: 0 }}>
                    Yaklaşan etkinlikler
                  </h2>
                  <Link to="/calendar" className="sk-arti" aria-label="Takvime git">
                    +
                  </Link>
                </div>
                {!etkinlikler && <div className="sk-muted">Yükleniyor…</div>}
                {etkinlikler && etkinlikler.length === 0 && <div className="sk-muted">Önümüzdeki 7 günde etkinlik yok.</div>}
                <ul className="sk-etkinlik">
                  {(etkinlikler ?? []).slice(0, 3).map((e) => (
                    <li key={e.id}>
                      <span className="sk-etk-saat">
                        {e.saat ?? (e.tarih === bugun ? "Bugün" : new Date(`${e.tarih}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }))}
                        {e.saat && e.tarih !== bugun && (
                          <small>{new Date(`${e.tarih}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</small>
                        )}
                      </span>
                      <span className={`sk-etk-ikon ${e.tur}`} aria-hidden="true">
                        {e.tur === "toplanti" ? <VideoIkon /> : <IconCalendar size={18} />}
                      </span>
                      <span className="sk-etk-metin">
                        <b>{e.baslik}</b>
                        {e.alt && <span>{e.alt}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="sk-lio">
                <div className="sk-lio-ust">
                  <img src="/lio-mascot.png" alt="" width={72} height={72} />
                  <div>
                    <b>
                      Lio burada <SparkIkon />
                    </b>
                    <p>Projeler, ekip, raporlar… Ne öğrenmek istersin?</p>
                  </div>
                </div>
                <form
                  className="sk-lio-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const q = lioSoru.trim();
                    if (!q) return;
                    askLio(q);
                    setLioSoru("");
                  }}
                >
                  <input value={lioSoru} onChange={(e) => setLioSoru(e.target.value)} placeholder="Örn. Geciken görevleri göster" aria-label="Lio'ya sor" />
                  <button type="submit" aria-label="Gönder">
                    →
                  </button>
                </form>
              </section>
            </aside>
          </div>
        )}

        {gorunum === "proje" && (
          <section>
            {projeler.length === 0 ? (
              <div className="sk-empty">Aktif projen yok.</div>
            ) : (
              <>
                <div className="sk-proj-head">
                  <div style={{ minWidth: 0 }}>
                    <p className="sk-eyebrow">Proje yolu</p>
                    <select className="sk-select" style={{ fontSize: 20, fontWeight: 700 }} value={projeId} onChange={(e) => setProjeId(e.target.value)} aria-label="Proje seç">
                      {projeler.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                    {seciliProje?.deadline && (
                      <p className="sk-muted" style={{ margin: "10px 0 0" }}>
                        Teslim {new Date(seciliProje.deadline).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })} · {projeGorevSayisi} görev
                      </p>
                    )}
                  </div>
                  <div className="sk-ring big" style={{ background: `conic-gradient(#C0813F ${projeYuzde * 3.6}deg, #EEE7DD 0deg)` }}>
                    <div className="sk-ring-in">
                      <span>%{projeYuzde}</span>
                      <span className="sk-ring-cap">tamam</span>
                    </div>
                  </div>
                </div>
                {!projeGorevleri && <div className="sk-empty">Yükleniyor…</div>}
                {projeGorevleri && asamalar.length === 0 && <div className="sk-empty">Bu projede görev yok.</div>}
                {projeGorevleri && asamalar.length > 0 && (
                  <>
                    <ProjeYolu asamalar={asamalar} secili={aktifAsama?.id ?? ""} onSec={setSeciliAsama} />
                    {aktifAsama && (
                      <div className="sk-card">
                        <div className="sk-sechead">
                          <h2 className="sk-h2" style={{ margin: 0 }}>
                            Aşama: {aktifAsama.ad}
                          </h2>
                          <span className="sk-muted">
                            {aktifAsama.gorevler.filter((t) => t.status === "completed").length} / {aktifAsama.gorevler.length} görev
                          </span>
                        </div>
                        <div className="sk-bar">
                          <div className="sk-bar-in" style={{ width: `${(aktifAsama.gorevler.filter((t) => t.status === "completed").length / aktifAsama.gorevler.length) * 100}%` }} />
                        </div>
                        {aktifAsama.gorevler.map((t) => (
                          <label key={t.id} className={t.status === "completed" ? "sk-task done" : "sk-task"}>
                            <input type="checkbox" checked={t.status === "completed"} onChange={() => gorevCevir(t)} />
                            <span className="sk-t-title">{t.title}</span>
                            {t.deadline && t.status !== "completed" && t.deadline.slice(0, 10) < bugun && <span className="sk-tag crit">Gecikti</span>}
                            <span className="sk-av" title={t.assignedToName ?? "Atanmamış"}>
                              {bas(t.assignedToName)}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        )}

        {gorunum === "depo" && <DepoGorunumu kayitlar={depo} onKaydet={stokKaydet} />}
      </div>

      {mesaj && (
        <div className={mesaj.hata ? "sk-toast err" : "sk-toast"} role="status">
          {!mesaj.hata && (
            <span className="sk-medal" style={{ width: 28, height: 28 }}>
              <Tik />
            </span>
          )}
          <span>{mesaj.metin}</span>
        </div>
      )}
    </div>
  );
}

function SparkIkon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#6B5BEF" aria-hidden="true">
      <path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
    </svg>
  );
}

function VideoIkon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3" />
    </svg>
  );
}

