import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ModulHakkiDurumu } from "@projelio/shared";
import { modulSayilirMi } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";

/**
 * Paket başına modül hakkı (bkz. shared modulHakki.ts) — "Modül ekle"
 * ekranlarının ortak satırı: paketin, kaç modül açık, seçimle kaç olacak.
 *
 * Sunucu aynı kuralla reddediyor; burası kullanıcının düğmeye basmadan önce
 * görmesi için. Hak okunamazsa (ör. eski sunucu) satır hiç çizilmez ve
 * seçim serbest kalır — karar zaten sunucuda.
 */

const PAKET_ADI: Record<string, string> = {
  free: "Ücretsiz", // dil:anahtar
  starter: "Starter",
  pro: "Pro",
  business: "Business",
};

export function useModulHakki(organizationId: string | undefined): ModulHakkiDurumu | null {
  const [durum, setDurum] = useState<ModulHakkiDurumu | null>(null);
  useEffect(() => {
    if (!organizationId) return;
    let iptal = false;
    api
      .get<ModulHakkiDurumu>(`/organizations/${organizationId}/modul-hakki`)
      .then((d) => !iptal && setDurum(d))
      .catch(() => !iptal && setDurum(null));
    return () => {
      iptal = true;
    };
  }, [organizationId]);
  return durum;
}

/** Seçim hakkı aşıyor mu: seçilenlerden hakka sayılanlar kalan haktan fazla. */
export function hakkiAsiyor(durum: ModulHakkiDurumu | null, secilen: string[]): boolean {
  if (!durum || durum.kalan === null) return false;
  return secilen.filter(modulSayilirMi).length > durum.kalan;
}

export default function ModulHakkiBilgisi({ durum, secilen }: { durum: ModulHakkiDurumu | null; secilen: string[] }) {
  const c = useThemeColors();
  const t = useT();
  if (!durum) return null;
  const paket = t(PAKET_ADI[durum.planKey] ?? durum.planKey);
  const asiyor = hakkiAsiyor(durum, secilen);
  const sonra = durum.kullanilan + secilen.filter(modulSayilirMi).length;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        borderRadius: 8,
        border: `1px solid ${asiyor ? c.danger : c.border}`,
        fontSize: 13,
        color: asiyor ? c.danger : c.textSecondary,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        {durum.hak === null
          ? t("{paket} paketinde modül sınırı yok.", { paket })
          : durum.kalan === 0 && secilen.length === 0
          ? t("{paket} paketinin modül hakkı doldu ({kullanilan}/{hak}). Yeni modül için birini kapat ya da paketini yükselt.", {
              paket,
              kullanilan: durum.kullanilan,
              hak: durum.hak,
            })
          : t("{paket} paketi: {sonra}/{hak} modül. Proje, görev ve dosya modülleri sayılmaz.", {
              paket,
              sonra,
              hak: durum.hak,
            })}
      </span>
      {durum.hak !== null && (
        <Link to="/settings/billing" style={{ fontSize: 13, color: c.accent, whiteSpace: "nowrap" }}>
          {t("Paketi yükselt")}
        </Link>
      )}
    </div>
  );
}
