import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";

/**
 * Uygulama geneli "geri al" (Cmd+Z / Ctrl+Z) ve "ileri al" (Shift+Cmd+Z / Ctrl+Y)
 * altyapısı.
 *
 * İki tür işlem var:
 *
 * 1. Geri alınabilir işlem (pushUndo) — işlem sunucuda ZATEN yapıldı; yığına
 *    onu geri çevirecek bir çağrı (`run`) konur. İşlemi tekrar uygulayan bir
 *    `redo` verilirse adım ileri de alınabilir.
 *
 * 2. Yıkıcı işlem (pushDestructive) — kalıcı silme sunucuda geri alınamadığı
 *    için hiç yapılmaz: arayüzden hemen kaldırılır ama gerçek DELETE birkaç
 *    saniye bekletilir. Bu pencere içinde Cmd+Z basılırsa istek hiç gitmez;
 *    ileri alınırsa silme yeniden (yine geri alınabilir şekilde) sıraya girer.
 *
 * Yığın davranışı standarttır: yeni bir işlem yapıldığında ileri alma zinciri
 * silinir. Bir adımın `redo`su tanımlı değilse o adımdan sonrası ileri alınamaz.
 *
 * Metin alanlarında (input/textarea/contenteditable) kısayollar devralınmaz —
 * orada tarayıcının kendi metin geri alması çalışmaya devam eder.
 */

const DESTRUCTIVE_DELAY_MS = 6000;
const MAX_STACK = 25;
const TOAST_MS = 2600;

interface UndoableParams {
  label: string;
  /** Geri alma: işlemi sunucuda tersine çevirir. */
  run: () => void | Promise<void>;
  /** İleri alma: işlemi yeniden uygular. Verilmezse adım ileri alınamaz. */
  redo?: () => void | Promise<void>;
}

interface DestructiveParams {
  label: string;
  /** Süre dolunca çalışacak gerçek yıkıcı istek. */
  commit: () => void | Promise<void>;
  /** Geri alındığında arayüzü eski hâline döndürür (genellikle listeyi yeniden çeker). */
  restore: () => void | Promise<void>;
  /** Varsa, silinmeyi bekleyen kaydın id'si — listeler bu kaydı gizlemek için okur. */
  entityId?: string;
}

type Entry =
  | ({ kind: "undoable" } & UndoableParams)
  | ({ kind: "destructive"; timer: ReturnType<typeof setTimeout> } & DestructiveParams);

/** İleri alma yığınındaki bir adım: işlemi tekrar uygular ve geri alma yığınına geri koyar. */
interface RedoItem {
  label: string;
  apply: () => void;
}

export interface UndoContextValue {
  /** Sunucuda yapılmış bir işlemi geri alacak (ve istenirse tekrar uygulayacak) çağrıları yığına ekler. */
  pushUndo: (entry: UndoableParams) => void;
  /** Kalıcı silmeyi geciktirir; pencere içinde geri alınabilir. */
  pushDestructive: (entry: DestructiveParams) => void;
  /**
   * Silinmesi beklenen kayıt id'leri. Sunucu bu kayıtları hâlâ döndüreceği için
   * listelerin bunları elemesi gerekir; aksi halde "sildim ama duruyor" görünür.
   */
  pendingDeleteIds: string[];
  /**
   * Her geri/ileri almada artan sayaç. Geri alma sunucu durumunu değiştirdiği
   * (ya da bekleyen bir silmeyi iptal ettiği) için açık listelerin kendini
   * tazelemesi gerekir — doğrudan okumak yerine useRefreshOnUndo kullanılır.
   */
  refreshToken: number;
  /** Kısayol dışında bir düğmeden de tetiklenebilsin diye dışa açık. */
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const UndoContext = createContext<UndoContextValue>({
  pushUndo: () => {},
  pushDestructive: () => {},
  pendingDeleteIds: [],
  refreshToken: 0,
  undo: () => {},
  redo: () => {},
  canUndo: false,
  canRedo: false,
});

export function useUndo(): UndoContextValue {
  return useContext(UndoContext);
}

/**
 * Bir geri/ileri alma gerçekleştiğinde verilen yükleme fonksiyonunu tekrar çalıştırır.
 *
 * Buna ihtiyaç var çünkü geri alma çoğu zaman kaydı yalnızca sunucuda geri getirir:
 * silinen bir görev, onu listeden düşürmüş olan ekranın state'inde artık yoktur ve
 * sayfa yenilenene kadar geri gelmiş görünmez. Liste çeken her bileşen bu kancayı
 * kendi reload'ıyla çağırmalı.
 */
export function useRefreshOnUndo(reload: () => void) {
  const { refreshToken } = useUndo();
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  // Mount anındaki değeri "görülmüş" sayıyoruz: bileşen zaten kendi ilk yüklemesini
  // yapıyor, sayaç daha önce artmış olsa bile burada fazladan istek atılmamalı.
  const seenToken = useRef(refreshToken);
  useEffect(() => {
    if (seenToken.current === refreshToken) return;
    seenToken.current = refreshToken;
    reloadRef.current();
  }, [refreshToken]);
}

/**
 * Bir listeden, silinmeyi bekleyen kayıtları eler. Geciktirmeli silme sırasında
 * sunucu bu kayıtları hâlâ döndürdüğü için liste bileşenleri bunu kullanmalı.
 */
export function useWithoutPendingDeletes<T extends { id: string }>(items: T[]): T[] {
  const { pendingDeleteIds } = useUndo();
  if (pendingDeleteIds.length === 0) return items;
  return items.filter((item) => !pendingDeleteIds.includes(item.id));
}

/**
 * Her render'da güncellenen bir ref. Sortable geri çağrıları oluşturuldukları
 * render'ın kapanışını taşıdığı için (bkz. useSortableList deps), "sürüklemeden
 * önceki liste" doğrudan state'ten okunursa bayat olabiliyor — bu ref hep günceli verir.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/**
 * Sürükle-bırak sıralamaları için kısayol: sıralama sunucuya gönderildikten
 * hemen sonra çağrılır. Geri alma eski id dizisini, ileri alma yeni diziyi aynı
 * uca tekrar yollar — tüm listeler aynı "/…/reorder { ids }" desenini kullandığı
 * için tek helper yetiyor.
 */
export function useReorderUndo() {
  const { pushUndo } = useUndo();
  return useCallback(
    (endpoint: string, previousIds: string[], nextIds: string[], reload: () => void) => {
      if (previousIds.length === 0) return;
      pushUndo({
        label: "Sıralama",
        run: async () => {
          await api.patch(endpoint, { ids: previousIds });
          reload();
        },
        redo: async () => {
          await api.patch(endpoint, { ids: nextIds });
          reload();
        },
      });
    },
    [pushUndo]
  );
}

/** Odak bir metin alanındaysa kısayolu tarayıcıya bırak. */
function isEditingText(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function UndoProvider({ children }: { children: ReactNode }) {
  // Yığınlar ref'te: her push'ta yeniden render etmeye gerek yok, yalnızca
  // "geri/ileri alınacak bir şey var mı" bilgisi state olarak dışarı veriliyor.
  const undoStack = useRef<Entry[]>([]);
  const redoStack = useRef<RedoItem[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sync = useCallback(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  // Sunucu çağrısı bittikten SONRA tetiklenir: aksi halde listeler henüz geri
  // alınmamış veriyi çeker.
  const bumpRefresh = useCallback(() => setRefreshToken((v) => v + 1), []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const pushEntry = useCallback(
    (entry: Entry) => {
      undoStack.current.push(entry);
      // Yığın sınırsız büyümesin; en eskiler düşerken bekleyen bir silme varsa
      // beklemeden gönderilir (yoksa hiç gerçekleşmezdi).
      while (undoStack.current.length > MAX_STACK) {
        const dropped = undoStack.current.shift();
        if (dropped?.kind === "destructive") {
          clearTimeout(dropped.timer);
          void dropped.commit();
        }
      }
      sync();
    },
    [sync]
  );

  /**
   * @param clearRedo Yeni bir kullanıcı işlemiyse true (ileri alma zinciri kırılır);
   *                  bir "ileri al" sonucu yeniden kaydediliyorsa false.
   */
  const registerDestructive = useCallback(
    (params: DestructiveParams, clearRedo: boolean) => {
      if (clearRedo) redoStack.current = [];
      const { label, commit, restore, entityId } = params;
      const forget = () => {
        if (entityId) setPendingDeleteIds((prev) => prev.filter((x) => x !== entityId));
      };
      const timer = setTimeout(() => {
        // Süre doldu: artık geri alınamaz, yığından düşür ve isteği gönder.
        undoStack.current = undoStack.current.filter((e) => !(e.kind === "destructive" && e.timer === timer));
        sync();
        void Promise.resolve(commit()).finally(forget);
      }, DESTRUCTIVE_DELAY_MS);
      if (entityId) setPendingDeleteIds((prev) => (prev.includes(entityId) ? prev : [...prev, entityId]));
      pushEntry({
        kind: "destructive",
        label,
        commit,
        // Geri alınırsa kaydı gizleme listesinden de çıkar ki tekrar görünsün.
        restore: () => {
          forget();
          return restore();
        },
        entityId,
        timer,
      });
    },
    [pushEntry, sync]
  );

  const registerUndoable = useCallback(
    (params: UndoableParams, clearRedo: boolean) => {
      if (clearRedo) redoStack.current = [];
      pushEntry({ kind: "undoable", ...params });
    },
    [pushEntry]
  );

  const pushUndo = useCallback<UndoContextValue["pushUndo"]>(
    (params) => registerUndoable(params, true),
    [registerUndoable]
  );

  const pushDestructive = useCallback<UndoContextValue["pushDestructive"]>(
    (params) => registerDestructive(params, true),
    [registerDestructive]
  );

  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) {
      sync();
      showToast("Geri alınacak bir işlem yok");
      return;
    }

    if (entry.kind === "destructive") {
      clearTimeout(entry.timer);
      void Promise.resolve(entry.restore())
        .catch(() => {})
        .finally(bumpRefresh);
      const params: DestructiveParams = {
        label: entry.label,
        commit: entry.commit,
        restore: entry.restore,
        entityId: entry.entityId,
      };
      redoStack.current.push({
        label: entry.label,
        apply: () => {
          registerDestructive(params, false);
          bumpRefresh();
        },
      });
    } else {
      void Promise.resolve(entry.run())
        .catch(() => {})
        .finally(bumpRefresh);
      if (entry.redo) {
        redoStack.current.push({
          label: entry.label,
          apply: () => {
            void Promise.resolve(entry.redo!())
              .catch(() => {})
              .finally(bumpRefresh);
            registerUndoable(entry, false);
          },
        });
      } else {
        // Bu adım ileri alınamıyorsa zinciri kır — yarım uygulanmış bir
        // durum oluşmasındansa ileri alma kapansın.
        redoStack.current = [];
      }
    }

    sync();
    showToast(`${entry.label} geri alındı`);
  }, [bumpRefresh, registerDestructive, registerUndoable, showToast, sync]);

  const redo = useCallback(() => {
    const item = redoStack.current.pop();
    if (!item) {
      sync();
      showToast("İleri alınacak bir işlem yok");
      return;
    }
    item.apply();
    sync();
    showToast(`${item.label} ileri alındı`);
  }, [showToast, sync]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;
      const key = e.key.toLowerCase();
      // macOS: Cmd+Z / Shift+Cmd+Z. Windows-Linux: Ctrl+Z / Ctrl+Y (Shift+Ctrl+Z de çalışır).
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = (key === "z" && e.shiftKey) || (key === "y" && !e.shiftKey);
      if (!isUndo && !isRedo) return;
      if (isEditingText(e.target)) return;
      e.preventDefault();
      if (isUndo) undo();
      else redo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);

  // Sekme kapanırken bekleyen silmeler kaybolmasın — isteği hemen gönder.
  useEffect(() => {
    const flush = () => {
      for (const entry of undoStack.current) {
        if (entry.kind === "destructive") {
          clearTimeout(entry.timer);
          void entry.commit();
        }
      }
      undoStack.current = [];
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  return (
    <UndoContext.Provider
      value={{ pushUndo, pushDestructive, pendingDeleteIds, refreshToken, undo, redo, canUndo, canRedo }}
    >
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 96,
            transform: "translateX(-50%)",
            zIndex: 120,
            maxWidth: "calc(100vw - 32px)",
            padding: "10px 16px",
            borderRadius: 10,
            background: "rgba(26,31,41,0.92)",
            color: "#fff",
            fontSize: 14,
            boxShadow: "0 6px 20px rgba(26,31,41,0.28)",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {toast}
        </div>
      )}
    </UndoContext.Provider>
  );
}
