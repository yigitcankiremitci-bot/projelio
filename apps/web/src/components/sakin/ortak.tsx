// Sakin Projelio ortak küçük parçaları.
import type { Durum } from "../../lib/sakin";

export const RENK: Record<Durum, string> = { ok: "#2E9A5B", warn: "#D9A21B", crit: "#C8372A" };

export function hataMetni(e: unknown): string {
  return e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu";
}

export function bas(ad?: string): string {
  if (!ad) return "?";
  const p = ad.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toLocaleUpperCase("tr");
}

export const fmt = (n: number) => n.toLocaleString("tr-TR");

// ------------------------------------------------------------------ küçük parçalar

export function Tik() {
  return <span className="sk-tick" aria-hidden="true" />;
}

export function Halka({ ad, alt, yuzde, renk }: { ad: string; alt: string; yuzde: number; renk: string }) {
  return (
    <div className="sk-ringrow">
      <div className="sk-ring" style={{ background: `conic-gradient(${renk} ${yuzde * 3.6}deg, #EEE7DD 0deg)` }}>
        <div className="sk-ring-in">%{yuzde}</div>
      </div>
      <div>
        <div className="sk-r-name">{ad}</div>
        <div className="sk-r-sub">{alt}</div>
      </div>
    </div>
  );
}

export function Rozet({ ad, kazanildi, sart }: { ad: string; kazanildi: boolean; sart: string }) {
  const stroke = kazanildi ? "#C0813F" : "#D3CCC0";
  return (
    <div className={kazanildi ? "sk-bdg got" : "sk-bdg"}>
      <svg viewBox="0 0 56 64" role="img" aria-label={`${ad} rozeti ${kazanildi ? "kazanıldı" : "kilitli"}`}>
        <polygon points="28,3 53,17 53,47 28,61 3,47 3,17" fill={kazanildi ? "#F6E8D6" : "#F4F1EC"} stroke={stroke} strokeWidth={2.5} />
        <polygon points="28,12 45,22 45,42 28,52 11,42 11,22" fill="none" stroke={stroke} strokeWidth={1.5} opacity={0.45} />
        <polyline points="19,32 25,38 37,26" fill="none" stroke={kazanildi ? "#8C5A28" : "#C9C1B4"} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="sk-b-name">{ad}</div>
      <div className="sk-b-sub">{kazanildi ? "Kazanıldı" : sart}</div>
    </div>
  );
}

