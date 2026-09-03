import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Sortable, { type SortableEvent } from "sortablejs";
import type { Task, TaskPriority, TaskStatus } from "@projelio/shared";
import { MAX_TASK_PRIORITY } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";

/** Alt görevi olmayan kartlar için sabit boş dizi: her çağrıda yenisini
 *  üretmek gereksiz referans değişikliği (ve gereksiz render) yaratır. */
const EMPTY_TASKS: Task[] = [];
import {
  IconPlus,
  IconChevronRight,
  IconCheck,
  IconEdit,
  IconActivity,
  IconStar,
} from "./icons";
import AskLioButton from "./AskLioButton";
import TaskAttachmentBadges from "./TaskAttachmentBadges";
import Modal from "./Modal";
import AutoGrowTextarea from "./AutoGrowTextarea";
import { useSortableList, SORTABLE_BASE_OPTIONS } from "../lib/useSortableList";
import { useClickIntent } from "../lib/clickIntent";
import { useKeepInView } from "../lib/useKeepInView";
import { useUndo } from "../lib/undo";
import { formatTaskDuration } from "../lib/dates";
import { coverBackground } from "../lib/covers";
import { assigneeLabels } from "../lib/taskAssignees";


export interface TaskColumnHandle {
  // Dışarıdan (ör. departman/iş sayfasındaki "+" FAB'ından) sütunun hızlı
  // "Görev ekle" giriş kutusunu açar — sütunun kendi "+ Görev ekle" düğmesine
  // basmışsınız gibi davranır.
  openCreate: () => void;
}

interface Props {
  status: TaskStatus;
  allTasks: Task[];
  // Verilmezse (ör. birden fazla projeyi birleştiren iş-geneli görünümde) sütunun altındaki
  // hızlı "Görev ekle" satırı gizlenir, çünkü hangi projeye/çıktıya ekleneceği belli olmaz.
  onCreate?: (status: TaskStatus, title: string) => void;
  // Verilmezse alt görev katmanı tamamen kapanır: kartlar açılmaz, ok işareti ve
  // "Alt görev ekle" gösterilmez. Kişisel Yapılacaklar panosu böyle çalışır —
  // orada kartların alt görevi olamaz (bkz. TasksOverview).
  onCreateSubtask?: (parentId: string, title: string) => void;
  onMove: (taskId: string, status: TaskStatus) => void;
  onToggleComplete: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  // Verilirse görev/alt görev başlığına çift tıklanarak adı yerinde değiştirilebilir;
  // PATCH bu bileşende atılır, üst bileşen yalnızca kendi state'ini günceller.
  onTaskRenamed?: (updated: Task) => void;
  // Aynı sütun içinde ya da sütunlar arasında (durum değişikliğiyle) basılı-tutup-sürükleme
  // ile sıralama yapıldığında son sırayı kalıcı hale getirmek için çağrılır.
  onReorderTasks?: (ids: string[]) => void;
  /**
   * Görev listesini sunucudan yeniden çeker.
   *
   * Seviye değiştiren sürüklemeler için şart: kayıt yeni yerine sunucuda
   * ekleniyor (hedefin alt görevlerinin SONUNA) ve doğru sırayı yalnızca
   * sunucu biliyor. Verilmezse üst görevi alt göreve sürükleme kapalı kalır.
   */
  onTasksReload?: () => void;
  // Sütunlar arası sürüklemenin çalışabilmesi için aynı görünümdeki tüm TaskColumn
  // örnekleri aynı group değerini paylaşmalı.
  group: string;
  // Giriş yapmış kullanıcının "üzerinde çalışıyorum" diyerek işaretlediği görev (varsa).
  activeTaskId?: string;
  onToggleActive?: (taskId: string) => void;
  // Karma listelerde (bkz. Yapılacaklar) bazı kartlar gerçek bir görev değildir;
  // "üzerinde çalışıyorum" yalnızca gerçek görevlerde anlamlıdır (users.active_task_id
  // tasks tablosuna FK). Verilmezse tüm kartlarda gösterilir (eski davranış).
  canToggleActive?: (task: Task) => boolean;
  // Ad değiştirme normalde PATCH /tasks/:id'ye gider. Görevleri başka bir uç
  // noktada yaşayan listeler (Yapılacaklar'daki kişisel kartlar) burayı geçerek
  // kendi isteklerini atar. Güncellenmiş görevi döndürmelidir.
  onRenameTask?: (task: Task, title: string) => Promise<Task>;
  // Verilirse (ör. birden fazla projeyi birleştiren iş-geneli görünümde) her görevin altında
  // hangi proje/çıktıya ait olduğunu gösteren küçük bir alt yazı render edilir.
  getTaskMeta?: (task: Task) => string | undefined;
  // Verilirse kartın başında küçük yuvarlak bir görsel gösterilir. Farklı
  // kaynakların karıştığı listelerde (bkz. Yapılacaklar) kartın nereye ait
  // olduğunu metni okumadan ayırt etmeye yarar. url yoksa label'ın ilk harfi
  // yedek olarak basılır.
  getTaskAvatar?: (task: Task) => { url?: string; label: string } | undefined;
  // Öncelik yıldızları, güncellemeyi karşılayacak bir taraf olduğu için
  // onTaskRenamed verildiğinde tıklanabilir olur; verilmediğinde yalnızca dolu
  // yıldızlar okunur şekilde basılır.
  //
  // İstek varsayılan olarak PATCH /tasks/:id'ye gider (ad değiştirmedeki desenin
  // aynısı). Görevleri başka bir uçta yaşayan listeler (Yapılacaklar'daki kişisel
  // kartlar) burayı geçerek kendi isteğini atar; güncellenmiş görevi döndürmelidir.
  onSetPriority?: (task: Task, priority: TaskPriority) => Promise<Task>;
  // Verilirse (ör. iş ekibi sekmesinden bir göreve tıklanıp buraya yönlendirildiğinde),
  // eşleşen görev/alt görev otomatik görünüre kaydırılır ve kısa süreliğine parlayarak
  // fark edilir hale getirilir.
  highlightTaskId?: string;
  // Seçim modu: her kartın başında bir checkbox belirir (üst görev + alt görev),
  // sürükle-bırak devre dışı kalır — çoklu seçimle çoğaltma/taşıma için (bkz.
  // useTaskSelection/TaskSelectionBar).
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (taskId: string) => void;
  /**
   * Karta çift tıklandığında çağrılır (başlık hariç — orada yerinde ad
   * değiştirme var, bkz. renderTitle). Görevin "asıl evine" gitmek için:
   * Yapılacaklar panosundaki bir iş görevi kendi projesinde yaşıyor, kullanıcı
   * onu bağlamıyla görmek istediğinde tek yol elle projeyi bulmaktı.
   */
  onOpenSource?: (task: Task) => void;
}

/**
 * Alt görev açıklamalarının rengi. Tema paletinde bu iş için ayrı bir ton yok;
 * `textSecondary` (#66707F) alt görevin atanan/süre bilgisinde zaten kullanılıyor
 * ve açıklama onlardan ayırt edilemiyordu. Bu mavi-gri ton beyaz yüzeyde 5.4:1
 * kontrast verir (WCAG AA eşiği 4.5:1) — `covers.ts`teki COVER_TEXT_SECONDARY
 * ile aynı gerekçe: paletin dışında ama ölçülmüş bir istisna.
 */
const SUBTASK_DESCRIPTION_COLOR = "#5A6B8C";

/**
 * Kartın sağ ucundaki alt görev sütununun (açma oku + "1/10" rozeti) sabit
 * genişliği. Sabit olması şart: içeriği karta göre değişiyor ve içeriğe göre
 * boyutlanınca solundaki eylem ikonları kartlar arasında farklı hizalara
 * düşüyordu.
 *
 * 34 px, 12 punto rozetin iki basamaklı hâlini ("10/10") taşır. Daha büyük
 * sayılarda rozet kutusundan biraz taşar ama YERLEŞİMİ değiştirmez — hizanın
 * bozulmaması, çok nadir bir durumda birkaç pikselin taşmasından önemli.
 *
 * Alt görev satırlarında da aynı genişlikte boşluk bırakılır ki alt görevlerin
 * ikonları üst görevlerinkiyle aynı dikey çizgide dursun.
 */
const SUBTASK_COL_WIDTH = 34;

/**
 * Bir görev kartının alt görev listesini açmasını isteyen olay. Alt görev
 * sürüklenirken kapalı bir kartın üzerinde beklenince tetiklenir; sürükleme
 * BAŞKA bir sütunda başlamış olabileceği için doğrudan state'e yazamıyoruz —
 * olay kartın üzerinde tetiklenir, kartı tutan TaskColumn kabararak gelen olayı
 * yakalar.
 */
const EXPAND_SUBTASKS_EVENT = "projelio:expand-subtasks";

/**
 * Bir alt görev sürüklemesinin başladığını/bittiğini tüm sütunlara duyuran olay.
 * Sürükleme tek bir sütunda başlar ama alt görev BAŞKA bir sütundaki karta
 * bırakılabilir; boş alt görev listelerinin bırakma alanı kazanması (yüksekliği
 * sıfır olan kutuya hiçbir şey bırakılamaz) bu yüzden panonun tamamında olmalı.
 */
const SUBTASK_DRAG_EVENT = "projelio:subtask-drag";

/** Kapalı kartın kendiliğinden açılması için üzerinde beklenmesi gereken süre (ms). */
const SUBTASK_HOVER_EXPAND_DELAY = 450;

const columnLabel: Record<TaskStatus, string> = {
  todo: "Yapılacak",
  in_progress: "Devam eden",
  completed: "Tamamlandı",
};

/**
 * Tarihi gün olarak biçimler; tarih yoksa ya da geçersizse boş string döner.
 * Kişisel Yapılacaklar kartlarının tarihi olmayabilir — "Invalid Date" basmak
 * yerine o alanı boş bırakıyoruz.
 */
function formatDay(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("tr-TR");
}

const TaskColumn = forwardRef<TaskColumnHandle, Props>(function TaskColumn({
  status,
  allTasks,
  onCreate,
  onCreateSubtask,
  onMove,
  onToggleComplete,
  onEditTask,
  onTaskRenamed,
  onReorderTasks,
  onTasksReload,
  group,
  activeTaskId,
  onToggleActive,
  canToggleActive,
  onRenameTask,
  getTaskMeta,
  getTaskAvatar,
  onSetPriority,
  highlightTaskId,
  selectionMode,
  selectedIds,
  onToggleSelect,
  onOpenSource,
}, ref) {
  const c = useThemeColors();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  useImperativeHandle(ref, () => ({
    openCreate: () => setAdding(true),
  }));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [subtaskParent, setSubtaskParent] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; title: string } | null>(null);
  const topListRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Başlığa çift tıklayınca yerinde ad değiştirme (bkz. renderTitle).
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const { pushUndo } = useUndo();

  // Hedef görev bir alt görevse, önce ait olduğu üst görevin açılır listesini genişlet
  // ki DOM'da render olsun ve kaydırma/parlama animasyonu ona ulaşabilsin.
  useEffect(() => {
    if (!highlightTaskId) return;
    const target = allTasks.find((t) => t.id === highlightTaskId);
    if (target?.parentTaskId) {
      setExpanded((prev) => (prev.has(target.parentTaskId!) ? prev : new Set(prev).add(target.parentTaskId!)));
    }
  }, [highlightTaskId, allTasks]);

  // Hedef görev DOM'da render olduğunda (gerekirse üst görev açıldıktan sonra) görünüre kaydır.
  //
  // `allTasks` bilerek bağımlılıkta: hedef, listeden ÖNCE belli olabiliyor —
  // başka bir sayfadan "şu göreve git" diye gelindiğinde vurgu daha ilk
  // render'da biliniyor ama kartlar sunucudan birkaç yüz ms sonra düşüyor.
  // Eski hâlde efekt boş DOM'da bir kez çalışıp susuyordu, yani kaydırma
  // sessizce gerçekleşmiyordu.
  //
  // `scrolledFor` tek seferlik yapıyor: liste her tazelendiğinde (canlı
  // yenileme, sürükleme) sayfayı yeniden zıplatmasın.
  const scrolledFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!highlightTaskId) {
      scrolledFor.current = undefined;
      return;
    }
    if (scrolledFor.current === highlightTaskId) return;
    const el = rootRef.current?.querySelector(`[data-id="${highlightTaskId}"]`) as HTMLElement | null;
    if (!el) return; // henüz render edilmedi; liste gelince tekrar denenir
    scrolledFor.current = highlightTaskId;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightTaskId, expanded, allTasks]);
  const subtaskSortables = useRef<Map<string, Sortable>>(new Map());

  const isCompletedColumn = status === "completed";
  // Alt görev katmanı yalnızca üst bileşen onCreateSubtask verdiğinde açılır.
  const subtasksEnabled = Boolean(onCreateSubtask);

  const columnAccent: Record<TaskStatus, string> = {
    todo: c.textSecondary,
    in_progress: c.primary,
    completed: c.success,
  };

  // Bu kolonda gerçekten yaşayan üst görevler (kendi statüsü bu kolonla eşleşen).
  const realTopLevel = allTasks.filter((t) => t.status === status && !t.parentTaskId);

  // Hızlı ekleme kutuları, her eklenen kayıtla bir kart boyu aşağı iner ve
  // ekranın altından çıkardı; kullanıcı yazmayı bırakıp sayfayı kaydırmak
  // zorunda kalıyordu. Kayıt sayısı değiştikçe VE metin uzayıp kutu büyüdükçe
  // görünür alana geri çekiliyor (bkz. useKeepInView).
  const addTaskFormRef = useKeepInView<HTMLFormElement>(adding, [title, realTopLevel.length]);
  // Aynı anda yalnızca tek bir alt görev kutusu açık olabildiği için (subtaskParent
  // tek bir kimlik) tek ref yetiyor; hangi kart açıksa ona bağlanıyor.
  const addSubtaskFormRef = useKeepInView<HTMLFormElement>(subtaskParent !== null, [
    subtaskParent,
    subtaskTitle,
    allTasks.length,
  ]);
  // Başlığa çift tıklayınca açılan yerinde düzenleme kutusu da aynı hizaya
  // uyar. Aynı anda yalnızca bir kutu açık olabildiği için (renamingId tek bir
  // kimlik) görev ve alt görev tek ref'i paylaşıyor.
  const renameBoxRef = useKeepInView<HTMLDivElement>(renamingId !== null, [renamingId, renameValue]);

  // Bir üst görevin altında gösterilecek alt görevler.
  // Tamamlandı kolonunda üst görev zaten tamamlanmışsa tüm alt görevleri (durumu ne olursa olsun) gösteriyoruz.
  // Diğer kolonlarda tamamlanmış alt görevler buradan kalkıp Tamamlandı'daki hayalet gruba taşınıyor.
  // Alt görevler üst göreve göre TEK GEÇİŞTE gruplanır.
  //
  // NEDEN: aşağıdaki subtasksOf ve subtaskStats her kart için allTasks'ı baştan
  // filtreliyordu. 200 görevlik bir kolonda bu, render başına 400 tam tarama
  // demek (O(n²)) — üstelik kolon her tuş vuruşunda yeniden çiziliyor (başlık
  // yerinde düzenlenirken), yani yazarken hissedilir gecikme oluşuyordu.
  const altGorevlerByParent = useMemo(() => {
    const harita = new Map<string, Task[]>();
    for (const t of allTasks) {
      if (!t.parentTaskId) continue;
      const liste = harita.get(t.parentTaskId);
      if (liste) liste.push(t);
      else harita.set(t.parentTaskId, [t]);
    }
    return harita;
  }, [allTasks]);

  // "Bugünün başlangıcı" render başına bir kez: gecikme kontrolü her kartta
  // aynı değeri kullanıyor, kart başına yeniden hesaplamak gereksiz.
  const bugunBaslangici = useMemo(() => {
    const simdi = new Date();
    return new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate());
    // Bağımlılık yok: gün içinde değişmiyor, gece yarısını geçen açık sekmede
    // zaten bir sonraki veri tazelemesinde yeniden hesaplanıyor.
  }, []);

  const subtasksOf = (parentId: string) => {
    const hepsi = altGorevlerByParent.get(parentId);
    if (!hepsi) return EMPTY_TASKS;
    return isCompletedColumn ? hepsi : hepsi.filter((t) => t.status !== "completed");
  };

  // Rozet için: toplam alt görev ve henüz tamamlanmamış (kalan) alt görev sayısı.
  const subtaskStats = (parentId: string) => {
    const all = altGorevlerByParent.get(parentId);
    if (!all) return { total: 0, remaining: 0 };
    let remaining = 0;
    for (const t of all) if (t.status !== "completed") remaining += 1;
    return { total: all.length, remaining };
  };

  // Sadece Tamamlandı kolonunda: üst görevi henüz tamamlanmamış ama kendisi tamamlanmış alt görevler.
  // Bunlar üst görevin hayalet (düşük opasiteli) bir başlığı altında gruplanır.
  // Üst görevi kimlikten bulmak için harita: aşağıdaki döngü her alt görev için
  // allTasks.find çağırıyordu, yani yine O(n²). Harita tek geçişte kuruluyor.
  const gorevById = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);

  const ghostGroups: { parent: Task; subtasks: Task[] }[] = [];
  if (isCompletedColumn) {
    const byParent = new Map<string, Task[]>();
    for (const t of allTasks) {
      if (!t.parentTaskId || t.status !== "completed") continue;
      const parent = gorevById.get(t.parentTaskId);
      if (!parent || parent.status === "completed") continue;
      const liste = byParent.get(parent.id);
      if (liste) liste.push(t);
      else byParent.set(parent.id, [t]);
    }
    for (const [parentId, subs] of byParent) {
      const parent = gorevById.get(parentId);
      if (parent) ghostGroups.push({ parent, subtasks: subs });
    }
  }

  // Üst görev kartları: kendi sütununda basılı tutup sürükleyerek sıralanabilir,
  // başka bir sütuna bırakıldığında ise görevin durumu değişir.
  useSortableList(
    topListRef,
    {
      // Seçim kipinde de sürükleme AÇIK: birden fazla kart seçip hepsini birden
      // bir görevin altına taşımak isteniyordu. Tıklama hâlâ seçim yapıyor —
      // sürükleme 180 ms basılı tutmak istiyor, ikisi çakışmıyor.
      group: { name: group, pull: true, put: true },
      sort: Boolean(onReorderTasks) && !selectionMode,
      handle: ".task-drag-handle",
      // Alt görev sürüklemesiyle AYNI yardımcılar: boş alt görev listeleri
      // bırakılabilir hale gelir ve kartın üzerinde beklenince liste açılır
      // (bkz. handleSubtaskDragMove). Ok işlevleri TDZ içindir — bu satırlar
      // render sırasında değerlendiriliyor, yardımcılar aşağıda tanımlı.
      onStart: (evt) => startSubtaskDrag(evt),
      onEnd: (evt) => {
        finishSubtaskDrag();
        const toEl = evt.to;
        const fromEl = evt.from;
        const taskId = evt.item.dataset.id;
        if (!taskId) return;

        // Hedef bir ALT GÖREV listesiyse bu bir seviye dönüşümüdür.
        const dropParentId = toEl.dataset.parentId;
        if (dropParentId) {
          // Hedef listenin BIRAKMADAN SONRAKİ sırası; DOM geri alınmadan önce
          // okunmalı. Kartın listenin neresine bırakıldığı buradan çıkıyor —
          // sona eklemek yerine kullanıcının bıraktığı yere konsun diye.
          const droppedOrder = Array.from(toEl.children)
            .map((node) => (node as HTMLElement).dataset.id)
            .filter((v): v is string => Boolean(v));

          // Sortable düğümü fiziksel olarak taşıdı; React bir sonraki render'da
          // aynı düğümü eski yerinden kaldırmaya çalışıp "removeChild" hatası
          // verirdi. Taşımayı hemen geri alıyoruz (aynı önlem aşağıda da var).
          try {
            toEl.removeChild(evt.item);
            const referenceNode = fromEl.children[evt.oldIndex ?? fromEl.children.length] ?? null;
            fromEl.insertBefore(evt.item, referenceNode);
          } catch {
            // DOM zaten React tarafından güncellendiyse sorun yok
          }
          void convertToSubtaskByDrop(taskId, dropParentId, droppedOrder);
          return;
        }
        const ids = Array.from(toEl.children)
          .map((node) => (node as HTMLElement).dataset.id)
          .filter((v): v is string => Boolean(v));
        if (toEl !== fromEl) {
          // Sortable kartın DOM düğümünü diğer sütuna fiziksel olarak taşır; React ise
          // bir sonraki render'da aynı düğümü eski sütundan kaldırmaya çalışıp
          // "removeChild" hatasıyla sayfayı beyaza düşürürdü. Bu yüzden DOM taşımasını
          // hemen geri alıyoruz; kartın yeni sütunda görünmesini state güncellemesi
          // (onMove) sağlıyor.
          try {
            toEl.removeChild(evt.item);
            const referenceNode = fromEl.children[evt.oldIndex ?? fromEl.children.length] ?? null;
            fromEl.insertBefore(evt.item, referenceNode);
          } catch {
            // DOM zaten React tarafından güncellendiyse sorun yok
          }
          const toStatus = toEl.dataset.status as TaskStatus | undefined;
          if (toStatus) {
            // Sürüklenen kart seçiliyse seçimin tamamı taşınır — alt göreve
            // dönüştürmedeki davranışın aynısı, aksi halde seçim kipinde
            // sürüklemek yalnızca bir kartı taşıyıp kafa karıştırırdı.
            const selection = latest.current.selectedIds;
            const movingIds =
              selection?.has(taskId) && selection.size > 1
                ? latest.current.allTasks
                    .filter((t) => selection.has(t.id) && !t.parentTaskId)
                    .map((t) => t.id)
                : [taskId];
            for (const id of movingIds) onMove(id, toStatus);
          }
        }
        if (!onReorderTasks) return;
        onReorderTasks(ids);
      },
    },
    [group, Boolean(onReorderTasks), selectionMode]
  );

  // ------------------------------------------------- alt görev sürükle-bırak
  // Alt görevler hem kendi listelerinde sıralanır hem de BAŞKA bir görev
  // kartının altına taşınabilir. İki incelik var:
  //
  // 1) Ref geri çağrısı parentId başına SABİT olmalı. Satır içi bir arrow
  //    kullanılsaydı her render'da kimliği değişir, React onu önce null ile
  //    çağırır ve Sortable örneği YOK EDİLİRDİ — sürükleme sırasında olan bir
  //    render (bkz. kapalı kartın kendiliğinden açılması) sürüklemeyi keserdi.
  //    Bu yüzden açık/kapalı olma durumu artık `disabled` seçeneğiyle yönetiliyor.
  // 2) Kapalı bir kartın alt görev listesi DOM'da yoktur; bırakılacak bir yer
  //    doğsun diye kartın üzerinde bir süre durunca kart kendiliğinden açılır.
  const [draggingSubtask, setDraggingSubtask] = useState(false);
  const hoverExpandRef = useRef<{ id: string; timer: number } | null>(null);
  // Sürüklenen alt görev ve kalktığı liste. Kartın kendiliğinden açılması
  // (yani sürükleme ortasında bir React render'ı) yalnızca düğüm HÂLÂ kendi
  // listesindeyken güvenli: Sortable onu başka bir listeye taşıdıktan sonra
  // React eski listeyi güncellemeye çalışıp "removeChild" ile sayfayı düşürür.
  const dragOriginRef = useRef<{ item: HTMLElement; from: HTMLElement } | null>(null);

  // Sortable seçenekleri bir kez kuruluyor; içeriden okunan prop'lar bu yüzden
  // ref üzerinden alınır, yoksa ilk render'ın değerlerine saplanırdı.
  const latest = useRef({ onReorderTasks, onTaskRenamed, pushUndo, onTasksReload, selectedIds, allTasks });
  useEffect(() => {
    latest.current = { onReorderTasks, onTaskRenamed, pushUndo, onTasksReload, selectedIds, allTasks };
  });

  /**
   * Görev kartı, alt görev listesine bırakılarak dönüştürülebilir mi?
   *
   * Yeniden yükleme geri çağrısı olmadan kapalı: dönüşüm sunucuda olur ama
   * ekran eski sırayı gösterir ve kullanıcı işlemin çalışmadığını sanar.
   * Ref üzerinden okunuyor çünkü Sortable örnekleri bir kez kuruluyor.
   */
  const canConvertByDrop = Boolean(onTasksReload) && subtasksEnabled;
  const canConvertByDropRef = useRef(canConvertByDrop);
  useEffect(() => {
    canConvertByDropRef.current = canConvertByDrop;
  }, [canConvertByDrop]);

  // Seçim kipinde de açık: çoklu seçimin BIRAKILACAĞI liste bu ve kapalıyken
  // hedef hiçbir şeyi kabul etmiyordu.
  const subtaskDragDisabled = !onReorderTasks;
  const subtaskDragDisabledRef = useRef(subtaskDragDisabled);
  useEffect(() => {
    subtaskDragDisabledRef.current = subtaskDragDisabled;
    for (const instance of subtaskSortables.current.values()) {
      instance.option("disabled", subtaskDragDisabled);
    }
  }, [subtaskDragDisabled]);

  // Sürükleme hangi sütunda başlarsa başlasın tüm sütunlar haberdar olmalı
  // (bkz. SUBTASK_DRAG_EVENT).
  useEffect(() => {
    const handler = (e: Event) => {
      setDraggingSubtask(Boolean((e as CustomEvent<{ active: boolean }>).detail?.active));
    };
    document.addEventListener(SUBTASK_DRAG_EVENT, handler);
    return () => document.removeEventListener(SUBTASK_DRAG_EVENT, handler);
  }, []);

  // Başka bir sütunda başlamış bir sürükleme bu sütundaki bir kartın açılmasını
  // isteyebilir; olay kartın üzerinde tetiklenip buraya kabararak geliyor.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const handler = (e: Event) => {
      const id = (e as CustomEvent<{ taskId: string }>).detail?.taskId;
      if (!id) return;
      setExpanded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    };
    el.addEventListener(EXPAND_SUBTASKS_EVENT, handler);
    return () => el.removeEventListener(EXPAND_SUBTASKS_EVENT, handler);
  }, []);

  // Aşağıdaki iki fonksiyon yalnızca ref ve DOM'a dokunuyor; kimlikleri sabit
  // olmalı ki addEventListener/removeEventListener aynı referansı görsün.
  const clearHoverExpand = useRef(() => {
    if (!hoverExpandRef.current) return;
    window.clearTimeout(hoverExpandRef.current.timer);
    hoverExpandRef.current = null;
  }).current;

  const handleSubtaskDragMove = useRef((e: Event) => {
    const source = e as MouseEvent & { touches?: TouchList };
    const point = source.touches?.length
      ? { x: source.touches[0].clientX, y: source.touches[0].clientY }
      : typeof source.clientX === "number"
      ? { x: source.clientX, y: source.clientY }
      : null;
    if (!point) return;

    // Sürüklenen kopya imlecin altında durduğu için elementFromPoint onu
    // döndürürdü; yığındaki İLK görev kartını arıyoruz.
    let card: HTMLElement | null = null;
    for (const el of document.elementsFromPoint(point.x, point.y)) {
      const match = (el as HTMLElement).closest?.("[data-task-card-id]") as HTMLElement | null;
      if (match) {
        card = match;
        break;
      }
    }
    const id = card?.dataset.taskCardId;
    const origin = dragOriginRef.current;
    // Açık bir kartın alt görev listesi zaten DOM'da; açmaya gerek yok.
    // Düğüm kendi listesinden çıktıysa artık açmıyoruz (bkz. dragOriginRef).
    if (!card || !id || (origin && origin.item.parentElement !== origin.from) || document.querySelector(`[data-parent-id="${id}"]`)) {
      clearHoverExpand();
      return;
    }
    if (hoverExpandRef.current?.id === id) return;
    clearHoverExpand();
    const target = card;
    hoverExpandRef.current = {
      id,
      timer: window.setTimeout(() => {
        hoverExpandRef.current = null;
        target.dispatchEvent(
          new CustomEvent(EXPAND_SUBTASKS_EVENT, { bubbles: true, detail: { taskId: id } })
        );
      }, SUBTASK_HOVER_EXPAND_DELAY),
    };
  }).current;

  /**
   * Bir GÖREVİN başka bir görevin alt görev listesine bırakılması.
   *
   * Listeden üst görev seçmeye göre daha doğrudan: kullanıcı zaten kartı
   * görüyor. Kayıt hedefin alt görevlerinin SONUNA ekleniyor (sunucu öyle
   * yerleştiriyor), o yüzden yerel yama yerine liste yeniden çekiliyor —
   * doğru sırayı yalnızca sunucu biliyor.
   */
  const convertToSubtaskByDrop = async (
    taskId: string,
    parentId: string,
    droppedOrder: string[]
  ) => {
    const {
      onTasksReload: reload,
      pushUndo: undo,
      selectedIds: selection,
      allTasks: tasksNow,
    } = latest.current;

    // Sürüklenen kart seçiliyse SEÇİMİN TAMAMI taşınır. Sortable tek bir düğüm
    // sürüklüyor; ötekilerin de gelmesi kullanıcının beklentisi (çoklu seçip
    // sürükleme). Sıraları panodaki sıralarıyla korunur.
    const movingIds =
      selection?.has(taskId) && selection.size > 1
        ? tasksNow.filter((t) => selection.has(t.id) && !t.parentTaskId).map((t) => t.id)
        : [taskId];

    // Eski üst görevler geri alma için işlemden ÖNCE saklanır.
    const previousParents = new Map<string, string | null>(
      movingIds.map((id) => [id, tasksNow.find((t) => t.id === id)?.parentTaskId ?? null])
    );

    // Hedef listenin son sırası: sürüklenen kartın bırakıldığı yere, birlikte
    // gelenler de onun hemen ardına yerleşir.
    const finalOrder = [...droppedOrder];
    const at = finalOrder.indexOf(taskId);
    const others = movingIds.filter((id) => id !== taskId);
    finalOrder.splice(at < 0 ? finalOrder.length : at + 1, 0, ...others);

    const apply = async (ids: string[], parent: string | null) => {
      if (ids.length === 1) {
        await api.patch(`/tasks/${ids[0]}/hierarchy`, { parentTaskId: parent });
        return;
      }
      await api.patch("/tasks/bulk-hierarchy", { ids, parentTaskId: parent });
    };

    // Sıralama isteği BEKLENMELİ. `onReorderTasks` isteği ateşleyip dönüyor;
    // hemen ardından yeniden yükleme yapılınca GET, sıralama PATCH'inden önce
    // cevap dönüyor ve kart listenin sonunda görünüyordu (sunucu dönüşümde
    // kaydı sona ekliyor). O yüzden burada doğrudan ve await ile çağrılıyor.
    const writeOrder = async (ids: string[]) => {
      await api.patch("/tasks/reorder", { ids });
    };

    try {
      await apply(movingIds, parentId);
      // Sıra dönüşümden SONRA yazılır: sunucu kaydı listenin sonuna ekliyor,
      // kullanıcının bıraktığı yeri ancak bu çağrı sabitliyor.
      await writeOrder(finalOrder);

      undo?.({
        label: movingIds.length > 1 ? `${movingIds.length} görev alt göreve alındı` : "Alt göreve dönüştürüldü",
        // Geri alırken her kayıt KENDİ eski üst görevine döner; birlikte taşınan
        // kartlar farklı yerlerden gelmiş olabilir.
        run: async () => {
          const groups = new Map<string | null, string[]>();
          for (const id of movingIds) {
            const previous = previousParents.get(id) ?? null;
            groups.set(previous, [...(groups.get(previous) ?? []), id]);
          }
          for (const [previous, ids] of groups) await apply(ids, previous);
        },
        redo: async () => {
          await apply(movingIds, parentId);
          await writeOrder(finalOrder);
        },
      });
      reload?.();
    } catch (err: any) {
      // Sunucu kuralı reddedebilir (ör. kaydın kendi alt görevleri var).
      window.alert(err?.message ?? "Alt göreve dönüştürülemedi.");
      reload?.();
    }
  };

  const startSubtaskDrag = (evt: SortableEvent) => {
    dragOriginRef.current = { item: evt.item, from: evt.from };
    document.dispatchEvent(new CustomEvent(SUBTASK_DRAG_EVENT, { detail: { active: true } }));
    document.addEventListener("pointermove", handleSubtaskDragMove, true);
    document.addEventListener("touchmove", handleSubtaskDragMove, true);
  };

  const finishSubtaskDrag = () => {
    dragOriginRef.current = null;
    document.dispatchEvent(new CustomEvent(SUBTASK_DRAG_EVENT, { detail: { active: false } }));
    clearHoverExpand();
    document.removeEventListener("pointermove", handleSubtaskDragMove, true);
    document.removeEventListener("touchmove", handleSubtaskDragMove, true);
  };

  const handleSubtaskDrop = async (evt: SortableEvent) => {
    const { onReorderTasks: reorder, onTaskRenamed: taskUpdated, pushUndo: undo } = latest.current;
    const toEl = evt.to;
    const fromEl = evt.from;
    const subtaskId = evt.item.dataset.id;
    if (!subtaskId) return;
    // Hedef listenin son sırası — DOM'u geri almadan ÖNCE okunmalı.
    const ids = Array.from(toEl.children)
      .map((node) => (node as HTMLElement).dataset.id)
      .filter((v): v is string => Boolean(v));

    if (toEl === fromEl) {
      reorder?.(ids);
      return;
    }

    // Sortable düğümü fiziksel olarak diğer listeye taşıdı; React bir sonraki
    // render'da onu eski listeden kaldırmaya çalışıp "removeChild" hatasıyla
    // sayfayı düşürürdü. Üst görev sütunlarındaki desenin aynısı: taşımayı hemen
    // geri alıyoruz, alt görevin yeni yerinde görünmesini state güncellemesi sağlıyor.
    try {
      toEl.removeChild(evt.item);
      const reference = fromEl.children[evt.oldIndex ?? fromEl.children.length] ?? null;
      fromEl.insertBefore(evt.item, reference);
    } catch {
      // DOM zaten React tarafından güncellendiyse sorun yok
    }

    // Hedef bir SÜTUNSA alt görev üst seviyeye çıkar. Eskiden bu bırakma
    // sessizce hiçbir şey yapmıyordu: kart eski yerine dönüyor, kullanıcı
    // sürüklemenin çalışmadığını sanıyordu.
    const toStatus = toEl.dataset.status as TaskStatus | undefined;
    if (toStatus) {
      const { onTasksReload: reload } = latest.current;
      const previousParent = fromEl.dataset.parentId ?? null;
      if (!reload) return;
      try {
        await api.patch(`/tasks/${subtaskId}/hierarchy`, { parentTaskId: null });
        // Bırakıldığı sütunun durumu devralınır ve bırakıldığı sıraya yerleşir.
        await api.patch(`/tasks/${subtaskId}/status`, { status: toStatus });
        // Sıralama da beklenmeli; yoksa hemen sonraki yeniden yükleme eski
        // sırayı çekiyor (bkz. convertToSubtaskByDrop'taki aynı gerekçe).
        await api.patch("/tasks/reorder", { ids });
        undo?.({
          label: "Göreve dönüştürüldü",
          run: async () => {
            if (previousParent) {
              await api.patch(`/tasks/${subtaskId}/hierarchy`, { parentTaskId: previousParent });
            }
          },
          redo: async () => {
            await api.patch(`/tasks/${subtaskId}/hierarchy`, { parentTaskId: null });
            await api.patch(`/tasks/${subtaskId}/status`, { status: toStatus });
          },
        });
      } catch (err: any) {
        window.alert(err?.message ?? "Göreve dönüştürülemedi.");
      }
      reload();
      return;
    }

    const newParentId = toEl.dataset.parentId;
    const previousParentId = fromEl.dataset.parentId;
    if (!newParentId || !previousParentId || newParentId === previousParentId || !taskUpdated) return;

    const applyParent = async (parentId: string) => {
      const updated = await api.patch<Task>(`/tasks/${subtaskId}/parent`, { parentTaskId: parentId });
      taskUpdated(updated);
    };

    try {
      await applyParent(newParentId);
      // Geri alma sırası bilinçli: önce taşıma kaydedilir, SONRA sıralama.
      // Cmd/Ctrl+Z önce sıralamayı (alt görev hâlâ hedefteyken), ikinci basışta
      // taşımayı geri alır. Ters sırada olsaydı ikinci geri alma, artık başka bir
      // üst görevin altında olan kayıtları tek liste sanıp sunucuda reddedilirdi.
      undo({
        label: "Alt görev taşıma",
        run: () => applyParent(previousParentId),
        redo: () => applyParent(newParentId),
      });
      reorder?.(ids);
    } catch {
      // taşınamadı, kullanıcı tekrar deneyebilir
    }
  };

  // parentId başına sabit ref geri çağrısı (bkz. yukarıdaki 1. madde).
  const subtaskListRefs = useRef<Map<string, (el: HTMLDivElement | null) => void>>(new Map());

  const subtaskListRef = (parentId: string) => {
    const cached = subtaskListRefs.current.get(parentId);
    if (cached) return cached;
    const cb = (el: HTMLDivElement | null) => {
      const existing = subtaskSortables.current.get(parentId);
      if (existing) {
        existing.destroy();
        subtaskSortables.current.delete(parentId);
      }
      if (!el) return;
      subtaskSortables.current.set(
        parentId,
        Sortable.create(el, {
          // Kenarda sayfayı kaydırma dahil ortak ayarlar (bkz. useSortableList).
          ...SORTABLE_BASE_OPTIONS,
          disabled: subtaskDragDisabledRef.current,
          // Panodaki TÜM alt görev listeleri aynı grubu paylaşır; alt görev
          // böylece başka bir görev kartının altına bırakılabiliyor. Üst görev
          // sütunları ayrı bir grup adı kullandığı için alt görev oraya düşmez.
          // `put` içine ÜST GÖREV grubu da alınıyor: bir görev kartı bir başka
          // görevin alt görev listesine bırakılabilsin diye. Bırakma sonucu
          // seviye dönüşümüdür (bkz. üst görev listesinin onEnd'i); alt görevin
          // alt görevi oluşmaz çünkü hedef her zaman bir üst görevin listesi.
          group: {
            name: `${group}-subtasks`,
            pull: true,
            // `put` içine ÜST GÖREV grubu da alınabiliyor: bir görev kartı bir
            // başka görevin alt görev listesine bırakılabilsin diye. Sonuç
            // seviye dönüşümüdür (bkz. üst görev listesinin onEnd'i).
            put: canConvertByDropRef.current
              ? [`${group}-subtasks`, group]
              : [`${group}-subtasks`],
          },
          onStart: startSubtaskDrag,
          onEnd: (evt) => {
            finishSubtaskDrag();
            void handleSubtaskDrop(evt);
          },
        })
      );
    };
    subtaskListRefs.current.set(parentId, cb);
    return cb;
  };

  // Kartta hem tek (alt görevleri aç/kapa) hem çift (kaynağa git) tıklama işi var;
  // ikisinin birbirine karışmaması için bkz. lib/clickIntent.
  const click = useClickIntent();

  const toggleExpand = (id: string) => {
    if (!subtasksEnabled) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Mobil klavyelerin "bitti/onay" tuşu her zaman gerçek bir Enter tuşu göndermeyip
  // sadece input'un odağını kaybettirebiliyor (blur). Bu yüzden ekleme mantığı hem
  // form submit hem de blur'dan çağrılabilen tek bir fonksiyonda toplanıyor; aynı anda
  // ikisi birden tetiklense bile addingRef sayesinde görev iki kez eklenmiyor.
  const addingTaskRef = useRef(false);
  const addingSubtaskRef = useRef(false);

  // ---------------------------------------------------------------- Ad değiştirme
  // Başlığa çift tıklamak metni bir input'a çevirir. Enter ya da odak kaybı
  // kaydeder, Esc vazgeçer. Kaydetme geri alınabilir (Cmd/Ctrl+Z).
  const startRename = (task: Task) => {
    if (selectionMode || !onTaskRenamed) return;
    setRenamingId(task.id);
    setRenameValue(task.title);
  };

  const commitRename = async (task: Task) => {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (!onTaskRenamed || !trimmed || trimmed === task.title) return;
    const previousTitle = task.title;
    const applyTitle = async (value: string) => {
      const updated = onRenameTask
        ? await onRenameTask(task, value)
        : await api.patch<Task>(`/tasks/${task.id}`, { title: value });
      onTaskRenamed(updated);
    };
    try {
      await applyTitle(trimmed);
      pushUndo({
        label: task.parentTaskId ? "Alt görev adı" : "Görev adı",
        run: () => applyTitle(previousTitle),
        redo: () => applyTitle(trimmed),
      });
    } catch {
      // güncellenemedi, kullanıcı tekrar deneyebilir
    }
  };

  /**
   * Düzenleme kutusundaki olayların satıra ULAŞMASINI engelleyen ref.
   *
   * İki ayrı sorunu birden kapatıyor:
   *  - basma olayları (pointerdown/mousedown/touchstart) satıra ulaşırsa
   *    SortableJS metin seçmek yerine kartı sürüklemeye başlıyor;
   *  - çift tıklama satıra ulaşırsa düzenleme modali açılıyor — oysa kullanıcı
   *    kutunun içinde KELİME SEÇMEYE çalışıyor.
   *
   * NEDEN React'in kendi işleyicileri yetmiyor: React olayları kök kapsayıcıda
   * dinliyor, SortableJS ise liste kapsayıcısına DOĞRUDAN yerel dinleyici
   * bağlıyor. Yerel olay React'e ulaşmadan önce oradan geçtiği için React
   * tarafında stopPropagation demek geç kalıyor. Buradaki dinleyiciler hedefin
   * kendisinde durduğu için hangi katman dinlerse dinlesin olay en baştan kesilir.
   *
   * preventDefault ÇAĞRILMIYOR: metin seçme ve kelime seçme davranışı tamamen
   * tarayıcıda kalmalı.
   */
  const stopPressRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const stop = (e: Event) => e.stopPropagation();
    for (const name of ["pointerdown", "mousedown", "touchstart", "click", "dblclick"]) {
      node.addEventListener(name, stop);
    }
  }, []);

  /** Görev/alt görev başlığı: normalde metin, çift tıklanınca düzenlenebilir input. */
  const renderTitle = (task: Task, fontSize: number, color: string) => {
    if (renamingId === task.id) {
      return (
        // Sarmalayıcı, kutunun ekranın altında kalmaması içindir: AutoGrowTextarea
        // ref almıyor, ölçülecek bir düğüm gerekiyor (bkz. useKeepInView).
        <div ref={renameBoxRef} style={{ flex: 1, minWidth: 0, display: "flex" }}>
          {/* İç sarmalayıcı yalnızca basma olaylarını kesmek için: tut-taşı
              listeleri bu satırı kapsıyor ve olay onlara ulaşırsa metin seçmek
              yerine kart sürüklenmeye başlıyor (bkz. stopPressRef). */}
          <div ref={stopPressRef} className="no-drag" style={{ flex: 1, minWidth: 0, display: "flex" }}>
            {/* Uzun başlıklar tek satırda yatay kayıp okunmaz hale gelmesin diye
                sararak aşağı büyüyen alan (bkz. AutoGrowTextarea). */}
            <AutoGrowTextarea
              autoFocus
              value={renameValue}
              onChange={setRenameValue}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => void commitRename(task)}
              onSubmit={() => void commitRename(task)}
              onCancel={() => setRenamingId(null)}
              ariaLabel="Görev adı"
              fontSize={fontSize}
              // Ölçüler yerini aldığı metinle aynı olsun diye: kutu görünümü
              // .autogrow-inline ile sıfırlanıyor, asgari yükseklik de satırın
              // kendi yüksekliğine bırakılıyor (bkz. index.css).
              minHeight={0}
              className="autogrow-inline"
              style={{ flex: 1, minWidth: 0 }}
            />
          </div>
        </div>
      );
    }
    return (
      <span
        onDoubleClick={(e) => {
          e.stopPropagation();
          startRename(task);
        }}
        title={onTaskRenamed && !selectionMode ? "Adı değiştirmek için çift tıkla" : undefined}
        style={{
          fontSize,
          color,
          textDecoration: task.status === "completed" ? "line-through" : "none",
          overflowWrap: "break-word",
          wordBreak: "break-word",
        }}
      >
        {task.title}
      </span>
    );
  };

  // Yıldızın üzerine gelince o dereceye kadar doldurarak önizleme yapar;
  // tıklamadan önce "kaç yıldız veriyorum" görünür olmalı.
  const [hoverStar, setHoverStar] = useState<{ taskId: string; value: number } | null>(null);

  /**
   * Öncelik yıldızları. onTaskRenamed verilmişse (yani güncellemeyi karşılayacak
   * bir taraf varsa) tıklanabilir; verilmemişse yalnızca dolu yıldızlar okunur
   * şekilde basılır — önceliksiz görevde hiçbir şey görünmez, kart sessiz kalır.
   */
  const applyPriority = async (task: Task, priority: TaskPriority) => {
    if (!onTaskRenamed) return;
    const previous = (task.priority ?? 0) as TaskPriority;
    if (previous === priority) return;
    const request = async (value: TaskPriority) => {
      const updated = onSetPriority
        ? await onSetPriority(task, value)
        : await api.patch<Task>(`/tasks/${task.id}`, { priority: value });
      onTaskRenamed(updated);
    };
    try {
      await request(priority);
      pushUndo({
        label: "Görev önceliği",
        run: () => request(previous),
        redo: () => request(priority),
      });
    } catch {
      // güncellenemedi, kullanıcı tekrar deneyebilir
    }
  };

  const renderPriority = (task: Task) => {
    const current = task.priority ?? 0;
    if (!onTaskRenamed) {
      if (current === 0) return null;
      return (
        <div
          aria-label={`Öncelik ${current}/${MAX_TASK_PRIORITY}`}
          style={{ display: "flex", gap: 1, marginTop: 5 }}
        >
          {Array.from({ length: current }, (_, i) => (
            <IconStar key={i} size={12} color={c.accent} filled />
          ))}
        </div>
      );
    }

    const preview = hoverStar?.taskId === task.id ? hoverStar.value : null;
    return (
      <div
        role="radiogroup"
        aria-label="Öncelik"
        onMouseLeave={() => setHoverStar(null)}
        style={{ display: "flex", gap: 1, marginTop: 5 }}
      >
        {Array.from({ length: MAX_TASK_PRIORITY }, (_, i) => {
          const value = (i + 1) as TaskPriority;
          const filled = value <= (preview ?? current);
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={current === value}
              aria-label={`${value} yıldız`}
              title={current === value ? "Önceliği kaldır" : `${value} yıldız`}
              onMouseEnter={() => setHoverStar({ taskId: task.id, value })}
              onClick={(e) => {
                e.stopPropagation();
                // Aynı yıldıza tekrar basmak önceliği kaldırır — yanlışlıkla
                // verilen bir dereceyi geri almanın tek yolu bu olmalı.
                void applyPriority(task, current === value ? 0 : value);
              }}
              style={{
                display: "flex",
                padding: 1,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                lineHeight: 0,
              }}
            >
              <IconStar
                size={13}
                color={filled ? c.accent : c.border}
                filled={filled}
              />
            </button>
          );
        })}
      </div>
    );
  };

  const commitAddTask = () => {
    if (addingTaskRef.current || !onCreate) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setAdding(false);
      return;
    }
    addingTaskRef.current = true;
    onCreate(status, trimmed);
    setTitle("");
    setTimeout(() => {
      addingTaskRef.current = false;
    }, 0);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    commitAddTask();
  };

  const commitAddSubtask = (parentId: string) => {
    if (addingSubtaskRef.current || !onCreateSubtask) return;
    const trimmed = subtaskTitle.trim();
    if (!trimmed) {
      setSubtaskParent(null);
      return;
    }
    addingSubtaskRef.current = true;
    onCreateSubtask(parentId, trimmed);
    setSubtaskTitle("");
    setTimeout(() => {
      addingSubtaskRef.current = false;
    }, 0);
  };

  const handleAddSubtask = (e: React.FormEvent, parentId: string) => {
    e.preventDefault();
    commitAddSubtask(parentId);
  };

  const handleCheckboxClick = (e: React.MouseEvent, taskId: string, currentStatus: TaskStatus, taskTitle: string) => {
    e.stopPropagation();
    if (currentStatus === "completed") {
      onToggleComplete(taskId);
    } else {
      setConfirmTarget({ id: taskId, title: taskTitle });
    }
  };

  const confirmComplete = () => {
    if (confirmTarget) onToggleComplete(confirmTarget.id);
    setConfirmTarget(null);
  };

  return (
    <div
      ref={rootRef}
      style={{
        width: "100%",
        background: c.background,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <h4 style={{ color: c.textPrimary, fontSize: 16, fontWeight: 500, margin: 0 }}>{columnLabel[status]}</h4>
        <span style={{ fontSize: 13, color: c.textSecondary, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 20, padding: "1px 7px" }}>
          {realTopLevel.length}
        </span>
      </div>

      <div ref={topListRef} data-status={status}>
        {realTopLevel.map((t) => {
          const subtasks = subtasksOf(t.id);
          const isOpen = subtasksEnabled && expanded.has(t.id);
          const stats = subtaskStats(t.id);
          // Gün bazlı karşılaştırma: son günü bugün olan görevler gün bitmeden
          // "gecikmiş" (kırmızı) görünmesin — sadece tarihi gerçekten geçmişse.
          // "Bugün" döngü DIŞINDA bir kez hesaplanıyor (bkz. bugunBaslangici):
          // burada kurulunca her render'da kart başına iki Date nesnesi daha
          // yaratılıyordu ve değeri zaten hepsinde aynı.
          const deadlineDate = new Date(t.deadline);
          const deadlineDay = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());
          const isOverdue = t.status !== "completed" && deadlineDay < bugunBaslangici;
          const isOverdueWithPendingSubtasks = isOverdue && stats.total > 0 && stats.remaining > 0;
          return (
            <div key={t.id} data-id={t.id} style={{ marginBottom: 8 }}>
              <div
                className={`task-drag-handle${highlightTaskId === t.id ? " task-highlight-flash" : ""}`}
                // Alt görev sürüklenirken imlecin altındaki kart bu işaretle
                // bulunur ve kapalıysa kendiliğinden açılır (bkz. handleSubtaskDragMove).
                data-task-card-id={subtasksEnabled ? t.id : undefined}
                // Tek tıklama alt görevleri açar/kapar, çift tıklama görevin
                // kaynağına gider. Çift tıklamada tarayıcı önce İKİ `click`
                // gönderdiği için tek tıklama işi doğrudan burada yapılamaz:
                // eskiden yapılıyor ve `dblclick` içinde bir kez daha
                // toggleExpand çağrılarak "geri alınmaya" çalışılıyordu — ama
                // geri alınması gereken iki tık vardı, üçüncü çağrı listeyi açık
                // bırakıp gözle görülür bir açılıp-kapanmaya yol açıyordu.
                // Artık tek tıklama kısa bir süre bekletiliyor (bkz. clickIntent).
                onClick={() => (onOpenSource ? click.single(() => toggleExpand(t.id)) : toggleExpand(t.id))}
                onDoubleClick={
                  onOpenSource
                    ? (e) => {
                        e.stopPropagation();
                        click.double(() => onOpenSource(t));
                      }
                    : undefined
                }
                title={onOpenSource ? "Çift tıkla: görevin bulunduğu sayfaya git" : undefined}
                style={{
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderLeft: `3px solid ${columnAccent[status]}`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  cursor: subtasksEnabled ? "pointer" : "default",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {selectionMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSelect?.(t.id);
                      }}
                      aria-label={selectedIds?.has(t.id) ? "Seçimi kaldır" : "Seç"}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        flexShrink: 0,
                        border: `1.5px solid ${selectedIds?.has(t.id) ? c.primary : c.border}`,
                        background: selectedIds?.has(t.id) ? c.primary : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                        cursor: "pointer",
                      }}
                    >
                      {selectedIds?.has(t.id) && <IconCheck size={11} color="#fff" />}
                    </button>
                  )}
                  <button
                    onClick={(e) => handleCheckboxClick(e, t.id, t.status, t.title)}
                    aria-label={t.status === "completed" ? "Tamamlandıyı geri al" : "Tamamlandı olarak işaretle"}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      flexShrink: 0,
                      border: t.status === "completed" ? "none" : `1.5px solid ${c.border}`,
                      background: t.status === "completed" ? c.accent : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
                    {t.status === "completed" && <IconCheck size={10} color="#fff" />}
                  </button>
                  {(() => {
                    const avatar = getTaskAvatar?.(t);
                    if (!avatar) return null;
                    // Kapak değeri her zaman bir URL değil: hazır kapaklar
                    // "preset:<anahtar>" olarak saklanıyor (bkz. lib/covers).
                    // <img src="preset:orman"> tarayıcıda kırık resim simgesi
                    // basıyordu. coverBackground üç durumu da (fotoğraf, hazır
                    // kapak, kapak yok) tek bir CSS arka planına çeviriyor.
                    return (
                      <span
                        title={avatar.label}
                        aria-label={avatar.label}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          overflow: "hidden",
                          flexShrink: 0,
                          background: avatar.url ? coverBackground(avatar.url) : c.background,
                          border: `1px solid ${c.border}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 500,
                          color: c.textSecondary,
                        }}
                      >
                        {!avatar.url && avatar.label.charAt(0).toLocaleUpperCase("tr")}
                      </span>
                    );
                  })()}
                  {/* Ad değiştirilirken yanındaki düğmeler gizlenir: giriş alanı
                      kartın tüm genişliğini alsın ve uzun başlık satır satır
                      okunabilsin. Düğmeler o an zaten kullanılamıyor — alana
                      tıklamaktan çıkmak (blur) değişikliği kaydediyor. */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {renderTitle(
                      t,
                      16,
                      t.status === "completed"
                        ? c.textSecondary
                        : isOverdueWithPendingSubtasks
                        ? c.danger
                        : c.textPrimary
                    )}
                      {/* Ad düzenlenirken de görünür kalırlar: satırın görünümü
                          değişmezse kullanıcı "olduğu yerde düzenliyorum" hissini
                          kaybetmiyor. Kutu artık satırın tamamını istemiyor
                          (bkz. .autogrow-inline), dolayısıyla yer açmaya gerek yok. */}
                      <>
                        {/* Ek rozetleri: tek ek doğrudan açılır, birden fazlaysa
                            görev modalı (Bağlantılar + Dosyalar bölümleri). */}
                        {/* Ek rozetleri başlığın YANINDA kalır: görevi
                            tanımlayan bilgi, ona uygulanan bir eylem değil. */}
                        <TaskAttachmentBadges
                          taskId={t.id}
                          links={t.attachments}
                          files={t.files}
                          onOpenDetail={() => onEditTask(t)}
                          size={13}
                        />
                        {/* Eylem düğmeleri her kartta AYNI hizada dursun diye
                            sağa itiliyor (marginLeft: auto). Başlığın hemen
                            ardına bırakıldıklarında yerleri başlığın uzunluğuna
                            göre kayıyor, uzun başlıklarda da sağdaki alt görev
                            okuna dayanıyorlardı. */}
                        <span
                          style={{
                            marginLeft: "auto",
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            flexShrink: 0,
                          }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditTask(t);
                            }}
                            aria-label="Görevi düzenle"
                            style={{ background: "transparent", border: "none", padding: 2, display: "flex", flexShrink: 0 }}
                          >
                            <IconEdit size={13} color={c.textSecondary} />
                          </button>
                          {onToggleActive && (canToggleActive?.(t) ?? true) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleActive(t.id);
                              }}
                              aria-label={activeTaskId === t.id ? "Üzerinde çalışmayı bırak" : "Üzerinde çalışıyorum"}
                              title={activeTaskId === t.id ? "Üzerinde çalışmayı bırak" : "Üzerinde çalışıyorum"}
                              className={activeTaskId === t.id ? "active-task-pulse" : undefined}
                              style={{
                                background: activeTaskId === t.id ? `${c.accent}22` : "transparent",
                                border: "none",
                                borderRadius: "50%",
                                padding: 3,
                                display: "flex",
                                flexShrink: 0,
                              }}
                            >
                              <IconActivity size={13} color={activeTaskId === t.id ? c.accentDark : c.textSecondary} filled={activeTaskId === t.id} />
                            </button>
                          )}
                          <AskLioButton subject={{ kind: "gorev", title: t.title, id: t.id }} size={20} />
                        </span>
                      </>
                  </div>
                  {/* SABİT GENİŞLİK — hizalamanın anahtarı.
                      İçindekiler karta göre değişiyor: ok yalnızca alt görev
                      açıkken, "1/10" rozeti yalnızca alt görev VARSA çiziliyor
                      ve rozetin genişliği sayıya göre oynuyor. Sütun içeriğe
                      göre daralıp genişleyince, solundaki eylem ikonları da
                      kartlar arasında kayıyordu. Genişliği sabitleyince her
                      kart "alt görevi varmış gibi" aynı yeri ayırıyor. */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 3,
                      flexShrink: 0,
                      width: subtasksEnabled ? SUBTASK_COL_WIDTH : undefined,
                    }}
                  >
                    {subtasksEnabled && (
                      <span
                        style={{
                          display: "inline-flex",
                          transform: isOpen ? "rotate(90deg)" : "none",
                          transition: "transform 0.1s ease",
                        }}
                      >
                        <IconChevronRight size={13} color={c.textSecondary} />
                      </span>
                    )}
                    {subtasksEnabled && subtaskStats(t.id).total > 0 && (
                      <span
                        style={{
                          fontSize: 12,
                          lineHeight: 1,
                          color: c.textSecondary,
                          background: c.background,
                          border: `1px solid ${c.border}`,
                          borderRadius: 20,
                          minWidth: 14,
                          height: 14,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "0 3px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {subtaskStats(t.id).remaining}/{subtaskStats(t.id).total}
                      </span>
                    )}
                  </div>
                </div>
                {getTaskMeta?.(t) && (
                  <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 3, overflowWrap: "break-word", wordBreak: "break-word" }}>
                    {getTaskMeta(t)}
                  </div>
                )}
                {/* Kartta yalnızca TEK SATIR: uzun bir not kartı şişirip panodaki
                    diğer görevleri ekrandan düşürüyordu. Tamamı düzenleme
                    modalinde okunur — açıklamaya çift tıklamak oraya götürür.
                    Tek tıklama burada durdurulur, yoksa çift tıklamanın ilk
                    tıklaması alt görev listesini açıp kapatırdı. */}
                {t.description && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onEditTask(t);
                    }}
                    title={t.description}
                    style={{
                      fontSize: 13,
                      color: c.textSecondary,
                      marginTop: 4,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      cursor: "pointer",
                    }}
                  >
                    {t.description}
                  </div>
                )}
                {(assigneeLabels(t).length > 0 || formatTaskDuration(t.estimatedDurationValue, t.estimatedDurationUnit)) && (
                  <div style={{ marginTop: 5, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {assigneeLabels(t).map((name) => (
                      <span
                        key={name}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                          color: c.accentDark,
                          background: `${c.accent}1a`,
                          border: `1px solid ${c.accent}55`,
                          borderRadius: 20,
                          padding: "1px 8px",
                        }}
                      >
                        {name}
                      </span>
                    ))}
                    {formatTaskDuration(t.estimatedDurationValue, t.estimatedDurationUnit) && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                          color: c.textSecondary,
                          background: c.background,
                          border: `1px solid ${c.border}`,
                          borderRadius: 20,
                          padding: "1px 8px",
                        }}
                      >
                        {formatTaskDuration(t.estimatedDurationValue, t.estimatedDurationUnit)}
                      </span>
                    )}
                  </div>
                )}
                {renderPriority(t)}
                {(() => {
                  const { total, remaining } = subtaskStats(t.id);
                  const progressPct = total > 0 ? Math.round(((total - remaining) / total) * 100) : 0;
                  const start = formatDay(t.startDate ?? t.createdAt);
                  // Yapılacaklar panosundaki kişisel görevlerin tarihi olmayabilir;
                  // "Invalid Date" basmak yerine o ucu boş bırakıyoruz.
                  // Bitiş saati opsiyonel (bkz. migration 057); varsa tarihin
                  // yanına eklenir, yoksa görünüm eskisiyle birebir aynı kalır.
                  const due = formatDay(t.deadline) + (t.deadlineTime ? ` ${t.deadlineTime}` : "");
                  // İlerleme çubuğu alt görev tamamlanmasını gösterir. Alt görevi
                  // olmayan bir görevde hep boş durup "%0 bitti" gibi yanlış bir
                  // sinyal veriyordu; artık yalnızca gösterecek bir şey varken çıkıyor.
                  if (!start && !due) return null;
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                      <span style={{ fontSize: 12, color: c.textSecondary, flexShrink: 0 }}>{start}</span>
                      {total > 0 ? (
                        <div style={{ flex: 1, height: 5, borderRadius: 3, background: c.border, overflow: "hidden", minWidth: 24 }}>
                          <div
                            style={{
                              width: `${progressPct}%`,
                              height: "100%",
                              background: c.accent,
                              borderRadius: 3,
                              transition: "width 0.15s ease",
                            }}
                          />
                        </div>
                      ) : (
                        <span style={{ flex: 1, minWidth: 24 }} />
                      )}
                      <span style={{ fontSize: 12, color: c.textSecondary, flexShrink: 0 }}>{due}</span>
                    </div>
                  );
                })()}
              </div>

              {isOpen && (
                <div
                  style={{
                    marginLeft: 14,
                    marginTop: 6,
                    paddingLeft: 12,
                    borderLeft: `2px solid ${c.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div
                    ref={subtaskListRef(t.id)}
                    // Hedef üst görevin kimliği: alt görev başka bir karta
                    // bırakıldığında yeni üst görev buradan okunuyor.
                    data-parent-id={t.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      // Sürükleme sırasında boş listenin de bırakma alanı olması
                      // gerekir; yüksekliği sıfır olan bir kutuya hiçbir şey
                      // bırakılamıyordu.
                      minHeight: draggingSubtask ? 34 : undefined,
                      border: draggingSubtask ? `1px dashed ${c.border}` : undefined,
                      borderRadius: draggingSubtask ? 7 : undefined,
                    }}
                  >
                    {subtasks.map((sub) => (
                      <div
                        key={sub.id}
                        data-id={sub.id}
                        className={highlightTaskId === sub.id ? "task-highlight-flash" : undefined}
                        // Tek tıklama burada durdurulur: üst karta ulaşırsa alt
                        // görev listesini açıp kapatıyor ve çift tıklamanın ilk
                        // tıklaması listeyi kapatıp modali görünmez kılıyordu
                        // (aynı önlem üst görevin açıklamasında da var).
                        onClick={(e) => e.stopPropagation()}
                        // Çift tıklama alt görevin düzenleme modalini açar — üst
                        // görev kartındaki davranışın karşılığı. Başlık ve açıklama
                        // kendi çift tıklamalarını (ada düzenleme / modal) zaten
                        // durduruyor, bu yüzden burası yalnızca satırın geri
                        // kalanında devreye giriyor.
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          onEditTask(sub);
                        }}
                        title="Çift tıkla: alt görevi düzenle"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          background: c.surface,
                          border: `1px solid ${c.border}`,
                          borderRadius: 7,
                          padding: "6px 9px",
                        }}
                      >
                        {selectionMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleSelect?.(sub.id);
                            }}
                            aria-label={selectedIds?.has(sub.id) ? "Seçimi kaldır" : "Seç"}
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: 4,
                              flexShrink: 0,
                              border: `1.5px solid ${selectedIds?.has(sub.id) ? c.primary : c.border}`,
                              background: selectedIds?.has(sub.id) ? c.primary : "transparent",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: 0,
                              cursor: "pointer",
                            }}
                          >
                            {selectedIds?.has(sub.id) && <IconCheck size={9} color="#fff" />}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleComplete(sub.id);
                          }}
                          aria-label={sub.status === "completed" ? "Alt görev tamamlandıyı geri al" : "Alt görevi tamamlandı olarak işaretle"}
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            flexShrink: 0,
                            border: sub.status === "completed" ? "none" : `1.5px solid ${c.border}`,
                            background: sub.status === "completed" ? c.accent : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                            cursor: "pointer",
                          }}
                        >
                          {sub.status === "completed" && <IconCheck size={8} color="#fff" />}
                        </button>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                            {renderTitle(sub, 15, sub.status === "completed" ? c.textSecondary : c.textPrimary)}
                            {/* Alt görevin açıklaması artık satırda görünür; rengi
                                bilinçli olarak farklı, yoksa altındaki atanan/süre
                                bilgisiyle aynı griye karışıyordu. Üst görev kartında
                                olduğu gibi tek satır, tamamı için çift tıklama. */}
                            {sub.description && (
                              <span
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  onEditTask(sub);
                                }}
                                title={sub.description}
                                style={{
                                  fontSize: 12,
                                  color: SUBTASK_DESCRIPTION_COLOR,
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  cursor: "pointer",
                                }}
                              >
                                {sub.description}
                              </span>
                            )}
                            {getTaskMeta?.(sub) && (
                              <span style={{ fontSize: 11, color: c.textSecondary }}>{getTaskMeta(sub)}</span>
                            )}
                            {(assigneeLabels(sub).length > 0 || formatTaskDuration(sub.estimatedDurationValue, sub.estimatedDurationUnit)) && (
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {assigneeLabels(sub).length > 0 && (
                                  <span style={{ fontSize: 11, color: c.accentDark }}>
                                    {assigneeLabels(sub).join(", ")}
                                  </span>
                                )}
                                {formatTaskDuration(sub.estimatedDurationValue, sub.estimatedDurationUnit) && (
                                  <span style={{ fontSize: 11, color: c.textSecondary }}>
                                    {formatTaskDuration(sub.estimatedDurationValue, sub.estimatedDurationUnit)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          {/* Ad düzenlenirken de görünür kalırlar (bkz. üst görev satırı). */}
                            <>
                              <TaskAttachmentBadges
                                taskId={sub.id}
                                links={sub.attachments}
                                files={sub.files}
                                onOpenDetail={() => onEditTask(sub)}
                                size={11}
                              />
                              {/* Üst görev satırındaki kuralın aynısı: eylemler
                                  sağa dayalı, böylece alt görevlerin düğmeleri
                                  de üsttekilerle aynı dikey çizgide durur. */}
                              <span
                                style={{
                                  marginLeft: "auto",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 5,
                                  flexShrink: 0,
                                }}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onEditTask(sub);
                                  }}
                                  aria-label="Alt görevi düzenle"
                                  style={{ background: "transparent", border: "none", padding: 2, display: "flex", flexShrink: 0 }}
                                >
                                  <IconEdit size={11} color={c.textSecondary} />
                                </button>
                                {onToggleActive && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onToggleActive(sub.id);
                                    }}
                                    aria-label={activeTaskId === sub.id ? "Üzerinde çalışmayı bırak" : "Üzerinde çalışıyorum"}
                                    title={activeTaskId === sub.id ? "Üzerinde çalışmayı bırak" : "Üzerinde çalışıyorum"}
                                    className={activeTaskId === sub.id ? "active-task-pulse" : undefined}
                                    style={{
                                      background: activeTaskId === sub.id ? `${c.accent}22` : "transparent",
                                      border: "none",
                                      borderRadius: "50%",
                                      padding: 2,
                                      display: "flex",
                                      flexShrink: 0,
                                    }}
                                  >
                                    <IconActivity size={11} color={activeTaskId === sub.id ? c.accentDark : c.textSecondary} filled={activeTaskId === sub.id} />
                                  </button>
                                )}
                                <AskLioButton subject={{ kind: "altgorev", title: sub.title, id: sub.id }} size={18} />
                              </span>
                            </>
                          {/* Üst görevdeki alt görev sütunu kadar boşluk: alt
                              görevin kendi oku/rozeti yok ama ikonları
                              üsttekilerle aynı dikey çizgide durmalı. */}
                          {subtasksEnabled && (
                            <span aria-hidden style={{ width: SUBTASK_COL_WIDTH, flexShrink: 0 }} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {subtaskParent === t.id ? (
                    <form ref={addSubtaskFormRef} onSubmit={(e) => handleAddSubtask(e, t.id)}>
                      <AutoGrowTextarea
                        autoFocus
                        value={subtaskTitle}
                        onChange={setSubtaskTitle}
                        onSubmit={() => commitAddSubtask(t.id)}
                        onCancel={() => {
                          setSubtaskParent(null);
                          setSubtaskTitle("");
                        }}
                        onBlur={() => commitAddSubtask(t.id)}
                        placeholder="Alt görev başlığı, Enter'a bas"
                        maxLength={200}
                        minHeight={32}
                      />
                    </form>
                  ) : (
                    <button
                      onClick={() => setSubtaskParent(t.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "5px 8px",
                        borderRadius: 7,
                        border: "none",
                        background: "transparent",
                        color: c.textSecondary,
                        fontSize: 15,
                        alignSelf: "flex-start",
                      }}
                    >
                      <IconPlus size={12} color={c.textSecondary} />
                      Alt görev ekle
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {ghostGroups.map(({ parent, subtasks }) => (
        <div key={parent.id} style={{ marginBottom: 8 }}>
          <div
            style={{
              opacity: 0.5,
              background: c.surface,
              border: `1px dashed ${c.border}`,
              borderLeft: `3px solid ${columnAccent[parent.status]}`,
              borderRadius: 8,
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 15, color: c.textSecondary, fontStyle: "italic", flex: 1, minWidth: 0, overflowWrap: "break-word", wordBreak: "break-word" }}>{parent.title}</span>
            <span style={{ fontSize: 12, color: c.textSecondary, whiteSpace: "nowrap" }}>{columnLabel[parent.status]}'de</span>
          </div>

          <div
            style={{
              marginLeft: 14,
              marginTop: 6,
              paddingLeft: 12,
              borderLeft: `2px solid ${c.border}`,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {subtasks.map((sub) => (
              <div
                key={sub.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: 7,
                  padding: "6px 9px",
                }}
              >
                <button
                  onClick={() => onToggleComplete(sub.id)}
                  aria-label="Alt görev tamamlandıyı geri al"
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: c.accent,
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  <IconCheck size={8} color="#fff" />
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 15,
                      color: c.textSecondary,
                      textDecoration: "line-through",
                      overflowWrap: "break-word",
                      wordBreak: "break-word",
                    }}
                  >
                    {sub.title}
                  </span>
                  <button
                    onClick={() => onEditTask(sub)}
                    aria-label="Alt görevi düzenle"
                    style={{ background: "transparent", border: "none", padding: 2, display: "flex", flexShrink: 0 }}
                  >
                    <IconEdit size={11} color={c.textSecondary} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {onCreate &&
        (adding ? (
          <form ref={addTaskFormRef} onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <AutoGrowTextarea
              autoFocus
              value={title}
              onChange={setTitle}
              onSubmit={commitAddTask}
              onCancel={() => {
                setAdding(false);
                setTitle("");
              }}
              onBlur={commitAddTask}
              placeholder="Görev başlığı yaz, Enter'a bas"
              maxLength={200}
              minHeight={34}
            />
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 10px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: c.textSecondary,
              fontSize: 15,
            }}
          >
            <IconPlus size={14} color={c.textSecondary} />
            Görev ekle
          </button>
        ))}

      {confirmTarget && (
        <Modal title="Görevi tamamla" onClose={() => setConfirmTarget(null)}>
          <p style={{ fontSize: 16, color: c.textSecondary, margin: "0 0 18px", lineHeight: 1.5 }}>
            <strong style={{ color: c.textPrimary, fontWeight: 500 }}>{confirmTarget.title}</strong> görevini tamamlandı
            olarak işaretleyip "Tamamlandı" bölümüne taşımak istiyor musun?
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setConfirmTarget(null)}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary, fontSize: 16 }}
            >
              Vazgeç
            </button>
            <button
              onClick={confirmComplete}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 16, fontWeight: 500 }}
            >
              Tamamlandı olarak işaretle
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
});

export default TaskColumn;
