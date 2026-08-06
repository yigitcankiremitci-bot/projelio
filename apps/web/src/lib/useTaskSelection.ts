import { useCallback, useState } from "react";

export interface TaskSelection {
  selectionMode: boolean;
  selectedIds: Set<string>;
  // Seçim modunu açar/kapatır; kapatırken seçimi de temizler.
  toggleSelectionMode: () => void;
  toggleSelect: (id: string) => void;
  // Seçimi temizler ve seçim modundan çıkar (bkz. çoğaltma/taşıma sonrası).
  clear: () => void;
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
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);

  return { selectionMode, selectedIds, toggleSelectionMode, toggleSelect, clear };
}
