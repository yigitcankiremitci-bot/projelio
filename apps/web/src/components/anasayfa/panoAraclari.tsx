import { api } from "../../api/client";
import { googleTakvimApi } from "../../api/googleTakvim";
import type { GoogleTakvimEtkinligi, PersonalBoardItem, ProjeEtkinligi } from "@projelio/shared";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { bicimDili } from "../../lib/i18n/depo";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconNote, IconPause, IconPlay, IconRestore, IconStopwatch, IconTimer } from "../icons";
import { POMODORO_BASI, POMODORO_SURESI, pomodoroAyarla, usePomodoro } from "../../lib/pomodoro";
import { Sayi, SonListe } from "./gorselOzet";
import type { PanoKartTanimi } from "./ozetKartlari";
import NotDefteri from "./NotDefteri";
import { askLioDraft } from "../../lib/askLio";

/**
 * Panonun küçük araçları. Durum saat gibi "bitiş anı" olarak saklanır, kalan
 * saniye olarak değil: sayfadan çıkıp dönünce sayaç kaldığı yerden değil, gerçekte
 * olması gereken yerden devam etsin. Araçlar cihaza özel, hesaba yazılmaz.
 */
function okuJson<T>(anahtar: string, varsayilan: T): T {
  try {
    const ham = localStorage.getItem(anahtar);
    return ham ? { ...varsayilan, ...JSON.parse(ham) } : varsayilan;
  } catch {
    return varsayilan;
  }
}

function yazJson(anahtar: string, deger: unknown) {
  try {
    localStorage.setItem(anahtar, JSON.stringify(deger));
  } catch {
    // Depolama kapalıysa araç yine çalışır, yalnızca hatırlanmaz.
  }
}

function useSaniyelik(calisiyor: boolean): number {
  const [simdi, setSimdi] = useState(Date.now());
  useEffect(() => {
    if (!calisiyor) return;
    setSimdi(Date.now());
    const zaman = setInterval(() => setSimdi(Date.now()), 1000);
    return () => clearInterval(zaman);
  }, [calisiyor]);
  return simdi;
}

function sure(ms: number): string {
  const toplam = Math.max(0, Math.ceil(ms / 1000));
  const saat = Math.floor(toplam / 3600);
  const dk = String(Math.floor((toplam % 3600) / 60)).padStart(2, "0");
  const sn = String(toplam % 60).padStart(2, "0");
  return saat > 0 ? `${saat}:${dk}:${sn}` : `${dk}:${sn}`;
}

function AracDugmesi({ ad, onClick, vurgulu, children }: { ad: string; onClick: () => void; vurgulu?: boolean; children: ReactNode }) {
  const c = useThemeColors();
  const stil: CSSProperties = {
    width: 32,
    height: 32,
    padding: 0,
    borderRadius: "50%",
    border: vurgulu ? "none" : `1px solid ${c.border}`,
    background: vurgulu ? c.accent : "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
  return (
    <button type="button" onClick={onClick} aria-label={ad} title={ad} style={stil}>
      {children}
    </button>
  );
}

function Pomodoro() {
  const c = useThemeColors();
  const t = useT();
  const durum = usePomodoro();
  const setDurum = pomodoroAyarla;
  const simdi = useSaniyelik(durum.bitis !== null);
  const kalan = durum.bitis !== null ? Math.max(0, durum.bitis - simdi) : durum.kalan;
  const calisiyor = durum.bitis !== null;
  return (
    // Süre büyük rakamla, ilerleme altta ince çubukla: halkanın içindeki 15px
    // sayaç küçük kalıyordu ve kart yüksekliği halkayı büyütmeye yetmiyor
    // (kullanıcı isteği, 2026-11-09).
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <span style={{ fontSize: 38, fontWeight: 600, lineHeight: 1, letterSpacing: "-0.02em", color: c.textPrimary, fontVariantNumeric: "tabular-nums" }}>{sure(kalan)}</span>
        <span style={{ fontSize: 12, color: c.textSecondary }}>{durum.evre === "mola" ? t("Mola") : t("Çalışma")}</span>
        <span aria-hidden style={{ height: 5, borderRadius: 3, background: c.border, overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${Math.min(100, Math.max(0, (1 - kalan / POMODORO_SURESI[durum.evre]) * 100))}%`, background: durum.evre === "mola" ? c.success : c.accent, transition: "width 1s linear" }} />
        </span>
      </div>
      <div className="no-drag" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <AracDugmesi
          ad={calisiyor ? t("Duraklat") : t("Başlat")}
          vurgulu
          onClick={() => {
            if (calisiyor) setDurum({ evre: durum.evre, bitis: null, kalan });
            else setDurum({ evre: durum.evre, bitis: Date.now() + kalan, kalan });
          }}
        >
          {calisiyor ? <IconPause size={15} color={c.surface} /> : <IconPlay size={15} color={c.surface} />}
        </AracDugmesi>
        <AracDugmesi ad={t("Sıfırla")} onClick={() => setDurum(POMODORO_BASI)}>
          <IconRestore size={15} color={c.textSecondary} />
        </AracDugmesi>
      </div>
    </div>
  );
}

const KRONOMETRE_ANAHTARI = "projelio_pano_kronometre";

function Kronometre() {
  const c = useThemeColors();
  const t = useT();
  const [durum, setDurumHam] = useState(() => okuJson<{ baslangic: number | null; birikmis: number }>(KRONOMETRE_ANAHTARI, { baslangic: null, birikmis: 0 }));
  const setDurum = (d: typeof durum) => {
    setDurumHam(d);
    yazJson(KRONOMETRE_ANAHTARI, d);
  };
  const calisiyor = durum.baslangic !== null;
  const simdi = useSaniyelik(calisiyor);
  const gecen = durum.birikmis + (durum.baslangic !== null ? Math.max(0, simdi - durum.baslangic) : 0);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
      <Sayi boyut={24}>{sure(gecen)}</Sayi>
      <div className="no-drag" style={{ display: "flex", gap: 6 }}>
        <AracDugmesi
          ad={calisiyor ? t("Duraklat") : t("Başlat")}
          vurgulu
          onClick={() => (calisiyor ? setDurum({ baslangic: null, birikmis: gecen }) : setDurum({ ...durum, baslangic: Date.now() }))}
        >
          {calisiyor ? <IconPause size={15} color={c.surface} /> : <IconPlay size={15} color={c.surface} />}
        </AracDugmesi>
        <AracDugmesi ad={t("Sıfırla")} onClick={() => setDurum({ baslangic: null, birikmis: 0 })}>
          <IconRestore size={15} color={c.textSecondary} />
        </AracDugmesi>
      </div>
    </div>
  );
}

interface TakvimOlayi {
  id: string;
  ad: string;
  gun: string;
  renk?: string;
  hedef?: string;
  disAdres?: string;
}

function gunAnahtari(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Ay görünümlü gerçek takvim: proje etkinlikleri, yapılacak tarihleri, bağlıysa Google. */
function TakvimKarti() {
  const c = useThemeColors();
  const t = useT();
  const bugun = gunAnahtari(new Date());
  const [ay, setAy] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [secili, setSecili] = useState(bugun);
  const [olaylar, setOlaylar] = useState<TakvimOlayi[]>([]);
  const ayAnahtari = gunAnahtari(ay);

  useEffect(() => {
    let iptal = false;
    const ilk = new Date(ay.getFullYear(), ay.getMonth(), 1);
    const son = new Date(ay.getFullYear(), ay.getMonth() + 1, 0);
    const from = gunAnahtari(ilk);
    const to = gunAnahtari(son);
    // Kaynaklar bağımsız: Google bağlı değilse ya da biri düşerse diğerleri yine görünsün.
    Promise.all([
      api.get<ProjeEtkinligi[]>(`/calendar/mine?from=${from}&to=${to}`).catch(() => [] as ProjeEtkinligi[]),
      api.get<PersonalBoardItem[]>("/todos/board?source=all").catch(() => [] as PersonalBoardItem[]),
      googleTakvimApi.etkinlikler(from, to).catch(() => [] as GoogleTakvimEtkinligi[]),
    ]).then(([etkinlikler, gorevler, google]) => {
      if (iptal) return;
      const liste: TakvimOlayi[] = [];
      for (const e of etkinlikler) {
        const bitis = e.endDate ?? e.eventDate;
        for (const g = new Date(`${e.eventDate}T12:00:00`); gunAnahtari(g) <= bitis; g.setDate(g.getDate() + 1)) {
          liste.push({ id: `${e.id}:${gunAnahtari(g)}`, ad: e.title, gun: gunAnahtari(g), renk: c.accent, hedef: e.projectId ? `/projects/${e.projectId}` : "/calendar" });
        }
      }
      for (const g of gorevler) {
        if (!g.effectiveDueDate || g.status === "completed") continue;
        liste.push({ id: g.itemId, ad: g.title, gun: g.effectiveDueDate.slice(0, 10), renk: c.success, hedef: g.projectId ? `/projects/${g.projectId}` : "/tasks" });
      }
      for (const e of google) {
        liste.push({ id: e.id, ad: e.baslik, gun: e.tumGun ? e.baslangic.slice(0, 10) : gunAnahtari(new Date(e.baslangic)), renk: e.takvimRengi, disAdres: e.htmlLink, hedef: "/calendar" });
      }
      setOlaylar(liste);
    });
    return () => {
      iptal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ayAnahtari]);

  const kaydir = (yon: number) => setAy(new Date(ay.getFullYear(), ay.getMonth() + yon, 1));
  const bosluk = (ay.getDay() + 6) % 7; // Hafta pazartesi başlar.
  const gunSayisi = new Date(ay.getFullYear(), ay.getMonth() + 1, 0).getDate();
  const haftaGunleri = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(bicimDili(), { weekday: "narrow" }));
  const okStili: CSSProperties = { width: 24, height: 24, padding: 0, border: "none", background: "transparent", color: c.textSecondary, display: "flex", alignItems: "center", justifyContent: "center" };

  return (
    <div className="no-drag" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: c.textPrimary, fontWeight: 500 }}>{ay.toLocaleDateString(bicimDili(), { month: "long", year: "numeric" })}</span>
        <span style={{ display: "flex" }}>
          <button type="button" onClick={() => kaydir(-1)} aria-label={t("Önceki")} title={t("Önceki")} style={okStili}>
            <IconChevronLeft size={14} color="currentColor" />
          </button>
          <button type="button" onClick={() => kaydir(1)} aria-label={t("Sonraki")} title={t("Sonraki")} style={okStili}>
            <IconChevronRight size={14} color="currentColor" />
          </button>
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: 1, textAlign: "center" }}>
        {haftaGunleri.map((g, i) => (
          <span key={i} style={{ fontSize: 11, color: c.textSecondary, paddingBottom: 2 }}>{g}</span>
        ))}
        {Array.from({ length: bosluk }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length: gunSayisi }, (_, i) => {
          const anahtar = gunAnahtari(new Date(ay.getFullYear(), ay.getMonth(), i + 1));
          const buGun = anahtar === bugun;
          const secilen = anahtar === secili;
          const dolu = olaylar.some((o) => o.gun === anahtar);
          return (
            <button key={anahtar} type="button" onClick={() => setSecili(anahtar)} aria-pressed={secilen} style={{ position: "relative", height: 24, padding: 0, border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, background: buGun ? c.accent : "transparent", color: buGun ? c.surface : c.textPrimary, boxShadow: secilen && !buGun ? `inset 0 0 0 1px ${c.accent}` : undefined }}>{i + 1}</span>
              {dolu && <span style={{ position: "absolute", bottom: 0, width: 4, height: 4, borderRadius: "50%", background: buGun ? c.surface : c.accent }} />}
            </button>
          );
        })}
      </div>
      <SonListe ogeler={olaylar.filter((o) => o.gun === secili)} adet={2} />
    </div>
  );
}

/** Her iki panoda da rafta duran araçlar. */
export function aracTanimlari(t: ReturnType<typeof useT>, kapsam: string): PanoKartTanimi[] {
  return [
    { id: "pomodoro", ad: t("Pomodoro"), grup: "arac", Icon: IconTimer, boyut: "kucuk", etkilesimli: true, hedef: "", ciz: () => <Pomodoro /> },
    { id: "kronometre", ad: t("Kronometre"), grup: "arac", Icon: IconStopwatch, boyut: "kucuk", etkilesimli: true, hedef: "", ciz: () => <Kronometre /> },
    // Geniş ve iki satır: yazmak için yer olsun; araç çubuğu dar kartta yana kayar.
    { id: "not", ad: t("Notlar"), grup: "arac", Icon: IconNote, boyut: "genis", satir: 2, etkilesimli: true, hedef: "", ciz: () => <NotDefteri kapsam={kapsam} /> },
    {
      id: "takvim",
      ad: t("Takvim"),
      grup: "arac",
      Icon: IconCalendar,
      boyut: "kucuk",
      satir: 2,
      etkilesimli: true,
      hedef: "/calendar",
      // Lio takvime etkinlik/plan yazabiliyor; taslak yazılır, göndermek kişide.
      hizliEylem: { ad: t("Lio'ya takvim için yaz"), ikon: "lio", calistir: () => askLioDraft(t("Takvimime eklemek istiyorum: ")) },
      ciz: () => <TakvimKarti />,
    },
  ];
}
