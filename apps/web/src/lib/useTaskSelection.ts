import { useCallback, useState } from "react";

export interface TaskSelection {
  selectionMode: boolean;
  selectedIds: Set<string>;
  // Seçim modunu açar/kapatır; kapatırken seçimi de temizler.
  toggleSelectionMode: () => void;
  toggleSelect: (id: string) => void;
  // Seçimi temizler ve seçim modundan çıkar (bkz. çoğaltma/taşıma sonrası).
  clear: () => void;
  /** Verilen kimliklerin tamamını seçili yapar (bkz. TaskSelectionBar "Tümü"). */
  selectAll: (ids: string[]) => void;
  /**
   * Seçimi boşaltır ama seçim MODUNDAN ÇIKMAZ.
   *
   * `clear`den farkı bu: kullanıcı yanlış seçim yaptığında modun kapanıp
   * yeniden "Seç"e basmak zorunda kalmasın diye. Tek tek işareti kaldırınca
   * modun kapanması (toggleSelect) bilinçli — orada kullanıcı zaten sıfıra
   * doğru gidiyor; burada ise tek hamlede baştan başlıyor.
   */
  deselectAll: () => void;
}

// Görev sütunlarında (bkz. TaskColumn) çoklu seçim durumunu tutan paylaşılan hook —
// hem tek bir görevi işaretleyip hem de birden fazlasını seçip toplu çoğaltma/taşıma
// yapabilmek için (bkz. TaskSelectionBar, MoveTaskModal).
export function useTaskSelection(): TaskSelection {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Son seçili öğe de kaldırıldıysa seçim modundan otomatik çık — kullanıcı
      // "Vazgeç"e basmadan tek tek işareti kaldırdığında modda takılı kalmasın.
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectionMode(true);
    setSelectedIds(new Set(ids));
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return { selectionMode, selectedIds, toggleSelectionMode, toggleSelect, clear, selectAll, deselectAll };
}
