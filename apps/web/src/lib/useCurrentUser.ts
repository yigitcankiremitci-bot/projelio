import { useEffect, useState } from "react";
import type { AccountType, Locale } from "@projelio/shared";
import { api } from "../api/client";

export interface CurrentUser {
  id: string;
  fullName?: string;
  email?: string;
  username?: string;
  role?: string;
  accountType?: AccountType;
  activeTaskId?: string;
  /** Hesaba kayıtlı arayüz dili. Boşsa kullanıcı seçim yapmamıştır. */
  locale?: Locale;
}

// /auth/me her sayfada ayrı ayrı çekiliyordu; taşeron kısıtı neredeyse her
// ekranda sorulduğu için tek seferlik bir modül-içi önbellek tutuyoruz.
// Oturum değişince sayfa zaten baştan yükleniyor (bkz. api/client.ts).
let cached: CurrentUser | null | undefined;
let inflight: Promise<CurrentUser | null> | null = null;

function fetchMe(): Promise<CurrentUser | null> {
  if (cached !== undefined) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api
      .get<CurrentUser | null>("/auth/me")
      .then((me) => {
        cached = me ?? null;
        return cached;
      })
      .catch(() => {
        cached = null;
        return null;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useCurrentUser(): { user: CurrentUser | null; loading: boolean } {
  const [user, setUser] = useState<CurrentUser | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((me) => {
      if (cancelled) return;
      setUser(me);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading };
}

/**
 * Taşeron hesabı mı?
 *
 * Taşeron dış kaynaktır: hiçbir ekranda bütçe, ekip listesi, ürün/hizmet,
 * iş ortağı ya da düzenleme yüzeyi görmez ve yalnızca açıkça atandığı
 * proje/işleri görür. Asıl kısıt sunucudadır
 * (bkz. backend common/access/subcontractor.ts) — bu kanca yalnızca
 * kullanıcıya tıklayınca 403 alacağı sekmeleri göstermemek içindir.
 *
 * Yüklenmeden önce false döner: kısıtlı kullanıcıda sekme bir an görünüp
 * kaybolur, kısıtsız kullanıcıda hiç titremez. Tersi (varsayılan true) her
 * kullanıcıya boş ekran gösterirdi.
 */
export function useIsSubcontractor(): boolean {
  const { user } = useCurrentUser();
  return user?.accountType === "subcontractor";
}
