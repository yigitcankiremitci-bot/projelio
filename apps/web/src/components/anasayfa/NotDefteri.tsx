import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";

/**
 * Panonun Not kartı: araç çubuklu küçük bir zengin metin defteri.
 *
 * İlk satır başlıktır (kullanıcı isteği, 2026-11-09): boş defterde imleç bir
 * <h2>'nin içinde durur, Enter'a basınca tarayıcı başlıktan çıkıp paragraf
 * açar. Görünüm CSS'te ilk bloğa bağlı (.pano-not > :first-child), yani ilk
 * satır sonradan paragraf olsa da başlık gibi görünür.
 *
 * Bağımlılık yok: contentEditable + execCommand. execCommand "eskimiş" sayılıyor
 * ama bütün tarayıcılarda çalışıyor ve geri al/yinele geçmişini tarayıcı
 * tutuyor; birkaç biçim düğmesi için editör kütüphanesi eklemeye değmez.
 *
 * Not cihazda (localStorage) durur, hesaba yazılmaz — eski düz not da öyleydi.
 * Kaydederken ve okurken HTML izinli etiketlere süzülür: yapıştırılan içerikteki
 * öznitelikler (onerror vb.) not tekrar açılınca çalışmasın.
 */

const IZINLI = new Set(["H2", "H3", "P", "DIV", "BR", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "UL", "OL", "LI", "BLOCKQUOTE"]);
const AT = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT"]);
const BOS = "<h2><br></h2>";

function suz(html: string): string {
  const belge = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const temizle = (dugum: Element) => {
    for (const cocuk of Array.from(dugum.children)) {
      if (AT.has(cocuk.tagName)) {
        cocuk.remove();
        continue;
      }
      temizle(cocuk);
      if (!IZINLI.has(cocuk.tagName)) {
        // Bilinmeyen etiket (span, a, font…) açılır, yazısı kalır.
        cocuk.replaceWith(...Array.from(cocuk.childNodes));
        continue;
      }
      for (const ad of cocuk.getAttributeNames()) cocuk.removeAttribute(ad);
    }
  };
  temizle(belge.body);
  return belge.body.innerHTML;
}

function kacir(metin: string): string {
  return metin.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Eski düz metin not: ilk satır başlık, kalanlar paragraf. */
function duzMetindenHtml(metin: string): string {
  const satirlar = metin.split("\n");
  if (!metin.trim()) return BOS;
  return satirlar.map((s, i) => (i === 0 ? `<h2>${kacir(s) || "<br>"}</h2>` : `<p>${kacir(s) || "<br>"}</p>`)).join("");
}

/** Tek not. Başlık sekmede görünsün diye ayrıca tutulur (ilk bloğun yazısı). */
interface NotKaydi {
  id: string;
  html: string;
  baslik: string;
}

interface NotDefteriKaydi {
  notlar: NotKaydi[];
  secili: string;
}

/** Not listesi tavanı: sekme şeridi ve cihaz deposu şişmesin. */
const NOT_TAVANI = 30;

function yeniNot(html = BOS): NotKaydi {
  return { id: Math.random().toString(36).slice(2, 10), html, baslik: "" };
}

function baslikOku(html: string): string {
  const belge = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return (belge.body.firstElementChild?.textContent ?? belge.body.textContent ?? "").trim().slice(0, 40);
}

/**
 * Notlar listesi (kullanıcı isteği, 2026-11-09: "notlar listeler olarak
 * kaydedilebilsin"). Eski tek not (önce düz metin, sonra HTML) ilk not olur.
 */
function oku(kapsam: string): NotDefteriKaydi {
  try {
    const ham = localStorage.getItem(`projelio_pano_notlar_${kapsam}`);
    if (ham) {
      const kayit = JSON.parse(ham) as NotDefteriKaydi;
      const notlar = (Array.isArray(kayit.notlar) ? kayit.notlar : [])
        .filter((n) => n && typeof n.id === "string" && typeof n.html === "string")
        .map((n) => ({ id: n.id, html: suz(n.html) || BOS, baslik: typeof n.baslik === "string" ? n.baslik : "" }));
      if (notlar.length) return { notlar, secili: notlar.some((n) => n.id === kayit.secili) ? kayit.secili : notlar[0].id };
    }
    const eskiHtml = localStorage.getItem(`projelio_pano_not_html_${kapsam}`);
    const html = eskiHtml !== null ? suz(eskiHtml) || BOS : duzMetindenHtml(localStorage.getItem(`projelio_pano_not_${kapsam}`) ?? "");
    const ilk = { ...yeniNot(html), baslik: baslikOku(html) };
    return { notlar: [ilk], secili: ilk.id };
  } catch {
    const ilk = yeniNot();
    return { notlar: [ilk], secili: ilk.id };
  }
}

function yaz(kapsam: string, kayit: NotDefteriKaydi) {
  try {
    localStorage.setItem(`projelio_pano_notlar_${kapsam}`, JSON.stringify(kayit));
  } catch {
    // Depolama kapalıysa notlar yalnızca bu oturumda durur.
  }
}

type Komut = { ad: string; simge: ReactNode; calistir: () => void; stil?: CSSProperties };

export default function NotDefteri({ kapsam }: { kapsam: string }) {
  const c = useThemeColors();
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const zamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [defter, setDefter] = useState<NotDefteriKaydi>(() => oku(kapsam));
  const defterRef = useRef(defter);
  defterRef.current = defter;
  const guncelle = (yeni: NotDefteriKaydi) => {
    setDefter(yeni);
    defterRef.current = yeni;
    yaz(kapsam, yeni);
  };

  // İçerik React durumu değil: her tuşta innerHTML'i yeniden yazmak imleci başa atardı.
  const bosMu = () => {
    const el = ref.current;
    if (el) el.dataset.bos = !el.textContent?.trim() && !el.querySelector("li") ? "1" : "0";
  };

  useEffect(() => {
    const kayit = oku(kapsam);
    setDefter(kayit);
    defterRef.current = kayit;
  }, [kapsam]);

  // Sekme değişince editöre o notun içeriği yazılır (yalnızca o an; yazarken değil).
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = defterRef.current.notlar.find((n) => n.id === defter.secili)?.html ?? BOS;
    bosMu();
    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
    } catch {
      // Desteklemeyen tarayıcı <div> açar; görünüm aynı.
    }
  }, [defter.secili, kapsam]);

  useEffect(
    () => () => {
      if (zamanlayici.current) clearTimeout(zamanlayici.current);
    },
    []
  );

  const kaydet = () => {
    const el = ref.current;
    if (!el) return;
    // Hepsi silinince ilk satır yine başlık olsun.
    if (!el.textContent?.trim() && !el.querySelector("li")) {
      if (el.innerHTML !== BOS && el.innerHTML !== "<h2></h2>") {
        el.innerHTML = BOS;
        const aralik = document.createRange();
        aralik.setStart(el.firstChild!, 0);
        aralik.collapse(true);
        const secim = window.getSelection();
        secim?.removeAllRanges();
        secim?.addRange(aralik);
      }
    }
    bosMu();
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    zamanlayici.current = setTimeout(simdiKaydet, 300);
  };

  /** Açık notun içeriğini deftere yazar; sekme adı da ilk satırdan güncellenir. */
  const simdiKaydet = () => {
    const el = ref.current;
    if (!el) return;
    if (zamanlayici.current) clearTimeout(zamanlayici.current);
    const html = suz(el.innerHTML);
    const d = defterRef.current;
    guncelle({ ...d, notlar: d.notlar.map((n) => (n.id === d.secili ? { ...n, html, baslik: baslikOku(html) } : n)) });
  };

  const notSec = (id: string) => {
    simdiKaydet();
    guncelle({ ...defterRef.current, secili: id });
  };
  const notEkle = () => {
    simdiKaydet();
    const d = defterRef.current;
    if (d.notlar.length >= NOT_TAVANI) return;
    const yeni = yeniNot();
    guncelle({ notlar: [...d.notlar, yeni], secili: yeni.id });
    setTimeout(() => ref.current?.focus(), 0);
  };
  const notSil = (id: string) => {
    const d = defterRef.current;
    const not = d.notlar.find((n) => n.id === id);
    if (!not) return;
    if (not.baslik && !window.confirm(t("\"{ad}\" notu silinsin mi?", { ad: not.baslik }))) return;
    const kalan = d.notlar.filter((n) => n.id !== id);
    const notlar = kalan.length ? kalan : [yeniNot()];
    guncelle({ notlar, secili: notlar[Math.max(0, d.notlar.findIndex((n) => n.id === id) - 1)]?.id ?? notlar[0].id });
  };

  const uygula = (komut: string, deger?: string) => {
    ref.current?.focus();
    document.execCommand(komut, false, deger);
    kaydet();
  };

  const komutlar: (Komut | "ayrac")[] = [
    { ad: t("Başlık"), simge: "H", calistir: () => uygula("formatBlock", "h3"), stil: { fontWeight: 700 } },
    { ad: t("Paragraf"), simge: "¶", calistir: () => uygula("formatBlock", "p") },
    "ayrac",
    { ad: t("Kalın"), simge: "B", calistir: () => uygula("bold"), stil: { fontWeight: 700 } },
    { ad: t("İtalik"), simge: "I", calistir: () => uygula("italic"), stil: { fontStyle: "italic", fontFamily: "Georgia, serif" } },
    { ad: t("Altı çizili"), simge: "U", calistir: () => uygula("underline"), stil: { textDecoration: "underline" } },
    { ad: t("Üstü çizili"), simge: "S", calistir: () => uygula("strikeThrough"), stil: { textDecoration: "line-through" } },
    "ayrac",
    { ad: t("Madde listesi"), simge: "•", calistir: () => uygula("insertUnorderedList"), stil: { fontSize: 18 } },
    { ad: t("Numaralı liste"), simge: "1.", calistir: () => uygula("insertOrderedList") },
    { ad: t("Alıntı"), simge: "❝", calistir: () => uygula("formatBlock", "blockquote") },
    "ayrac",
    { ad: t("Biçimi temizle"), simge: "Tx", calistir: () => uygula("removeFormat"), stil: { fontSize: 12 } },
  ];

  const dugme: CSSProperties = { minWidth: 28, height: 28, padding: "0 6px", border: "none", borderRadius: 7, background: "transparent", color: c.textSecondary, fontSize: 14, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };

  return (
    <div className="no-drag" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Not listesi: her not bir sekme, adı ilk satırı. */}
      <div className="pano-cipler" role="tablist" aria-label={t("Notlar")} style={{ marginBottom: 0 }}>
        {defter.notlar.map((n) => {
          const secik = n.id === defter.secili;
          return (
            <span key={n.id} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              <button
                type="button"
                role="tab"
                aria-selected={secik}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => notSec(n.id)}
                title={n.baslik || t("Yeni not")}
                style={{ padding: "3px 10px", borderRadius: 999, border: `1px solid ${secik ? c.accent : c.border}`, background: secik ? c.accent : "transparent", color: secik ? c.surface : c.textSecondary, fontSize: 12, whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {n.baslik || t("Yeni not")}
              </button>
              {secik && (defter.notlar.length > 1 || n.baslik) && (
                <button type="button" onClick={() => notSil(n.id)} aria-label={t("Notu sil")} title={t("Notu sil")} style={{ marginLeft: 3, width: 20, height: 20, padding: 0, borderRadius: "50%", border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary, fontSize: 12, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ×
                </button>
              )}
            </span>
          );
        })}
        {defter.notlar.length < NOT_TAVANI && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={notEkle} aria-label={t("Yeni not")} title={t("Yeni not")} style={{ flexShrink: 0, padding: "3px 10px", borderRadius: 999, border: `1px dashed ${c.border}`, background: "transparent", color: c.textSecondary, fontSize: 12 }}>
            +
          </button>
        )}
      </div>
      <div role="toolbar" aria-label={t("Not biçimi")} className="pano-not-araclar" style={{ display: "flex", alignItems: "center", gap: 2, paddingBottom: 6, borderBottom: `1px solid ${c.border}`, overflowX: "auto", scrollbarWidth: "none" }}>
        {komutlar.map((k, i) =>
          k === "ayrac" ? (
            <span key={`a${i}`} style={{ width: 1, height: 16, margin: "0 4px", background: c.border, flexShrink: 0 }} />
          ) : (
            <button
              key={k.ad}
              type="button"
              title={k.ad}
              aria-label={k.ad}
              // Düğmeye basmak editörden odağı ve seçimi almasın.
              onMouseDown={(e) => e.preventDefault()}
              onClick={k.calistir}
              style={{ ...dugme, ...k.stil }}
            >
              {k.simge}
            </button>
          )
        )}
      </div>
      <div
        ref={ref}
        className="pano-not"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={t("Hızlı not")}
        data-yer-tutucu={t("Başlık")}
        onInput={kaydet}
        onBlur={simdiKaydet}
        onPaste={(e) => {
          // Başka sayfadan gelen yazı tipleri, renkler defteri bozmasın: düz metin yapıştırılır.
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        onKeyDown={(e) => {
          // Pano kısayolları (Alt+ok ile kart taşıma) yazarken tetiklenmesin.
          e.stopPropagation();
        }}
        style={{ flex: 1, minHeight: 120, overflowY: "auto", outline: "none", color: c.textPrimary, fontSize: 14, lineHeight: 1.55, cursor: "text" }}
      />
    </div>
  );
}
