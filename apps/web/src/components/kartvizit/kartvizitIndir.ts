/**
 * Kartvizit QR'ını dosya olarak indirme. SVG baskı için (sonsuz keskin),
 * PNG mesajla göndermek ve sosyal medya için.
 */

function indir(blob: Blob, dosyaAdi: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dosyaAdi;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function svgVeriAdresi(svg: string): string {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

export function svgIndir(svg: string, dosyaAdi: string) {
  indir(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), dosyaAdi);
}

/**
 * SVG'yi tuvale çizip PNG olarak indirir. Genişlik 1200 px: A6 baskıda bile
 * keskin, mesajla göndermek için yeterince küçük.
 */
export async function pngIndir(svg: string, dosyaAdi: string, genislik = 1200): Promise<void> {
  const img = new Image();
  img.src = svgVeriAdresi(svg);
  await img.decode();
  const oran = img.naturalHeight / img.naturalWidth || 1;
  const tuval = document.createElement("canvas");
  tuval.width = genislik;
  tuval.height = Math.round(genislik * oran);
  const ctx = tuval.getContext("2d");
  if (!ctx) throw new Error("Tuval açılamadı");
  ctx.drawImage(img, 0, 0, tuval.width, tuval.height);
  const blob = await new Promise<Blob | null>((r) => tuval.toBlob(r, "image/png"));
  if (!blob) throw new Error("PNG üretilemedi");
  indir(blob, dosyaAdi);
}
