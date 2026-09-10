import { useEffect, useRef, useState } from "react";
import type { SchedulableTask } from "@projelio/shared";
import { api, ignoreAbort } from "../api/client";

/** Kutuya yazıldıktan kaç ms sonra aranacağı. */
const GECIKME_MS = 220;
/** Öneri listesinde gösterilecek en fazla satır. */
const TAVAN = 8;

/**
 * Yazarken kullanıcının görevlerini arar (Yaptım'ın giriş kutusu).
 *
 * NEDEN /planning/schedulable-tasks:
 *   Aradığımız şey tam olarak "bu kullanıcının dokunabildiği, henüz kapanmamış
 *   görevler" ve bu kapsam takvim seçicisi için zaten tanımlanmış — projeler,
 *   programlar ve kendisine atanmış işler, taşeronluk kısıtıyla birlikte
 *   (bkz. PlanningService.loadSchedulableScope). İkinci bir arama ucu açmak,
 *   aynı yetki kuralının ikinci bir kopyası demekti; kopya kural er ya da geç
 *   asıl kuralla ayrışır.
 *
 *   Yan etkisi: TAMAMLANMIŞ görevler listeye GİRMEZ. Zaten kapattığı bir işe
 *   sonradan süre yazmak isteyen kullanıcı onu bulamayacak — kabul edilebilir,
 *   çünkü akışın tamamı "yaptığım işi şimdi kapatıyorum" üzerine kurulu.
 *
 * GECİKME (debounce) ŞART: her tuşta istek atmak, hızlı yazan birinde on
 * beş isteğe çıkıyor ve sonuncudan önce dönen yanıt listeyi yanlış tazeliyordu.
 */
export function useTaskSearch(query: string, enabled = true) {
  const [tasks, setTasks] = useState<SchedulableTask[]>([]);
  const [loading, setLoading] = useState(false);
  // Yalnızca EN SON aramanın yanıtı ekrana yazılsın: gecikmeye rağmen iki istek
  // üst üste binebiliyor ve önce atılan sonra dönebiliyor.
  const sonIstek = useRef(0);

  const aranan = query.trim();

  useEffect(() => {
    // İki karakterden kısa aramada liste neredeyse her şeyi getiriyor; kullanıcı
    // daha yazmayı bitirmeden ekranı doldurmak yardımcı olmuyor.
    if (!enabled || aranan.length < 2) {
      setTasks([]);
      setLoading(false);
      return;
    }

    const sira = ++sonIstek.current;
    const ac = new AbortController();
    setLoading(true);
    const zamanlayici = window.setTimeout(() => {
      api
        .get<SchedulableTask[]>(
          `/planning/schedulable-tasks?limit=${TAVAN}&query=${encodeURIComponent(aranan)}`,
          ac.signal
        )
        .then((sonuc) => {
          if (sira === sonIstek.current) setTasks(sonuc.slice(0, TAVAN));
        })
        .catch(ignoreAbort)
        .finally(() => {
          if (sira === sonIstek.current) setLoading(false);
        });
    }, GECIKME_MS);

    return () => {
      window.clearTimeout(zamanlayici);
      ac.abort();
    };
  }, [aranan, enabled]);

  return { tasks, loading };
}
