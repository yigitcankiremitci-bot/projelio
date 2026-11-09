import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { bicimDili } from "../../lib/i18n/depo";
import { IconCalendar, IconNote, IconPause, IconPlay, IconRestore, IconStopwatch, IconTimer } from "../icons";
import { Halka, Sayi } from "./gorselOzet";
import type { PanoKartTanimi } from "./ozetKartlari";

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

const POMODORO_MS = 25 * 60 * 1000;
const POMODORO_ANAHTARI = "projelio_pano_pomodoro";

/** Bitişi duyurur; kısa bir bip, ses dosyası taşımaya değmez. */
function bip() {
  try {
    const ses = new AudioContext();
    const osilator = ses.createOscillator();
    osilator.connect(ses.destination);
    osilator.frequency.value = 660;
    osilator.start();
    osilator.stop(ses.currentTime + 0.25);
  } catch {
    // Tarayıcı izin vermediyse halka yine dolu görünür.
  }
}

function Pomodoro() {
  const c = useThemeColors();
  const t = useT();
  const [durum, setDurumHam] = useState(() => okuJson<{ bitis: number | null; kalan: number }>(POMODORO_ANAHTARI, { bitis: null, kalan: POMODORO_MS }));
  const setDurum = (d: typeof durum) => {
    setDurumHam(d);
    yazJson(POMODORO_ANAHTARI, d);
  };
  const simdi = useSaniyelik(durum.bitis !== null);
  const kalan = durum.bitis !== null ? Math.max(0, durum.bitis - simdi) : durum.kalan;
  const bitti = kalan === 0;
  const durumRef = useRef(durum);
  durumRef.current = durum;
  useEffect(() => {
    if (durumRef.current.bitis === null || !bitti) return;
    bip();
    setDurum({ bitis: null, kalan: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitti]);
  const calisiyor = durum.bitis !== null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <Halka oran={1 - kalan / POMODORO_MS} renk={bitti ? c.success : c.accent} boyut={76}>
        {sure(kalan)}
      </Halka>
      <div className="no-drag" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <AracDugmesi
          ad={calisiyor ? t("Duraklat") : t("Başlat")}
          vurgulu
          onClick={() => {
            if (calisiyor) setDurum({ bitis: null, kalan });
            else setDurum({ bitis: Date.now() + (bitti ? POMODORO_MS : kalan), kalan: bitti ? POMODORO_MS : kalan });
          }}
        >
          {calisiyor ? <IconPause size={15} color={c.surface} /> : <IconPlay size={15} color={c.surface} />}
        </AracDugmesi>
        <AracDugmesi ad={t("Sıfırla")} onClick={() => setDurum({ bitis: null, kalan: POMODORO_MS })}>
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

function HizliNot({ kapsam }: { kapsam: string }) {
  const c = useThemeColors();
  const t = useT();
  const anahtar = `projelio_pano_not_${kapsam}`;
  const [metin, setMetin] = useState(() => {
    try {
      return localStorage.getItem(anahtar) ?? "";
    } catch {
      return "";
    }
  });
  return (
    <textarea
      className="no-drag"
      value={metin}
      onChange={(e) => {
        setMetin(e.target.value);
        try {
          localStorage.setItem(anahtar, e.target.value);
        } catch {
          // Depolama kapalıysa not yalnızca bu oturumda durur.
        }
      }}
      placeholder={t("Not yaz")}
      aria-label={t("Hızlı not")}
      style={{ flex: 1, width: "100%", minHeight: 62, boxSizing: "border-box", padding: 0, border: "none", outline: "none", resize: "none", background: "transparent", color: c.textPrimary, fontSize: 14, fontFamily: "inherit" }}
    />
  );
}

function TakvimOzeti() {
  const c = useThemeColors();
  const bugun = new Date();
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
      <Sayi boyut={38}>{bugun.getDate()}</Sayi>
      <span style={{ fontSize: 13, color: c.textSecondary, whiteSpace: "nowrap" }}>{bugun.toLocaleDateString(bicimDili(), { month: "short", weekday: "short" })}</span>
    </div>
  );
}

/** Her iki panoda da rafta duran araçlar. */
export function aracTanimlari(t: ReturnType<typeof useT>, kapsam: string): PanoKartTanimi[] {
  return [
    { id: "pomodoro", ad: t("Pomodoro"), grup: "arac", Icon: IconTimer, boyut: "kucuk", etkilesimli: true, hedef: "", ciz: () => <Pomodoro /> },
    { id: "kronometre", ad: t("Kronometre"), grup: "arac", Icon: IconStopwatch, boyut: "kucuk", etkilesimli: true, hedef: "", ciz: () => <Kronometre /> },
    { id: "not", ad: t("Hızlı not"), grup: "arac", Icon: IconNote, boyut: "kucuk", etkilesimli: true, hedef: "", ciz: () => <HizliNot kapsam={kapsam} /> },
    { id: "takvim", ad: t("Takvim"), grup: "arac", Icon: IconCalendar, boyut: "kucuk", hedef: "/calendar", ciz: () => <TakvimOzeti /> },
  ];
}
