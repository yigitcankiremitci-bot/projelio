import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Product } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import ProductCard from "../ProductCard";
import UrunTablosu from "./UrunTablosu";
import { IconDownload, IconLayers, IconListCheck, IconDashboard, IconX, IconChevronDown, IconChevronUp } from "../icons";
import {
  BOS_DEGER,
  BOS_FILTRE,
  etkinFiltreSayisi,
  filtreleUrunler,
  hizliSayilar,
  kovalar,
  siralaUrunler,
  SIRALAMALAR,
  urunlerCsv,
} from "../../lib/urunListesi";
import type { Kova, UrunFiltresi, UrunGorunumu, UrunSiralama } from "../../lib/urunListesi";

// Ürün/Hizmet sekmesinin (ve Ürün Yönetimi departmanının) tam kataloğu: arama,
// kategori/marka kenar çubuğu, hızlı filtreler, sıralama ve üç görünüm.
//
// Neden ayrı bileşen: anasayfa şeridi (ProductsPanel layout="scroll") bir özet;
// orada arama çubuğu ve filtre yeri yok. Katalog yönetimi burada.
//
// 3.586 ürünü tek seferde çizmek (her biri fotoğraflı bir kart) sayfayı
// saniyelerce donduruyordu. Liste PARÇA PARÇA çizilir: ilk parça hemen, sonrakiler
// kullanıcı aşağı indikçe (IntersectionObserver). Filtre değişince başa dönülür.

interface Props {
  organizationId: string;
  products: Product[];
  onOpen: (p: Product) => void;
  onCoverUpdated: () => void;
  /** Başlık satırındaki düğmeler (Excel, toplu fotoğraf) — araç çubuğunun yanında kalsınlar. */
  ustEylemler?: ReactNode;
}

const PARCA: Record<UrunGorunumu, number> = { kart: 48, kompakt: 96, liste: 100 };

const GORUNUM_ANAHTARI = "projelio.urunler.gorunum";
const SIRALAMA_ANAHTARI = "projelio.urunler.siralama";
const filtreAnahtari = (orgId: string) => `projelio.urunler.filtre.${orgId}`;

function oku<T>(depo: Storage | undefined, anahtar: string, gecerli: (v: unknown) => v is T): T | undefined {
  try {
    const ham = depo?.getItem(anahtar);
    if (!ham) return undefined;
    const v = JSON.parse(ham);
    return gecerli(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

function yaz(depo: Storage | undefined, anahtar: string, deger: unknown) {
  try {
    depo?.setItem(anahtar, JSON.stringify(deger));
  } catch {
    // Gizli pencere / dolu depo: tercih hatırlanmaz, liste yine çalışır.
  }
}

const gorunumMu = (v: unknown): v is UrunGorunumu => v === "kart" || v === "kompakt" || v === "liste";
const siralamaMi = (v: unknown): v is UrunSiralama => SIRALAMALAR.includes(v as UrunSiralama);
const filtreMi = (v: unknown): v is UrunFiltresi =>
  !!v && typeof v === "object" && Array.isArray((v as UrunFiltresi).kategoriler) && Array.isArray((v as UrunFiltresi).markalar);

const yerel = typeof window !== "undefined" ? window.localStorage : undefined;
const oturum = typeof window !== "undefined" ? window.sessionStorage : undefined;

export default function UrunKatalogu({ organizationId, products, onOpen, onCoverUpdated, ustEylemler }: Props) {
  const c = useThemeColors();
  const t = useT();

  const [gorunum, setGorunum] = useState<UrunGorunumu>(() => oku(yerel, GORUNUM_ANAHTARI, gorunumMu) ?? "kart");
  const [siralama, setSiralama] = useState<UrunSiralama>(() => oku(yerel, SIRALAMA_ANAHTARI, siralamaMi) ?? "varsayilan");
  // Filtre OTURUMA bağlı: ürün kartını açıp kapatınca ya da sekme değiştirip
  // dönünce kaybolmasın, ama ertesi gün kullanıcı yarım kalmış bir aramayla
  // karşılaşıp "ürünlerim nerede" demesin.
  const [filtre, setFiltre] = useState<UrunFiltresi>(
    () => ({ ...BOS_FILTRE, ...(oku(oturum, filtreAnahtari(organizationId), filtreMi) ?? {}) })
  );
  const [gosterilen, setGosterilen] = useState(PARCA[gorunum]);
  const [filtrePaneliAcik, setFiltrePaneliAcik] = useState(false);

  useEffect(() => yaz(yerel, GORUNUM_ANAHTARI, gorunum), [gorunum]);
  useEffect(() => yaz(yerel, SIRALAMA_ANAHTARI, siralama), [siralama]);
  useEffect(() => yaz(oturum, filtreAnahtari(organizationId), filtre), [organizationId, filtre]);

  // Kenar çubuğu PANELİN genişliğine göre açılır, pencereninkine göre değil:
  // masaüstünde uygulamanın kendi sol menüsü de yer kaplıyor.
  const kokRef = useRef<HTMLDivElement>(null);
  const [genislik, setGenislik] = useState(1200);
  useLayoutEffect(() => {
    const el = kokRef.current;
    if (!el) return;
    setGenislik(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setGenislik(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const kenarCubugu = genislik >= 900;
  const dar = genislik < 640;
  // Tablo kendi alanına bakar: kenar çubuğu açıkken ondan geriye kalan yer.
  // Kök genişliğine bakınca tablo 760 px'lik tam düzenini sıkışık alana
  // zorluyor, ad sütunu tek harfe ("Ş…") iniyordu.
  const tabloDar = (kenarCubugu ? genislik - 266 : genislik) < 780;

  // Arama kutusu her tuşta anında güncellenir; ağır süzme bir adım geriden gelir.
  const ertelenen = useDeferredValue(filtre);
  const sonuc = useMemo(
    () => siralaUrunler(filtreleUrunler(products, ertelenen), siralama, ertelenen.arama),
    [products, ertelenen, siralama]
  );
  const kova = useMemo(() => kovalar(products, ertelenen), [products, ertelenen]);
  const sayilar = useMemo(() => hizliSayilar(products), [products]);
  const etkin = etkinFiltreSayisi(filtre);

  // Sonuç kümesi ya da görünüm değişince ilk parçaya dön.
  useEffect(() => setGosterilen(PARCA[gorunum]), [ertelenen, siralama, gorunum]);

  const gozcuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = gozcuRef.current;
    if (!el || gosterilen >= sonuc.length) return;
    const io = new IntersectionObserver(
      (girdiler) => {
        if (girdiler.some((g) => g.isIntersecting)) setGosterilen((n) => n + PARCA[gorunum]);
      },
      { rootMargin: "800px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [gosterilen, sonuc.length, gorunum]);

  // "/" arama kutusuna götürür (yazı alanında değilken) — uzun listede yukarı
  // kaydırmadan aramaya dönmenin yolu.
  const aramaRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const dinle = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const hedef = e.target as HTMLElement | null;
      if (hedef && (hedef.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(hedef.tagName))) return;
      if (document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      aramaRef.current?.focus();
    };
    window.addEventListener("keydown", dinle);
    return () => window.removeEventListener("keydown", dinle);
  }, []);

  const degistir = (parca: Partial<UrunFiltresi>) => setFiltre((f) => ({ ...f, ...parca }));
  const temizle = () => setFiltre((f) => ({ ...BOS_FILTRE, arama: f.arama }));
  const hepsiniTemizle = () => setFiltre(BOS_FILTRE);

  const disaAktar = () => {
    const csv = urunlerCsv(sonuc, [
      t("Ad"),
      t("Tür"),
      t("Kategori"),
      t("Marka"),
      t("Stok kodu"),
      t("Barkod"),
      t("Birim"),
      t("Fiyat"),
      t("Para birimi"),
      t("Maliyet"),
      t("KDV (%)"),
      t("Stok"),
      t("Kritik stok"),
      t("Durum"),
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `urunler-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const siralamaEtiketi: Record<UrunSiralama, string> = {
    varsayilan: filtre.arama ? t("En alakalı") : t("Varsayılan sıra"),
    "ad-artan": t("Ad (A → Z)"),
    "ad-azalan": t("Ad (Z → A)"),
    "fiyat-artan": t("Fiyat (düşükten yükseğe)"),
    "fiyat-azalan": t("Fiyat (yüksekten düşüğe)"),
    "stok-artan": t("Stok (azdan çoğa)"),
    "stok-azalan": t("Stok (çoktan aza)"),
    "marj-azalan": t("Kâr marjı (yüksekten düşüğe)"),
    yeni: t("En yeni eklenen"),
    eski: t("En eski eklenen"),
    kod: t("Stok kodu"),
  };

  const kontrol: CSSProperties = {
    fontSize: 13.5,
    padding: "7px 10px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
  };

  const yanPanel = (
    <FiltrePaneli
      filtre={filtre}
      kova={kova}
      degistir={degistir}
      kontrol={kontrol}
    />
  );

  const gorunen = sonuc.slice(0, gosterilen);

  return (
    <div ref={kokRef} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Üst satır: arama + sıralama + görünüm + eylemler */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 260px", minWidth: 0 }}>
          <input
            ref={aramaRef}
            type="search"
            value={filtre.arama}
            onChange={(e) => degistir({ arama: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape" && filtre.arama) {
                e.stopPropagation();
                degistir({ arama: "" });
              }
              // Barkod okuyucu Enter gönderir: tek sonuç kaldıysa kartı aç.
              if (e.key === "Enter" && sonuc.length === 1) onOpen(sonuc[0]);
            }}
            placeholder={t("Ad, stok kodu, barkod, marka ya da kategori ara…  ( / )")}
            aria-label={t("Ürün ara")}
            style={{ ...kontrol, width: "100%", boxSizing: "border-box", fontSize: 14.5, padding: "9px 12px" }}
          />
        </div>

        <select
          value={siralama}
          onChange={(e) => setSiralama(e.target.value as UrunSiralama)}
          aria-label={t("Sıralama")}
          style={{ ...kontrol, flex: dar ? "1 1 160px" : "0 0 auto" }}
        >
          {SIRALAMALAR.map((s) => (
            <option key={s} value={s}>
              {siralamaEtiketi[s]}
            </option>
          ))}
        </select>

        <div role="group" aria-label={t("Görünüm")} style={{ display: "inline-flex", border: `1px solid ${c.border}`, borderRadius: 8, overflow: "hidden" }}>
          {(
            [
              ["kart", t("Kart görünümü"), <IconDashboard key="k" size={16} />],
              ["kompakt", t("Küçük kartlar"), <IconLayers key="c" size={16} />],
              ["liste", t("Liste görünümü"), <IconListCheck key="l" size={16} />],
            ] as const
          ).map(([g, etiket, ikon]) => (
            <button
              key={g}
              type="button"
              onClick={() => setGorunum(g)}
              title={etiket}
              aria-label={etiket}
              aria-pressed={gorunum === g}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 34,
                border: "none",
                background: gorunum === g ? c.primary : c.surface,
                color: gorunum === g ? c.onPrimary : c.textSecondary,
                cursor: "pointer",
              }}
            >
              {ikon}
            </button>
          ))}
        </div>

        {!kenarCubugu && (
          <button
            type="button"
            onClick={() => setFiltrePaneliAcik((a) => !a)}
            aria-expanded={filtrePaneliAcik}
            style={{ ...kontrol, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
          >
            {t("Filtreler")}
            {etkin > 0 && <Rozet c={c}>{etkin}</Rozet>}
            {filtrePaneliAcik ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </button>
        )}

        <button
          type="button"
          onClick={disaAktar}
          disabled={sonuc.length === 0}
          title={t("Görünen {n} kaydı CSV olarak indir", { n: sonuc.length })}
          style={{ ...kontrol, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
        >
          <IconDownload size={15} /> {!dar && t("Dışa aktar")}
        </button>
        {ustEylemler}
      </div>

      {/* Hızlı filtreler: kataloğun tamamındaki sayılarla */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <Cip c={c} secili={!filtre.tur} onClick={() => degistir({ tur: "" })}>
          {t("Tümü")} <Sayi>{products.length}</Sayi>
        </Cip>
        {sayilar.urun > 0 && sayilar.hizmet > 0 && (
          <>
            <Cip c={c} secili={filtre.tur === "product"} onClick={() => degistir({ tur: filtre.tur === "product" ? "" : "product" })}>
              {t("Ürünler")} <Sayi>{sayilar.urun}</Sayi>
            </Cip>
            <Cip c={c} secili={filtre.tur === "service"} onClick={() => degistir({ tur: filtre.tur === "service" ? "" : "service" })}>
              {t("Hizmetler")} <Sayi>{sayilar.hizmet}</Sayi>
            </Cip>
          </>
        )}
        <span style={{ width: 1, background: c.border, margin: "2px 4px" }} />
        {sayilar.tukendi > 0 && (
          <Cip c={c} renk={c.danger} secili={filtre.stok === "tukendi"} onClick={() => degistir({ stok: filtre.stok === "tukendi" ? "" : "tukendi" })}>
            {t("Stokta yok")} <Sayi>{sayilar.tukendi}</Sayi>
          </Cip>
        )}
        {sayilar.kritik > 0 && (
          <Cip c={c} renk={c.warning} secili={filtre.stok === "kritik"} onClick={() => degistir({ stok: filtre.stok === "kritik" ? "" : "kritik" })}>
            {t("Kritik stok")} <Sayi>{sayilar.kritik}</Sayi>
          </Cip>
        )}
        {sayilar.fotografsiz > 0 && (
          <Cip c={c} secili={filtre.foto === "yok"} onClick={() => degistir({ foto: filtre.foto === "yok" ? "" : "yok" })}>
            {t("Fotoğrafsız")} <Sayi>{sayilar.fotografsiz}</Sayi>
          </Cip>
        )}
        {sayilar.satisDisi > 0 && (
          <Cip c={c} secili={filtre.durum === "inactive"} onClick={() => degistir({ durum: filtre.durum === "inactive" ? "" : "inactive" })}>
            {t("Satış dışı")} <Sayi>{sayilar.satisDisi}</Sayi>
          </Cip>
        )}
      </div>

      {!kenarCubugu && filtrePaneliAcik && (
        <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, padding: 12, background: c.surface }}>{yanPanel}</div>
      )}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {kenarCubugu && (
          <aside
            style={{
              flex: "0 0 250px",
              width: 250,
              position: "sticky",
              top: 12,
              maxHeight: "calc(100vh - 24px)",
              overflowY: "auto",
              border: `1px solid ${c.border}`,
              borderRadius: 12,
              padding: 12,
              background: c.surface,
              boxSizing: "border-box",
            }}
          >
            {yanPanel}
          </aside>
        )}

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Sonuç satırı + etkin filtre etiketleri */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 13.5, color: c.textSecondary }}>
            <span>
              {sonuc.length === products.length
                ? t("{n} kayıt", { n: products.length.toLocaleString("tr-TR") })
                : t("{n} / {toplam} kayıt", {
                    n: sonuc.length.toLocaleString("tr-TR"),
                    toplam: products.length.toLocaleString("tr-TR"),
                  })}
            </span>
            {filtre.kategoriler.map((k) => (
              <Etiket key={`k:${k}`} c={c} onKaldir={() => degistir({ kategoriler: filtre.kategoriler.filter((x) => x !== k) })}>
                {k === BOS_DEGER ? t("Kategorisiz") : k}
              </Etiket>
            ))}
            {filtre.markalar.map((m) => (
              <Etiket key={`m:${m}`} c={c} onKaldir={() => degistir({ markalar: filtre.markalar.filter((x) => x !== m) })}>
                {m === BOS_DEGER ? t("Markasız") : m}
              </Etiket>
            ))}
            {(filtre.fiyatMin !== undefined || filtre.fiyatMax !== undefined) && (
              <Etiket c={c} onKaldir={() => degistir({ fiyatMin: undefined, fiyatMax: undefined })}>
                {t("Fiyat")}: {filtre.fiyatMin ?? "…"} – {filtre.fiyatMax ?? "…"}
              </Etiket>
            )}
            {(etkin > 0 || filtre.arama) && (
              <button
                type="button"
                onClick={hepsiniTemizle}
                style={{ border: "none", background: "transparent", color: c.accent, cursor: "pointer", fontSize: 13.5, padding: "2px 4px" }}
              >
                {t("Tümünü temizle")}
              </button>
            )}
          </div>

          {sonuc.length === 0 ? (
            <div
              style={{
                border: `1px dashed ${c.border}`,
                borderRadius: 12,
                padding: 32,
                textAlign: "center",
                color: c.textSecondary,
                fontSize: 15,
              }}
            >
              {t("Bu ölçütlere uyan ürün/hizmet yok.")}{" "}
              <button
                type="button"
                onClick={etkin > 0 ? temizle : hepsiniTemizle}
                style={{ border: "none", background: "transparent", color: c.accent, cursor: "pointer", fontSize: 15 }}
              >
                {etkin > 0 ? t("Filtreleri temizle") : t("Aramayı temizle")}
              </button>
            </div>
          ) : gorunum === "liste" ? (
            <UrunTablosu
              urunler={gorunen}
              siralama={siralama}
              onSirala={setSiralama}
              onOpen={onOpen}
              dar={tabloDar}
            />
          ) : (
            <div
              style={{
                display: "grid",
                // min(…, 100%): kap karttan darsa tek sütun kabın genişliğine iner.
                gridTemplateColumns:
                  gorunum === "kompakt"
                    ? "repeat(auto-fill, minmax(min(160px, 100%), 1fr))"
                    : "repeat(auto-fill, minmax(min(260px, 100%), 1fr))",
                gap: gorunum === "kompakt" ? 10 : 14,
              }}
            >
              {gorunen.map((p) => (
                <div key={p.id} style={{ minWidth: 0 }}>
                  <ProductCard product={p} compact={gorunum === "kompakt"} onOpen={() => onOpen(p)} onCoverUpdated={onCoverUpdated} />
                </div>
              ))}
            </div>
          )}

          {gosterilen < sonuc.length && (
            <div ref={gozcuRef} style={{ display: "flex", justifyContent: "center", padding: "8px 0 16px" }}>
              <button
                type="button"
                onClick={() => setGosterilen((n) => n + PARCA[gorunum])}
                style={{ ...kontrol, cursor: "pointer" }}
              >
                {t("Daha fazla göster ({n} kaldı)", { n: (sonuc.length - gosterilen).toLocaleString("tr-TR") })}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FiltrePaneli({
  filtre,
  kova,
  degistir,
  kontrol,
}: {
  filtre: UrunFiltresi;
  kova: { kategoriler: Kova[]; markalar: Kova[] };
  degistir: (p: Partial<UrunFiltresi>) => void;
  kontrol: CSSProperties;
}) {
  const c = useThemeColors();
  const t = useT();
  const sayiOku = (v: string): number | undefined => {
    const n = Number(v.replace(",", "."));
    return v.trim() === "" || !Number.isFinite(n) ? undefined : n;
  };
  const baslik: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: c.textSecondary, textTransform: "uppercase", letterSpacing: 0.4, margin: "0 0 6px" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <KovaListesi
        baslik={t("Kategoriler")}
        bosEtiket={t("Kategorisiz")}
        kovalar={kova.kategoriler}
        secili={filtre.kategoriler}
        onDegis={(kategoriler) => degistir({ kategoriler })}
      />
      <KovaListesi
        baslik={t("Markalar")}
        bosEtiket={t("Markasız")}
        kovalar={kova.markalar}
        secili={filtre.markalar}
        onDegis={(markalar) => degistir({ markalar })}
      />

      <div>
        <p style={baslik}>{t("Fiyat aralığı")}</p>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            inputMode="decimal"
            placeholder={t("En az")}
            value={filtre.fiyatMin ?? ""}
            onChange={(e) => degistir({ fiyatMin: sayiOku(e.target.value) })}
            aria-label={t("En düşük fiyat")}
            style={{ ...kontrol, width: "100%", minWidth: 0, boxSizing: "border-box" }}
          />
          <span style={{ color: c.textSecondary }}>–</span>
          <input
            inputMode="decimal"
            placeholder={t("En çok")}
            value={filtre.fiyatMax ?? ""}
            onChange={(e) => degistir({ fiyatMax: sayiOku(e.target.value) })}
            aria-label={t("En yüksek fiyat")}
            style={{ ...kontrol, width: "100%", minWidth: 0, boxSizing: "border-box" }}
          />
        </div>
      </div>

      <div>
        <p style={baslik}>{t("Stok durumu")}</p>
        <select value={filtre.stok} onChange={(e) => degistir({ stok: e.target.value as UrunFiltresi["stok"] })} style={{ ...kontrol, width: "100%" }}>
          <option value="">{t("Tümü")}</option>
          <option value="yeterli">{t("Stokta var")}</option>
          <option value="kritik">{t("Kritik stok")}</option>
          <option value="tukendi">{t("Stokta yok")}</option>
          <option value="girilmemis">{t("Stok girilmemiş")}</option>
        </select>
      </div>

      <div>
        <p style={baslik}>{t("Satış durumu")}</p>
        <select value={filtre.durum} onChange={(e) => degistir({ durum: e.target.value as UrunFiltresi["durum"] })} style={{ ...kontrol, width: "100%" }}>
          <option value="">{t("Tümü")}</option>
          <option value="active">{t("Satışta")}</option>
          <option value="inactive">{t("Satış dışı")}</option>
        </select>
      </div>

      <div>
        <p style={baslik}>{t("Fotoğraf")}</p>
        <select value={filtre.foto} onChange={(e) => degistir({ foto: e.target.value as UrunFiltresi["foto"] })} style={{ ...kontrol, width: "100%" }}>
          <option value="">{t("Tümü")}</option>
          <option value="var">{t("Fotoğraflı")}</option>
          <option value="yok">{t("Fotoğrafsız")}</option>
        </select>
      </div>
    </div>
  );
}

/** Kategori / marka listesi: kendi arama kutusu, sayılar, çoklu seçim, ilk 10'dan sonrası katlanır. */
function KovaListesi({
  baslik,
  bosEtiket,
  kovalar,
  secili,
  onDegis,
}: {
  baslik: string;
  bosEtiket: string;
  kovalar: Kova[];
  secili: string[];
  onDegis: (yeni: string[]) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [ara, setAra] = useState("");
  const [hepsi, setHepsi] = useState(false);
  const ILK = 10;

  // Yalnızca "Kategorisiz" kovası varsa liste anlamsız: o alan hiç doldurulmamış.
  if (kovalar.length === 0 || (kovalar.length === 1 && kovalar[0].deger === BOS_DEGER)) return null;

  const a = ara.trim().toLocaleLowerCase("tr-TR");
  const suzulen = a ? kovalar.filter((k) => (k.deger || bosEtiket).toLocaleLowerCase("tr-TR").includes(a)) : kovalar;
  const gorunen = hepsi || a ? suzulen : suzulen.slice(0, ILK);

  const degis = (d: string) => onDegis(secili.includes(d) ? secili.filter((x) => x !== d) : [...secili, d]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 6px" }}>
        <p style={{ fontSize: 12.5, fontWeight: 600, color: c.textSecondary, textTransform: "uppercase", letterSpacing: 0.4, margin: 0 }}>
          {baslik} <span style={{ fontWeight: 400 }}>({kovalar.filter((k) => k.deger !== BOS_DEGER).length})</span>
        </p>
        {secili.length > 0 && (
          <button type="button" onClick={() => onDegis([])} style={{ border: "none", background: "transparent", color: c.accent, fontSize: 12.5, cursor: "pointer" }}>
            {t("Temizle")}
          </button>
        )}
      </div>
      {kovalar.length > ILK && (
        <input
          type="search"
          value={ara}
          onChange={(e) => setAra(e.target.value)}
          placeholder={t("Listede ara…")}
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontSize: 13,
            padding: "5px 8px",
            borderRadius: 6,
            border: `1px solid ${c.border}`,
            background: c.background,
            color: c.textPrimary,
            marginBottom: 6,
          }}
        />
      )}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {gorunen.map((k) => {
          const isaretli = secili.includes(k.deger);
          return (
            <label
              key={k.deger || "__bos"}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 4px",
                borderRadius: 6,
                fontSize: 13.5,
                cursor: "pointer",
                color: k.sayi === 0 && !isaretli ? c.textSecondary : c.textPrimary,
                background: isaretli ? c.acilanAlan : "transparent",
              }}
            >
              {/* Boyut açıkça veriliyor: genel girdi kuralı her input'a 42 px yükseklik
                  veriyor ve 70 kategorilik liste ekrana üç kat uzun yayılıyordu.
                  Dokunma alanı satırın tamamı (label). */}
              <input type="checkbox" checked={isaretli} onChange={() => degis(k.deger)} style={{ margin: 0, flexShrink: 0, width: 16, height: 16, minHeight: 0 }} />
              <span
                title={k.deger || bosEtiket}
                style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: k.deger ? "normal" : "italic" }}
              >
                {k.deger || bosEtiket}
              </span>
              <span style={{ color: c.textSecondary, fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>{k.sayi.toLocaleString("tr-TR")}</span>
            </label>
          );
        })}
        {!a && suzulen.length > ILK && (
          <button
            type="button"
            onClick={() => setHepsi((h) => !h)}
            style={{ border: "none", background: "transparent", color: c.accent, fontSize: 13, cursor: "pointer", textAlign: "left", padding: "4px" }}
          >
            {hepsi ? t("Daha az göster") : t("Tümünü göster ({n})", { n: suzulen.length })}
          </button>
        )}
        {a && suzulen.length === 0 && <span style={{ fontSize: 13, color: c.textSecondary, padding: 4 }}>{t("Eşleşme yok")}</span>}
      </div>
    </div>
  );
}

type Renkler = ReturnType<typeof useThemeColors>;

function Cip({ c, secili, renk, onClick, children }: { c: Renkler; secili: boolean; renk?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={secili}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: 999,
        fontSize: 13,
        cursor: "pointer",
        border: `1px solid ${secili ? c.primary : c.border}`,
        background: secili ? c.primary : c.surface,
        color: secili ? c.onPrimary : renk ?? c.textPrimary,
      }}
    >
      {children}
    </button>
  );
}

function Sayi({ children }: { children: number }) {
  return <span style={{ opacity: 0.7, fontVariantNumeric: "tabular-nums" }}>{children.toLocaleString("tr-TR")}</span>;
}

function Rozet({ c, children }: { c: Renkler; children: ReactNode }) {
  return (
    <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: c.primary, color: c.onPrimary, fontSize: 11.5, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>
      {children}
    </span>
  );
}

function Etiket({ c, onKaldir, children }: { c: Renkler; onKaldir: () => void; children: ReactNode }) {
  const t = useT();
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 4px 2px 9px",
        borderRadius: 999,
        background: c.acilanAlan,
        color: c.textPrimary,
        fontSize: 12.5,
        maxWidth: 240,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
      <button
        type="button"
        onClick={onKaldir}
        aria-label={t("Filtreyi kaldır")}
        style={{ border: "none", background: "transparent", cursor: "pointer", display: "inline-flex", padding: 2, color: c.textSecondary }}
      >
        <IconX size={12} />
      </button>
    </span>
  );
}
