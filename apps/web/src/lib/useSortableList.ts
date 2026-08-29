import { useEffect } from "react";
import type { RefObject } from "react";
import Sortable from "sortablejs";
import type { SortableOptions } from "sortablejs";

// Kısa süre basılı tutunca aktifleşen "tut-taşı" sıralaması için ortak ayarlar.
// Sürüklemeyi başlatan basılı tutma süresi (ms). Tek kaynak: bu hook'u kullanmayan
// yerler de (bkz. TaskColumn'daki alt görev listesi) buradan almalı ki tüm
// uygulamada aynı his olsun. Çok kısaltılırsa normal tıklama/kaydırma hareketleri
// yanlışlıkla sürükleme olarak algılanmaya başlar.
export const LONG_PRESS_DELAY = 180;

/**
 * Tüm tut-taşı listelerinin paylaştığı ayarlar. Tek kaynak olmalı: sürüklemenin
 * hissi (basılı tutma, hayalet sınıfları) ve kenarda sayfayı kaydırma davranışı
 * listeden listeye değişmemeli. Bu hook'u kullanmayan yerler de (bkz.
 * TaskColumn'daki alt görev listeleri) buradan almalı.
 */
// Basılı tutulduğunda sürükleme yerine KENDİ işini yapması gereken öğeler.
// Metin alanları listede olmak zorunda: bir görev başlığı yerinde düzenlenirken
// kullanıcı metnin üstünde basılı tutup sürüklediğinde beklediği şey METNİ
// SEÇMEK, kartı taşımak değil. Sortable her ikisini de aynı basılı-tutma
// hareketinden okuduğu için seçim hiç yapılamıyordu.
const INTERACTIVE_SELECTOR = "button, input, textarea, select, [contenteditable='true']";

/**
 * Sürüklemenin başlayıp başlamayacağına karar verir (true = başlamasın).
 * Tek kaynak: bu hook'u kullanmayan yerler de (bkz. TaskColumn'daki alt görev
 * listeleri) SORTABLE_BASE_OPTIONS üzerinden bunu almalı.
 *
 * `preventOnFilter: false` ile birlikte çalışır: o olmadan Sortable filtrelenen
 * öğede de preventDefault çağırıp tarayıcının kendi seçim davranışını iptal
 * ediyor — yani sürükleme durur ama seçim yine olmaz.
 *
 * Neden seçici (string) değil de fonksiyon: kart ızgaralarında kartın TAMAMI bir
 * <a> (ProjectCard, JobCard, DepartmentCard, OperationCard, OrganizationCard,
 * GroupCard, ProductCard, ModuleCard — hepsi bir Link). Düz "a" seçicisi bu
 * kartlarda sürüklemeyi tamamen kapatıyordu: basılan her nokta bir bağlantının
 * içinde kaldığı için Sortable hiçbir zaman başlamıyordu, kartlar "tutulup
 * taşınamaz" görünüyordu.
 *
 * Kart bağlantısı iki işaretten biriyle tanınır: `draggable="false"` (kart
 * bileşenleri bunu zaten koyuyor — tarayıcının kendi sürüklemesini kapatıp işi
 * Sortable'a bırakmak için) ya da `.entity-card` sınıfı. Satır içi normal bir
 * bağlantıda bunların ikisi de bulunmaz, dolayısıyla o hâlâ sürükleme başlatmaz.
 *
 * Sıra önemli: önce gerçek etkileşimli öğeler (düğme/metin alanı) elenir — kartın
 * içindeki durum rozeti ya da kapak yükleme düğmesi basılı tutulunca kart
 * sürüklenmeye başlamasın. Kart istisnası YALNIZCA bağlantılar için.
 *
 * Sürükleme bitince tarayıcının ürettiği "click"i Sortable kendisi yutuyor
 * (Sortable.js #1184, `ignoreNextClick`), yani kart bırakıldığında o kartın
 * sayfasına gidilmiyor — burada ayrıca bir önlem gerekmiyor.
 */
export function sortableFilter(evt: Event): boolean {
  // Olayın en derindeki hedefi kullanılıyor: Sortable fonksiyon biçiminde
  // filtreye sürüklenebilir ATAYI veriyor, oysa karar basılan asıl öğeye bağlı.
  const origin = (evt?.target ?? null) as HTMLElement | null;
  if (!origin || typeof origin.closest !== "function") return false;
  if (origin.closest(".no-drag")) return true;
  if (origin.closest(INTERACTIVE_SELECTOR)) return true;
  if (origin.closest("a[draggable='false'], .entity-card")) return false;
  return Boolean(origin.closest("a"));
}

export const SORTABLE_BASE_OPTIONS: SortableOptions = {
  animation: 180,
  filter: sortableFilter,
  preventOnFilter: false,
  delay: LONG_PRESS_DELAY,
  delayOnTouchOnly: false,
  touchStartThreshold: 5,
  forceFallback: true,
  fallbackTolerance: 3,
  ghostClass: "sortable-ghost",
  chosenClass: "sortable-chosen",
  dragClass: "sortable-drag",
  // Sürüklenen kart ekranın üstüne/altına yaklaşınca sayfa kendiliğinden kayar.
  // Yoksa hedef görünür alanın dışındaysa kullanıcı kartı bir yere bırakıp
  // sayfayı kaydırıp yeniden almak zorunda kalıyordu — uzun listelerde bunu
  // defalarca tekrarlamak gerekiyordu.
  scroll: true,
  // Varsayılan 30px: kenarda o kadar ince bir şeride isabet ettirmek pratikte
  // "kaydırma hiç çalışmıyor" hissi veriyor.
  scrollSensitivity: 70,
  scrollSpeed: 16,
  // Kaydırılabilir bir kutunun içindeysek önce onu, sonra sayfayı kaydır.
  bubbleScroll: true,
  // forceFallback ile birlikte kaydırma, tarayıcının yerleşik sürükleme
  // olaylarına güvenemez; bu seçenek zamanlayıcıya dayalı güvenilir yolu zorlar.
  forceAutoScrollFallback: true,
};

/**
 * Verilen container ref'inin doğrudan çocuklarını, basılı tutup sürükleyerek
 * sıralanabilir yapar (hem mouse hem dokunmatik). `deps` değiştiğinde (örn.
 * liste boştan doluya geçtiğinde) yeniden bağlanır.
 */
export function useSortableList(containerRef: RefObject<HTMLElement>, options: SortableOptions, deps: unknown[] = []) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const instance = Sortable.create(el, {
      ...SORTABLE_BASE_OPTIONS,
      ...options,
    });

    return () => instance.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
