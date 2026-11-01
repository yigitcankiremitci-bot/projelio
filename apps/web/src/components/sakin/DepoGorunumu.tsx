// Depo modülü kayıtları: Excel düzeninde tablo + raf hazneleri (bkz. pages/Sakin.tsx).
import { useState } from "react";
import type { ModuleRecord } from "@projelio/shared";
import { stokDurumu } from "../../lib/sakin";
import { fmt } from "./ortak";

// ------------------------------------------------------------------ depo

const SUTUNLAR = ["A", "B", "C", "D", "E", "F"] as const;
type Sutun = (typeof SUTUNLAR)[number];

export function DepoGorunumu({ kayitlar, onKaydet }: { kayitlar: ModuleRecord[] | null; onKaydet: (r: ModuleRecord, miktar: number) => void }) {
  const [gorunum, setGorunum] = useState<"tablo" | "raf">("tablo");
  const [yalnizKritik, setYalnizKritik] = useState(false);
  const [secim, setSecim] = useState<{ r: number; c: Sutun } | null>(null);
  const [taslak, setTaslak] = useState<Record<string, string>>({});

  if (!kayitlar) return <div className="sk-empty">Yükleniyor…</div>;
  if (kayitlar.length === 0)
    return <div className="sk-empty">Bu şirkette Depo modülünde kayıt yok. Depo modülünü açıp kalem eklediğinde burada tablo ve raflar belirir.</div>;

  const satirlar = kayitlar.map((r, i) => {
    const miktar = Number(r.data.quantity) || 0;
    const kritik = Number(r.data.criticalLevel) || 0;
    return { r, i, rn: i + 2, ad: String(r.data.itemName ?? ""), kod: String(r.data.sku ?? ""), birim: String(r.data.unit ?? ""), miktar, kritik, durum: stokDurumu(miktar, kritik) };
  });
  const kritikSayisi = satirlar.filter((s) => s.durum === "crit").length;
  const gorunen = yalnizKritik ? satirlar.filter((s) => s.durum === "crit") : satirlar;
  const sonSatir = satirlar.length + 2;
  const toplamMiktar = satirlar.reduce((a, s) => a + s.miktar, 0);

  let hucreAdi = "";
  let formul = "";
  if (secim) {
    if (secim.r === -1) {
      hucreAdi = `${secim.c}${sonSatir}`;
      formul = `=TOPLA(C2:C${sonSatir - 1})`;
    } else {
      const s = satirlar[secim.r];
      hucreAdi = `${secim.c}${s.rn}`;
      formul = { A: s.ad, B: s.kod, C: String(s.miktar), D: s.birim, E: String(s.kritik), F: `=C${s.rn}-E${s.rn}` }[secim.c];
    }
  }
  const sinif = (i: number, c: Sutun, ek = "") => `sk-c${ek ? ` ${ek}` : ""}${secim && secim.r === i && secim.c === c ? " sel" : ""}`;

  const kaydet = (s: (typeof satirlar)[number]) => {
    const metin = taslak[s.r.id];
    if (metin === undefined) return;
    const v = parseInt(metin.replace(/[^0-9]/g, ""), 10);
    setTaslak((t) => {
      const k = { ...t };
      delete k[s.r.id];
      return k;
    });
    if (!Number.isNaN(v)) onKaydet(s.r, v);
  };

  const sirali = satirlar.slice().sort((a, b) => ({ crit: 0, warn: 1, ok: 2 })[a.durum] - ({ crit: 0, warn: 1, ok: 2 })[b.durum] || a.i - b.i);

  return (
    <section>
      <div className="sk-proj-head" style={{ alignItems: "flex-end" }}>
        <div>
          <p className="sk-eyebrow">Modül · Depo</p>
          <h1 className="sk-h1" style={{ margin: 0 }}>
            {satirlar.length} kalem{kritikSayisi ? `, ${kritikSayisi} tanesi kritik` : ", kritik yok"}
          </h1>
        </div>
        <div className="sk-seg" role="group" aria-label="Görünüm">
          <button type="button" className={gorunum === "raf" ? "sk-segb on" : "sk-segb"} onClick={() => setGorunum("raf")}>
            Raf
          </button>
          <button type="button" className={gorunum === "tablo" ? "sk-segb on" : "sk-segb"} onClick={() => setGorunum("tablo")}>
            Tablo
          </button>
        </div>
      </div>

      {gorunum === "tablo" ? (
        <>
          <div className="sk-tools">
            <div className="sk-namebox">{hucreAdi || "—"}</div>
            <div className="sk-fx">
              <i>fx</i>
              <span>{formul}</span>
            </div>
            <button type="button" className={yalnizKritik ? "sk-fbtn on" : "sk-fbtn"} onClick={() => setYalnizKritik((v) => !v)}>
              Yalnız kritikler
            </button>
          </div>
          <div className="sk-sheet-wrap">
            <table className="sk-sheet">
              <thead>
                <tr>
                  <th className="rn" />
                  {SUTUNLAR.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="hdr">
                  <th className="rn">1</th>
                  <td>Ürün / malzeme</td>
                  <td>Stok kodu</td>
                  <td className="sk-num">Miktar</td>
                  <td>Birim</td>
                  <td className="sk-num">Kritik seviye</td>
                  <td className="sk-num">Fark</td>
                </tr>
                {gorunen.map((s) => (
                  <tr key={s.r.id}>
                    <th className="rn">{s.rn}</th>
                    <td className={sinif(s.i, "A")} onClick={() => setSecim({ r: s.i, c: "A" })}>
                      {s.ad}
                    </td>
                    <td className={sinif(s.i, "B")} onClick={() => setSecim({ r: s.i, c: "B" })}>
                      {s.kod}
                    </td>
                    <td className={sinif(s.i, "C", `sk-num${s.durum === "ok" ? "" : ` ${s.durum}`}`)}>
                      <input
                        className="sk-cellin"
                        inputMode="numeric"
                        aria-label={`${s.ad} miktarı`}
                        value={taslak[s.r.id] ?? String(s.miktar)}
                        onFocus={() => setSecim({ r: s.i, c: "C" })}
                        onChange={(e) => setTaslak((t) => ({ ...t, [s.r.id]: e.target.value }))}
                        onBlur={() => kaydet(s)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          if (e.key === "Escape") {
                            setTaslak((t) => {
                              const k = { ...t };
                              delete k[s.r.id];
                              return k;
                            });
                          }
                        }}
                      />
                    </td>
                    <td className={sinif(s.i, "D")} onClick={() => setSecim({ r: s.i, c: "D" })}>
                      {s.birim}
                    </td>
                    <td className={sinif(s.i, "E", "sk-num")} onClick={() => setSecim({ r: s.i, c: "E" })}>
                      {s.kritik ? fmt(s.kritik) : "—"}
                    </td>
                    <td className={sinif(s.i, "F", "sk-num")} onClick={() => setSecim({ r: s.i, c: "F" })}>
                      {s.kritik ? fmt(s.miktar - s.kritik) : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="total">
                  <th className="rn">{sonSatir}</th>
                  <td>Toplam</td>
                  <td />
                  <td className={`sk-c sk-num${secim?.r === -1 ? " sel" : ""}`} onClick={() => setSecim({ r: -1, c: "C" })}>
                    {fmt(toplamMiktar)}
                  </td>
                  <td />
                  <td />
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="sk-hint">Miktar hücresine yeni sayı yazıp Enter'a bas: Depo modülüne kaydedilir, hücre rengi ve haritadaki ışık birlikte değişir.</p>
        </>
      ) : (
        <>
          <div className="sk-bins">
            {sirali.map((s) => {
              const h = s.kritik ? Math.max(3, Math.min(100, Math.round((s.miktar / (s.kritik * 2)) * 100))) : 100;
              return (
                <div key={s.r.id} className="sk-bin">
                  <div className="sk-tank" role="img" aria-label={`${s.ad}: ${s.miktar}${s.kritik ? `, kritik ${s.kritik}` : ""}`}>
                    <div className={`sk-fill ${s.durum}`} style={{ height: `${h}%` }} />
                    {s.kritik > 0 && (
                      <>
                        <div className="sk-kline" />
                        <span className="sk-kline-t">kritik {fmt(s.kritik)}</span>
                      </>
                    )}
                    <span className="sk-tank-n">{fmt(s.miktar)}</span>
                  </div>
                  <div className="sk-bin-name">{s.ad}</div>
                </div>
              );
            })}
          </div>
          <p className="sk-hint">Kesikli çizgi kritik seviye. Hazne çizginin altına inince kırmızıya döner.</p>
        </>
      )}
    </section>
  );
}
