"use client";

import { useEffect, useState } from "react";
import type { Dict, Locale } from "@/i18n";
import NewsletterForm, { BULTEN_ABONE_ANAHTARI } from "@/components/NewsletterForm";

/**
 * Sağ altta, sayfaya girdikten 5 saniye sonra açılan bülten kutusu.
 *
 * Her sayfada her girişte çıkması ziyaretçiyi kovardı; o yüzden:
 *   · abone olmuş biri (alt bilgideki formdan da olsa) bir daha görmez,
 *   · kapatan biri KAPATMA_GUN boyunca görmez.
 * İkisi de tarayıcıda (localStorage) tutuluyor; depolama kapalıysa (gizli
 * pencere vb.) kutu yine çıkar, kapatılınca o sayfa için kapanır.
 *
 * WhatsApp düğmesi (.wa-lio) de sağ altta; kutu onun ÜSTÜNDE durur, düğmeyi örtmez.
 */
const GECIKME_MS = 5000;
const KAPATMA_GUN = 7;
const KAPATILDI_ANAHTARI = "projelio-bulten-kapatildi";

function gosterilmeli(): boolean {
  try {
    if (localStorage.getItem(BULTEN_ABONE_ANAHTARI)) return false;
    const kapatildi = Number(localStorage.getItem(KAPATILDI_ANAHTARI) ?? 0);
    return !kapatildi || Date.now() - kapatildi > KAPATMA_GUN * 86_400_000;
  } catch {
    return true;
  }
}

export default function NewsletterPopup({ dict, locale }: { dict: Dict; locale: Locale }) {
  const n = dict.newsletter;
  const [acik, setAcik] = useState(false);

  useEffect(() => {
    if (!gosterilmeli()) return;
    const zamanlayici = setTimeout(() => {
      // 5 saniye içinde alt bilgideki formdan abone olduysa açılmasın.
      if (gosterilmeli()) setAcik(true);
    }, GECIKME_MS);
    return () => clearTimeout(zamanlayici);
  }, []);

  useEffect(() => {
    if (!acik) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && kapat();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [acik]);

  function kapat() {
    setAcik(false);
    try {
      localStorage.setItem(KAPATILDI_ANAHTARI, String(Date.now()));
    } catch {}
  }

  if (!acik) return null;

  return (
    <aside className="newsletter-popup" role="dialog" aria-labelledby="newsletter-popup-title">
      <button type="button" className="newsletter-popup-close" onClick={kapat} aria-label={n.close}>
        ×
      </button>
      <h4 id="newsletter-popup-title">{n.title}</h4>
      <p className="newsletter-popup-lead">{n.lead}</p>
      {/* Teşekkür mesajı bir süre görünsün, sonra kutu kendiliğinden kapansın. */}
      <NewsletterForm dict={dict} locale={locale} variant="popup" onSubscribed={() => setTimeout(() => setAcik(false), 3500)} />
    </aside>
  );
}
