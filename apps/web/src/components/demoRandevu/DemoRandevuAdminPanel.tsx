import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  DEMO_DURUM_ETIKETI,
  type DemoAyarlari,
  type DemoCalismaAraligi,
  type DemoMusaitlik,
  type DemoRandevuYonetici,
  type DemoSunucu,
} from "@projelio/shared";
import { demoRandevuAdminApi } from "../../api/demoRandevu";
import { useThemeColors } from "../../theme/useThemeColors";
import { useLocale, useT } from "../../lib/i18n";
import TabBar from "../TabBar";
import Modal from "../Modal";
import SlotSecici from "./SlotSecici";
import { gunAnahtari, uzunTarih } from "./demoBicim";
import { anaDugme, girdi, ikincilDugme } from "./stiller";

type Bolum = "randevular" | "saatler" | "sunucular";

/**
 * Admin > Demo randevuları.
 *
 * Üç bölüm: gelen randevular (atama, bağlantı, sonuç), çalışma saatleri
 * (blokların üretildiği çerçeve) ve sunucular (görev alabilen moderatörler).
 * Kurallar sunucuda (DemoRandevuService); burası yalnızca form.
 */
export default function DemoRandevuAdminPanel() {
  const t = useT();
  const [bolum, setBolum] = useState<Bolum>("randevular");
  const [sunucular, setSunucular] = useState<DemoSunucu[]>([]);

  useEffect(() => {
    demoRandevuAdminApi.sunucular().then(setSunucular).catch(() => undefined);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <TabBar
        tabs={[
          { key: "randevular", label: t("Randevular") },
          { key: "saatler", label: t("Çalışma saatleri") },
          { key: "sunucular", label: t("Sunucular") },
        ]}
        active={bolum}
        onChange={(k) => setBolum(k as Bolum)}
      />
      {bolum === "randevular" && <Randevular sunucular={sunucular} />}
      {bolum === "saatler" && <Saatler />}
      {bolum === "sunucular" && <Sunucular liste={sunucular} onDegisti={setSunucular} />}
    </div>
  );
}

// ───────────────────────────────────────────── Randevular

function Randevular({ sunucular }: { sunucular: DemoSunucu[] }) {
  const c = useThemeColors();
  const t = useT();
  const { locale } = useLocale();
  const [kapsam, setKapsam] = useState<"yaklasan" | "gecmis">("yaklasan");
  const [liste, setListe] = useState<DemoRandevuYonetici[] | null>(null);
  const [hata, setHata] = useState("");

  const yukle = () => {
    setListe(null);
    demoRandevuAdminApi
      .liste(kapsam)
      .then(setListe)
      .catch((e) => {
        setHata(e instanceof Error ? e.message : t("Yüklenemedi."));
        setListe([]);
      });
  };
  useEffect(yukle, [kapsam]);

  // Güne göre öbekle: yönetici "bugün kimler var" sorusuna bakıyor.
  const gunler = useMemo(() => {
    const harita = new Map<string, DemoRandevuYonetici[]>();
    for (const r of liste ?? []) {
      const k = gunAnahtari(r.baslangic, r.saatDilimi);
      harita.set(k, [...(harita.get(k) ?? []), r]);
    }
    return [...harita.values()];
  }, [liste]);

  const degistir = (yeni: DemoRandevuYonetici) => setListe((l) => (l ?? []).map((r) => (r.id === yeni.id ? { ...r, ...yeni } : r)));
  const cikar = (id: string) => setListe((l) => (l ?? []).filter((r) => r.id !== id));
  const bekleyen = (liste ?? []).filter((r) => r.durum === "bekliyor").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {(["yaklasan", "gecmis"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKapsam(k)}
            style={{ ...ikincilDugme(c), background: kapsam === k ? c.primary : c.surface, color: kapsam === k ? c.onPrimary : c.textPrimary }}
          >
            {k === "yaklasan" ? t("Yaklaşan") : t("Geçmiş ve iptal")}
          </button>
        ))}
        {kapsam === "yaklasan" && bekleyen > 0 && (
          <span style={{ fontSize: 13, color: c.warning, fontWeight: 500 }}>{t("{n} randevu sunucu bekliyor", { n: bekleyen })}</span>
        )}
        <a href="/demo-randevu" target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", fontSize: 13, color: c.primary }}>
          {t("Herkese açık sayfayı aç")} ↗
        </a>
      </div>

      {hata && <p style={{ margin: 0, color: c.danger, fontSize: 14 }}>{hata}</p>}
      {liste === null && <p style={{ margin: 0, color: c.textSecondary }}>{t("Yükleniyor…")}</p>}
      {liste?.length === 0 && !hata && (
        <p style={{ margin: 0, color: c.textSecondary, fontSize: 14 }}>
          {kapsam === "yaklasan" ? t("Yaklaşan demo randevusu yok.") : t("Henüz geçmiş randevu yok.")}
        </p>
      )}

      {gunler.map((grup) => (
        <div key={grup[0].id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: c.textSecondary }}>
            {new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "tr-TR", {
              timeZone: grup[0].saatDilimi,
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(new Date(grup[0].baslangic))}
          </div>
          {grup.map((r) => (
            <RandevuSatiri key={r.id} r={r} sunucular={sunucular} onDegisti={degistir} onKapandi={() => (kapsam === "yaklasan" ? cikar(r.id) : yukle())} />
          ))}
        </div>
      ))}
    </div>
  );
}

function RandevuSatiri({
  r,
  sunucular,
  onDegisti,
  onKapandi,
}: {
  r: DemoRandevuYonetici;
  sunucular: DemoSunucu[];
  onDegisti: (r: DemoRandevuYonetici) => void;
  onKapandi: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const { locale } = useLocale();
  const [link, setLink] = useState(r.toplantiLinki ?? "");
  const [icNot, setIcNot] = useState(r.icNot ?? "");
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");
  const [tasi, setTasi] = useState(false);

  useEffect(() => setLink(r.toplantiLinki ?? ""), [r.toplantiLinki]);

  const etkin = r.durum === "bekliyor" || r.durum === "planlandi";
  const bitti = Date.parse(r.bitis) < Date.now();

  const kaydet = async (yama: Parameters<typeof demoRandevuAdminApi.guncelle>[1]) => {
    setCalisiyor(true);
    setHata("");
    try {
      const yeni = await demoRandevuAdminApi.guncelle(r.id, yama);
      onDegisti(yeni);
      if (yama.durum) onKapandi();
    } catch (e) {
      setHata(e instanceof Error ? e.message : t("Kaydedilemedi."));
    } finally {
      setCalisiyor(false);
    }
  };

  const iptalEt = async () => {
    const neden = window.prompt(t("İptal nedeni (ekip için not, isteğe bağlı)")) ;
    if (neden === null) return;
    setCalisiyor(true);
    try {
      await demoRandevuAdminApi.iptal(r.id, neden || undefined);
      onKapandi();
    } catch (e) {
      setHata(e instanceof Error ? e.message : t("İptal edilemedi."));
    } finally {
      setCalisiyor(false);
    }
  };

  const durumRengi = r.durum === "bekliyor" ? c.warning : r.durum === "planlandi" ? c.success : r.durum === "iptal" ? c.danger : c.textSecondary;

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, padding: 14, background: c.surface, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: c.textPrimary }}>{uzunTarih(r.baslangic, r.bitis, r.saatDilimi, locale)}</div>
          <div style={{ fontSize: 14, color: c.textPrimary, marginTop: 4 }}>
            {r.ad}
            {r.sirket ? ` · ${r.sirket}` : ""}
            {r.ekipBuyuklugu ? ` · ${t(r.ekipBuyuklugu)}` : ""}
          </div>
          <div style={{ fontSize: 13, color: c.textSecondary, marginTop: 2 }}>
            <a href={`mailto:${r.eposta}`} style={{ color: c.textSecondary }}>{r.eposta}</a>
            {r.telefon ? (
              <>
                {" · "}
                <a href={`tel:${r.telefon.replace(/[^\d+]/g, "")}`} style={{ color: c.textSecondary }}>{r.telefon}</a>
              </>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: durumRengi }}>{t(DEMO_DURUM_ETIKETI[r.durum])}</span>
          <span style={{ fontSize: 12, color: r.hesabiVar ? c.success : c.warning }}>
            {r.hesabiVar ? t("Hesabı var") : t("Henüz hesap açmadı")}
          </span>
          <span style={{ fontSize: 12, color: c.textSecondary }}>{r.kaynak === "ayarlar" ? t("Ayarlar'dan") : t("Herkese açık sayfadan")}</span>
        </div>
      </div>

      {r.not && (
        <div style={{ fontSize: 13, color: c.textPrimary, background: c.background, borderRadius: 8, padding: "8px 10px", whiteSpace: "pre-wrap" }}>{r.not}</div>
      )}
      {r.iptalNedeni && <div style={{ fontSize: 13, color: c.danger }}>{t("İptal nedeni")}: {r.iptalNedeni}</div>}

      {etkin && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Görüşmeyi yapacak kişi")}</span>
            <select value={r.sunucuId ?? ""} disabled={calisiyor} onChange={(e) => void kaydet({ sunucuId: e.target.value || null })} style={girdi(c)}>
              <option value="">{t("Atanmadı")}</option>
              {sunucular.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.ad}
                  {s.yonetici ? ` (${t("yönetici")})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Görüşme bağlantısı")}</span>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onBlur={() => link.trim() !== (r.toplantiLinki ?? "") && void kaydet({ toplantiLinki: link.trim() || null })}
              placeholder="https://meet.google.com/…"
              style={girdi(c)}
            />
          </label>
        </div>
      )}

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 12, color: c.textSecondary }}>{t("İç not (katılımcı görmez)")}</span>
        <textarea
          value={icNot}
          onChange={(e) => setIcNot(e.target.value)}
          onBlur={() => icNot !== (r.icNot ?? "") && void kaydet({ icNot })}
          rows={2}
          style={{ ...girdi(c), resize: "vertical", fontFamily: "inherit", fontSize: 14 }}
        />
      </label>

      {etkin && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {r.toplantiLinki && !bitti && (
            <a href={r.toplantiLinki} target="_blank" rel="noopener noreferrer" style={{ ...ikincilDugme(c), textDecoration: "none" }}>
              {t("Görüşmeye katıl")}
            </a>
          )}
          {bitti ? (
            <>
              <button type="button" disabled={calisiyor} onClick={() => void kaydet({ durum: "tamamlandi" })} style={ikincilDugme(c)}>
                {t("Tamamlandı")}
              </button>
              <button type="button" disabled={calisiyor} onClick={() => void kaydet({ durum: "gelmedi" })} style={ikincilDugme(c)}>
                {t("Katılmadı")}
              </button>
            </>
          ) : (
            <button type="button" disabled={calisiyor} onClick={() => setTasi(true)} style={ikincilDugme(c)}>
              {t("Saati değiştir")}
            </button>
          )}
          <button type="button" disabled={calisiyor} onClick={() => void iptalEt()} style={{ ...ikincilDugme(c), color: c.danger }}>
            {t("İptal et")}
          </button>
        </div>
      )}
      {hata && <p style={{ margin: 0, fontSize: 13, color: c.danger }}>{hata}</p>}

      {tasi && (
        <TasiPenceresi
          r={r}
          onClose={() => setTasi(false)}
          onTasindi={(yeni) => {
            onDegisti({ ...r, baslangic: yeni.baslangic, bitis: yeni.bitis });
            setTasi(false);
          }}
        />
      )}
    </div>
  );
}

function TasiPenceresi({
  r,
  onClose,
  onTasindi,
}: {
  r: DemoRandevuYonetici;
  onClose: () => void;
  onTasindi: (yeni: { baslangic: string; bitis: string }) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [musaitlik, setMusaitlik] = useState<DemoMusaitlik | null>(null);
  const [secili, setSecili] = useState<string | null>(null);
  const [hata, setHata] = useState("");
  const [calisiyor, setCalisiyor] = useState(false);

  useEffect(() => {
    demoRandevuAdminApi.musaitlik(r.id).then(setMusaitlik).catch((e) => setHata(e instanceof Error ? e.message : t("Yüklenemedi.")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id]);

  const kaydet = async () => {
    if (!secili) return;
    setCalisiyor(true);
    setHata("");
    try {
      onTasindi(await demoRandevuAdminApi.tasi(r.id, secili));
    } catch (e) {
      setHata(e instanceof Error ? e.message : t("Kaydedilemedi."));
    } finally {
      setCalisiyor(false);
    }
  };

  return (
    <Modal
      title={t("Saati değiştir")}
      subtitle={t("Katılımcıya ve sunucuya güncel bilgiler e-postayla gider.")}
      onClose={onClose}
      maxWidth={560}
      mobileFullScreen
      footer={
        <button type="button" disabled={!secili || calisiyor} onClick={() => void kaydet()} style={{ ...anaDugme(c), width: "100%" }}>
          {calisiyor ? t("Kaydediliyor…") : t("Bu saate taşı")}
        </button>
      }
    >
      {musaitlik ? <SlotSecici musaitlik={musaitlik} secili={secili} onSec={setSecili} /> : !hata && <p style={{ color: c.textSecondary }}>{t("Yükleniyor…")}</p>}
      {hata && <p style={{ margin: "10px 0 0", fontSize: 13, color: c.danger }}>{hata}</p>}
    </Modal>
  );
}

// ───────────────────────────────────────────── Çalışma saatleri

const GUNLER = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

function Saatler() {
  const c = useThemeColors();
  const t = useT();
  const [ayar, setAyar] = useState<DemoAyarlari | null>(null);
  const [kayitli, setKayitli] = useState("");
  const [calisiyor, setCalisiyor] = useState(false);
  const [mesaj, setMesaj] = useState<{ tur: "ok" | "hata"; metin: string } | null>(null);
  const [yeniKapali, setYeniKapali] = useState({ tarih: "", aciklama: "" });

  useEffect(() => {
    demoRandevuAdminApi
      .ayarlar()
      .then((a) => {
        setAyar(a);
        setKayitli(JSON.stringify(a));
      })
      .catch((e) => setMesaj({ tur: "hata", metin: e instanceof Error ? e.message : t("Yüklenemedi.") }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ayar) return mesaj ? <p style={{ color: c.danger }}>{mesaj.metin}</p> : <p style={{ color: c.textSecondary }}>{t("Yükleniyor…")}</p>;

  const degisti = JSON.stringify(ayar) !== kayitli;
  const guncelle = (yama: Partial<DemoAyarlari>) => {
    setAyar({ ...ayar, ...yama });
    setMesaj(null);
  };
  const araliklar = (gun: number) => ayar.calismaSaatleri.map((a, i) => ({ a, i })).filter(({ a }) => a.gun === gun);
  const araligiDegistir = (i: number, yama: Partial<DemoCalismaAraligi>) =>
    guncelle({ calismaSaatleri: ayar.calismaSaatleri.map((a, j) => (j === i ? { ...a, ...yama } : a)) });

  const kaydet = async () => {
    setCalisiyor(true);
    setMesaj(null);
    try {
      const yeni = await demoRandevuAdminApi.ayarlariKaydet(ayar);
      setAyar(yeni);
      setKayitli(JSON.stringify(yeni));
      setMesaj({ tur: "ok", metin: t("Kaydedildi.") });
    } catch (e) {
      setMesaj({ tur: "hata", metin: e instanceof Error ? e.message : t("Kaydedilemedi.") });
    } finally {
      setCalisiyor(false);
    }
  };

  const blokSayisi = ayar.calismaSaatleri.reduce((top, a) => {
    const [bs, bd] = a.baslangic.split(":").map(Number);
    const [ss, sd] = a.bitis.split(":").map(Number);
    const uzunluk = ss * 60 + sd - (bs * 60 + bd);
    return top + (uzunluk >= ayar.sureDk ? Math.floor((uzunluk - ayar.sureDk) / (ayar.sureDk + ayar.tamponDk)) + 1 : 0);
  }, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Kart baslik={t("Randevu alma")}>
        <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 14, color: c.textPrimary }}>
          <input type="checkbox" checked={ayar.aktif} onChange={(e) => guncelle({ aktif: e.target.checked })} style={{ width: 17, height: 17 }} />
          {t("Herkese açık sayfa ve Ayarlar'daki kart randevu alsın")}
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))", gap: 10 }}>
          <SayiAlani etiket={t("Görüşme süresi (dk)")} deger={ayar.sureDk} onChange={(v) => guncelle({ sureDk: v })} />
          <SayiAlani etiket={t("Görüşmeler arası (dk)")} deger={ayar.tamponDk} onChange={(v) => guncelle({ tamponDk: v })} />
          <SayiAlani etiket={t("En erken (saat sonra)")} deger={ayar.minOncedenSaat} onChange={(v) => guncelle({ minOncedenSaat: v })} />
          <SayiAlani etiket={t("Kaç gün ileri")} deger={ayar.maxGunIleri} onChange={(v) => guncelle({ maxGunIleri: v })} />
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Varsayılan görüşme bağlantısı (sunucunun otomatik Meet'i ve kişisel bağlantısı yoksa)")}</span>
          <input
            value={ayar.varsayilanToplantiLinki ?? ""}
            onChange={(e) => guncelle({ varsayilanToplantiLinki: e.target.value || null })}
            placeholder="https://meet.google.com/…"
            style={girdi(c)}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Yeni randevuyu ayrıca bildir (virgülle ayır; yöneticilere her zaman gider)")}</span>
          <input
            value={ayar.bildirimEpostalari.join(", ")}
            onChange={(e) => guncelle({ bildirimEpostalari: e.target.value.split(",").map((x) => x.trim()) })}
            placeholder="demo@pist.com.tr"
            style={girdi(c)}
          />
        </label>
      </Kart>

      <Kart baslik={t("Haftalık çalışma saatleri (Türkiye saati)")}>
        <p style={{ margin: 0, fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
          {t("Bloklar her aralığın başından başlar: {sure} dk görüşme + {tampon} dk ara. Haftada {n} blok açılıyor.", {
            sure: ayar.sureDk,
            tampon: ayar.tamponDk,
            n: blokSayisi,
          })}
        </p>
        {GUNLER.map((ad, idx) => {
          const gun = idx + 1;
          const satirlar = araliklar(gun);
          return (
            <div key={gun} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap", borderTop: `1px solid ${c.border}`, paddingTop: 10 }}>
              <div style={{ width: 96, fontSize: 14, color: c.textPrimary, paddingTop: 9 }}>{t(ad)}</div>
              <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 6 }}>
                {satirlar.length === 0 && <span style={{ fontSize: 13, color: c.textSecondary, paddingTop: 9 }}>{t("Kapalı")}</span>}
                {satirlar.map(({ a, i }) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="time" value={a.baslangic} onChange={(e) => araligiDegistir(i, { baslangic: e.target.value })} style={{ ...girdi(c), width: 120 }} />
                    <span style={{ color: c.textSecondary }}>–</span>
                    <input type="time" value={a.bitis} onChange={(e) => araligiDegistir(i, { bitis: e.target.value })} style={{ ...girdi(c), width: 120 }} />
                    <button
                      type="button"
                      aria-label={t("Aralığı sil")}
                      onClick={() => guncelle({ calismaSaatleri: ayar.calismaSaatleri.filter((_, j) => j !== i) })}
                      style={{ ...ikincilDugme(c), padding: "8px 11px" }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => guncelle({ calismaSaatleri: [...ayar.calismaSaatleri, { gun, baslangic: "10:00", bitis: "12:00" }] })}
                style={{ ...ikincilDugme(c), padding: "8px 12px", fontSize: 13 }}
              >
                + {t("Aralık")}
              </button>
            </div>
          );
        })}
      </Kart>

      <Kart baslik={t("Kapalı günler")}>
        <p style={{ margin: 0, fontSize: 13, color: c.textSecondary }}>{t("Tatil ve izin günleri: o gün hiç blok açılmaz.")}</p>
        {ayar.kapaliGunler.map((k) => (
          <div key={k.tarih} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, color: c.textPrimary }}>
            <span style={{ minWidth: 100 }}>{k.tarih}</span>
            <span style={{ flex: 1, color: c.textSecondary }}>{k.aciklama}</span>
            <button
              type="button"
              onClick={() => guncelle({ kapaliGunler: ayar.kapaliGunler.filter((x) => x.tarih !== k.tarih) })}
              style={{ ...ikincilDugme(c), padding: "6px 10px" }}
            >
              ×
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="date" value={yeniKapali.tarih} onChange={(e) => setYeniKapali({ ...yeniKapali, tarih: e.target.value })} style={{ ...girdi(c), width: 170 }} />
          <input
            value={yeniKapali.aciklama}
            onChange={(e) => setYeniKapali({ ...yeniKapali, aciklama: e.target.value })}
            placeholder={t("Açıklama (isteğe bağlı)")}
            style={{ ...girdi(c), flex: 1, minWidth: 160 }}
          />
          <button
            type="button"
            disabled={!yeniKapali.tarih}
            onClick={() => {
              guncelle({
                kapaliGunler: [
                  ...ayar.kapaliGunler.filter((x) => x.tarih !== yeniKapali.tarih),
                  { tarih: yeniKapali.tarih, aciklama: yeniKapali.aciklama || null },
                ].sort((a, b) => a.tarih.localeCompare(b.tarih)),
              });
              setYeniKapali({ tarih: "", aciklama: "" });
            }}
            style={ikincilDugme(c)}
          >
            {t("Ekle")}
          </button>
        </div>
      </Kart>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          position: "sticky",
          bottom: 0,
          padding: "12px 0",
          background: c.background,
          borderTop: `1px solid ${c.border}`,
        }}
      >
        <button type="button" disabled={!degisti || calisiyor} onClick={() => void kaydet()} style={{ ...anaDugme(c), opacity: degisti ? 1 : 0.6 }}>
          {calisiyor ? t("Kaydediliyor…") : t("Kaydet")}
        </button>
        {mesaj && <span style={{ fontSize: 14, color: mesaj.tur === "ok" ? c.success : c.danger }}>{mesaj.metin}</span>}
      </div>
    </div>
  );
}

function SayiAlani({ etiket, deger, onChange }: { etiket: string; deger: number; onChange: (v: number) => void }) {
  const c = useThemeColors();
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, color: c.textSecondary }}>{etiket}</span>
      <input type="number" min={0} value={deger} onChange={(e) => onChange(Number(e.target.value))} style={girdi(c)} />
    </label>
  );
}

function Kart({ baslik, children }: { baslik: string; children: ReactNode }) {
  const c = useThemeColors();
  return (
    <section style={{ border: `1px solid ${c.border}`, borderRadius: 12, padding: 16, background: c.surface, display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: c.textPrimary }}>{baslik}</h3>
      {children}
    </section>
  );
}

// ───────────────────────────────────────────── Sunucular

function Sunucular({ liste, onDegisti }: { liste: DemoSunucu[]; onDegisti: (l: DemoSunucu[]) => void }) {
  const c = useThemeColors();
  const t = useT();
  const [eposta, setEposta] = useState("");
  const [link, setLink] = useState("");
  const [hata, setHata] = useState("");
  const [calisiyor, setCalisiyor] = useState(false);

  const calistir = async (is: () => Promise<DemoSunucu[]>) => {
    setCalisiyor(true);
    setHata("");
    try {
      onDegisti(await is());
      return true;
    } catch (e) {
      setHata(e instanceof Error ? e.message : t("Kaydedilemedi."));
      return false;
    } finally {
      setCalisiyor(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 14, color: c.textSecondary, lineHeight: 1.6 }}>
        {t("Demo görüşmesi yapabilecek kişiler. Yöneticiler her zaman listede. Moderatör olarak eklenen kişi kendisine atanan görüşmeleri Ayarlar > Yardımcılar'da görür; başka bir yetki almaz.")}{" "}
        {t("Her kişi kendi Google hesabını Ayarlar > Yardımcılar > Canlı demo kartından bağlarsa, ona atanan randevulara otomatik ve ayrı bir Meet bağlantısı açılır. Bağlamayanlarda aşağıdaki kişisel bağlantı, o da yoksa varsayılan bağlantı kullanılır.")}
      </p>
      {liste.map((s) => (
        <SunucuSatiri key={s.userId} s={s} calisiyor={calisiyor} calistir={calistir} />
      ))}
      <Kart baslik={t("Moderatör ekle")}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 8 }}>
          <input value={eposta} onChange={(e) => setEposta(e.target.value)} placeholder={t("Projelio hesabının e-postası")} style={girdi(c)} />
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder={t("Kişisel görüşme bağlantısı (isteğe bağlı)")} style={girdi(c)} />
        </div>
        <button
          type="button"
          disabled={!eposta.trim() || calisiyor}
          onClick={async () => {
            if (await calistir(() => demoRandevuAdminApi.sunucuEkle(eposta.trim(), link.trim() || undefined))) {
              setEposta("");
              setLink("");
            }
          }}
          style={{ ...anaDugme(c), alignSelf: "flex-start" }}
        >
          {t("Ekle")}
        </button>
      </Kart>
      {hata && <p style={{ margin: 0, fontSize: 14, color: c.danger }}>{hata}</p>}
    </div>
  );
}

function SunucuSatiri({
  s,
  calisiyor,
  calistir,
}: {
  s: DemoSunucu;
  calisiyor: boolean;
  calistir: (is: () => Promise<DemoSunucu[]>) => Promise<boolean>;
}) {
  const c = useThemeColors();
  const t = useT();
  const [link, setLink] = useState(s.toplantiLinki ?? "");
  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, padding: 12, background: c.surface, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ minWidth: 180, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary }}>
          {s.ad} {s.yonetici && <span style={{ fontSize: 12, fontWeight: 400, color: c.textSecondary }}>· {t("yönetici")}</span>}
        </div>
        <div style={{ fontSize: 13, color: c.textSecondary }}>{s.eposta}</div>
        <div style={{ fontSize: 12, marginTop: 2, color: s.googleMeetEposta ? c.success : c.textSecondary }}>
          {s.googleMeetEposta ? t("Otomatik Meet: {eposta}", { eposta: s.googleMeetEposta }) : t("Otomatik Meet bağlı değil")}
        </div>
      </div>
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        onBlur={() => link.trim() !== (s.toplantiLinki ?? "") && void calistir(() => demoRandevuAdminApi.sunucuGuncelle(s.userId, link.trim() || null))}
        placeholder={t("Kişisel görüşme bağlantısı")}
        style={{ ...girdi(c), flex: 2, minWidth: 200 }}
      />
      {!s.yonetici && (
        <button type="button" disabled={calisiyor} onClick={() => void calistir(() => demoRandevuAdminApi.sunucuSil(s.userId))} style={{ ...ikincilDugme(c), color: c.danger }}>
          {t("Çıkar")}
        </button>
      )}
    </div>
  );
}
