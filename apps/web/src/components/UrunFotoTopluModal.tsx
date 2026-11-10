import { useMemo, useRef, useState } from "react";
import type { Product } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { IconUpload } from "./icons";
import Modal from "./Modal";

interface Props {
  /** Panelde zaten yüklü ürün listesi: eşleştirme tarayıcıda, sunucuya ek istek yok. */
  products: Product[];
  onClose: () => void;
  /** Yükleme bitince liste tazelensin (kapak görselleri değişti). */
  onDone: () => void;
}

// Sunucudaki sınırlar (products.controller addImage / products.service).
// Burada da bakılıyor ki 8 MB'lık bir fotoğraf ya da 13. görsel yüklemenin
// ortasında hata olarak değil, önizlemede "atlanacak" olarak görünsün.
const MAX_BOYUT = 8 * 1024 * 1024;
const MAX_GORSEL = 12;
// Aynı anda kaç yükleme: tek tek gitmek 900 fotoğrafta dakikalar sürüyordu,
// fazlası hem tarayıcının bağlantı sınırına hem sunucunun hız sınırına takılır.
const ES_ZAMANLI = 3;

const GORSEL_UZANTI = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

/** Dosya adını ve stok kodunu aynı biçime getirir: macOS adları NFD gelebiliyor. */
const anahtar = (s: string) => s.normalize("NFC").trim().toLocaleUpperCase("tr");

/**
 * "ABC-12.jpg" → "ABC-12"; "ABC-12_2.jpg" / "ABC-12 (2).jpg" ikinci fotoğraf sayılır.
 * Tire eki ("ABC-2") bilerek yok: stok kodlarının çoğu tireli, "ABC-2" yoksa
 * "ABC"ye bağlamak yanlış ürüne fotoğraf eklemek olurdu.
 */
function adAdaylari(dosyaAdi: string): string[] {
  const kok = anahtar(dosyaAdi.replace(/\.[^.]+$/, ""));
  const ekli = kok.replace(/(\s*\(\d+\)|_\d{1,2})$/, "");
  return ekli && ekli !== kok ? [kok, ekli] : [kok];
}

interface Eslesme {
  dosya: File;
  urun: Product;
}

interface Atlanan {
  ad: string;
  sebep: string;
}

/**
 * Toplu ürün fotoğrafı yükleme: adı stok kodu (ya da barkod) olan fotoğraflar
 * seçilir, her biri o ürüne eklenir.
 *
 * NEDEN: 2026-11-10'da bir medikal depo kataloglardan çıkarılmış ~900 fotoğrafı
 * ürünlere eklemek istedi; ürün kartından tek tek eklemek saatler sürerdi.
 * Eşleştirme yalnızca dosya adıyla — görselin içeriğine bakılmaz, yanlış ada
 * yanlış ürün eşleşir; bu yüzden önce önizleme gösterilir.
 */
export default function UrunFotoTopluModal({ products, onClose, onDone }: Props) {
  const c = useThemeColors();
  const t = useT();
  const dosyaGirdi = useRef<HTMLInputElement>(null);
  const klasorGirdi = useRef<HTMLInputElement>(null);
  const durdur = useRef(false);
  const [dosyalar, setDosyalar] = useState<File[]>([]);
  const [fotografliDahil, setFotografliDahil] = useState(false);
  const [surukleniyor, setSurukleniyor] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [biten, setBiten] = useState(0);
  const [hatalar, setHatalar] = useState<Atlanan[]>([]);
  const [bitti, setBitti] = useState(false);
  const [eksikAcik, setEksikAcik] = useState(false);

  // Stok kodu ve barkod → ürün. Stok kodu önce: barkod bazen birden çok
  // kalemde aynı (koli/adet), stok kodu deponun kendi benzersiz anahtarı.
  const sozluk = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) if (p.barcode) m.set(anahtar(p.barcode), p);
    for (const p of products) if (p.sku) m.set(anahtar(p.sku), p);
    return m;
  }, [products]);

  const plan = useMemo(() => {
    const eslesen: Eslesme[] = [];
    const eslesmeyen: Atlanan[] = [];
    const fotografli = new Set<string>();
    const sayac = new Map<string, number>();
    for (const d of [...dosyalar].sort((a, b) => a.name.localeCompare(b.name))) {
      let urun: Product | undefined;
      for (const a of adAdaylari(d.name)) {
        urun = sozluk.get(a);
        if (urun) break;
      }
      if (!urun) {
        eslesmeyen.push({ ad: d.name, sebep: t("eşleşen stok kodu yok") });
        continue;
      }
      const mevcut = urun.images?.length ?? (urun.coverImageUrl ? 1 : 0);
      if (mevcut > 0 && !fotografliDahil) {
        fotografli.add(urun.id);
        continue;
      }
      if (d.size > MAX_BOYUT) {
        eslesmeyen.push({ ad: d.name, sebep: t("8 MB'tan büyük") });
        continue;
      }
      const n = (sayac.get(urun.id) ?? 0) + 1;
      if (mevcut + n > MAX_GORSEL) {
        eslesmeyen.push({ ad: d.name, sebep: t("üründe en fazla {n} fotoğraf olabilir", { n: MAX_GORSEL }) });
        continue;
      }
      sayac.set(urun.id, n);
      eslesen.push({ dosya: d, urun });
    }
    return { eslesen, eslesmeyen, fotografli: fotografli.size, urunSayisi: sayac.size };
  }, [dosyalar, sozluk, fotografliDahil, t]);

  const sec = (liste: FileList | null | undefined) => {
    if (!liste) return;
    // Klasör seçiminde .DS_Store, eslesme.json gibi dosyalar da gelir.
    const gorseller = Array.from(liste).filter((f) => f.type.startsWith("image/") || GORSEL_UZANTI.test(f.name));
    setDosyalar(gorseller);
    setHatalar([]);
    setBiten(0);
  };

  const yukle = async () => {
    const is = plan.eslesen;
    setYukleniyor(true);
    durdur.current = false;
    let sira = 0;
    let degisti = false;
    const isci = async () => {
      while (!durdur.current && sira < is.length) {
        const { dosya, urun } = is[sira++];
        const fd = new FormData();
        fd.append("file", dosya);
        try {
          await api.uploadFile<Product>(`/products/${urun.id}/images`, fd);
          degisti = true;
        } catch (err) {
          const sebep = err instanceof Error ? err.message : t("yüklenemedi");
          setHatalar((h) => [...h, { ad: dosya.name, sebep }]);
        }
        setBiten((b) => b + 1);
      }
    };
    await Promise.all(Array.from({ length: Math.min(ES_ZAMANLI, is.length) }, isci));
    setYukleniyor(false);
    setBitti(true);
    if (degisti) onDone();
  };

  const kapat = () => {
    // Pencere kapanınca kuyruk durur; yolda olan en fazla üç yükleme tamamlanır.
    durdur.current = true;
    onClose();
  };

  const liste = (l: Atlanan[]) => (
    <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, color: c.textSecondary }}>
      {l.slice(0, 15).map((x, i) => (
        <li key={i}>
          {x.ad}: {x.sebep}
        </li>
      ))}
      {l.length > 15 && <li>{t("… ve {n} dosya daha", { n: l.length - 15 })}</li>}
    </ul>
  );

  const ikincilDugme = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 14px",
    borderRadius: 8,
    border: `1px solid ${c.primary}`,
    background: "transparent",
    color: c.primary,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  } as const;

  const toplam = plan.eslesen.length;
  const basarili = biten - hatalar.length;

  return (
    <Modal title={t("Toplu ürün fotoğrafı yükle")} onClose={kapat}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {!bitti && !yukleniyor && (
          <>
            <p style={{ margin: 0, fontSize: 13, color: c.textSecondary }}>
              {t(
                "Fotoğrafların adı ürünün stok kodu ya da barkodu olsun (örn. ABC-123.jpg). Aynı ürünün ikinci fotoğrafı için ABC-123_2.jpg yazın."
              )}
            </p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setSurukleniyor(true);
              }}
              onDragLeave={() => setSurukleniyor(false)}
              onDrop={(e) => {
                e.preventDefault();
                setSurukleniyor(false);
                sec(e.dataTransfer.files);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                padding: "18px 12px",
                borderRadius: 10,
                border: `2px dashed ${surukleniyor ? c.primary : c.border}`,
                background: surukleniyor ? `${c.primary}10` : "transparent",
                textAlign: "center",
              }}
            >
              <IconUpload size={22} color={c.primary} />
              <span style={{ fontSize: 14, color: c.textPrimary }}>
                {dosyalar.length > 0
                  ? t("{n} fotoğraf seçildi", { n: dosyalar.length })
                  : t("Fotoğrafları buraya bırakın ya da seçin")}
              </span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                <button onClick={() => klasorGirdi.current?.click()} style={ikincilDugme}>
                  {t("Klasör seç")}
                </button>
                <button onClick={() => dosyaGirdi.current?.click()} style={ikincilDugme}>
                  {t("Fotoğraf seç")}
                </button>
              </div>
              <input
                ref={dosyaGirdi}
                type="file"
                multiple
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  sec(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={klasorGirdi}
                type="file"
                // React'in tiplerinde yok; Chrome, Safari ve Firefox destekliyor.
                {...{ webkitdirectory: "" }}
                style={{ display: "none" }}
                onChange={(e) => {
                  sec(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          </>
        )}

        {dosyalar.length > 0 && !bitti && !yukleniyor && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: 12,
              borderRadius: 10,
              background: c.background,
              border: `1px solid ${c.border}`,
              fontSize: 13,
              color: c.textPrimary,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 500 }}>
              {toplam > 0
                ? t("{n} fotoğraf {m} ürüne eklenecek.", { n: toplam, m: plan.urunSayisi })
                : t("Eklenecek fotoğraf yok.")}
            </div>
            {plan.fotografli > 0 && (
              <div style={{ color: c.textSecondary }}>
                {t("{n} ürünün zaten fotoğrafı var, atlanacak.", { n: plan.fotografli })}
              </div>
            )}
            <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer", color: c.textSecondary }}>
              <input type="checkbox" checked={fotografliDahil} onChange={(e) => setFotografliDahil(e.target.checked)} />
              {t("Fotoğrafı olan ürünlere de ekle")}
            </label>
            {plan.eslesmeyen.length > 0 && (
              <div>
                <button
                  onClick={() => setEksikAcik((v) => !v)}
                  style={{ padding: 0, border: "none", background: "transparent", color: c.warning, cursor: "pointer", fontSize: 13 }}
                >
                  {t("{n} fotoğraf eklenmeyecek", { n: plan.eslesmeyen.length })} {eksikAcik ? "▾" : "▸"}
                </button>
                {eksikAcik && liste(plan.eslesmeyen)}
              </div>
            )}
          </div>
        )}

        {(yukleniyor || bitti) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: c.textPrimary }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: bitti ? c.success : c.textPrimary }}>
              {bitti
                ? t("{n} fotoğraf eklendi.", { n: basarili })
                : t("Yükleniyor: {n} / {m}", { n: biten, m: toplam })}
            </div>
            <div style={{ height: 6, borderRadius: 999, background: c.border, overflow: "hidden" }}>
              <div
                style={{
                  width: `${toplam ? Math.round((biten / toplam) * 100) : 0}%`,
                  height: "100%",
                  background: c.primary,
                  transition: "width 0.2s",
                }}
              />
            </div>
            {hatalar.length > 0 && (
              <div style={{ color: c.danger }}>
                {t("Yüklenemeyenler:")}
                {liste(hatalar)}
              </div>
            )}
          </div>
        )}

        {bitti ? (
          <button
            data-primary
            onClick={onClose}
            style={{ background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 16, fontWeight: 500 }}
          >
            {t("Kapat")}
          </button>
        ) : yukleniyor ? (
          <button
            onClick={() => (durdur.current = true)}
            style={{ background: "transparent", color: c.textPrimary, padding: "11px 0", borderRadius: 8, border: `1px solid ${c.border}`, fontSize: 16 }}
          >
            {t("Durdur")}
          </button>
        ) : (
          <button
            data-primary
            disabled={toplam === 0}
            onClick={yukle}
            style={{
              background: c.primary,
              color: c.onPrimary,
              padding: "11px 0",
              borderRadius: 8,
              border: "none",
              fontSize: 16,
              fontWeight: 500,
              opacity: toplam === 0 ? 0.5 : 1,
            }}
          >
            {toplam > 0 ? t("{n} fotoğrafı yükle", { n: toplam }) : t("Fotoğrafları yükle")}
          </button>
        )}
      </div>
    </Modal>
  );
}
