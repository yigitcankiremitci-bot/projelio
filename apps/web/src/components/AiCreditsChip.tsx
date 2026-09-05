import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { aiChat } from "../api/aiChat";
import type { AiCredits } from "../api/aiChat";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import { IconSparkle } from "./icons";

interface Props {
  // Mobilde anasayfa başlığının altında dar bir alanda duruyor; orada yazı ve
  // dolgu küçülür (bkz. ProfileCard'ın aynı adlı prop'u).
  compact?: boolean;
}

/**
 * Anasayfada Lio kredisini gösteren, tıklanınca kredi sayfasına götüren rozet.
 *
 * Neden anasayfada: kredi bitince Lio sessizce çalışmayı bırakıyor ve bakiye
 * yalnızca Ayarlar'ın altındaki sayfada görünüyordu — kullanıcı krediyi ancak
 * asistan durduğunda fark ediyordu. Rozet bakiyeyi görünür kılıp yükleme
 * sayfasına tek tıklamayla bağlar.
 *
 * Kredi YÜKLEME akışı yönetici işi (bkz. /ai/admin/credits/topup); buradaki
 * bağlantı kullanıcıyı bakiyesini ve hareketlerini gördüğü sayfaya götürür,
 * yükleme oradan (azaldı uyarısındaki yönlendirmeyle) sürer.
 */
export default function AiCreditsChip({ compact = false }: Props) {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();
  const [credits, setCredits] = useState<AiCredits | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    aiChat
      .getCredits()
      .then((data) => {
        if (!cancelled) setCredits(data);
      })
      .catch(() => {
        // İstek başarısızsa rozet HİÇ gösterilmez. Bakiyeyi "0" diye çizmek,
        // kredisi olan kullanıcıya kredisi bitmiş gibi görünürdü — sessizce
        // yok olmak yanlış bilgi vermekten iyi.
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed || !credits) return null;

  const isLow = credits.balance < (credits.minBalanceToStart || 20);
  const balance = Math.round(credits.balance).toLocaleString("tr-TR");

  return (
    <button
      onClick={() => navigate("/settings/ai-credits")}
      // Yükleme sözü verilmiyor: kredi yüklemeyi yönetici yapıyor
      // (bkz. AiCreditAdminPanel), kullanıcı burada bakiyesini ve nasıl
      // yükletebileceğini görüyor.
      title={
        isLow ? t("Lio kredin azaldı — kredi sayfasını aç") : t("Lio kredilerin — kredi sayfasını aç")
      }
      aria-label={t("Lio kredisi: {bakiye}. Kredi sayfasını aç.", { bakiye: balance })}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 5 : 7,
        flexShrink: 0,
        padding: compact ? "5px 9px" : "7px 12px",
        borderRadius: 999,
        cursor: "pointer",
        // Azaldığında uyarı rengine geçer; normalde sayfanın geri kalanıyla aynı
        // sessiz kart görünümü (bkz. theme.ts — renk uydurulmuyor).
        border: `1px solid ${isLow ? c.warning : c.border}`,
        background: isLow ? `${c.warning}1A` : c.surface,
        color: c.textPrimary,
        fontSize: compact ? 12.5 : 14,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      <IconSparkle size={compact ? 13 : 15} color={isLow ? c.accentDark : c.accent} />
      <span style={{ fontWeight: 500 }}>{balance}</span>
      <span style={{ color: c.textSecondary, fontSize: compact ? 11.5 : 13 }}>{t("Lio kredisi")}</span>
    </button>
  );
}
