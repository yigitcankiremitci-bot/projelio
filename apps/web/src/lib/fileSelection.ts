import { useCallback, useRef, useState } from "react";

/**
 * Dosya listelerinde ÇOKLU SEÇİM.
 *
 * NEDEN ORTAK BİR KANCA: seçim davranışı iki ayrı ekranda (FilesPanel ve
 * AllFilesPanel) yaşıyor ve kullanıcı için ikisi de "dosyalar sayfası".
 * Kuralları her birinde ayrı yazmak, aradaki farkın sessizce büyümesi demekti —
 * Cmd+tık birinde çalışıp diğerinde çalışmayan bir uygulama, öğrenilmesi
 * gereken iki uygulamadır.
 *
 * Kurallar masaüstü dosya yöneticilerinin ortak dili:
 *   * düz tık        → yalnızca o öğe
 *   * Cmd/Ctrl+tık   → ekle/çıkar
 *   * Shift+tık      → çıpadan buraya kadar olan aralık
 *
 * Anahtar biçimi `"file:<id>"` / `"folder:<id>"`: tek bir listede iki farklı
 * varlık türü var ve kimlikleri çakışabilir.
 */

export type SelectionKey = string;

export function fileKey(id: string): SelectionKey {
  return `file:${id}`;
}

export function folderKey(id: string): SelectionKey {
  return `folder:${id}`;
}

/** `"file:abc"` → `{ kind: "file", id: "abc" }`. */
export function parseKey(key: SelectionKey): { kind: "file" | "folder"; id: string } {
  const ayrac = key.indexOf(":");
  return { kind: key.slice(0, ayrac) === "folder" ? "folder" : "file", id: key.slice(ayrac + 1) };
}

/** Tıklamada basılı olan değiştirici tuşlar. */
export interface ClickModifiers {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

/**
 * Bir tıklamadan sonraki seçim ve yeni çıpa.
 *
 * Kancadan AYRI ve saf: kurallar davranışın tamamı, testi de burada
 * (bkz. fileSelection.test.ts).
 *
 * `order` o an EKRANDA GÖRÜNEN sıradaki bütün anahtarlar — Shift+tık aralığı
 * buna göre hesaplanıyor, yoksa "aradakiler" ekrandaki sıradan başka bir şey
 * olurdu (liste ile simge görünümünde sıralama aynı ama süzgeç değişebiliyor).
 */
export function nextSelection(
  prev: SelectionKey[],
  anchor: SelectionKey | null,
  e: ClickModifiers,
  key: SelectionKey,
  order: SelectionKey[]
): { keys: SelectionKey[]; anchor: SelectionKey | null } {
  if (e.metaKey || e.ctrlKey) {
    const keys = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
    // Çıpa çıkarılan öğede kalmamalı: sonraki Shift+tık artık seçili olmayan
    // bir noktadan aralık kurardı.
    return { keys, anchor: keys.includes(key) ? key : anchor };
  }

  if (e.shiftKey && anchor) {
    const bas = order.indexOf(anchor);
    const son = order.indexOf(key);
    if (bas >= 0 && son >= 0) {
      const [a, b] = bas <= son ? [bas, son] : [son, bas];
      // Çıpa DEĞİŞMEZ: kullanıcı aralığı büyütüp küçültürken sabit bir uçtan
      // ölçüyor; çıpayı kaydırmak aralığı her tıkta yeniden başlatırdı.
      return { keys: order.slice(a, b + 1), anchor };
    }
  }

  return { keys: [key], anchor: key };
}

export interface FileSelection {
  keys: SelectionKey[];
  count: number;
  has: (key: SelectionKey) => boolean;
  click: (e: ClickModifiers, key: SelectionKey, order: SelectionKey[]) => void;
  /**
   * Sağ tık. Öğe zaten seçimin içindeyse seçim KORUNUR ve olduğu gibi döner:
   * kullanıcı üç dosya seçip birine sağ tıkladığında üçü için menü bekliyor,
   * seçimin bire düşmesini değil.
   */
  contextSelect: (key: SelectionKey) => SelectionKey[];
  clear: () => void;
}

export function useFileSelection(): FileSelection {
  const [keys, setKeys] = useState<SelectionKey[]>([]);
  // Shift+tık çıpası: state değil ref — değişmesi yeniden çizim gerektirmiyor.
  const anchor = useRef<SelectionKey | null>(null);

  const has = useCallback((key: SelectionKey) => keys.includes(key), [keys]);

  const click = useCallback<FileSelection["click"]>((e, key, order) => {
    setKeys((prev) => {
      const sonuc = nextSelection(prev, anchor.current, e, key, order);
      anchor.current = sonuc.anchor;
      return sonuc.keys;
    });
  }, []);

  const contextSelect = useCallback<FileSelection["contextSelect"]>(
    (key) => {
      if (keys.includes(key)) return keys;
      anchor.current = key;
      setKeys([key]);
      return [key];
    },
    [keys]
  );

  const clear = useCallback(() => {
    anchor.current = null;
    setKeys([]);
  }, []);

  return { keys, count: keys.length, has, click, contextSelect, clear };
}
