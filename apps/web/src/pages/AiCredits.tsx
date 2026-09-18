import { useCallback, useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import { aiChat } from "../api/aiChat";
import type { AiCredits as AiCreditsData, AiCreditTransaction } from "../api/aiChat";
import { IconSparkle } from "../components/icons";
import AiCreditTopUp from "../components/AiCreditTopUp";
import { useCurrentUser } from "../lib/useCurrentUser";
import { demoHesap } from "../lib/demoHesap";
import { satinAlmaGosterilir } from "../lib/mobilKabuk";

// Modül düzeyinde kanca çağrılamaz: Türkçe metin ANAHTAR olarak duruyor,
// çeviri kullanıldığı yerde (t(TYPE_LABELS[...])) yapılıyor.
const TYPE_LABELS: Record<AiCreditTransaction["type"], string> = {
  topup: "Bakiye yüklemesi", // dil:anahtar
  usage: "AI kullanımı", // dil:anahtar
  refund: "İade", // dil:anahtar
  adjustment: "Düzeltme", // dil:anahtar
  welcome: "Hoş geldin bakiyesi", // dil:anahtar
};

export default function AiCreditsPage() {
  const c = useThemeColors();
  const t = useT();
  const [credits, setCredits] = useState<AiCreditsData | null>(null);
  const [transactions, setTransactions] = useState<AiCreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [odemeDurumu, setOdemeDurumu] = useState<"bekleniyor" | "basarisiz" | null>(null);
  // Demo hesabında Lio ücretsiz: bakiye diye görünen sayı aslında saatlik
  // deneme tavanından kalan kısım (bkz. backend demo-ai-kotasi.ts). Kredi
  // yükleme arka uçta da kapalı, düğmeyi göstermek boşuna hataya çıkarırdı.
  const { user: me } = useCurrentUser();
  const demoHesabi = me?.email?.toLowerCase() === demoHesap.email;

  // Sipariş oluşturulunca da çağrılır: ödeme entegrasyonu bağlandığında kredi
  // anında yükleneceği için bakiyenin tazelenmesi gerekir.
  const reload = useCallback(() => {
    Promise.all([aiChat.getCredits(), aiChat.getTransactions(100)])
      .then(([balance, txs]) => {
        setCredits(balance);
        setTransactions(txs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  /**
   * PayTR'den dönen müşteriyi karşılar (?odeme=bekleniyor | basarisiz).
   *
   * ÖDEME FORMUNDAN DÖNMEK BAKİYE YÜKLENDİ DEMEK DEĞİL: sonucu PayTR'nin
   * sunucudan sunucuya gönderdiği imzalı bildirim belirliyor ve o bildirim
   * tarayıcının dönüşünden saniyeler sonra gelebiliyor. Bu yüzden sayfa
   * "yüklendi" demiyor, bakiyeyi birkaç kez tazeleyip bekliyor.
   */
  useEffect(() => {
    const durum = new URLSearchParams(window.location.search).get("odeme");
    if (!durum) return;
    setOdemeDurumu(durum === "basarisiz" ? "basarisiz" : "bekleniyor");
    // Adres çubuğu temizlenir: sayfa yenilenince mesaj tekrar çıkmasın.
    window.history.replaceState({}, "", window.location.pathname);
    if (durum === "basarisiz") return;

    // Üç kez, ikişer saniye arayla: bildirim genelde birkaç saniyede geliyor.
    // Sonsuz yoklama YOK — gelmediyse kullanıcıya sayfayı yenilemesini söylemek
    // daha dürüst.
    let kalan = 3;
    const zamanlayici = window.setInterval(() => {
      reload();
      if (--kalan <= 0) window.clearInterval(zamanlayici);
    }, 2000);
    return () => window.clearInterval(zamanlayici);
  }, [reload]);

  const isLow = !!credits && credits.balance < (credits.minBalanceToStart || 20);

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: "0 0 20px" }}>{t("Lio Bakiyesi")}</h1>

      {odemeDurumu && (
        <div
          style={{
            maxWidth: 480,
            marginBottom: 16,
            padding: "12px 14px",
            borderRadius: 10,
            fontSize: 13,
            lineHeight: 1.5,
            border: `1px solid ${odemeDurumu === "basarisiz" ? c.danger : c.border}`,
            color: odemeDurumu === "basarisiz" ? c.danger : c.textPrimary,
            background: c.surface,
          }}
        >
          {odemeDurumu === "basarisiz"
            ? t("Ödeme tamamlanmadı. Kartından para çekilmedi; dilediğin zaman tekrar deneyebilirsin.")
            : t("Ödemen alındı. Bakiyen birkaç saniye içinde yüklenecek; görünmezse sayfayı yenile.")}
        </div>
      )}

      {/* Bakiye kartı */}
      <div
        style={{
          maxWidth: 480,
          background: c.primaryDark,
          borderRadius: 14,
          padding: 22,
          color: "#fff",
          marginBottom: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9, opacity: 0.8, fontSize: 13 }}>
          <IconSparkle size={16} color={c.accent} />
          {t("Kullanılabilir bakiye")}
        </div>
        <div style={{ fontSize: 38, fontWeight: 600, margin: "8px 0 2px", letterSpacing: -0.5 }}>
          {loading ? "…" : Math.round(credits?.balance ?? 0).toLocaleString("tr-TR")}
        </div>
        <div style={{ fontSize: 13, opacity: 0.75 }}>{t("Lio birimi")}</div>

        {credits && (
          <div style={{ display: "flex", gap: 22, marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.15)" }}>
            <Stat label={t("Toplam yüklenen")} value={credits.lifetimePurchased} />
            <Stat label={t("Toplam harcanan")} value={credits.lifetimeSpent} />
          </div>
        )}
      </div>

      {demoHesabi && (
        <div
          style={{
            maxWidth: 480,
            marginBottom: 22,
            padding: "12px 14px",
            borderRadius: 10,
            background: "rgba(192,129,63,0.10)",
            border: `1px solid ${c.accent}`,
            color: c.textPrimary,
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          {t(
            "Demo hesabındasın: Lio ücretsiz, bakiyeden düşmüyor. Yukarıdaki sayı, bütün ziyaretçilerin paylaştığı saatlik deneme hakkından kalan kısım — dolarsa bir süre sonra kendiliğinden yenileniyor. Kendi hesabında böyle bir sınır yok."
          )}
        </div>
      )}

      {!demoHesabi && isLow && (
        <div
          style={{
            maxWidth: 480,
            marginBottom: 22,
            padding: "12px 14px",
            borderRadius: 10,
            background: "rgba(192,129,63,0.10)",
            border: `1px solid ${c.warning}`,
            color: c.accentDark,
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          {t("Lio Bakiyeniz azaldı. Asistanı kesintisiz kullanmak için aşağıdan bakiye yükleyebilirsiniz.")}
        </div>
      )}

      {!demoHesabi && satinAlmaGosterilir() && <AiCreditTopUp onChanged={reload} />}

      <h2 style={{ fontSize: 15, fontWeight: 500, color: c.textSecondary, margin: "0 0 10px", maxWidth: 480 }}>
        {t("Hareketler")}
      </h2>

      <div
        style={{
          maxWidth: 480,
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        {loading ? (
          <p style={{ padding: 16, margin: 0, fontSize: 14, color: c.textSecondary }}>{t("Yükleniyor…")}</p>
        ) : transactions.length === 0 ? (
          <p style={{ padding: 16, margin: 0, fontSize: 14, color: c.textSecondary }}>{t("Henüz hareket yok.")}</p>
        ) : (
          transactions.map((tx, i) => {
            const positive = tx.credits > 0;
            return (
              <div
                key={tx.id}
                style={{
                  padding: "13px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderTop: i === 0 ? "none" : `1px solid ${c.border}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, color: c.textPrimary }}>{t(TYPE_LABELS[tx.type] ?? tx.type)}</div>
                  <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                    {new Date(tx.createdAt).toLocaleString("tr-TR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {tx.description ? ` · ${tx.description}` : ""}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: positive ? c.success : c.textPrimary,
                    whiteSpace: "nowrap",
                  }}
                >
                  {positive ? "+" : ""}
                  {Math.round(tx.credits).toLocaleString("tr-TR")}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 11, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2 }}>
        {Math.round(value).toLocaleString("tr-TR")}
      </div>
    </div>
  );
}
