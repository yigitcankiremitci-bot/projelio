import type { KeyboardEvent } from "react";

/**
 * "Enter = olumlu eylem" kuralının MODAL DIŞI karşılığı.
 *
 * Modallerde bu kural ortak Modal bileşeninde kurulu (bkz. components/Modal.tsx):
 * orada odağın içinde olduğu form ya da `data-primary` butonu bulunup tıklanır.
 * Sayfaya gömülü panellerde (kurulum sihirbazı, departman ekleme paneli) ise
 * ne modal ne de `<form>` var — tek bir alandan sonra "Devam"a basılıyor.
 * Böyle yerlerde alana bu handler takılır.
 *
 * Kullanım:
 *   <input value={ad} onChange={…} onKeyDown={onEnter(kaydet)} />
 *
 * Çok satırlı alanlara TAKILMAZ: orada Enter yeni satırdır (bkz. Modal'daki
 * ⌘/Ctrl+Enter kuralı).
 */
export function onEnter(action: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key !== "Enter") return;
    // Klavye henüz kelimeyi tamamlamamışsa (IME) Enter seçimi onaylar.
    if (e.nativeEvent.isComposing) return;
    if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    action();
  };
}
