import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useThemeColors } from "../theme/useThemeColors";
import { IconX } from "./icons";

/**
 * Modalin "olumlu eylem" butonunu bulur: Enter'a basıldığında tıklanacak olan.
 *
 * SIRA ÖNEMLİ. Bir modalde birden fazla form olabilir (görev düzenlemede
 * "Kaydet" ve altında ayrı bir "yorum gönder" formu). Kullanıcı yorum
 * kutusundayken Enter yorumu göndermeli, görevi kaydetmemeli — o yüzden önce
 * ODAĞIN İÇİNDE OLDUĞU forma bakılır, modalin geneline sonra.
 *
 * `data-primary` işareti, `<form>` kullanmayan modaller için: onay butonu
 * sıradan bir onClick butonu olduğunda hangisinin "olumlu" olduğunu koddan
 * anlamanın başka yolu yok (iptal butonu da aynı görünür).
 */
function findPrimaryAction(box: HTMLElement, target: HTMLElement): HTMLElement | null {
  const usable = (el: Element | null | undefined): HTMLElement | null => {
    if (!(el instanceof HTMLElement)) return null;
    if ((el as HTMLButtonElement).disabled) return null;
    // Sekme değişimiyle gizlenmiş ya da henüz çizilmemiş butona basılmasın.
    if (el.getClientRects().length === 0) return null;
    return el;
  };
  // İşaretli buton varsa karar onundur: kapalıysa (zorunlu alan boş, istek
  // sürüyor) Enter boşa düşer — yerine başka bir butona basılmaz.
  const first = (list: Element[]): HTMLElement | null => {
    const marked = list.find((el) => el.hasAttribute("data-primary"));
    if (marked) return usable(marked);
    return usable(list.find((el) => (el as HTMLButtonElement).type === "submit"));
  };

  // Odak bir formun içindeyse kararı O form verir; modalin genelindeki
  // "Kaydet"e düşülmez. Yoksa yorum kutusunda Enter, boş yorumu göndermek
  // yerine görevi kaydederdi.
  const form = target.closest("form");
  // form.elements, `form="id"` ile DIŞARIDAN bağlanmış butonları da içerir —
  // kaydet butonu alttaki yapışkan çubuğa taşındığında (bkz. footer) buton
  // artık formun içinde değil ama yine ona ait.
  if (form) return first(Array.from(form.elements));
  // Form dışında `type` yazılmamış butonun DOM'daki türü yine "submit"tir —
  // başlıktaki kapatma (X) butonu da öyle. O yüzden burada özniteliğe bakılır.
  const marked = box.querySelector("[data-primary]");
  if (marked) return usable(marked);
  return usable(box.querySelector('button[type="submit"]'));
}

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
  /** Başlığın altındaki tek satırlık açıklama (modül modallerinde katalog metni). */
  subtitle?: string;
  /**
   * Dar ekranda kenar boşluksuz, tam ekran açılsın mı.
   *
   * Modül modalleri için gerekli: telefonda 20px boşlukla ortalanmış bir kutuya
   * form ya da liste sığmıyor, içerik iki kelimede bir kırılıyor.
   */
  mobileFullScreen?: boolean;
  /**
   * Modalin alt kenarına yapışan eylem çubuğu — genelde "Kaydet".
   *
   * NEDEN: uzun düzenleme modallerinde (görev modali: ekler, dosyalar,
   * yorumlar, arşivle/sil) kaydet butonu içeriğin ortasında kalıyordu;
   * kullanıcı aşağıda not yazıp kaydetmek için yukarı geri kaydırmak zorunda
   * kalıyordu. Yapışkan çubuk hep görünür durur.
   *
   * Buton formun DIŞINDA kalır; `form="<formId>"` özniteliğiyle bağlanır, bu
   * sayede `type="submit"` ve Enter kuralı (bkz. findPrimaryAction) aynen
   * çalışır.
   */
  footer?: ReactNode;
}

export default function Modal({
  title,
  onClose,
  children,
  maxWidth = 400,
  subtitle,
  mobileFullScreen = false,
  footer,
}: Props) {
  const c = useThemeColors();
  const boxRef = useRef<HTMLDivElement>(null);
  const fullScreen = mobileFullScreen && typeof window !== "undefined" && window.innerWidth < 768;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    // Odak modalin İÇİNDE olmalı, yoksa tuş vuruşu buraya hiç gelmez: içinde
    // alan olmayan pencerelerde (silme onayı gibi) odak arkadaki sayfada
    // kalıyor ve Enter modalin değil, arkadaki butonun işine yarıyordu.
    // İçeride autoFocus'lu bir alan varsa ona dokunulmaz.
    if (!box.contains(document.activeElement)) box.focus({ preventScroll: true });
  }, []);

  /**
   * Enter = olumlu eylem. Uygulamanın her yerinde aynı davransın diye burada,
   * tek noktada duruyor: modallerin yarısı `<form>` kullanmıyor, oralarda
   * tarayıcının kendi "Enter ile gönder" davranışı hiç devreye girmiyordu.
   */
  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement | null;
    if (!target || !boxRef.current?.contains(target)) return;
    // İç içe modal: iç modal portal ile ayrı bir düğüme çizilir ama React
    // ağacında bunun altındadır, olay yine buraya uğrar. Yukarıdaki kapsama
    // kontrolü sayesinde yalnızca odağın gerçekten içinde olduğu modal tepki
    // verir — üstteki pencereye basılan Enter alttakini kaydetmez.

    // IME (klavye henüz kelimeyi tamamlamamış): Enter seçimi onaylar, form değil.
    if (e.nativeEvent.isComposing) return;

    const withModifier = e.metaKey || e.ctrlKey;
    if (e.altKey || (e.shiftKey && !withModifier)) return;

    const tag = target.tagName;
    // Kendi Enter davranışı olan öğelere karışılmaz: butona zaten basılır,
    // bağlantı açılır, açık bir seçim listesinde Enter seçimi onaylar.
    if (tag === "BUTTON" || tag === "A" || tag === "SELECT") return;

    // Çok satırlı alanda Enter yeni satırdır; onay ⌘/Ctrl+Enter ile verilir.
    if ((tag === "TEXTAREA" || target.isContentEditable) && !withModifier) return;

    const action = findPrimaryAction(boxRef.current, target);
    if (!action) return;
    // Tarayıcının örtük gönderimi de aynı butona basardı; iki kez
    // tetiklenmesin diye olay burada bitirilir.
    e.preventDefault();
    e.stopPropagation();
    action.click();
  };

  // Modal her zaman body'ye taşınır (portal). Aksi halde CSS "transform" ya da
  // "will-change" uygulanmış bir üst öğenin içinde kalırsa (örn. hover'da büyüyen
  // kişi kartı) o öğe position:fixed için içeren blok haline gelir; modal ekranın
  // ortası yerine o kartın üstünde açılır ve karartma sadece kartı kaplar.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,31,41,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: fullScreen ? 0 : 20,
        zIndex: 100,
      }}
    >
      <div
        ref={boxRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Odaklanabilir olmalı ki tuş vuruşları modale ulaşsın; sekme sırasına
        // girmesin diye -1, tıklandığında çerçeve çizilmesin diye outline yok.
        tabIndex={-1}
        style={{
          outline: "none",
          width: "100%",
          maxWidth: fullScreen ? "none" : maxWidth,
          maxHeight: fullScreen ? "none" : "85vh",
          height: fullScreen ? "100%" : undefined,
          overflowY: "auto",
          background: c.surface,
          border: fullScreen ? "none" : `1px solid ${c.border}`,
          borderRadius: fullScreen ? 0 : 14,
          // Yapışkan çubuk varsa alt boşluk çubuğun kendi iç boşluğundan gelir.
          padding: footer ? "20px 22px 0" : "20px 22px 22px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 20, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{title}</h2>
            {subtitle && (
              <p style={{ margin: "4px 0 0", fontSize: 13, color: c.textSecondary, lineHeight: 1.4 }}>{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            style={{ background: "transparent", border: "none", padding: 4, display: "flex", flexShrink: 0 }}
          >
            <IconX size={18} color={c.textSecondary} />
          </button>
        </div>
        {children}
        {footer && (
          <div
            style={{
              position: "sticky",
              // Çubuk kutunun tam dibine yaslanır. Kutunun alt iç boşluğu bu
              // durumda kaldırılıyor (bkz. padding), yoksa sona kaydırıldığında
              // çubuğun altında boş bir şerit kalırdı.
              bottom: 0,
              marginTop: 16,
              // Kenarlardan taşır: çizgi modalin bir ucundan diğerine gitsin.
              marginLeft: -22,
              marginRight: -22,
              padding: "12px 22px",
              // İçerik altından geçerken görünmesin diye dolu zemin.
              background: c.surface,
              borderTop: `1px solid ${c.border}`,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
