import { useEffect, useState } from "react";
import type { Party, Product, ProductKind, ProductSpec, ProductStatus, ProductUnit } from "@projelio/shared";
import { PRODUCT_KIND_LABEL, PRODUCT_STATUS_LABEL, PRODUCT_UNIT_LABEL, PRODUCT_UNITS } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import ProductImagesEditor from "./ProductImagesEditor";
import { IconPlus, IconX } from "./icons";
import { brutKarMarji, formatPara, kdvDahilFiyat } from "../lib/urunKarti";
import { useT } from "../lib/i18n";

interface Props {
  /** Kaydet düğmesi formun DIŞINDA (modalin yapışkan çubuğunda) durur ve bu kimlikle bağlanır. */
  formId: string;
  organizationId: string;
  departmentId?: string;
  product?: Product;
  /** Kayıt bitti: yeni ürün oluştu ya da mevcut ürün güncellendi. */
  onSaved: (product: Product) => void;
  /** Fotoğraflar kaydetmeyi beklemeden değişir; üst bileşen listesini tazelesin. */
  onImagesChanged?: (product: Product) => void;
  onBusyChange?: (busy: boolean) => void;
}

// Türüne göre önerilen teknik özellik başlıkları. Öneri, zorunluluk değil:
// kullanıcıya boş bir tablo yerine nereden başlayacağını gösteriyor.
// Metinler render anında t() ile çevrilir; burada sözlük anahtarıdır.
// dil:anahtar-baslangic
const SPEC_ONERILERI: Record<ProductKind, string[]> = {
  product: ["Ölçüler", "Ağırlık", "Malzeme", "Renk", "Menşei", "Ambalaj"],
  service: ["Süre", "Kapsam", "Teslim şekli", "Revizyon hakkı", "Destek", "Hizmet bölgesi"],
};
// dil:anahtar-bitis

/**
 * Ürün/hizmet formu — "Yeni ürün" modali ile ürün kartının "Bilgiler" sekmesi
 * aynı bileşeni kullanır. İki ayrı kopya olsaydı yeni bir alan birine eklenip
 * ötekinde unutulurdu (074'te kart ile modal böyle ayrışmıştı).
 *
 * Alanlar öbeklere ayrılı; ad dışında hiçbiri zorunlu değil: hizmet satan biri
 * için stok ve barkod anlamsız, ürün satan biri için vazgeçilmez. Tür "Hizmet"
 * seçilince stok/kod öbeği GİZLENİR ama değerleri silinmez — yanlışlıkla tür
 * değiştirip geri alan kullanıcı stok bilgisini kaybetmesin.
 */
export default function ProductForm({
  formId,
  organizationId,
  departmentId,
  product,
  onSaved,
  onImagesChanged,
  onBusyChange,
}: Props) {
  const c = useThemeColors();
  const t = useT();
  const isEdit = !!product;

  const [current, setCurrent] = useState<Product | undefined>(product);

  const [kind, setKind] = useState<ProductKind>(product?.kind ?? "product");
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [status, setStatus] = useState<ProductStatus>(product?.status ?? "active");

  const [features, setFeatures] = useState<string[]>(product?.features ?? []);
  const [featureDraft, setFeatureDraft] = useState("");
  const [specs, setSpecs] = useState<ProductSpec[]>(product?.specs ?? []);

  const [sku, setSku] = useState(product?.sku ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");

  const sayiMetni = (value?: number) => (value !== undefined && value !== null ? String(value) : "");
  const [price, setPrice] = useState(sayiMetni(product?.price));
  const [currency, setCurrency] = useState(product?.currency ?? "TRY");
  const [costPrice, setCostPrice] = useState(sayiMetni(product?.costPrice));
  const [taxRate, setTaxRate] = useState(sayiMetni(product?.taxRate));

  const [stockQuantity, setStockQuantity] = useState(sayiMetni(product?.stockQuantity));
  const [minStock, setMinStock] = useState(sayiMetni(product?.minStock));
  const [unit, setUnit] = useState<ProductUnit | "">(product?.unit ?? "");

  const [supplierPartyId, setSupplierPartyId] = useState(product?.supplierPartyId ?? "");
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [warranty, setWarranty] = useState(product?.warranty ?? "");
  const [leadTime, setLeadTime] = useState(product?.leadTime ?? "");

  const [productUrl, setProductUrl] = useState(product?.productUrl ?? "");
  const [notes, setNotes] = useState(product?.notes ?? "");

  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    // Tedarikçiler ortak party kaydından gelir. Kullanıcının müşteri/tedarikçi
    // listesini okuma yetkisi yoksa istek reddedilir; o durumda seçici yalnızca
    // mevcut seçimi korur, form çalışmaya devam eder.
    api
      .get<Party[]>(`/organizations/${organizationId}/party?role=supplier`)
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, [organizationId]);

  const metin = (value: string) => (value.trim() ? value.trim() : null);
  const sayi = (value: string) => (value.trim() ? value.trim().replace(",", ".") : null);
  const sayiDegeri = (value: string) => {
    const n = Number(value.trim().replace(",", "."));
    return value.trim() && Number.isFinite(n) ? n : undefined;
  };

  const ozellikEkle = () => {
    const text = featureDraft.trim();
    if (!text) return;
    setFeatures((list) => (list.includes(text) ? list : [...list, text]));
    setFeatureDraft("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    onBusyChange?.(true);

    // Taslak kutuda kalmış bir özellik de kaydedilsin: kullanıcı yazıp Enter'a
    // basmadan "Kaydet"e basarsa yazdığı madde sessizce kaybolmasın.
    const sonOzellikler = featureDraft.trim() && !features.includes(featureDraft.trim())
      ? [...features, featureDraft.trim()]
      : features;

    const gövde = {
      kind,
      name,
      description: metin(description),
      category: metin(category),
      brand: metin(brand),
      status,
      features: sonOzellikler,
      specs,
      sku: metin(sku),
      barcode: metin(barcode),
      price: sayi(price),
      currency,
      costPrice: sayi(costPrice),
      taxRate: sayi(taxRate),
      stockQuantity: sayi(stockQuantity),
      minStock: sayi(minStock),
      unit: unit || null,
      supplierPartyId: supplierPartyId || null,
      warranty: metin(warranty),
      leadTime: metin(leadTime),
      productUrl: metin(productUrl),
      notes: metin(notes),
    };

    try {
      if (isEdit && current) {
        const saved = await api.patch<Product>(`/products/${current.id}`, gövde);
        setFeatures(sonOzellikler);
        setFeatureDraft("");
        onSaved(saved);
      } else {
        const olusan = await api.post<Product>(`/organizations/${organizationId}/products`, {
          departmentId,
          ...gövde,
        });
        // Ürün oluştuktan SONRA fotoğraflar: yükleme uçları ürün kimliği
        // istiyor. Sırayla gönderiliyor ki sıraları seçilen sırayla aynı olsun.
        let son = olusan;
        for (const file of pendingImages) {
          const formData = new FormData();
          formData.append("file", file);
          son = await api.uploadFile<Product>(`/products/${olusan.id}/images`, formData);
        }
        onSaved(son);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Ürün/hizmet kaydedilemedi. Tekrar dene."));
    } finally {
      onBusyChange?.(false);
    }
  };

  const alan = (etiket: string, girdi: React.ReactNode, ipucu?: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <label style={{ fontSize: 14, color: c.textSecondary }}>{etiket}</label>
      {girdi}
      {ipucu && <span style={{ fontSize: 12.5, color: c.textSecondary }}>{ipucu}</span>}
    </div>
  );

  const bolum = (baslik: string, aciklama: string | null, icerik: React.ReactNode) => (
    <section
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {(baslik || aciklama) && (
        <div>
          {baslik && <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: c.textPrimary }}>{baslik}</h3>}
          {aciklama && <p style={{ margin: "2px 0 0", fontSize: 13, color: c.textSecondary }}>{aciklama}</p>}
        </div>
      )}
      {icerik}
    </section>
  );

  const fiyatSayisi = sayiDegeri(price);
  const marj = brutKarMarji(fiyatSayisi, sayiDegeri(costPrice));
  const kdvli = kdvDahilFiyat(fiyatSayisi, sayiDegeri(taxRate));

  const kullanilmayanOneriler = SPEC_ONERILERI[kind].filter(
    (oneri) => !specs.some((s) => s.label.toLocaleLowerCase("tr-TR") === oneri.toLocaleLowerCase("tr-TR"))
  );

  // Seçili tedarikçi listede yoksa (yetki yok ya da tedarikçi rolü kaldırılmış)
  // seçimi kaybetmemek için ayrı bir seçenek olarak gösterilir.
  const seciliListedeYok = supplierPartyId && !suppliers.some((s) => s.id === supplierPartyId);

  return (
    <form id={formId} onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Düzenleyicinin kendi "Fotoğraflar (n/12)" başlığı var; bölüm başlığı
          eklenirse aynı kelime alt alta iki kez yazıyordu. */}
      {bolum(
        "",
        t("İlk fotoğraf vitrin görselidir; oklarla sırayı değiştirebilirsin."),
        <ProductImagesEditor
          productId={current?.id}
          images={current?.images ?? []}
          pending={pendingImages}
          onPendingChange={setPendingImages}
          onChanged={(guncel) => {
            setCurrent(guncel);
            onImagesChanged?.(guncel);
          }}
        />
      )}

      {bolum(
        t("Temel bilgiler"),
        null,
        <>
          <div role="radiogroup" aria-label={t("Tür")} style={{ display: "flex", gap: 8 }}>
            {(Object.keys(PRODUCT_KIND_LABEL) as ProductKind[]).map((key) => {
              const secili = kind === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={secili}
                  onClick={() => setKind(key)}
                  style={{
                    flex: 1,
                    padding: "9px 0",
                    borderRadius: 8,
                    fontSize: 15,
                    border: `1px solid ${secili ? c.primary : c.border}`,
                    background: secili ? c.primary : "transparent",
                    color: secili ? c.onPrimary : c.textPrimary,
                  }}
                >
                  {t(PRODUCT_KIND_LABEL[key])}
                </button>
              );
            })}
          </div>

          {alan(
            kind === "service" ? t("Hizmet adı") : t("Ürün adı"),
            <input value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%" }} />
          )}

          {alan(
            t("Açıklama"),
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("Ürünü/hizmeti anlatan metin (opsiyonel)")}
              rows={6}
              style={cokSatirliStil}
            />
          )}

          <div style={IZGARA}>
            {alan(
              t("Kategori"),
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t("Örn. Mobilya")} style={{ width: "100%" }} />
            )}
            {alan(
              t("Marka"),
              <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder={t("Opsiyonel")} style={{ width: "100%" }} />
            )}
            {alan(
              t("Durum"),
              <select value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)} style={{ width: "100%" }}>
                {(Object.keys(PRODUCT_STATUS_LABEL) as ProductStatus[]).map((key) => (
                  <option key={key} value={key}>
                    {t(PRODUCT_STATUS_LABEL[key])}
                  </option>
                ))}
              </select>
            )}
          </div>
        </>
      )}

      {bolum(
        t("Öne çıkan özellikler"),
        t("Müşteriye ilk söyleyeceğin maddeler. Kısa tut: bir madde, bir fayda."),
        <>
          {features.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {features.map((ozellik, index) => (
                <li
                  key={`${ozellik}-${index}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px 6px 12px",
                    borderRadius: 8,
                    background: c.background,
                    fontSize: 15,
                    color: c.textPrimary,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{ozellik}</span>
                  <button
                    type="button"
                    aria-label={t("Özelliği kaldır")}
                    onClick={() => setFeatures((list) => list.filter((_, i) => i !== index))}
                    style={ikonDugmesi}
                  >
                    <IconX size={14} color={c.textSecondary} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={featureDraft}
              onChange={(e) => setFeatureDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter maddeyi ekler, formu göndermez: Modal'ın genel "Enter =
                // kaydet" kuralı buraya ulaşmadan olay burada biter.
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.stopPropagation();
                  ozellikEkle();
                }
              }}
              placeholder={t("Örn. Su geçirmez kumaş")}
              style={{ flex: 1, minWidth: 0 }}
            />
            <button type="button" onClick={ozellikEkle} disabled={!featureDraft.trim()} style={ikincilDugme(c)}>
              {t("Ekle")}
            </button>
          </div>
        </>
      )}

      {bolum(
        t("Teknik özellikler"),
        kind === "service"
          ? t("Hizmetin kapsamı, süresi ve koşulları.")
          : t("Ölçü, ağırlık, malzeme gibi ürünün sabit bilgileri."),
        <>
          {specs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {specs.map((spec, index) => (
                <div key={index} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={spec.label}
                    onChange={(e) =>
                      setSpecs((list) => list.map((s, i) => (i === index ? { ...s, label: e.target.value } : s)))
                    }
                    placeholder={t("Özellik")}
                    aria-label={t("Özellik")}
                    style={{ flex: 2, minWidth: 0 }}
                  />
                  <input
                    value={spec.value}
                    onChange={(e) =>
                      setSpecs((list) => list.map((s, i) => (i === index ? { ...s, value: e.target.value } : s)))
                    }
                    placeholder={t("Değer")}
                    aria-label={t("Değer")}
                    style={{ flex: 3, minWidth: 0 }}
                  />
                  <button
                    type="button"
                    aria-label={t("Satırı kaldır")}
                    onClick={() => setSpecs((list) => list.filter((_, i) => i !== index))}
                    style={ikonDugmesi}
                  >
                    <IconX size={14} color={c.textSecondary} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button
              type="button"
              onClick={() => setSpecs((list) => [...list, { label: "", value: "" }])}
              style={{ ...ikincilDugme(c), display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <IconPlus size={14} color={c.textPrimary} />
              {t("Satır ekle")}
            </button>
            {kullanilmayanOneriler.map((oneri) => (
              <button
                key={oneri}
                type="button"
                onClick={() => setSpecs((list) => [...list, { label: t(oneri), value: "" }])}
                style={{
                  padding: "5px 10px",
                  borderRadius: 999,
                  border: `1px dashed ${c.border}`,
                  background: "transparent",
                  color: c.textSecondary,
                  fontSize: 13,
                }}
              >
                + {t(oneri)}
              </button>
            ))}
          </div>
        </>
      )}

      {bolum(
        t("Fiyat ve kârlılık"),
        t("Fiyat ve maliyet KDV hariç girilir."),
        <>
          <div style={IZGARA}>
            {alan(
              t("Satış fiyatı"),
              <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder={t("Opsiyonel")} inputMode="decimal" style={{ width: "100%" }} />
            )}
            {alan(
              t("Para birimi"),
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: "100%" }}>
                <option value="TRY">{t("TRY")}</option>
                <option value="USD">{t("USD")}</option>
                <option value="EUR">{t("EUR")}</option>
              </select>
            )}
            {alan(
              t("Maliyet"),
              <input value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder={t("Opsiyonel")} inputMode="decimal" style={{ width: "100%" }} />
            )}
            {alan(
              t("KDV (%)"),
              <input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="20" inputMode="decimal" style={{ width: "100%" }} />
            )}
          </div>
          {(marj !== null || kdvli !== null) && (
            <p style={{ margin: 0, fontSize: 13.5, color: c.textSecondary }}>
              {[
                kdvli !== null ? t("KDV dahil: {tutar}", { tutar: formatPara(kdvli, currency) ?? "" }) : null,
                marj !== null ? t("Brüt kâr marjı: %{oran}", { oran: marj.toFixed(1).replace(".", ",") }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </>
      )}

      {kind === "product" &&
        bolum(
          t("Stok ve kodlar"),
          null,
          <div style={IZGARA}>
            {alan(
              t("Stok miktarı"),
              <input value={stockQuantity} onChange={(e) => setStockQuantity(e.target.value)} placeholder={t("Opsiyonel")} inputMode="decimal" style={{ width: "100%" }} />
            )}
            {alan(
              t("Birim"),
              <select value={unit} onChange={(e) => setUnit(e.target.value as ProductUnit | "")} style={{ width: "100%" }}>
                <option value="">—</option>
                {PRODUCT_UNITS.map((key) => (
                  <option key={key} value={key}>
                    {t(PRODUCT_UNIT_LABEL[key])}
                  </option>
                ))}
              </select>
            )}
            {alan(
              t("Kritik stok seviyesi"),
              <input value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder={t("Opsiyonel")} inputMode="decimal" style={{ width: "100%" }} />,
              t("Stok bu miktara inince kart uyarır.")
            )}
            {alan(
              t("Stok kodu (SKU)"),
              <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder={t("Şirket içinde benzersiz")} style={{ width: "100%" }} />
            )}
            {alan(
              t("Barkod"),
              <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder={t("Opsiyonel")} style={{ width: "100%" }} />
            )}
          </div>
        )}

      {bolum(
        kind === "service" ? t("Teslim ve koşullar") : t("Tedarik ve garanti"),
        null,
        <div style={IZGARA}>
          {alan(
            t("Tedarikçi"),
            <select value={supplierPartyId} onChange={(e) => setSupplierPartyId(e.target.value)} style={{ width: "100%" }}>
              <option value="">—</option>
              {seciliListedeYok && <option value={supplierPartyId}>{t("Mevcut tedarikçi")}</option>}
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>,
            suppliers.length === 0 ? t("Tedarikçiler Müşteriler modülünde “tedarikçi” rolüyle eklenir.") : undefined
          )}
          {alan(
            kind === "service" ? t("Teslim / başlama süresi") : t("Teslim süresi"),
            <input value={leadTime} onChange={(e) => setLeadTime(e.target.value)} placeholder={t("Örn. 3 iş günü")} maxLength={120} style={{ width: "100%" }} />
          )}
          {alan(
            t("Garanti"),
            <input value={warranty} onChange={(e) => setWarranty(e.target.value)} placeholder={t("Örn. 2 yıl")} maxLength={120} style={{ width: "100%" }} />
          )}
        </div>
      )}

      {bolum(
        t("Ek bilgi"),
        null,
        <>
          {alan(
            t("Ürün adresi"),
            <input value={productUrl} onChange={(e) => setProductUrl(e.target.value)} placeholder={t("https://… (tanıtım ya da satış sayfası)")} style={{ width: "100%" }} />
          )}
          {alan(
            t("İç not"),
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("Yalnızca şirket içinde görünür (tedarikçi, raf yeri, uyarı…)")}
              rows={3}
              style={cokSatirliStil}
            />
          )}
        </>
      )}

      {error && <p style={{ color: c.danger, fontSize: 15, margin: 0 }}>{error}</p>}
    </form>
  );
}

const IZGARA = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px 14px",
} as const;

const ikonDugmesi: React.CSSProperties = {
  width: 30,
  height: 30,
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  borderRadius: 6,
  background: "transparent",
};

function ikincilDugme(c: ReturnType<typeof useThemeColors>): React.CSSProperties {
  return {
    padding: "0 14px",
    height: 42,
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
    fontSize: 14.5,
    whiteSpace: "nowrap",
  };
}

/**
 * Çok satırlı alanların kutu stili.
 *
 * `height: "auto"` ŞART. index.css'teki genel kural `input, select, textarea`
 * için `height: 42px` veriyor; bu, textarea'nın `rows` özniteliğini eziyor ve
 * sekiz satırlık bir alan bile tek satır yüksekliğinde çiziliyor. Yüksekliği
 * `auto`ya çekince yüksekliği yine `rows` belirliyor.
 *
 * Dikey dolgu da aynı genel kuraldan geliyor (`padding: 0 12px`): tek satırlık
 * bir input'ta doğru, çok satırlıda ilk satırı kutunun tam üst kenarına
 * yapıştırıyor.
 */
const cokSatirliStil: React.CSSProperties = {
  width: "100%",
  height: "auto",
  padding: "10px 12px",
  lineHeight: 1.5,
  resize: "vertical",
  fontFamily: "inherit",
  fontSize: "inherit",
};
