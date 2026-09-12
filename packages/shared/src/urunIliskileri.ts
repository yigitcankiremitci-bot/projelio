import type { ModuleAccess, ModuleRecord, Product } from "./types";

// Ürün kartının "Modüllerde" bölümü: bir ürünün adının geçtiği modül kayıtları.
//
// NEDEN METİN EŞLEŞMESİ. Tedarik, depo, kalite gibi modüllerde ürün bugün bir
// kimlikle değil SERBEST METİNLE yazılıyor ("Ürün / malzeme" alanı). Bu
// kayıtları ürüne kimlikle bağlamak her modüle bir ürün seçicisi eklemeyi ve
// eski kayıtları elle eşlemeyi gerektirir. Kart o gün gelene kadar boş
// kalmasın diye kayıtlar ürünün ADI ve STOK KODU üzerinden bulunuyor.
//
// Yanlış pozitifi sınırlayan iki kural:
//   · Her modülde yalnızca ürünü anlatan alanlara bakılır (aşağıdaki liste) —
//     notlar alanına bakılsaydı "masa" adlı ürün, "masa başı toplantı" notunu
//     da getirirdi.
//   · Eşleşme KELİME SINIRINDA aranır ve 3 harften kısa adlar aranmaz: "Su"
//     adlı bir ürün "sunucu" geçen her kaydı ürüne bağlardı.
//
// Sunucu ve arayüz aynı koddan geçsin diye burada (bkz. ProductsService.overview).

/** Ürün Stratejisi A1 modülü — kaydı `scope_ref = products.id` ile bağlı. */
export const URUN_STRATEJI_MODUL_KEY = "pd_urun_stratejileri";

/**
 * Modül → ürünü anlatan alanlar. Sıra, kartta modüllerin gösterilme sırasıdır:
 * ürünün tedarik zinciri önce, pazarlama ve müşteri tarafı sonra.
 */
export const URUN_BAGLANTI_ALANLARI: Record<string, string[]> = {
  oud_depo: ["itemName", "sku"],
  oud_tedarik: ["itemName"],
  oud_sevkiyat_yonetimi: ["itemSummary"],
  oud_kalite_kontrol: ["relatedItem", "title"],
  // A1'den önceki liste biçimli strateji kayıtları: ürün adı metin olarak durur.
  pd_urun_stratejileri: ["productName"],
  pd_reklam: ["campaignName"],
  pd_email: ["campaignName"],
  spd_satis_planlama_b2b_b2c: ["opportunityName"],
  mid_sikayet_oneri: ["description"],
  mid_teknik_destek: ["subject", "description"],
  hud_marka_patent_telif: ["title"],
};

export type UrunEslesmeTuru = "sku" | "name";

/** Karşılaştırma için sadeleştirme: Türkçe küçük harf, tek boşluk. */
export function urunMetniSadelestir(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
}

function kacir(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `aranan` metnin içinde kelime sınırında geçiyor mu. */
function kelimeOlarakGecer(metin: string, aranan: string): boolean {
  if (!metin || !aranan) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${kacir(aranan)}($|[^\\p{L}\\p{N}])`, "u").test(metin);
}

/** En kısa aranabilir ad. Daha kısası neredeyse her metinde geçer. */
const EN_KISA_AD = 3;

/**
 * Kayıt bu ürünle ilgili mi; ilgiliyse neyle eşleşti.
 *
 * Stok kodu addan ÖNCE bakılır: kod şirkette tekildir (bkz. migration 074),
 * ad değildir — kodla eşleşme daha güçlü bir kanıttır.
 */
export function urunKaydiEslesir(
  product: Pick<Product, "name" | "sku">,
  moduleKey: string,
  data: Record<string, unknown> | null | undefined
): UrunEslesmeTuru | null {
  const alanlar = URUN_BAGLANTI_ALANLARI[moduleKey];
  if (!alanlar || !data) return null;

  const metinler = alanlar.map((alan) => urunMetniSadelestir(data[alan])).filter(Boolean);
  if (metinler.length === 0) return null;

  const sku = urunMetniSadelestir(product.sku);
  if (sku && metinler.some((metin) => kelimeOlarakGecer(metin, sku))) return "sku";

  const ad = urunMetniSadelestir(product.name);
  if (ad.length >= EN_KISA_AD && metinler.some((metin) => kelimeOlarakGecer(metin, ad))) return "name";

  return null;
}

/** Ürünle ilgili bulunan kayıtlar, modül sırasına göre (bkz. URUN_BAGLANTI_ALANLARI). */
export function urunIliskiliKayitlar(
  product: Pick<Product, "id" | "name" | "sku">,
  records: ModuleRecord[]
): Array<{ record: ModuleRecord; matchedBy: UrunEslesmeTuru }> {
  const sira = Object.keys(URUN_BAGLANTI_ALANLARI);
  const sonuc: Array<{ record: ModuleRecord; matchedBy: UrunEslesmeTuru }> = [];
  for (const record of records) {
    // Kimlikle bağlı strateji kaydı ayrı bölümde gösterilir; burada da çıkarsa
    // aynı metin kartta iki kez görünürdü.
    if (record.scopeRef) continue;
    const matchedBy = urunKaydiEslesir(product, record.moduleKey, record.data);
    if (matchedBy) sonuc.push({ record, matchedBy });
  }
  return sonuc.sort((a, b) => sira.indexOf(a.record.moduleKey) - sira.indexOf(b.record.moduleKey));
}

/** Ürün kartının tek istekte aldığı her şey: `GET /products/:id/overview`. */
export interface ProductOverview {
  product: Product;
  /** Bu kullanıcı ürünü düzenleyebilir mi (sahip ya da ürünün departman yöneticisi). */
  canManage: boolean;
  supplier?: {
    id: string;
    displayName: string;
    email?: string;
    phone?: string;
    website?: string;
  };
  strategy: {
    /** Ürün Stratejisi modülü şirkette açık mı. */
    enabled: boolean;
    /** Modülün açık olduğu departman — yeni kayıt ona yazılır. */
    departmentId?: string;
    access: Pick<ModuleAccess, "canRead" | "canWrite" | "canManageTeam">;
    record?: ModuleRecord;
  };
  related: Array<{
    moduleKey: string;
    moduleName: string;
    matchedBy: UrunEslesmeTuru;
    record: ModuleRecord;
    /** Kayıt kaydedildiği departmanın sayfasında açılabilsin diye. */
    departmentId?: string;
  }>;
  /** Tavana takılıp kesilen ilişkili kayıt var mı. */
  relatedTruncated: boolean;
}
