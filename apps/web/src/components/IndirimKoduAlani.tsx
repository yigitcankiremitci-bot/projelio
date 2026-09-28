import { useState } from "react";
import type { IndirimOzeti } from "../api/billing";
import { ApiError } from "../api/client";
import { useT } from "../lib/i18n";
import { bicimDili } from "../lib/i18n/depo";
import { useThemeColors } from "../theme/useThemeColors";

/**
 * "İndirim kodu" alanı: kart formunda (abonelik) ve Lio Bakiyesi satın almada.
 *
 * Buradaki tutar yalnızca ÖNİZLEME: asıl tutar ödeme formu açılırken sunucuda
 * yeniden hesaplanıyor; kod arada kapatılırsa ya da tükenirse ödeme o hatayla
 * durur. Kodun kullanımı da ödeme alınınca yazılıyor, burada değil.
 */
export default function IndirimKoduAlani({
  onizle,
  onDegis,
  sureyiGoster = true,
}: {
  onizle: (kod: string) => Promise<IndirimOzeti>;
  onDegis: (ozet: IndirimOzeti | null) => void;
  /** Lio Bakiyesi tek seferlik: "ilk 3 ödemede" gibi süre metni anlamsız. */
  sureyiGoster?: boolean;
}) {
  const c = useThemeColors();
  const t = useT();
  const [acik, setAcik] = useState(false);
  const [kod, setKod] = useState("");
  const [ozet, setOzet] = useState<IndirimOzeti | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  const tl = (n: number) => `${n.toLocaleString(bicimDili(), { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₺`;

  const uygula = async () => {
    if (!kod.trim() || mesgul) return;
    setMesgul(true);
    setHata(null);
    try {
      const sonuc = await onizle(kod.trim());
      setOzet(sonuc);
      onDegis(sonuc);
    } catch (h) {
      setOzet(null);
      onDegis(null);
      setHata(h instanceof ApiError ? h.message : t("İndirim kodu kontrol edilemedi."));
    } finally {
      setMesgul(false);
    }
  };

  const kaldir = () => {
    setOzet(null);
    setKod("");
    onDegis(null);
  };

  if (!acik && !ozet) {
    return (
      <button
        type="button"
        onClick={() => setAcik(true)}
        style={{ border: "none", background: "transparent", color: c.accentDark, fontSize: 13, padding: 0, cursor: "pointer", textAlign: "left" }}
      >
        {t("İndirim kodun var mı?")}
      </button>
    );
  }

  if (ozet) {
    const sure =
      ozet.sure === "surekli"
        ? t("Her yenilemede geçerli")
        : ozet.sure === "donem"
          ? t("İlk {n} ödemede geçerli", { n: ozet.donemSayisi ?? 1 })
          : t("Yalnızca ilk ödemede geçerli");
    return (
      <div style={{ fontSize: 13, color: c.textPrimary, lineHeight: 1.5, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ flex: 1 }}>
          <strong>{ozet.kod}</strong>: <s style={{ color: c.textSecondary }}>{tl(ozet.listeTutari)}</s> {tl(ozet.tutar)}
          {sureyiGoster && <span style={{ display: "block", color: c.textSecondary }}>{sure}</span>}
        </span>
        <button
          type="button"
          onClick={kaldir}
          style={{ border: "none", background: "transparent", color: c.textSecondary, fontSize: 12.5, cursor: "pointer" }}
        >
          {t("Kaldır")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={kod}
          onChange={(e) => setKod(e.target.value)}
          onKeyDown={(e) => {
            // Kart formunun içinde: Enter formu (ve PayTR'ye gönderimi) tetiklemesin.
            if (e.key === "Enter") {
              e.preventDefault();
              void uygula();
            }
          }}
          placeholder={t("İndirim kodu")}
          autoCapitalize="characters"
          style={{
            flex: 1,
            background: c.background,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            color: c.textPrimary,
            padding: "8px 10px",
            fontSize: 14,
          }}
        />
        <button
          type="button"
          onClick={uygula}
          disabled={!kod.trim() || mesgul}
          style={{ border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary, borderRadius: 8, padding: "8px 12px", fontSize: 13.5, cursor: "pointer" }}
        >
          {mesgul ? "…" : t("Uygula")}
        </button>
      </div>
      {hata && <div style={{ fontSize: 12.5, color: c.danger, marginTop: 4 }}>{hata}</div>}
    </div>
  );
}
