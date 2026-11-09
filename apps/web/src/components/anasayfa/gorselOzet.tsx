import type { ReactNode } from "react";
import { accentPresets } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";

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
