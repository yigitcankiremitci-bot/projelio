import { useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";

/**
 * Dönemler arası "tutup kaydırarak" gezinme (bkz. pages/Calendar.tsx).
 *
 * Üç giriş yolu:
 *
 *  1. Dokunmatik: parmakla yatay sürükleme.
 *  2. Fare: sol tuşla tutup yana sürükleme.
 *  3. Klavye: ← / → okları.
 *
 * TRACKPAD YATAY KAYDIRMASI BİLEREK YOK. Önce o vardı ve macOS'ta iki parmak
 * yatay kaydırma tarayıcının "geri git" hareketiyle çakışıyordu: kullanıcı
 * haftayı değiştirmek isterken uygulamadan çıkıp önceki sayfaya dönüyordu.
 * Bu davranış tarayıcı/işletim sistemi seviyesinde olduğu için sayfadan
 * güvenilir şekilde bastırılamıyor — tek doğru çözüm o hareketi hiç
 * kullanmamak.
 *
 * BLOK SÜRÜKLEMESİYLE ÇAKIŞMAZ: bloklar HTML5 `draggable` ile taşınıyor.
 * Fare tarafında sürüklemeye bir bloğun üstünden başlanırsa hareket hiç
 * başlatılmaz (aşağıdaki draggable kontrolü); dokunmatikte ise HTML5 sürükleme
 * zaten çalışmadığı için çakışma yapısal olarak imkânsız.
 */

/** Dönemin değişmesi için gereken yatay mesafe. */
const THRESHOLD = 60;
/** Hareketin yatay sayılması için dikeye göre baskınlık oranı. */
const AXIS_RATIO = 1.3;
/** Yön kararı bu kadar hareket edilene kadar verilmez. */
const AXIS_DEADZONE = 10;
/**
 * İçerik parmağın/farenin gittiği mesafenin bu kadarı kadar kayar. Birebir
 * takip, eşiğe varmadan bırakıldığında içeriğin çok uzağa gidip geri
 * zıplamasına yol açıyordu.
 */
const FOLLOW_RATIO = 0.4;
/** Eşiğe varmadan bırakılınca içeriğin yerine dönme süresi. */
const SNAP_MS = 160;

/**
 * Parmağın/farenin yönü. Karar bir kez verilir ve hareket bitene kadar
 * değişmez — aksi halde köşegen bir harekette yön gidip gelirdi.
 */
export function decideAxis(dx: number, dy: number): "unknown" | "x" | "y" {
  if (dx < AXIS_DEADZONE && dy < AXIS_DEADZONE) return "unknown";
  return dx > dy * AXIS_RATIO ? "x" : "y";
}

/** Bırakma anında adım atılacak mı; atılacaksa hangi yöne. */
export function releaseStep(dx: number): 0 | 1 | -1 {
  if (Math.abs(dx) < THRESHOLD) return 0;
  // Sola sürükleme ileri gider (içerik sola akar) — mobil takvimlerin tamamında böyle.
  return dx < 0 ? 1 : -1;
}

export function useSwipeNavigate(step: (direction: 1 | -1) => void) {
  // step her render'da yeniden oluşuyor; pencere dinleyicileri bayat kapanış
  // yakalamasın diye ref üzerinden okunuyor.
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  /** Kayan içerik. Sürükleme sırasında transform doğrudan buraya yazılıyor:
   *  her fare hareketinde React state güncellemek ızgarayı yeniden çizip
   *  hareketi takılmalı hale getiriyordu. */
  const contentRef = useRef<HTMLDivElement>(null);

  const start = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<"unknown" | "x" | "y">("unknown");
  /** Sürükleme sonrası gelen tıklamayı yut: yoksa ızgara boş hücreye yeni blok açardı. */
  const swallowClick = useRef(false);

  const setOffset = (px: number) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = "";
    el.style.transform = px === 0 ? "" : `translateX(${px}px)`;
  };

  /** Sürüklemeyi bitirir: içeriği yerine oturtur, gerekiyorsa adımı atar. */
  const finish = (dx: number) => {
    const el = contentRef.current;
    const direction = axis.current === "x" ? releaseStep(dx) : 0;

    if (el) {
      if (direction === 0 && el.style.transform) {
        // Eşiğe varılmadı: yumuşakça yerine dönsün.
        el.style.transition = `transform ${SNAP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        el.style.transform = "";
        window.setTimeout(() => {
          if (contentRef.current === el) el.style.transition = "";
        }, SNAP_MS);
      } else {
        // Adım atılıyor: yeni dönem kendi animasyonuyla gelecek (bkz. index.css
        // plan-slide-*), buradaki kaydırma anında temizlenmeli.
        el.style.transition = "";
        el.style.transform = "";
      }
    }

    if (direction !== 0) {
      swallowClick.current = true;
      stepRef.current(direction);
    }
    start.current = null;
    axis.current = "unknown";
  };

  // ---------------------------------------------------------------- Fare
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const s = start.current;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (axis.current === "unknown") axis.current = decideAxis(Math.abs(dx), Math.abs(dy));
      if (axis.current !== "x") return;
      // Metin seçimi sürüklemeyi bozuyordu.
      e.preventDefault();
      setOffset(dx * FOLLOW_RATIO);
    };
    const onUp = (e: MouseEvent) => {
      const s = start.current;
      if (!s) return;
      finish(e.clientX - s.x);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // -------------------------------------------------------------- Klavye
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      // Bir alana yazarken oklar imleci taşımalı, dönemi değil.
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      stepRef.current(e.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return {
    contentRef,

    /** Kaydırılan alana verilecek özellikler. */
    handlers: {
      // Tarayıcı dikey kaydırmayı kendisi yapsın, yatayı bize bıraksın.
      style: { touchAction: "pan-y" as const, cursor: "grab" as const },

      onMouseDown: (e: ReactMouseEvent) => {
        if (e.button !== 0) return;
        // Blok taşıma (HTML5 draggable) kendi işini yapsın.
        if ((e.target as HTMLElement).closest?.('[draggable="true"]')) return;
        start.current = { x: e.clientX, y: e.clientY };
        axis.current = "unknown";
      },

      onClickCapture: (e: ReactMouseEvent) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      },

      onTouchStart: (e: ReactTouchEvent) => {
        const t = e.touches[0];
        if (!t) return;
        start.current = { x: t.clientX, y: t.clientY };
        axis.current = "unknown";
      },

      onTouchMove: (e: ReactTouchEvent) => {
        const s = start.current;
        const t = e.touches[0];
        if (!s || !t) return;
        const dx = t.clientX - s.x;
        if (axis.current === "unknown") {
          axis.current = decideAxis(Math.abs(dx), Math.abs(t.clientY - s.y));
        }
        if (axis.current !== "x") return;
        setOffset(dx * FOLLOW_RATIO);
      },

      onTouchEnd: (e: ReactTouchEvent) => {
        const s = start.current;
        const t = e.changedTouches[0];
        if (!s || !t) {
          start.current = null;
          axis.current = "unknown";
          return;
        }
        finish(t.clientX - s.x);
      },
    },
  };
}
