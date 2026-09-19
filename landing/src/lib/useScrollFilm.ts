"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Dikey kaydırmayı yatay harekete çeviren "film" bölümlerinin ortak mantığı
 * (FeatureFilm, JourneyFilm).
 *
 * Bölüm ekrana yapışır; yüksekliği şeridin taşan genişliği kadar uzatılır,
 * böylece son öğe göründüğü anda yapışma bırakılır. Yapışmalı mod yalnızca
 * geniş ekranda ve "hareketi azalt" kapalıyken açılır; aksi hâlde bölüm
 * `data-pinned="false"` kalır ve CSS kendi yedek düzenini (yatay liste ya da
 * alt alta sahneler) uygular — içerik hiçbir durumda gizli kalmaz.
 *
 * `onProgress` her karede 0–1 arası ilerlemeyle çağrılır; ref üzerinden
 * tutulduğu için dinleyiciler her render'da yeniden kurulmaz.
 */
export function useScrollFilm(
  sectionRef: RefObject<HTMLElement | null>,
  trackRef: RefObject<HTMLElement | null>,
  onProgress: (progress: number) => void,
  minWidth = 900,
) {
  const [pinned, setPinned] = useState(false);
  const callback = useRef(onProgress);
  callback.current = onProgress;

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;

    const wide = matchMedia(`(min-width: ${minWidth}px)`);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let distance = 0;
    let frame = 0;

    const update = () => {
      frame = 0;
      if (!wide.matches || reduce.matches || distance === 0) return;
      const top = section.getBoundingClientRect().top;
      const progress = Math.min(Math.max(-top / distance, 0), 1);
      track.style.transform = `translate3d(${-progress * distance}px, 0, 0)`;
      callback.current(progress);
    };

    const measure = () => {
      const on = wide.matches && !reduce.matches;
      // Öznitelik React'i beklemeden DOM'a yazılıyor: şeridin genişliği
      // yapışmalı mod stilleriyle (max-content, iç boşluk) ölçülmeli. State'e
      // bırakılsaydı ilk ölçüm eski düzenden yapılır, son öğe yarım kalırdı.
      section.dataset.pinned = String(on);
      setPinned(on);
      if (!on) {
        section.style.height = "";
        track.style.transform = "";
        return;
      }
      distance = Math.max(0, track.offsetWidth - window.innerWidth);
      section.style.height = `${window.innerHeight + distance}px`;
      update();
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    wide.addEventListener("change", measure);
    reduce.addEventListener("change", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      wide.removeEventListener("change", measure);
      reduce.removeEventListener("change", measure);
    };
  }, [sectionRef, trackRef, minWidth]);

  return pinned;
}
