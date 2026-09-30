/**
 * YAZILAN YER HER ZAMAN KLAVYENİN HEMEN ÜSTÜNDE GÖRÜNÜR KALIR.
 *
 * NEDEN: telefonda (özellikle Android'de, Capacitor kabuğunda) klavye açılınca
 * WebView küçülüyor ama odaklanan alanı görünür alana getirmek tarayıcıya
 * kalıyordu. Görev oluşturma gibi pencerelerde alan klavyenin arkasında ya da
 * ekranın üstünde kalıyor, yazılanı görmek için elle kaydırmak gerekiyordu.
 * Yazdıkça alan büyüdüğünde (satır eklenince) de kimse onu tekrar kaydırmıyordu.
 *
 * NASIL: odaklanınca, her tuşta ve klavye/görünür alan değişince imlecin
 * (yani yazılan SON kelimenin) ekrandaki yeri ölçülür; klavyenin üstünde bir
 * konfor payı kalacak biçimde, imleci saran kaydırılabilir kapların hepsi
 * gerektiği kadar kaydırılır. Bileşenler ayrıca bir şey yapmaz — tek yerden,
 * belge düzeyinde dinlenir.
 *
 * Yalnızca dokunmatik cihazda çalışır: masaüstünde kaydırmayı ellemenin anlamı
 * yok, kullanıcı fareyle zaten yönetiyor.
 */

/** Yazılan satırla klavye (ya da görünür alan sınırı) arasında bırakılan boşluk. */
export const KONFOR_PAYI = 28;

const YAZI_ALANI = "input, textarea, [contenteditable=''], [contenteditable='true']";
const YAZILMAZ_INPUT = new Set([
  "checkbox", "radio", "button", "submit", "reset", "file", "range", "color", "image", "hidden",
]);

function yaziAlaniMi(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement) || !el.matches(YAZI_ALANI)) return false;
  if (el instanceof HTMLInputElement && YAZILMAZ_INPUT.has(el.type)) return false;
  return true;
}

/**
 * Bir kaba göre gerekli kaydırma miktarı (saf, test edilebilir).
 * `ust`/`alt` imlecin satırının, `kapUst`/`kapAlt` görünür bölgenin sınırı.
 * Pozitif dönüş = aşağı kaydır. Satır bölgeden yüksekse ALT kenar önceliklidir:
 * yazılan son kelimeler görünsün.
 */
export function kaydirmaMiktari(
  ust: number,
  alt: number,
  kapUst: number,
  kapAlt: number,
  pay: number = KONFOR_PAYI,
): number {
  if (alt + pay > kapAlt) return alt + pay - kapAlt;
  if (ust - pay < kapUst) return ust - pay - kapUst;
  return 0;
}

/** İmlecin bulunduğu satırın ekrandaki dikdörtgeni. */
function imlecDikdortgeni(el: HTMLElement): { ust: number; alt: number } {
  const kutu = el.getBoundingClientRect();

  if (el.isContentEditable) {
    const sec = window.getSelection();
    if (sec && sec.rangeCount > 0 && el.contains(sec.anchorNode)) {
      const r = sec.getRangeAt(0).cloneRange();
      r.collapse(false);
      const dikdortgen = r.getClientRects()[0] ?? r.getBoundingClientRect();
      if (dikdortgen && (dikdortgen.height > 0 || dikdortgen.top > 0)) {
        return { ust: dikdortgen.top, alt: dikdortgen.bottom };
      }
    }
    return { ust: kutu.top, alt: kutu.bottom };
  }

  if (el instanceof HTMLTextAreaElement) {
    // İmleç satırını ölçmek için aynı biçimde bir ayna kutusu kurulur.
    const cs = getComputedStyle(el);
    const konum = el.selectionEnd ?? el.value.length;
    const ayna = document.createElement("div");
    const s = ayna.style;
    s.position = "fixed";
    s.visibility = "hidden";
    s.top = "0";
    s.left = "-9999px";
    s.width = `${el.clientWidth}px`;
    s.boxSizing = "content-box";
    s.whiteSpace = "pre-wrap";
    s.wordWrap = "break-word";
    s.overflowWrap = "break-word";
    for (const ozellik of [
      "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing",
      "textTransform", "wordSpacing", "textIndent", "lineHeight", "tabSize",
    ] as const) {
      s[ozellik] = cs[ozellik];
    }
    s.paddingTop = cs.paddingTop;
    s.paddingBottom = cs.paddingBottom;
    s.paddingLeft = cs.paddingLeft;
    s.paddingRight = cs.paddingRight;
    s.width = `${el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px`;
    ayna.textContent = el.value.slice(0, konum);
    const isaret = document.createElement("span");
    isaret.textContent = "​";
    ayna.appendChild(isaret);
    document.body.appendChild(ayna);
    const satirYuksekligi = isaret.offsetHeight || parseFloat(cs.lineHeight) || 20;
    const isaretUstu = isaret.offsetTop;
    document.body.removeChild(ayna);

    const ust = kutu.top + parseFloat(cs.borderTopWidth) + isaretUstu - el.scrollTop;
    return { ust, alt: ust + satirYuksekligi };
  }

  return { ust: kutu.top, alt: kutu.bottom };
}

function kaydirilabilirMi(el: Element): boolean {
  const oy = getComputedStyle(el).overflowY;
  return (oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 1;
}

/** Görünür alanın alt sınırı: klavyenin hemen üstü. */
function gorunurAlt(): number {
  const vv = window.visualViewport;
  return vv ? vv.offsetTop + vv.height : window.innerHeight;
}
function gorunurUst(): number {
  return window.visualViewport?.offsetTop ?? 0;
}

/** Odaktaki yazı alanının imlecini görünür alana ve konfor payına getirir. */
export function odaktakiniGorunurYap(): void {
  const el = document.activeElement;
  if (!yaziAlaniMi(el)) return;

  for (let kap: Element | null = el.parentElement; kap; kap = kap.parentElement) {
    const kaydirilan = kap === document.body || kap === document.documentElement
      ? null
      : kaydirilabilirMi(kap)
        ? kap
        : null;
    if (!kaydirilan) continue;
    const r = kaydirilan.getBoundingClientRect();
    const imlec = imlecDikdortgeni(el);
    const fark = kaydirmaMiktari(
      imlec.ust,
      imlec.alt,
      Math.max(r.top, gorunurUst()),
      Math.min(r.bottom, gorunurAlt()),
    );
    if (fark !== 0) kaydirilan.scrollTop += fark;
  }

  // Sayfanın kendisi (kaydırılabilir bir kap yoksa ya da kap yetmediyse).
  const imlec = imlecDikdortgeni(el);
  const fark = kaydirmaMiktari(imlec.ust, imlec.alt, gorunurUst(), gorunurAlt());
  if (fark !== 0) window.scrollBy(0, fark);
}

/** Uygulama açılışında bir kez çağrılır; dönen fonksiyon dinlemeyi bırakır. */
export function yaziyiGorunurTut(): () => void {
  const dokunmatik = window.matchMedia?.("(pointer: coarse)").matches;
  if (!dokunmatik) return () => {};

  let kare = 0;
  const zamanlayicilar = new Set<number>();
  const planla = () => {
    cancelAnimationFrame(kare);
    kare = requestAnimationFrame(odaktakiniGorunurYap);
  };
  // Klavye animasyonu ve WebView'in yeniden boyutlanması birkaç yüz ms sürüyor;
  // tek ölçüm animasyon bitmeden yapılıp yanlış kalıyordu.
  const gecikmeli = () => {
    planla();
    for (const ms of [120, 280, 500]) {
      const z = window.setTimeout(() => {
        zamanlayicilar.delete(z);
        planla();
      }, ms);
      zamanlayicilar.add(z);
    }
  };

  const odaklandi = (e: Event) => {
    if (yaziAlaniMi(e.target as Element)) gecikmeli();
  };
  const yazildi = (e: Event) => {
    if (yaziAlaniMi(e.target as Element)) planla();
  };
  const imlecTasindi = () => {
    if (yaziAlaniMi(document.activeElement)) planla();
  };

  document.addEventListener("focusin", odaklandi);
  document.addEventListener("input", yazildi, true);
  document.addEventListener("selectionchange", imlecTasindi);
  window.addEventListener("resize", gecikmeli);
  window.visualViewport?.addEventListener("resize", gecikmeli);

  return () => {
    cancelAnimationFrame(kare);
    zamanlayicilar.forEach((z) => clearTimeout(z));
    document.removeEventListener("focusin", odaklandi);
    document.removeEventListener("input", yazildi, true);
    document.removeEventListener("selectionchange", imlecTasindi);
    window.removeEventListener("resize", gecikmeli);
    window.visualViewport?.removeEventListener("resize", gecikmeli);
  };
}
