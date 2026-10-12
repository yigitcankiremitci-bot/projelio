import * as ExcelJS from "exceljs";
import * as JSZipModul from "jszip";

// Derlenmiş sunucu (CommonJS) paketleri doğrudan veriyor; Node'un test koşucusu
// ESM olarak yüklüyor ve `default` altına koyuyor (bkz. musteri-sablonu.ts).
const Workbook: typeof ExcelJS.Workbook = (ExcelJS as any).Workbook ?? (ExcelJS as any).default.Workbook;
const JSZip: any = (JSZipModul as any).loadAsync ? JSZipModul : (JSZipModul as any).default;

/**
 * Yüklenen bir .xlsx'i ExcelJS'e açtırır; ExcelJS'in tanımadığı ama GEÇERLİ
 * biçimleri önce onun anlayacağı hâle çevirir.
 *
 * Neden: ExcelJS XML'i ad alanına değil etiket ADINA bakarak okuyor. Muhasebe/ERP
 * programları ve .NET'in OpenXML kütüphanesi aynı ad alanını önekle yazıyor
 * (`<x:workbook xmlns:x="...">`); Excel bunu sorunsuz açar, ExcelJS ise
 * `workbook` etiketini bulamayıp "Cannot read properties of undefined (reading
 * 'sheets')" diye patlıyor. Kullanıcı "dosyam xlsx ama kabul etmiyor" diyordu
 * — haklıydı. "Strict Open XML" kaydı da aynı sınıf: ad alanları farklı adreste.
 *
 * Önce dosya olduğu gibi denenir; yalnızca düşerse düzeltilmiş kopya denenir.
 * O da düşerse İLK hata fırlatılır — asıl sebep odur.
 */
export async function xlsxYukle(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new Workbook();
  try {
    await wb.xlsx.load(buffer as any);
    return wb;
  } catch (ilkHata) {
    const duzeltilmis = await xlsxNormallestir(buffer).catch(() => null);
    if (!duzeltilmis) throw ilkHata;
    const ikinci = new Workbook();
    try {
      await ikinci.xlsx.load(duzeltilmis as any);
      return ikinci;
    } catch {
      throw ilkHata;
    }
  }
}

/** Strict Open XML ad alanı → ExcelJS'in beklediği (Transitional) karşılığı. */
const STRICT_AD_ALANLARI: [string, string][] = [
  ["http://purl.oclc.org/ooxml/spreadsheetml/main", "http://schemas.openxmlformats.org/spreadsheetml/2006/main"],
  ["http://purl.oclc.org/ooxml/officeDocument/relationships", "http://schemas.openxmlformats.org/officeDocument/2006/relationships"],
  ["http://purl.oclc.org/ooxml/drawingml/main", "http://schemas.openxmlformats.org/drawingml/2006/main"],
];

const ANA_AD_ALANI = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

/** Tek bir XML parçasını düzeltir (saf; test edilebilsin diye ayrı). */
export function xmlNormallestir(xml: string): string {
  let sonuc = xml;
  for (const [strict, gecis] of STRICT_AD_ALANLARI) sonuc = sonuc.split(strict).join(gecis);
  // Ana ad alanına bağlı öneki bul ve kaldır: <x:row> → <row>, xmlns:x → xmlns.
  const onek = new RegExp(`xmlns:([A-Za-z_][\\w.-]*)="${ANA_AD_ALANI.replace(/[.]/g, "\\.")}"`).exec(sonuc)?.[1];
  if (!onek) return sonuc;
  // Aynı belgede hem önekli hem öneksiz varsayılan ad alanı olabilir; ikinci
  // bir xmlns="..." eklemek XML'i bozardı.
  const varsayilanVar = new RegExp(`\\sxmlns="`).test(sonuc);
  sonuc = sonuc.replace(new RegExp(`<(/?)${onek}:`, "g"), "<$1");
  sonuc = sonuc.replace(`xmlns:${onek}="${ANA_AD_ALANI}"`, varsayilanVar ? "" : `xmlns="${ANA_AD_ALANI}"`);
  return sonuc;
}

async function xlsxNormallestir(buffer: Buffer): Promise<Buffer | null> {
  const zip = await JSZip.loadAsync(buffer);
  let degisti = false;
  for (const ad of Object.keys(zip.files)) {
    const dosya = zip.files[ad];
    if (dosya.dir || !/\.(xml|rels)$/i.test(ad)) continue;
    const eski = await dosya.async("string");
    const yeni = xmlNormallestir(eski);
    if (yeni !== eski) {
      zip.file(ad, yeni);
      degisti = true;
    }
  }
  return degisti ? zip.generateAsync({ type: "nodebuffer" }) : null;
}
