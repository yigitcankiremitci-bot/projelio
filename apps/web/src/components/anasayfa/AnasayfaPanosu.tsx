import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PANO_BOYUTLARI, type PanoBoyut } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useIsDesktop } from "../../lib/useIsDesktop";
import { pageGutter } from "../../lib/layout";
import { LONG_PRESS_DELAY, useSortableList } from "../../lib/useSortableList";
import type { AnasayfaPano } from "../../lib/useAnasayfaPano";
import { tourAnchor } from "../../lib/tour/types";
import { useT } from "../../lib/i18n";
import { IconDoor, IconPlus, IconSparkle, IconX } from "../icons";
import PanoEkle from "./PanoEkle";
import type { PanoKartTanimi } from "./ozetKartlari";

const BOYUT_HARFI: Record<PanoBoyut, string> = { kucuk: "S", orta: "M", genis: "L" };
const BOYUT_ADI: Record<PanoBoyut, string> = { kucuk: "Küçük", orta: "Orta", genis: "Geniş" }; // dil:anahtar

/** Sanal ofise tek dokunuşla geçiş. */
export function OfisKapisi({ hedef }: { hedef: string }) {
  const c = useThemeColors();
  const t = useT();
  return (
    <Link to={hedef} aria-label={t("Sanal ofis")} title={t("Sanal ofis")} style={ustDugmeStili(c)}>
      <IconDoor size={17} color={c.textSecondary} />
    </Link>
  );
}

function ustDugmeStili(c: ReturnType<typeof useThemeColors>): CSSProperties {
  return {
    width: 36,
    height: 36,
    padding: 0,
    borderRadius: "50%",
    border: `1px solid ${c.border}`,
    background: c.surface,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
}

function kosePulStili(c: ReturnType<typeof useThemeColors>): CSSProperties {
  return {
    width: 26,
    height: 26,
    padding: 0,
    borderRadius: "50%",
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textSecondary,
    fontSize: 11,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  };
}

export interface PanoBoslugu {
  satir: number;
  kolon: number;
  /** Buradan başlayıp yan yana kaç hücre boş: geniş kart sığmıyorsa küçük eklenir. */
  genislik: number;
  /** Buraya eklenen kartın sıradaki yeri. */
  konum: number;
}

/**
 * Izgaradaki boş hücreler + en alta bir boş satır. Tarayıcıya sorulamıyor,
 * CSS grid'in yerleştirmesi burada aynen tekrarlanıyor: boşluklar kartların
 * atlayıp geçtiği hücreler olduğu için buraya öğe koymak kartları kımıldatmaz.
 */
export function panoBosluklari(olcular: { genislik: number; tam: boolean; yukseklik: number }[], kolonSayisi: number): PanoBoslugu[] {
  const dolu = new Set<string>();
  const sigar = (r: number, k: number, g: number, y: number) => {
    if (k + g > kolonSayisi) return false;
    for (let a = r; a < r + y; a++) for (let b = k; b < k + g; b++) if (dolu.has(`${a}:${b}`)) return false;
    return true;
  };
  const yerlesen: { r: number; k: number }[] = [];
  let r = 0;
  let k = 0;
  let satirSayisi = 0;
  for (const o of olcular) {
    const g = o.tam ? kolonSayisi : Math.min(o.genislik, kolonSayisi);
    if (o.tam) {
      if (k > 0) r++;
      k = 0;
      while (!sigar(r, 0, g, o.yukseklik)) r++;
    } else {
      while (!sigar(r, k, g, o.yukseklik)) {
        k++;
        if (k + g > kolonSayisi) {
          k = 0;
          r++;
        }
      }
    }
    for (let a = r; a < r + o.yukseklik; a++) for (let b = k; b < k + g; b++) dolu.add(`${a}:${b}`);
    yerlesen.push({ r, k });
    satirSayisi = Math.max(satirSayisi, r + o.yukseklik);
  }
  const bosluklar: PanoBoslugu[] = [];
  for (let satir = 0; satir <= satirSayisi; satir++) {
    for (let kolon = 0; kolon < kolonSayisi; kolon++) {
      if (dolu.has(`${satir}:${kolon}`)) continue;
      let genislik = 1;
      while (kolon + genislik < kolonSayisi && !dolu.has(`${satir}:${kolon + genislik}`)) genislik++;
      const konum = yerlesen.filter((p) => p.r < satir || (p.r === satir && p.k < kolon)).length;
      bosluklar.push({ satir, kolon, genislik, konum });
    }
  }
  return bosluklar;
}

/**
 * Anasayfanın kendisi: kullanıcının dizdiği özet kartları.
 *
 * Ayrı bir düzenleme modu yok, her şey yerinde: basılı tutup taşı, boşluğun
 * üstüne gelip + ile ekle, kartın sağ üst köşesine gelip çarpıyla kaldır.
 */
export default function AnasayfaPanosu({ pano, katalog }: { pano: AnasayfaPano; katalog: PanoKartTanimi[] }) {
  const c = useThemeColors();
  const t = useT();
  const gezin = useNavigate();
  const gutter = pageGutter(useIsDesktop());
  const izgaraRef = useRef<HTMLDivElement>(null);
  const [kolonSayisi, setKolonSayisi] = useState(4);
  const [acikBosluk, setAcikBosluk] = useState<PanoBoslugu | null>(null);
  const tanimlar = new Map(katalog.map((k) => [k.id, k]));
  const gorunen = pano.kartlar.filter((k) => tanimlar.has(k.id));
  const siraAnahtari = gorunen.map((k) => k.id).join(",");

  const panoRef = useRef(pano);
  panoRef.current = pano;
  // Sürükleme sırasında boşluklar gizli (kartların yolunu kesmesinler), ama
  // kart bir boşluğun üstüne bırakılırsa oraya oturmalı: Sortable yalnızca
  // başka bir kartın üstüne gelince sıra değiştiriyor, boş hücreye bırakılan
  // kart yerinde kalıyordu (kullanıcı isteği, 2026-11-09). Boşlukların yeri
  // sürükleme başında ölçülür, imleç izlenir, üstündeki boşluk vurgulanır.
  const birakmaRef = useRef<HTMLDivElement>(null);
  const tasimaRef = useRef<{
    sira: string[];
    bosluklar: (PanoBoslugu & { sol: number; ust: number; en: number; boy: number })[];
    hedef: PanoBoslugu | null;
    izle: (e: PointerEvent | MouseEvent | TouchEvent) => void;
  } | null>(null);
  const durumRef = useRef<{ bosluklar: PanoBoslugu[]; genislikler: Map<string, number>; kolonSayisi: number }>({ bosluklar: [], genislikler: new Map(), kolonSayisi: 4 });

  // Sütun sayısı panonun genişliğine bağlı (container sorgusu); CSS'in verdiği sonucu okuyoruz.
  useLayoutEffect(() => {
    const el = izgaraRef.current;
    if (!el) return;
    const olc = () => setKolonSayisi(getComputedStyle(el).gridTemplateColumns.split(" ").length || 4);
    olc();
    const izleyici = new ResizeObserver(olc);
    izleyici.observe(el);
    return () => izleyici.disconnect();
  }, []);

  useSortableList(
    izgaraRef,
    {
      draggable: ".pano-hucre",
      // Pano container-type kullanıyor: içindeki position:fixed hayalet panoya
      // göre konumlanıp imleçten kopardı. Gövdeye eklenince imleci izliyor.
      fallbackOnBody: true,
      delay: LONG_PRESS_DELAY,
      // Boşluklar sabit hücrelere oturuyor; sürüklerken kartların yolunu kesmesinler.
      // React durumu değil: taşıma sırasında yeniden çizim Sortable'ın DOM'unu bozar.
      onStart: (olay) => {
        const el = izgaraRef.current;
        if (!el) return;
        const sira = Array.from(el.children).map((n) => (n as HTMLElement).dataset.id!).filter(Boolean);
        const izgaraKutusu = el.getBoundingClientRect();
        // Gizlenmeden ÖNCE ölçülür; konumlar ızgaraya göre, sayfa kayınca da tutsun.
        const bosluklar = durumRef.current.bosluklar.flatMap((b) => {
          const hucre = el.querySelector<HTMLElement>(`.pano-bosluk[data-yer="${b.satir}-${b.kolon}"]`);
          if (!hucre) return [];
          const k = hucre.getBoundingClientRect();
          return [{ ...b, sol: k.left - izgaraKutusu.left, ust: k.top - izgaraKutusu.top, en: k.width, boy: k.height }];
        });
        const surukGenisligi = durumRef.current.genislikler.get((olay.item as HTMLElement).dataset.id ?? "") ?? 1;
        const izle = (e: PointerEvent | MouseEvent | TouchEvent) => {
          const nokta = "touches" in e ? e.touches[0] : e;
          const tasima = tasimaRef.current;
          const kutu = izgaraRef.current?.getBoundingClientRect();
          if (!nokta || !tasima || !kutu) return;
          const x = nokta.clientX - kutu.left;
          const y = nokta.clientY - kutu.top;
          const alti = tasima.bosluklar.find((b) => x >= b.sol && x <= b.sol + b.en && y >= b.ust && y <= b.ust + b.boy);
          // Orta kart iki hücre ister: imleç sağdaki hücredeyse soldakinden başlar.
          const uygun = alti
            ? tasima.bosluklar
                .filter((b) => b.satir === alti.satir && b.kolon <= alti.kolon && b.kolon + b.genislik > alti.kolon && b.genislik >= surukGenisligi)
                .sort((a, b) => b.kolon - a.kolon)[0]
            : undefined;
          tasima.hedef = uygun ?? null;
          const vurgu = birakmaRef.current;
          if (!vurgu) return;
          if (!uygun) {
            vurgu.style.display = "none";
            return;
          }
          const ilk = uygun;
          const pano = vurgu.parentElement!.getBoundingClientRect();
          vurgu.style.display = "block";
          vurgu.style.left = `${kutu.left - pano.left + ilk.sol}px`;
          vurgu.style.top = `${kutu.top - pano.top + ilk.ust}px`;
          vurgu.style.width = `${surukGenisligi > 1 ? ilk.en * surukGenisligi + 12 * (surukGenisligi - 1) : ilk.en}px`;
          vurgu.style.height = `${ilk.boy}px`;
        };
        tasimaRef.current = { sira, bosluklar, hedef: null, izle };
        document.addEventListener("pointermove", izle, true);
        document.addEventListener("mousemove", izle, true);
        document.addEventListener("touchmove", izle, true);
        el.classList.add("pano-izgara--tasiniyor");
      },
      onEnd: (olay) => {
        const el = izgaraRef.current;
        el?.classList.remove("pano-izgara--tasiniyor");
        const tasima = tasimaRef.current;
        tasimaRef.current = null;
        if (birakmaRef.current) birakmaRef.current.style.display = "none";
        if (tasima) {
          document.removeEventListener("pointermove", tasima.izle, true);
          document.removeEventListener("mousemove", tasima.izle, true);
          document.removeEventListener("touchmove", tasima.izle, true);
        }
        if (!el) return;
        const id = (olay.item as HTMLElement).dataset.id;
        if (tasima?.hedef && id) {
          // Sortable'ın DOM'da yaptığı kaydırmayı geri al: sırayı React kursun.
          if (olay.oldIndex !== undefined && olay.oldIndex !== olay.newIndex) {
            olay.item.remove();
            el.insertBefore(olay.item, el.children[olay.oldIndex] ?? null);
          }
          const eskiYer = tasima.sira.indexOf(id);
          const sira = tasima.sira.filter((x) => x !== id);
          const konum = eskiYer >= 0 && eskiYer < tasima.hedef.konum ? tasima.hedef.konum - 1 : tasima.hedef.konum;
          sira.splice(Math.min(konum, sira.length), 0, id);
          panoRef.current.sirala(sira);
          return;
        }
        if (olay.oldIndex === olay.newIndex) return;
        panoRef.current.sirala(Array.from(el.children).map((n) => (n as HTMLElement).dataset.id!).filter(Boolean));
      },
    },
    []
  );

  // Klavyeyle de taşınabilsin: sürükleme yalnızca fare ve dokunuşla çalışıyor.
  const kaydir = (id: string, yon: -1 | 1) => {
    const sira = siraAnahtari.split(",");
    const i = sira.indexOf(id);
    const j = i + yon;
    if (i < 0 || j < 0 || j >= sira.length) return;
    [sira[i], sira[j]] = [sira[j], sira[i]];
    pano.sirala(sira);
  };

  const gercekBoyut = (kart: { id: string; boyut: PanoBoyut }) => tanimlar.get(kart.id)?.sabitBoyut ?? kart.boyut;
  const satirSayisi = (tanim: PanoKartTanimi | undefined, boyut: PanoBoyut) => (typeof tanim?.satir === "function" ? tanim.satir(boyut) : tanim?.satir ?? 1);
  const bosluklar = panoBosluklari(
    gorunen.map((k) => {
      const b = gercekBoyut(k);
      return { genislik: b === "orta" ? 2 : 1, tam: b === "genis", yukseklik: satirSayisi(tanimlar.get(k.id), b) };
    }),
    kolonSayisi
  );
  const paneldeki = new Set(pano.kartlar.map((k) => k.id));
  durumRef.current = {
    bosluklar,
    kolonSayisi,
    // Tam satır kartı yalnızca bütün satırı boş bir boşluğa oturur.
    genislikler: new Map(gorunen.map((k) => [k.id, gercekBoyut(k) === "genis" ? kolonSayisi : gercekBoyut(k) === "orta" ? 2 : 1])),
  };

  const ekle = (tanim: PanoKartTanimi, bosluk: PanoBoslugu) => {
    const boyut = tanim.sabitBoyut ?? (tanim.boyut === "kucuk" || bosluk.genislik >= 2 ? tanim.boyut : "kucuk");
    const sira = gorunen.map((k) => k.id);
    sira.splice(bosluk.konum, 0, tanim.id);
    pano.ekle(tanim.id, boyut);
    pano.sirala(sira);
    setAcikBosluk(null);
  };

  return (
    <div className="pano" style={{ padding: `0 ${gutter}px 170px` }}>
      <div ref={izgaraRef} className={`pano-izgara${gorunen.length === 0 ? " pano-izgara--bos" : ""}`} {...tourAnchor("dashboard-tabs")}>
        {gorunen.map((kart) => {
          const tanim = tanimlar.get(kart.id)!;
          const boyut = gercekBoyut(kart);
          const baslikStili: CSSProperties = { display: "flex", alignItems: "center", gap: 7, minWidth: 0, textDecoration: "none" };
          const baslikYazisi: CSSProperties = { fontSize: 14, fontWeight: 500, color: c.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
          const icerik = tanim.tamKaplama ? (
            tanim.ciz(boyut)
          ) : (
            <>
              {/* Sağda rozet ya da hızlı düğme olabilir, uzun ad onların altına girmesin. */}
              <span style={{ display: "flex", minWidth: 0, paddingBottom: 10, paddingRight: tanim.hizliEylem ? 66 : 30 }}>
                {tanim.hedef ? (
                  <Link to={tanim.hedef} draggable={false} style={baslikStili}>
                    <tanim.Icon size={17} color={c.accentDark} />
                    <span style={baslikYazisi}>{tanim.ad}</span>
                  </Link>
                ) : (
                  <span style={baslikStili}>
                    <tanim.Icon size={17} color={c.accentDark} />
                    <span style={baslikYazisi}>{tanim.ad}</span>
                  </span>
                )}
              </span>
              {tanim.ciz(boyut)}
            </>
          );
          const kartStili: CSSProperties = {
            background: c.surface,
            border: `1px solid ${c.border}`,
            ...(tanim.tamKaplama ? { padding: 0, overflow: "hidden" } : {}),
          };
          const sonrakiBoyut = PANO_BOYUTLARI[(PANO_BOYUTLARI.indexOf(boyut) + 1) % PANO_BOYUTLARI.length];
          return (
            <div
              key={kart.id}
              data-id={kart.id}
              data-boyut={boyut}
              className="pano-hucre"
              style={satirSayisi(tanim, boyut) > 1 ? { gridRow: `span ${satirSayisi(tanim, boyut)}` } : undefined}
              onKeyDown={(e) => {
                if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
                e.preventDefault();
                kaydir(kart.id, e.key === "ArrowLeft" ? -1 : 1);
              }}
              {...(tanim.turCapasi ? tourAnchor(tanim.turCapasi) : {})}
            >
              {tanim.etkilesimli ? (
                <div className="pano-kart" role="group" aria-label={tanim.ad} style={kartStili}>
                  {icerik}
                </div>
              ) : tanim.tamKaplama ? (
                <Link to={tanim.hedef} draggable={false} className="entity-card pano-kart" aria-label={tanim.ad} style={kartStili}>
                  {icerik}
                </Link>
              ) : (
                // Bağlantı değil: içinde kendi satır bağlantıları var, bağlantı iç içe olamaz.
                // Klavye için başlık bağlantısı aynı yere gider.
                <div
                  className="entity-card pano-kart"
                  role="group"
                  aria-label={tanim.ad}
                  style={{ ...kartStili, cursor: "pointer" }}
                  onClick={(e) => {
                    // Karttan açılan pencereler portal'da ama tıklaması React ağacından buraya kabarıyor.
                    if (!e.currentTarget.contains(e.target as Node)) return;
                    if (!(e.target as HTMLElement).closest("a, button, input, textarea")) gezin(tanim.hedef);
                  }}
                >
                  {icerik}
                </div>
              )}

              {tanim.hizliEylem && (
                <button type="button" className="no-drag pano-hizli" onClick={tanim.hizliEylem.calistir} aria-label={tanim.hizliEylem.ad} title={tanim.hizliEylem.ad} style={{ border: `1px solid ${c.border}`, background: c.surface }}>
                  {tanim.hizliEylem.ikon === "lio" ? <IconSparkle size={14} color={c.accentDark} /> : <IconPlus size={14} color={c.textSecondary} />}
                </button>
              )}

              <div className="no-drag pano-kose">
                <button type="button" onClick={() => pano.kaldir(kart.id)} aria-label={t("Panodan kaldır")} title={t("Panodan kaldır")} style={kosePulStili(c)}>
                  <IconX size={13} color="currentColor" />
                </button>
                {!tanim.sabitBoyut && (
                  <button type="button" className="pano-kose-boyut" onClick={(e) => {
                    // Kart büyüyünce köşe imlecin altından kayıyor; odak kalmazsa düğme de gözden kayboluyordu.
                    e.currentTarget.focus();
                    pano.boyutAyarla(kart.id, sonrakiBoyut);
                  }} aria-label={t(BOYUT_ADI[sonrakiBoyut])} title={t(BOYUT_ADI[sonrakiBoyut])} style={kosePulStili(c)}>
                    {BOYUT_HARFI[boyut]}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {bosluklar.map((b) => (
          <div key={`${b.satir}-${b.kolon}`} data-yer={`${b.satir}-${b.kolon}`} className="no-drag pano-bosluk" style={{ gridColumn: b.kolon + 1, gridRow: b.satir + 1 }}>
            <button type="button" onClick={() => setAcikBosluk(b)} aria-label={t("Panoya ekle")} title={t("Panoya ekle")} style={{ borderColor: c.border, color: c.textSecondary }}>
              <IconPlus size={20} color="currentColor" />
            </button>
          </div>
        ))}
      </div>

      <div ref={birakmaRef} className="pano-birakma" aria-hidden style={{ borderColor: c.accent }} />

      {acikBosluk && (
        <PanoEkle
          secenekler={katalog.filter((k) => !paneldeki.has(k.id))}
          onSec={(tanim) => ekle(tanim, acikBosluk)}
          onSifirla={() => {
            pano.sifirla();
            setAcikBosluk(null);
          }}
          onKapat={() => setAcikBosluk(null)}
        />
      )}
    </div>
  );
}
