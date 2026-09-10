import { useEffect, useMemo, useState } from "react";
import type { SchedulableTask } from "@projelio/shared";
import { gorevleriAra } from "@projelio/shared";
import { api, ignoreAbort } from "../api/client";

/** Öneri listesinde gösterilecek en fazla satır. */
const TAVAN = 8;
/** Bir kerede çekilen aday görev sayısı. */
const ADAY_TAVANI = 300;

/**
 * Yaptım'ın giriş kutusundaki görev araması.
 *
 * LİSTE BİR KEZ ÇEKİLİYOR, EŞLEŞTİRME TARAYICIDA.
 *
 * Önce her tuş vuruşunda sunucuya gidiliyordu ve `ilike '%metin%'` ile
 * aranıyordu. İki sorunu birden vardı:
 *
 *   1. YAVAŞ — gecikme (debounce) koyunca sonuç geç geliyor, koymayınca hızlı
 *      yazan biri on beş istek atıyordu.
 *   2. BULAMIYORDU — `ilike` tek ve bitişik bir alt dize arıyor. Kullanıcı
 *      görevin adını harfi harfine hatırlamadıkça ("sunum hazırla" ile
 *      "Müşteri sunumu hazırlandı") hiçbir şey çıkmıyordu. Bu esnekliği
 *      PostgREST üzerinden SQL'de ifade etmek de mümkün değil.
 *
 * Kullanıcının açık görevleri yüzler mertebesinde; hepsini tek istekle alıp
 * eşleştirmeyi burada yapmak ikisini de çözüyor: sonuç anında çıkıyor ve
 * kelime/ek/yazım hatası toleransı serbestçe yazılabiliyor
 * (bkz. shared/taskSearch.ts).
 *
 * BEDELİ: sayfa açıldıktan SONRA oluşturulan görev listeye girmez. Yaptım
 * "az önce yaptığım işi kaydediyorum" ekranı; o iş neredeyse her zaman sayfa
 * açılmadan önce var olan bir görev. Yenilemek için sayfayı yenilemek yeterli.
 */
export function useTaskSearch(query: string, enabled = true) {
  const [adaylar, setAdaylar] = useState<SchedulableTask[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    api
      .get<SchedulableTask[]>(`/planning/schedulable-tasks?limit=${ADAY_TAVANI}`, ac.signal)
      .then(setAdaylar)
      // Arama çalışmazsa kutu serbest metin kutusu olarak çalışmaya devam
      // etmeli: görev bulunamaması, kaydın hiç girilememesi anlamına gelmemeli.
      .catch(ignoreAbort)
      .finally(() => {
        if (!ac.signal.aborted) setYukleniyor(false);
      });
    return () => ac.abort();
  }, []);

  const aranan = query.trim();

  const tasks = useMemo(() => {
    // Tek harfte liste neredeyse her şeyi getiriyor; kullanıcı daha yazmayı
    // bitirmeden ekranı doldurmak yardımcı olmuyor.
    if (!enabled || aranan.length < 2) return [];
    return gorevleriAra(
      aranan,
      adaylar,
      (gorev) => ({
        baslik: gorev.title,
        // Bağlam da aranabilir: kullanıcı çoğu zaman görevi projesiyle anıyor
        // ("milano lojistik").
        baglam: [gorev.projectTitle, gorev.departmentName, gorev.operationTitle, gorev.jobTitle],
      }),
      TAVAN
    );
  }, [aranan, adaylar, enabled]);

  // "Aranıyor" göstergesi yalnızca ilk yükleme için: eşleştirme anlık.
  return { tasks, loading: yukleniyor };
}
