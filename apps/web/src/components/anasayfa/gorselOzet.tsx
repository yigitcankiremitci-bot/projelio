import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { accentPresets } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { bicimDili } from "../../lib/i18n/depo";

/**
 * Özet kartlarının görsel parçaları. Yazı yerine şekil: sayının yanında halka,
 * çubuk, şerit ya da yüz durur. Her şekil gerçek veriden çizilir; süs olsun diye
 * uydurulmuş eğilim ya da yüzde yok.
 *
 * Renkler vurgu paletinden geliyor (bkz. CLAUDE.md "Renkler tek yerden gelir"):
 * kartları bir bakışta ayırt ettiren şey bu.
 */
const RENKLER = Object.values(accentPresets).map((p) => p.light.accent);

/** Aynı modül her açılışta aynı renkte kalsın diye anahtardan türetilir. */
export function ozetRengi(anahtar: string): string {
  let toplam = 0;
  for (let i = 0; i < anahtar.length; i++) toplam = (toplam * 31 + anahtar.charCodeAt(i)) >>> 0;
  return RENKLER[toplam % RENKLER.length];
}

export function Sayi({ children, boyut = 26 }: { children: ReactNode; boyut?: number }) {
  const c = useThemeColors();
  return <div style={{ fontSize: boyut, lineHeight: 1.1, fontWeight: 500, color: c.textPrimary, whiteSpace: "nowrap" }}>{children}</div>;
}

/** Sayı solda, görsel sağda: kartların çoğunun alt satırı. */
export function YanYana({ sol, sag }: { sol: ReactNode; sag?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, minWidth: 0 }}>
      <div style={{ flexShrink: 0 }}>{sol}</div>
      {sag && <div style={{ minWidth: 0, display: "flex", justifyContent: "flex-end" }}>{sag}</div>}
    </div>
  );
}

export function Halka({ oran, renk, boyut = 72, children }: { oran: number; renk: string; boyut?: number; children?: ReactNode }) {
  const c = useThemeColors();
  const r = boyut / 2 - 5;
  const cevre = 2 * Math.PI * r;
  const sinirli = Math.min(1, Math.max(0, oran));
  return (
    <div style={{ position: "relative", width: boyut, height: boyut, flexShrink: 0 }}>
      <svg width={boyut} height={boyut} aria-hidden="true">
        <circle cx={boyut / 2} cy={boyut / 2} r={r} fill="none" stroke={c.border} strokeWidth={7} />
        <circle
          cx={boyut / 2}
          cy={boyut / 2}
          r={r}
          fill="none"
          stroke={renk}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${sinirli * cevre} ${cevre}`}
          transform={`rotate(-90 ${boyut / 2} ${boyut / 2})`}
        />
      </svg>
      {children && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 500, color: c.textPrimary }}>
          {children}
        </div>
      )}
    </div>
  );
}

/** Dönem çubukları: en yeni olan en koyu, göz son aya gitsin. */
export function Cubuklar({ degerler, renk, yukseklik = 48 }: { degerler: number[]; renk: string; yukseklik?: number }) {
  const enBuyuk = Math.max(1, ...degerler.map((d) => Math.abs(d)));
  return (
    <div aria-hidden="true" style={{ display: "flex", alignItems: "flex-end", gap: 4, height: yukseklik }}>
      {degerler.map((d, i) => (
        <span
          key={i}
          style={{
            width: 12,
            height: Math.max(4, (Math.abs(d) / enBuyuk) * yukseklik),
            borderRadius: 3,
            background: renk,
            opacity: 0.35 + (0.65 * (i + 1)) / degerler.length,
          }}
        />
      ))}
    </div>
  );
}

export function Seritler({ parcalar, yukseklik = 9 }: { parcalar: { deger: number; renk: string; ad?: string }[]; yukseklik?: number }) {
  const c = useThemeColors();
  const dolu = parcalar.filter((p) => p.deger > 0);
  return (
    <div style={{ display: "flex", gap: 2, height: yukseklik, width: "100%", borderRadius: yukseklik / 2, overflow: "hidden", background: dolu.length ? undefined : c.border }}>
      {dolu.map((p, i) => (
        <span key={i} title={p.ad} style={{ flexGrow: p.deger, flexBasis: 0, background: p.renk }} />
      ))}
    </div>
  );
}

/** Tek tek sayılabilen şeyler (departman, kayıt): her biri bir kare. */
export function Kareler({ renkler, tavan = 12 }: { renkler: string[]; tavan?: number }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end", maxWidth: 104 }}>
      {renkler.slice(0, tavan).map((r, i) => (
        <span key={i} style={{ width: 13, height: 13, borderRadius: 4, background: r }} />
      ))}
    </div>
  );
}

export function KisiYigini({ kisiler, en = 4 }: { kisiler: { ad: string; foto?: string }[]; en?: number }) {
  const c = useThemeColors();
  return (
    <div style={{ display: "flex", paddingLeft: 8 }}>
      {kisiler.slice(0, en).map((k, i) => (
        <span
          key={i}
          title={k.ad}
          style={{
            width: 30,
            height: 30,
            marginLeft: -8,
            borderRadius: "50%",
            border: `2px solid ${c.surface}`,
            background: ozetRengi(k.ad),
            color: c.surface,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 500,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {k.foto ? <img src={k.foto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : k.ad.trim().charAt(0).toLocaleUpperCase()}
        </span>
      ))}
    </div>
  );
}

/** Kartın sağ üst köşesindeki küçük sayaç (geciken, bekleyen). */
export function KartRozeti({ renk, baslik, children }: { renk: string; baslik: string; children: ReactNode }) {
  return (
    <span className="pano-rozet" title={baslik} aria-label={baslik} style={{ color: renk }}>
      {children}
    </span>
  );
}

export function kisaTarih(deger: string | undefined): string | undefined {
  if (!deger) return undefined;
  const tarih = new Date(deger);
  return Number.isNaN(tarih.getTime()) ? undefined : tarih.toLocaleDateString(bicimDili(), { day: "numeric", month: "short" });
}

export function enYeniOnce<T extends { createdAt?: string }>(liste: T[]): T[] {
  return [...liste].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export interface SonOge {
  id: string;
  ad: string;
  sag?: string;
  renk?: string;
  /** Satıra basınca gidilen yer. */
  hedef?: string;
  /** Uygulama dışı adres (Drive'daki dosya gibi): yeni sekmede açılır. */
  disAdres?: string;
}

/** Sayının altındaki son kullanılanlar: kart "kaç tane"nin yanında "hangileri"ni de söylesin. */
export function SonListe({ ogeler, adet = 3 }: { ogeler: SonOge[]; adet?: number }) {
  const c = useThemeColors();
  if (ogeler.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 9, minWidth: 0 }}>
      {ogeler.slice(0, adet).map((o) => {
        const icerik = (
          <>
            <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: o.renk ?? c.accent }} />
            <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: c.textPrimary }}>{o.ad}</span>
            {o.sag && <span style={{ flexShrink: 0, fontSize: 12, whiteSpace: "nowrap" }}>{o.sag}</span>}
          </>
        );
        const stil = { display: "flex", alignItems: "center", gap: 7, minWidth: 0, fontSize: 13, color: c.textSecondary };
        // draggable=false: Sortable bunu kart bağlantısı sayıp taşımaya izin versin.
        if (o.disAdres) {
          return (
            <a key={o.id} href={o.disAdres} target="_blank" rel="noreferrer" draggable={false} className="pano-satir" style={stil}>
              {icerik}
            </a>
          );
        }
        if (o.hedef) {
          return (
            <Link key={o.id} to={o.hedef} draggable={false} className="pano-satir" style={stil}>
              {icerik}
            </Link>
          );
        }
        return (
          <div key={o.id} style={stil}>
            {icerik}
          </div>
        );
      })}
    </div>
  );
}

/** Fotoğraf öncelikli küçük kutucuklar: ad fotoğrafın üstünde, sığmayanlar "+N". */
const KAPAK_ADI = { position: "absolute", left: 0, right: 0, bottom: 0, padding: "16px 7px 5px", fontSize: 12, fontWeight: 500, color: "#fff", background: "linear-gradient(transparent, rgba(0,0,0,0.68))", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as const;

export function KapakIzgara({ ogeler, adet, tumu, enDar = 76 }: { ogeler: { id: string; ad: string; arka: string; hedef: string }[]; adet: number; tumu: string; /** Kutunun en dar genişliği (px). */ enDar?: number }) {
  const c = useThemeColors();
  const fazla = ogeler.length - adet;
  const gorunen = fazla > 0 ? ogeler.slice(0, adet - 1) : ogeler;
  const kutu = { position: "relative", aspectRatio: "3 / 2", borderRadius: 9, overflow: "hidden", textDecoration: "none", display: "block" } as const;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${enDar}px, 1fr))`, gap: 6 }}>
      {gorunen.map((o) => (
        <Link key={o.id} to={o.hedef} draggable={false} title={o.ad} style={{ ...kutu, background: o.arka }}>
          {/* Karartma: açık renkli kapakta da ad okunsun. */}
          <span style={KAPAK_ADI}>{o.ad}</span>
        </Link>
      ))}
      {fazla > 0 && (
        <Link to={tumu} draggable={false} style={{ ...kutu, background: c.background, display: "flex", alignItems: "center", justifyContent: "center", color: c.textSecondary, fontSize: 14 }}>
          +{fazla + 1}
        </Link>
      )}
    </div>
  );
}

/**
 * Yatay kayan kapaklar: hepsi orada, kart büyümeden gezilir. Kutu genişliği
 * 2,4'e bölünüyor; yarım görünen üçüncü kutu sağda daha fazlası olduğunu söyler.
 *
 * no-drag şart: yoksa şeridi kaydırmak kartı sürüklemeye dönüşüyordu.
 */
export function KapakSeridi({ ogeler }: { ogeler: { id: string; ad: string; arka: string; hedef: string }[] }) {
  return (
    <div className="no-drag pano-serit">
      {ogeler.map((o) => (
        <Link key={o.id} to={o.hedef} draggable={false} title={o.ad} className="pano-serit-kutu" style={{ background: o.arka }}>
          <span style={KAPAK_ADI}>{o.ad}</span>
        </Link>
      ))}
    </div>
  );
}

/** Dosya simgesi: türün rengi ve uzantısı; önizlemesi olmayan dosya da bir bakışta seçilsin. */
export function DosyaSimgesi({ uzanti, renk }: { uzanti: string; renk: string }) {
  return (
    <svg width="34" height="42" viewBox="0 0 34 42" aria-hidden="true">
      <path d="M4 0h18l12 12v26a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z" fill={renk} />
      <path d="M22 0l12 12H26a4 4 0 0 1-4-4z" fill="#000" opacity={0.22} />
      <text x="17" y="33" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff" fontFamily="inherit">{uzanti.slice(0, 4).toUpperCase()}</text>
    </svg>
  );
}

/**
 * Kartın üstündeki sekme çipleri: modülün sekmeleri (Müşteriler / Potansiyel…),
 * haber türü, iş süzgeci. Hepsi aynı görünsün diye tek yerde. Tek satır,
 * sığmayan yana kayar; no-drag: çipe basmak kartı sürüklemesin.
 */
export function SekmeCipleri<K extends string>({ sekmeler, secili, onSec, etiket }: { sekmeler: { id: K; ad: string; sayi?: number; baslik?: string }[]; secili: K; onSec: (id: K) => void; etiket: string }) {
  const c = useThemeColors();
  return (
    <div className="no-drag pano-cipler" role="tablist" aria-label={etiket}>
      {sekmeler.map((s) => {
        const secik = s.id === secili;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={secik}
            title={s.baslik ?? s.ad}
            onClick={() => onSec(s.id)}
            style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999, border: `1px solid ${secik ? c.accent : c.border}`, background: secik ? c.accent : "transparent", color: secik ? c.surface : c.textSecondary, fontSize: 12, whiteSpace: "nowrap", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {s.ad}
            {s.sayi !== undefined && <span style={{ opacity: 0.75 }}>{s.sayi}</span>}
          </button>
        );
      })}
    </div>
  );
}
