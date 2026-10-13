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
 * openpyxl'in mutlak ilişki adresleri de (bkz. relsHedefleriniGoreceYap).
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

/**
 * Bir .rels dosyasındaki MUTLAK hedefleri (`Target="/xl/comments/comment1.xml"`)
 * ilişkinin sahibi olan parçanın klasörüne göre GÖRELİ yazar.
 *
 * Neden: Python'un openpyxl'i (Claude'a, ChatGPT'ye düzenletilen dosyaların
 * hepsi ondan çıkıyor) hedefleri paket kökünden mutlak yazar; standart buna izin
 * verir ve Excel açar. ExcelJS ise bağları dosya adına göre eşliyor ve mutlak
 * adresi tanımıyor. Şablonumuzun başlık hücrelerinde açıklama (yorum) olduğu
 * için "şablonu indir → Claude'a düzenlet → yükle" yolu "reading 'comments'"
 * hatasıyla her seferinde kırılıyordu (yorumlar için bkz. aşağıdaki not).
 * Dış bağlantılar (TargetMode="External") adres değil URL, dokunulmaz.
 */
export function relsHedefleriniGoreceYap(xml: string, relsYolu: string): string {
  // xl/worksheets/_rels/sheet1.xml.rels → sahibi xl/worksheets/sheet1.xml → klasörü xl/worksheets
  const sahipKlasor = relsYolu.replace(/(^|\/)_rels\/[^/]*$/, "").split("/").filter(Boolean);
  return xml.replace(/<Relationship\b[^>]*>/g, (etiket) => {
    // Hücre yorumları: ExcelJS yorum dosyasını yalnızca kendi yazdığı adda
    // (xl/comments1.xml, xl/drawings/vmlDrawing1.vml) tanıyor; openpyxl
    // xl/comments/comment1.xml yazıyor ve adres göreli olsa da bulunamıyor.
    // Okumada yorumun değeri yok (bizim şablonda yalnızca sütun açıklaması),
    // bağı atmak dosyayı açılır kılıyor. Bu yol zaten yalnızca ilk deneme
    // düştüğünde çalışıyor; düzgün dosyaların yorumları olduğu gibi okunur.
    if (/Type="[^"]*\/(comments|vmlDrawing)"/.test(etiket)) return "";
    if (/TargetMode="External"/.test(etiket)) return etiket;
    return etiket.replace(/Target="\/([^"]*)"/, (_t, hedef: string) => {
      const parcalar = hedef.split("/");
      let ortak = 0;
      while (ortak < sahipKlasor.length && ortak < parcalar.length - 1 && sahipKlasor[ortak] === parcalar[ortak]) ortak++;
      const goreli = [...Array(sahipKlasor.length - ortak).fill(".."), ...parcalar.slice(ortak)].join("/");
      return `Target="${goreli}"`;
    });
  });
}

async function xlsxNormallestir(buffer: Buffer): Promise<Buffer | null> {
  const zip = await JSZip.loadAsync(buffer);
  let degisti = false;
  for (const ad of Object.keys(zip.files)) {
    const dosya = zip.files[ad];
    if (dosya.dir || !/\.(xml|rels)$/i.test(ad)) continue;
    const eski = await dosya.async("string");
    let yeni = xmlNormallestir(eski);
    if (/\.rels$/i.test(ad)) yeni = relsHedefleriniGoreceYap(yeni, ad);
    if (yeni !== eski) {
      zip.file(ad, yeni);
      degisti = true;
    }
  }
  return degisti ? zip.generateAsync({ type: "nodebuffer" }) : null;
}
