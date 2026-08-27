import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Z } from "./layout";
import type { ReactNode } from "react";
import { api } from "../api/client";
import { onRoomChanged } from "./liveRoom";

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
  /**
   * Toplu silme gibi BİRDEN FAZLA kaydı tek bir geri alınabilir adımda toplamak
   * için (bkz. TaskSelectionBar toplu "Sil"). `entityId` ile birlikte de
   * verilebilir, ikisi birleştirilir.
   */
  entityIds?: string[];
}

type Entry =
  | ({ kind: "undoable" } & UndoableParams)
  | ({ kind: "destructive"; timer: ReturnType<typeof setTimeout> } & DestructiveParams);

/** İleri alma yığınındaki bir adım: işlemi tekrar uygular ve geri alma yığınına geri koyar. */
interface RedoItem {
  label: string;
  apply: () => void | Promise<void>;
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

/** `entityId` ve `entityIds`'i tek bir listede birleştirir (bkz. DestructiveParams). */
function destructiveIds(params: { entityId?: string; entityIds?: string[] }): string[] {
  const ids = params.entityIds ?? [];
  return params.entityId ? [params.entityId, ...ids] : ids;
}

/**
 * Odak bir metin alanındaysa VE o alanda gerçekten (tarayıcının geri alabileceği)
 * içerik varsa kısayolu tarayıcıya bırak. Boş bir alan (ör. hızlı görev ekleme
 * kutusu: Enter'a basıp görevi oluşturduktan sonra bir sonrakini yazabilmek için
 * odaklı ve BOŞ kalır, bkz. TaskColumn commitAddTask/commitAddSubtask) için
 * tarayıcının geri alacağı bir şey yoktur — o durumda Cmd/Ctrl+Z uygulamanın
 * kendi geri alma yığınına gitmeli, yoksa az önce oluşturulan görev "geri
 * alınamıyor" gibi görünür (kısayol sessizce input'un boş native geçmişine gider).
 */
function isEditingText(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "SELECT") return true;
  if (tag === "INPUT" || tag === "TEXTAREA") {
    return (el as HTMLInputElement | HTMLTextAreaElement).value.trim().length > 0;
  }
  if (el.isContentEditable) {
    return (el.textContent ?? "").trim().length > 0;
  }
  return false;
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
  const toastInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const sync = useCallback(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, []);

  // Sunucu çağrısı bittikten SONRA tetiklenir: aksi halde listeler henüz geri
  // alınmamış veriyi çeker.
  const bumpRefresh = useCallback(() => setRefreshToken((v) => v + 1), []);

  /**
   * Aynı sayfadaki BAŞKA bir kullanıcı bir şey değiştirdiğinde de listeler
   * tazelenir (bkz. lib/liveRoom.ts).
   *
   * Neden bu sayaç: "açık listeler kendini yenilesin" mekanizması uygulamada
   * zaten vardı, geri/ileri alma için. Canlı sinyali de aynı yere bağlamak,
   * useRefreshOnUndo kullanan her yüzeyi (görev panoları, çıktılar, departman
   * listeleri, arşiv…) tek dokunuşla canlı hale getiriyor; her sayfaya ayrı bir
   * abonelik yazmak yerine.
   *
   * Sinyaller kısa süre biriktirilir: bir kullanıcının sürükleyip bıraktığı
   * görev arka arkaya birkaç istek üretiyor, karşı taraf tek sefer tazelesin.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshWhenIdle = () => {
      // Kullanıcı tam o sırada bir kartı sürüklüyorsa liste altından
      // değiştirilmez: sürükleme yarıda kopar, bırakılan kart yanlış yere
      // düşerdi. Bırakana kadar beklenir (bkz. lib/useSortableList.ts sınıfları).
      if (document.querySelector(".sortable-drag, .sortable-ghost, .sortable-chosen")) {
        timer = setTimeout(refreshWhenIdle, 500);
        return;
      }
      bumpRefresh();
    };
    const off = onRoomChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(refreshWhenIdle, 250);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [bumpRefresh]);

  const clearToastTimers = useCallback(() => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
    if (toastInterval.current) {
      clearInterval(toastInterval.current);
      toastInterval.current = null;
    }
  }, []);

  const showToast = useCallback(
    (message: string, durationMs: number = TOAST_MS) => {
      clearToastTimers();
      setToast(message);
      toastTimer.current = setTimeout(() => setToast(null), durationMs);
    },
    [clearToastTimers]
  );

  /**
   * Yıkıcı bir işlem (silme) başladığında gösterilen bildirimi saniye saniye
   * geri sayan bir mesaja çevirir — kullanıcı tam olarak kaç saniyesi kaldığını
   * görür (bkz. bug raporu: kullanıcı geri alınabilir olduğunu fark etmiyordu).
   * Süre dolunca (gerçek silme isteği o an gider) ya da başka bir toast
   * tetiklendiğinde geri sayım durur.
   */
  const showCountdownToast = useCallback(
    (label: string, totalSeconds: number) => {
      clearToastTimers();
      let remaining = totalSeconds;
      const render = () => `${label} — ${remaining} sn içinde Cmd/Ctrl+Z ile geri alabilirsin`;
      setToast(render());
      toastInterval.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          clearToastTimers();
          setToast(null);
          return;
        }
        setToast(render());
      }, 1000);
    },
    [clearToastTimers]
  );

  const pushEntry = useCallback(
    (entry: Entry) => {
      undoStack.current.push(entry);
      // Yığın sınırsız büyümesin; en eskiler düşerken bekleyen bir silme varsa
      // beklemeden gönderilir (yoksa hiç gerçekleşmezdi).
      while (undoStack.current.length > MAX_STACK) {
        const dropped = undoStack.current.shift();
        if (dropped?.kind === "destructive") {
          clearTimeout(dropped.timer);
          const ids = destructiveIds(dropped);
          // "Yığından düştü" demek "artık geri alınamaz, gerçek isteği gönder"
          // demek — ama hata olursa da (bkz. registerDestructive'teki zamanlayıcı
          // ile aynı desen) sessizce yutulmamalı, en azından bekleyen-silme
          // işaretini temizleyip listeleri tazelemeli (aksi halde kayıt
          // sonsuza dek "bekliyor" gibi gizli kalır — bkz. bug raporu).
          void Promise.resolve(dropped.commit())
            .catch(() => {
              showToast(`${dropped.label} silinemedi, ağ bağlantını kontrol et`);
            })
            .finally(() => {
              if (ids.length) setPendingDeleteIds((prev) => prev.filter((x) => !ids.includes(x)));
              bumpRefresh();
            });
        }
      }
      sync();
    },
    [sync, showToast, bumpRefresh]
  );

  /**
   * @param clearRedo Yeni bir kullanıcı işlemiyse true (ileri alma zinciri kırılır);
   *                  bir "ileri al" sonucu yeniden kaydediliyorsa false.
   */
  const registerDestructive = useCallback(
    (params: DestructiveParams, clearRedo: boolean) => {
      if (clearRedo) redoStack.current = [];
      const { label, commit, restore, entityId, entityIds } = params;
      const ids = destructiveIds(params);
      const forget = () => {
        if (ids.length) setPendingDeleteIds((prev) => prev.filter((x) => !ids.includes(x)));
      };
      const timer = setTimeout(() => {
        // Süre doldu: artık geri alınamaz, yığından düşür ve isteği gönder.
        undoStack.current = undoStack.current.filter((e) => !(e.kind === "destructive" && e.timer === timer));
        sync();
        void Promise.resolve(commit())
          .catch(() => {
            // İstek başarısız oldu: sessizce yutmak yerine haber ver ve
            // listeleri tazele — aksi halde kayıt sunucuda hâlâ dururken
            // arayüzde "silinmiş" gibi görünmeye devam eder.
            showToast(`${label} silinemedi, ağ bağlantını kontrol et`);
          })
          .finally(() => {
            forget();
            bumpRefresh();
          });
      }, DESTRUCTIVE_DELAY_MS);
      if (ids.length) setPendingDeleteIds((prev) => Array.from(new Set([...prev, ...ids])));
      pushEntry({
        kind: "destructive",
        label,
        commit,
        // Geri alınırsa kayıtları gizleme listesinden de çıkar ki tekrar görünsünler.
        restore: () => {
          forget();
          return restore();
        },
        entityId,
        entityIds,
        timer,
      });

      // Yalnızca yeni bir kullanıcı eyleminde (ileri almanın kendi yeniden
      // kaydı değil) bildir — aksi halde "ileri al" her tetiklendiğinde de
      // aynı bildirim tekrar çıkar. Bu, kullanıcının silmenin birkaç saniye
      // geri alınabilir olduğunu FARK ETMESİNİN tek yolu; aksi halde bunu
      // ancak tesadüfen Cmd+Z'ye basarsa öğrenirdi. Geri sayım, gerçek silme
      // isteğinin gideceği anla (DESTRUCTIVE_DELAY_MS) örtüşecek şekilde ayarlı.
      if (clearRedo) {
        showCountdownToast(label, Math.round(DESTRUCTIVE_DELAY_MS / 1000));
      }
    },
    [pushEntry, sync, showToast, showCountdownToast, bumpRefresh]
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

  // NOT: `run`/`restore` başarısız olabilir (ağ hatası, yetki sorunu vb.). Eskiden
  // bu durumda bile "geri alındı" mesajı gösterilip adım yığından sessizce
  // düşürülüyordu — kullanıcı işlemin geri alındığını sanıyor ama sunucuda hiçbir
  // şey değişmemiş oluyordu ve tekrar denemenin bir yolu kalmıyordu. Artık sonucu
  // bekliyoruz: başarılıysa "geri alındı" gösterip ileri alma yığınına ekliyoruz,
  // başarısızsa adımı GERİ yığına koyup hata mesajı gösteriyoruz ki tekrar denenebilsin.
  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) {
      sync();
      showToast("Geri alınacak bir işlem yok");
      return;
    }
    // Yığından çıkarıldığını hemen yansıt (buton/durum geri bildirimi); işlem
    // başarısız olursa aşağıda geri koyup tekrar senkronlayacağız.
    sync();

    if (entry.kind === "destructive") {
      clearTimeout(entry.timer);
      Promise.resolve(entry.restore())
        .then(() => {
          bumpRefresh();
          const params: DestructiveParams = {
            label: entry.label,
            commit: entry.commit,
            restore: entry.restore,
            entityId: entry.entityId,
            entityIds: entry.entityIds,
          };
          redoStack.current.push({
            label: entry.label,
            apply: () => {
              registerDestructive(params, false);
              bumpRefresh();
            },
          });
          sync();
          showToast(`${entry.label} geri alındı`);
        })
        .catch(() => {
          // Geri alma isteği başarısız oldu: adımı yığına geri koy, sessizce kaybolmasın.
          undoStack.current.push(entry);
          sync();
          showToast(`${entry.label} geri alınamadı, tekrar dene`);
        });
    } else {
      Promise.resolve(entry.run())
        .then(() => {
          bumpRefresh();
          if (entry.redo) {
            redoStack.current.push({
              label: entry.label,
              apply: async () => {
                await Promise.resolve(entry.redo!());
                bumpRefresh();
                registerUndoable(entry, false);
              },
            });
          } else {
            // Bu adım ileri alınamıyorsa zinciri kır — yarım uygulanmış bir
            // durum oluşmasındansa ileri alma kapansın.
            redoStack.current = [];
          }
          sync();
          showToast(`${entry.label} geri alındı`);
        })
        .catch(() => {
          undoStack.current.push(entry);
          sync();
          showToast(`${entry.label} geri alınamadı, tekrar dene`);
        });
    }
  }, [bumpRefresh, registerDestructive, registerUndoable, showToast, sync]);

  const redo = useCallback(() => {
    const item = redoStack.current.pop();
    if (!item) {
      sync();
      showToast("İleri alınacak bir işlem yok");
      return;
    }
    sync();
    Promise.resolve(item.apply())
      .then(() => {
        sync();
        showToast(`${item.label} ileri alındı`);
      })
      .catch(() => {
        // İleri alma başarısız oldu: adımı yığına geri koy, tekrar denenebilsin.
        redoStack.current.push(item);
        sync();
        showToast(`${item.label} ileri alınamadı, tekrar dene`);
      });
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
            zIndex: Z.undoToast,
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
