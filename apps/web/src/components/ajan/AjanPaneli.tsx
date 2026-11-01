import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { AjanBilgi, AjanDurumu, AjanIs, AjanKonu, AjanMesaj, AjanOneri, AjanRapor, AjanRaporOzeti, ThemeColors } from "@projelio/shared";
import { ajanApi } from "../../api/ajan";
import { ignoreAbort } from "../../api/client";
import { markdownBloklari, type SatirIci } from "../../lib/ajanMetin";
import { useThemeColors } from "../../theme/useThemeColors";
import Modal from "../Modal";

/**
 * Ajan paneli: ofisteki ajan robotuna tıklanınca açılır (migration 177).
 *
 * Ajanın kendisi kullanıcının Mac'inde çalışıyor; panel yalnızca kuyruğu ve
 * belleği gösterir. Mac uyurken her şey yine yazılabilir — iş sırada bekler,
 * Mac açılınca yapılır. Bunu her sekmede açıkça söylüyoruz: aksi hâlde
 * yanıtsız kalan mesaj "bozuk" sanılırdı.
 *
 * Panel açıkken 5 sn'de bir yoklar (ajanın yanıtı dakikalar sürebilir, soket
 * kanalı bu MVP için fazla).
 */

type Sekme = "sohbet" | "raporlar" | "ogrettiklerim" | "liste" | "mac";

const SEKMELER: { id: Sekme; ad: string }[] = [
  { id: "sohbet", ad: "Sohbet" },
  { id: "raporlar", ad: "Raporlar" },
  { id: "ogrettiklerim", ad: "Bellek" },
  { id: "liste", ad: "Öğrenme listesi" },
  { id: "mac", ad: "Mac bağlantısı" },
];

const YOKLAMA_MS = 5000;

export default function AjanPaneli({ onClose, onDurum }: { onClose: () => void; onDurum?: (d: AjanDurumu) => void }) {
  const c = useThemeColors();
  const [durum, setDurum] = useState<AjanDurumu | null>(null);
  const [sekme, setSekme] = useState<Sekme>("sohbet");
  const [tazele, setTazele] = useState(0);
  const onDurumRef = useRef(onDurum);
  onDurumRef.current = onDurum;

  useEffect(() => {
    const ac = new AbortController();
    const yokla = () =>
      ajanApi
        .durum(ac.signal)
        .then((d) => {
          setDurum(d);
          onDurumRef.current?.(d);
          setTazele((n) => n + 1);
        })
        .catch(() => undefined);
    yokla();
    const z = setInterval(yokla, YOKLAMA_MS);
    return () => {
      clearInterval(z);
      ac.abort();
    };
  }, []);

  // Kurulmamışsa ilk açılışta doğrudan kurulum sekmesine.
  const ilk = useRef(true);
  useEffect(() => {
    if (durum && ilk.current) {
      ilk.current = false;
      if (!durum.kurulu) setSekme("mac");
    }
  }, [durum]);

  const ad = durum?.ad ?? "Ajan";
  return (
    <Modal title={ad} subtitle={durumMetni(durum)} onClose={onClose} maxWidth={760}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {SEKMELER.map((s) => {
          const rozet = s.id === "raporlar" ? durum?.okunmamisRapor : s.id === "sohbet" ? durum?.bekleyenOneri : 0;
          return (
            <button key={s.id} type="button" onClick={() => setSekme(s.id)} style={sekmeStili(c, sekme === s.id)}>
              {s.ad}
              {!!rozet && <span style={rozetStili(c)}>{rozet}</span>}
            </button>
          );
        })}
      </div>
      {durum && !durum.izinli ? (
        <p style={{ color: c.textSecondary }}>Ajan şimdilik yalnızca izinli hesaplara açık.</p>
      ) : (
        <>
          {sekme === "sohbet" && <Sohbet c={c} durum={durum} tazele={tazele} />}
          {sekme === "raporlar" && <Raporlar c={c} durum={durum} tazele={tazele} />}
          {sekme === "ogrettiklerim" && <Bellek c={c} />}
          {sekme === "liste" && <Liste c={c} durum={durum} tazele={tazele} onDurum={setDurum} />}
          {sekme === "mac" && <Mac c={c} durum={durum} onDurum={setDurum} />}
        </>
      )}
    </Modal>
  );
}

function durumMetni(d: AjanDurumu | null): string {
  if (!d) return "Yükleniyor…";
  if (!d.izinli) return "Kapalı";
  if (!d.kurulu) return "Kurulum bekliyor: Mac bağlantısı sekmesine bak";
  if (!d.bagli) return `Uyuyor: Mac kapalı ya da uykuda${d.bekleyenIs ? ` · ${d.bekleyenIs} iş sırada` : ""}`;
  if (d.calisiyor) return d.not ?? "Çalışıyor";
  return d.not ? `Boşta · ${d.not}` : `Boşta${d.bekleyenIs ? ` · ${d.bekleyenIs} iş sırada` : ""}`;
}

// ------------------------------------------------------------------ Sohbet

function Sohbet({ c, durum, tazele }: { c: ThemeColors; durum: AjanDurumu | null; tazele: number }) {
  const [mesajlar, setMesajlar] = useState<AjanMesaj[]>([]);
  const [oneriler, setOneriler] = useState<AjanOneri[]>([]);
  const [yazi, setYazi] = useState("");
  const [hata, setHata] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const sonRef = useRef<HTMLDivElement>(null);
  const sayi = useRef(0);

  useEffect(() => {
    const ac = new AbortController();
    ajanApi.mesajlar(ac.signal).then(setMesajlar).catch(ignoreAbort);
    ajanApi.oneriler(ac.signal).then(setOneriler).catch(ignoreAbort);
    return () => ac.abort();
  }, [tazele]);

  useEffect(() => {
    // Yalnızca yeni mesaj gelince aşağı kaydır; yoklama her 5 sn'de kaydırmasın.
    if (mesajlar.length !== sayi.current) sonRef.current?.scrollIntoView({ block: "end" });
    sayi.current = mesajlar.length;
  }, [mesajlar]);

  const gonder = async () => {
    const metin = yazi.trim();
    if (!metin) return;
    setGonderiliyor(true);
    setHata(null);
    try {
      const m = await ajanApi.mesajGonder(metin);
      setMesajlar((l) => [...l, m]);
      setYazi("");
    } catch (e: any) {
      setHata(e?.message ?? "Gönderilemedi.");
    } finally {
      setGonderiliyor(false);
    }
  };

  const yanitla = async (o: AjanOneri, onay: boolean) => {
    try {
      await (onay ? ajanApi.onayla(o.id) : ajanApi.reddet(o.id));
      setOneriler((l) => l.filter((x) => x.id !== o.id));
    } catch (e: any) {
      setHata(e?.message ?? "Yanıtlanamadı.");
    }
  };

  const bekliyor = mesajlar.length > 0 && mesajlar[mesajlar.length - 1].rol === "kullanici";
  return (
    <div>
      {oneriler.map((o) => (
        <div key={o.id} style={{ ...kart(c), borderColor: c.accent, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <small style={{ color: c.textSecondary }}>Yapılacaklarına eklemek istiyor</small>
            <div style={{ fontWeight: 600 }}>{o.veri.baslik}</div>
            {(o.veri.aciklama || o.veri.bitis) && (
              <small style={{ color: c.textSecondary }}>
                {o.veri.aciklama}
                {o.veri.bitis ? ` · ${o.veri.bitis}` : ""}
              </small>
            )}
          </div>
          <button type="button" style={dugme(c, true)} onClick={() => yanitla(o, true)}>
            Ekle
          </button>
          <button type="button" style={dugme(c)} onClick={() => yanitla(o, false)}>
            Hayır
          </button>
        </div>
      ))}
      <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "4px 2px" }}>
        {!mesajlar.length && (
          <p style={{ color: c.textSecondary, margin: "8px 0" }}>
            Merhaba de, bir şey öğret ("raporlarımı madde madde yaz, unutma") ya da bir iş iste. Uzun araştırmalar için Raporlar sekmesindeki "Araştır"ı kullan.
          </p>
        )}
        {mesajlar.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.rol === "kullanici" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              background: m.rol === "kullanici" ? c.primary : c.acilanAlan,
              color: m.rol === "kullanici" ? c.onPrimary : c.textPrimary,
              borderRadius: 12,
              padding: "8px 12px",
              whiteSpace: "pre-wrap",
              lineHeight: 1.45,
            }}
          >
            {m.rol === "ajan" ? <Markdown c={c} metin={m.metin} /> : m.metin}
          </div>
        ))}
        {bekliyor && (
          <small style={{ color: c.textSecondary }}>
            {durum?.bagli ? "Yazıyor… (Mac'te çalışan model birkaç saniye ile birkaç dakika arası sürebilir)" : "Mac uyuyor. Açılınca yanıtlayacak."}
          </small>
        )}
        <div ref={sonRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void gonder();
        }}
        style={{ display: "flex", gap: 8, marginTop: 10 }}
      >
        <input value={yazi} onChange={(e) => setYazi(e.target.value)} placeholder="Mesaj yaz…" maxLength={4000} style={{ ...giris(c), flex: 1 }} />
        <button type="submit" disabled={gonderiliyor || !yazi.trim()} style={dugme(c, true)}>
          Gönder
        </button>
      </form>
      {hata && <Hata c={c} metin={hata} />}
    </div>
  );
}

// ------------------------------------------------------------------ Raporlar

function Raporlar({ c, durum, tazele }: { c: ThemeColors; durum: AjanDurumu | null; tazele: number }) {
  const [raporlar, setRaporlar] = useState<AjanRaporOzeti[]>([]);
  const [isler, setIsler] = useState<AjanIs[]>([]);
  const [acik, setAcik] = useState<AjanRapor | null>(null);
  const [konu, setKonu] = useState("");
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    ajanApi.raporlar(ac.signal).then(setRaporlar).catch(ignoreAbort);
    ajanApi.isler(ac.signal).then(setIsler).catch(ignoreAbort);
    return () => ac.abort();
  }, [tazele]);

  const ac = async (id: string) => {
    try {
      const r = await ajanApi.rapor(id);
      setAcik(r);
      setRaporlar((l) => l.map((x) => (x.id === id ? { ...x, okundu: true } : x)));
    } catch (e: any) {
      setHata(e?.message ?? "Rapor açılamadı.");
    }
  };

  const arastir = async () => {
    if (!konu.trim()) return;
    setHata(null);
    try {
      const is = await ajanApi.arastir(konu.trim());
      setIsler((l) => [is, ...l]);
      setKonu("");
    } catch (e: any) {
      setHata(e?.message ?? "İş açılamadı.");
    }
  };

  if (acik)
    return (
      <div>
        <button type="button" style={dugme(c)} onClick={() => setAcik(null)}>
          ← Raporlar
        </button>
        <h3 style={{ margin: "12px 0 4px" }}>{acik.baslik}</h3>
        <small style={{ color: c.textSecondary }}>{tarih(acik.createdAt)}</small>
        {acik.ozet && <p style={{ fontStyle: "italic", color: c.textSecondary }}>{acik.ozet}</p>}
        <div style={{ lineHeight: 1.55 }}>
          <Markdown c={c} metin={acik.icerik} />
        </div>
        {!!acik.kaynaklar.length && (
          <>
            <h4 style={{ marginBottom: 4 }}>Kaynaklar</h4>
            <ol style={{ marginTop: 0, paddingLeft: 20 }}>
              {acik.kaynaklar.map((k) => (
                <li key={k.adres}>
                  <a href={k.adres} target="_blank" rel="noopener noreferrer nofollow" style={{ color: c.accentDark }}>
                    {k.baslik}
                  </a>
                </li>
              ))}
            </ol>
          </>
        )}
        <button
          type="button"
          style={{ ...dugme(c), marginTop: 12 }}
          onClick={async () => {
            if (!window.confirm("Rapor silinsin mi?")) return;
            await ajanApi.raporSil(acik.id).catch(() => undefined);
            setRaporlar((l) => l.filter((x) => x.id !== acik.id));
            setAcik(null);
          }}
        >
          Raporu sil
        </button>
      </div>
    );

  const sirada = isler.filter((i) => i.durum === "bekliyor" || i.durum === "calisiyor");
  const hatali = isler.filter((i) => i.durum === "hata" && i.tur === "arastirma").slice(0, 3);
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void arastir();
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input value={konu} onChange={(e) => setKonu(e.target.value)} placeholder="Neyi araştırayım? Ör. Türkiye'de ajans yazılımlarının fiyatları" maxLength={1000} style={{ ...giris(c), flex: 1 }} />
        <button type="submit" disabled={!konu.trim()} style={dugme(c, true)}>
          Araştır
        </button>
      </form>
      {hata && <Hata c={c} metin={hata} />}
      {!!sirada.length && (
        <div style={{ marginTop: 12 }}>
          {sirada.map((i) => (
            <div key={i.id} style={{ ...kart(c), display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ flex: 1 }}>
                <small style={{ color: c.textSecondary }}>{i.durum === "calisiyor" ? "Üzerinde çalışıyor" : durum?.bagli ? "Sırada" : "Sırada (Mac uyuyor)"} · {IS_ADI[i.tur]}</small>
                <div>{i.girdi.split("\n")[0]}</div>
              </span>
              {i.durum === "bekliyor" && (
                <button
                  type="button"
                  style={dugme(c)}
                  onClick={async () => {
                    await ajanApi.isIptal(i.id).catch(() => undefined);
                    setIsler((l) => l.filter((x) => x.id !== i.id));
                  }}
                >
                  Vazgeç
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {hatali.map((i) => (
        <div key={i.id} style={{ ...kart(c), color: c.textSecondary }}>
          <small>Yapılamadı: {i.girdi.split("\n")[0]} · {i.hata}</small>
        </div>
      ))}
      <div style={{ marginTop: 12 }}>
        {!raporlar.length && <p style={{ color: c.textSecondary }}>Henüz rapor yok.</p>}
        {raporlar.map((r) => (
          <button key={r.id} type="button" onClick={() => ac(r.id)} style={{ ...kart(c), display: "block", width: "100%", textAlign: "left", cursor: "pointer", color: c.textPrimary }}>
            <div style={{ fontWeight: r.okundu ? 500 : 700 }}>
              {!r.okundu && <span style={{ color: c.accent }}>● </span>}
              {r.baslik}
            </div>
            <small style={{ color: c.textSecondary }}>{tarih(r.createdAt)}{r.ozet ? ` · ${r.ozet.slice(0, 140)}` : ""}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

const IS_ADI: Record<AjanIs["tur"], string> = { sohbet: "Sohbet", arastirma: "Araştırma", ogrenme: "Öğrenme", liste: "Liste hazırlama" };

// ------------------------------------------------------------------ Bellek

function Bellek({ c }: { c: ThemeColors }) {
  const [bilgiler, setBilgiler] = useState<AjanBilgi[]>([]);
  const [filtre, setFiltre] = useState<"ogretilen" | "ogrenilen">("ogretilen");
  const [baslik, setBaslik] = useState("");
  const [icerik, setIcerik] = useState("");
  const [hata, setHata] = useState<string | null>(null);

  const yukle = useCallback((signal?: AbortSignal) => ajanApi.bilgiler(signal).then(setBilgiler).catch(ignoreAbort), []);
  useEffect(() => {
    const ac = new AbortController();
    void yukle(ac.signal);
    return () => ac.abort();
  }, [yukle]);

  const ogret = async () => {
    setHata(null);
    try {
      const b = await ajanApi.ogret({ baslik: baslik.trim() || undefined, icerik: icerik.trim() });
      setBilgiler((l) => [b, ...l]);
      setBaslik("");
      setIcerik("");
      setFiltre("ogretilen");
    } catch (e: any) {
      setHata(e?.message ?? "Kaydedilemedi.");
    }
  };

  const gorunen = bilgiler.filter((b) => b.tur === filtre);
  return (
    <div>
      <p style={{ color: c.textSecondary, marginTop: 0 }}>
        Öğrettiklerin her işte ajana kural olarak gider: nasıl yazacağı, neye önem vereceği, işin hakkında bilmesi gerekenler.
      </p>
      <input value={baslik} onChange={(e) => setBaslik(e.target.value)} placeholder="Başlık (isteğe bağlı)" maxLength={200} style={{ ...giris(c), width: "100%", marginBottom: 6 }} />
      <textarea value={icerik} onChange={(e) => setIcerik(e.target.value)} placeholder="Ör. Projelio küçük ajanslar ve serbest çalışanlar için bir iş yönetimi uygulaması. Rakiplerimiz: …" rows={3} maxLength={8000} style={{ ...giris(c), width: "100%", resize: "vertical" }} />
      <button type="button" disabled={!icerik.trim()} style={{ ...dugme(c, true), marginTop: 6 }} onClick={ogret}>
        Öğret
      </button>
      {hata && <Hata c={c} metin={hata} />}
      <div style={{ display: "flex", gap: 6, margin: "16px 0 8px" }}>
        <button type="button" style={sekmeStili(c, filtre === "ogretilen")} onClick={() => setFiltre("ogretilen")}>
          Öğrettiklerim ({bilgiler.filter((b) => b.tur === "ogretilen").length})
        </button>
        <button type="button" style={sekmeStili(c, filtre === "ogrenilen")} onClick={() => setFiltre("ogrenilen")}>
          Kendi öğrendikleri ({bilgiler.filter((b) => b.tur === "ogrenilen").length})
        </button>
      </div>
      {!gorunen.length && <p style={{ color: c.textSecondary }}>Burada henüz bir şey yok.</p>}
      {gorunen.map((b) => (
        <div key={b.id} style={kart(c)}>
          <div style={{ display: "flex", gap: 8 }}>
            <b style={{ flex: 1 }}>{b.baslik}</b>
            <button
              type="button"
              style={{ ...dugme(c), padding: "2px 8px" }}
              onClick={async () => {
                await ajanApi.bilgiSil(b.id).catch(() => undefined);
                setBilgiler((l) => l.filter((x) => x.id !== b.id));
              }}
              aria-label="Sil"
            >
              Sil
            </button>
          </div>
          <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{b.icerik}</div>
          {!!b.kaynaklar.length && (
            <small style={{ color: c.textSecondary }}>
              {b.kaynaklar.map((k, i) => (
                <span key={k.adres}>
                  {i ? " · " : ""}
                  <a href={k.adres} target="_blank" rel="noopener noreferrer nofollow" style={{ color: c.accentDark }}>
                    {k.baslik}
                  </a>
                </span>
              ))}
            </small>
          )}
          <div>
            <small style={{ color: c.textSecondary }}>{tarih(b.createdAt)}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Öğrenme listesi

const KONU_DURUMU: Record<AjanKonu["durum"], string> = { bekliyor: "Sırada", ogreniliyor: "Öğreniyor", ogrenildi: "Öğrendi", atlandi: "Atlandı" };

function Liste({ c, durum, tazele, onDurum }: { c: ThemeColors; durum: AjanDurumu | null; tazele: number; onDurum: (d: AjanDurumu) => void }) {
  const [konular, setKonular] = useState<AjanKonu[]>([]);
  const [konu, setKonu] = useState("");
  const [hata, setHata] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    ajanApi.konular(ac.signal).then(setKonular).catch(ignoreAbort);
    return () => ac.abort();
  }, [tazele]);

  const guncelle = async (k: AjanKonu, g: { durum?: AjanKonu["durum"]; oncelik?: number }) => {
    try {
      const yeni = await ajanApi.konuGuncelle(k.id, g);
      setKonular((l) => l.map((x) => (x.id === k.id ? yeni : x)));
    } catch (e: any) {
      setHata(e?.message ?? "Güncellenemedi.");
    }
  };

  const ekle = async () => {
    setHata(null);
    try {
      const k = await ajanApi.konuEkle({ konu: konu.trim() });
      setKonular((l) => [k, ...l]);
      setKonu("");
    } catch (e: any) {
      setHata(e?.message ?? "Eklenemedi.");
    }
  };

  return (
    <div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <input
          type="checkbox"
          checked={!!durum?.ogrenmeAcik}
          onChange={async (e) => onDurum(await ajanApi.ayarlar({ ogrenmeAcik: e.target.checked }))}
        />
        Boş kaldığında bu listeden öğrenmeye devam etsin (en çok 20 dakikada bir konu)
      </label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ekle();
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <input value={konu} onChange={(e) => setKonu(e.target.value)} placeholder="Öğrenmesini istediğin konu" maxLength={200} style={{ ...giris(c), flex: 1 }} />
        <button type="submit" disabled={!konu.trim()} style={dugme(c, true)}>
          Ekle
        </button>
      </form>
      {hata && <Hata c={c} metin={hata} />}
      <p style={{ color: c.textSecondary, fontSize: 13 }}>Liste boşalınca ajan, öğrettiklerine bakıp kendine yeni konular ekler.</p>
      {konular.map((k) => (
        <div key={k.id} style={{ ...kart(c), display: "flex", gap: 8, alignItems: "center", opacity: k.durum === "atlandi" ? 0.6 : 1 }}>
          <div style={{ flex: 1 }}>
            <div>{k.konu}</div>
            <small style={{ color: c.textSecondary }}>
              {KONU_DURUMU[k.durum]} · {k.oneren === "ajan" ? "ajan ekledi" : "sen ekledin"}
              {k.neden ? ` · ${k.neden}` : ""}
            </small>
          </div>
          {k.durum === "bekliyor" && (
            <button type="button" style={dugme(c)} title="Öne al" onClick={() => guncelle(k, { oncelik: k.oncelik + 1 })}>
              Öne al
            </button>
          )}
          {k.durum === "bekliyor" ? (
            <button type="button" style={dugme(c)} onClick={() => guncelle(k, { durum: "atlandi" })}>
              Atla
            </button>
          ) : k.durum !== "ogreniliyor" ? (
            <button type="button" style={dugme(c)} onClick={() => guncelle(k, { durum: "bekliyor" })}>
              Yeniden
            </button>
          ) : null}
          <button
            type="button"
            style={dugme(c)}
            onClick={async () => {
              await ajanApi.konuSil(k.id).catch(() => undefined);
              setKonular((l) => l.filter((x) => x.id !== k.id));
            }}
          >
            Sil
          </button>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Mac bağlantısı

function Mac({ c, durum, onDurum }: { c: ThemeColors; durum: AjanDurumu | null; onDurum: (d: AjanDurumu) => void }) {
  const [anahtar, setAnahtar] = useState<string | null>(null);
  const [ad, setAd] = useState(durum?.ad ?? "");
  const [hata, setHata] = useState<string | null>(null);
  useEffect(() => {
    if (durum && !ad) setAd(durum.ad);
  }, [durum, ad]);

  const uret = async () => {
    if (durum?.kurulu && !window.confirm("Yeni anahtar üretilince Mac'teki eski anahtar çalışmayı bırakır. Devam edilsin mi?")) return;
    setHata(null);
    try {
      setAnahtar((await ajanApi.anahtarUret()).anahtar);
    } catch (e: any) {
      setHata(e?.message ?? "Anahtar üretilemedi.");
    }
  };

  const komut = anahtar ? `bash ajan/kur.sh ${anahtar}` : "";
  return (
    <div>
      <div style={kart(c)}>
        <div>
          Durum: <b>{durumMetni(durum)}</b>
        </div>
        {durum?.model && <small style={{ color: c.textSecondary }}>Model: {durum.model}</small>}
        {durum?.sonNabiz && (
          <div>
            <small style={{ color: c.textSecondary }}>Son görülme: {tarih(durum.sonNabiz)}</small>
          </div>
        )}
      </div>
      <h4 style={{ marginBottom: 6 }}>Kurulum</h4>
      <ol style={{ paddingLeft: 20, marginTop: 0, lineHeight: 1.6 }}>
        <li>
          Mac'e Ollama'yı kur ve modeli indir: <code>brew install ollama && brew services start ollama && ollama pull qwen3:8b</code>
        </li>
        <li>Aşağıdan anahtar üret. Anahtar yalnızca bir kez gösterilir.</li>
        <li>
          Projelio klasöründe Terminal'de komutu çalıştır. Ajan oturum açınca kendiliğinden başlar, günlüğü <code>~/.projelio-ajan/ajan.log</code>'da.
        </li>
      </ol>
      <button type="button" style={dugme(c, true)} onClick={uret}>
        {durum?.kurulu ? "Yeni anahtar üret" : "Anahtar üret"}
      </button>
      {anahtar && (
        <div style={{ ...kart(c), borderColor: c.accent, marginTop: 10 }}>
          <small style={{ color: c.textSecondary }}>Bu komutu şimdi kopyala; anahtar bir daha gösterilmez:</small>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "6px 0", userSelect: "all" }}>{komut}</pre>
          <button type="button" style={dugme(c)} onClick={() => navigator.clipboard?.writeText(komut).catch(() => undefined)}>
            Kopyala
          </button>
        </div>
      )}
      {hata && <Hata c={c} metin={hata} />}
      <h4 style={{ marginBottom: 6 }}>Adı</h4>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={ad} onChange={(e) => setAd(e.target.value)} maxLength={40} style={{ ...giris(c), flex: 1 }} />
        <button
          type="button"
          style={dugme(c)}
          disabled={!ad.trim() || ad.trim() === durum?.ad}
          onClick={async () => {
            try {
              onDurum(await ajanApi.ayarlar({ ad: ad.trim() }));
            } catch (e: any) {
              setHata(e?.message ?? "Kaydedilemedi.");
            }
          }}
        >
          Kaydet
        </button>
      </div>
      <p style={{ color: c.textSecondary, fontSize: 13 }}>
        Model ve öğrettiklerin Mac'inde işlenir. Projelio'da yalnızca sohbet, bellek, öğrenme listesi ve raporlar durur. Ajan Projelio'da kendi başına
        bir şey değiştirmez; yapılacak gibi önerileri senin onayını bekler.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ ortak

function Markdown({ c, metin }: { c: ThemeColors; metin: string }) {
  const parca = (p: SatirIci, i: number): ReactNode =>
    p.tur === "kalin" ? (
      <b key={i}>{p.metin}</b>
    ) : p.tur === "baglanti" ? (
      <a key={i} href={p.adres} target="_blank" rel="noopener noreferrer nofollow" style={{ color: c.accentDark }}>
        {p.metin}
      </a>
    ) : (
      <span key={i}>{p.metin}</span>
    );
  return (
    <div style={{ whiteSpace: "normal" }}>
      {markdownBloklari(metin).map((b, i) =>
        b.tur === "baslik" ? (
          <div key={i} style={{ fontWeight: 700, fontSize: b.seviye === 1 ? 18 : b.seviye === 2 ? 16 : 15, margin: "12px 0 4px" }}>
            {b.parcalar.map(parca)}
          </div>
        ) : b.tur === "liste" ? (
          b.sirali ? (
            <ol key={i} style={{ margin: "4px 0", paddingLeft: 22 }}>
              {b.maddeler.map((m, j) => (
                <li key={j}>{m.map(parca)}</li>
              ))}
            </ol>
          ) : (
            <ul key={i} style={{ margin: "4px 0", paddingLeft: 22 }}>
              {b.maddeler.map((m, j) => (
                <li key={j}>{m.map(parca)}</li>
              ))}
            </ul>
          )
        ) : (
          <p key={i} style={{ margin: "4px 0" }}>
            {b.parcalar.map(parca)}
          </p>
        )
      )}
    </div>
  );
}

function Hata({ c, metin }: { c: ThemeColors; metin: string }) {
  return <p style={{ color: c.danger, margin: "6px 0" }}>{metin}</p>;
}

function tarih(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function kart(c: ThemeColors): CSSProperties {
  return { border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8, background: c.surface };
}

function giris(c: ThemeColors): CSSProperties {
  return { border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 10px", background: c.surface, color: c.textPrimary, font: "inherit", boxSizing: "border-box" };
}

function dugme(c: ThemeColors, birincil = false): CSSProperties {
  return {
    border: `1px solid ${birincil ? c.primary : c.border}`,
    background: birincil ? c.primary : c.surface,
    color: birincil ? c.onPrimary : c.textPrimary,
    borderRadius: 8,
    padding: "7px 12px",
    font: "inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

function sekmeStili(c: ThemeColors, secili: boolean): CSSProperties {
  return {
    border: `1px solid ${secili ? c.primary : c.border}`,
    background: secili ? c.primary : "transparent",
    color: secili ? c.onPrimary : c.textPrimary,
    borderRadius: 999,
    padding: "5px 12px",
    font: "inherit",
    fontSize: 14,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

function rozetStili(c: ThemeColors): CSSProperties {
  return { background: c.accent, color: c.onPrimary, borderRadius: 999, fontSize: 11, padding: "0 6px", lineHeight: "16px", fontWeight: 700 };
}
