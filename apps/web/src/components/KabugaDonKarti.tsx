import { useState } from "react";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { uygulamadaAcAdresi } from "../lib/mobilKabuk";

/**
 * SAĞLAYICI DÖNÜŞÜ TARAYICIDA KALDIĞINDA ÇIKAN KURTARMA EKRANI.
 *
 * Giriş uygulamadan başlatıldı, sistem tarayıcısında tamamlandı, ama dönüş
 * uygulamaya teslim edilmedi (bkz. lib/mobilKabuk.ts kabukDonusuTarayicidaMi).
 * Kullanıcı burada çıkmaza girerdi.
 *
 * KRİTİK: bu ekran gösterilirken devir kodu HENÜZ TAKAS EDİLMEMİŞ olmalı.
 * Kod tek kullanımlık ve 2 dakika ömürlü; tarayıcıda takas edilirse kullanıcı
 * uygulamada değil TARAYICIDA giriş yapmış olur ve aynı kodla uygulamaya
 * geçemez. Bu yüzden dönüş sayfaları takastan ÖNCE bu ekranı gösteriyor.
 *
 * İkinci seçenek (tarayıcıda devam) bilerek duruyor: uygulama silinmişse ya da
 * intent bir sebeple açılmıyorsa kullanıcı yine de girebilmeli.
 */
export default function KabugaDonKarti({ onTarayicidaDevam }: { onTarayicidaDevam: () => void }) {
  const c = useThemeColors();
  const t = useT();
  const [denendi, setDenendi] = useState(false);

  return (
    <div style={{ maxWidth: 380, margin: "0 auto", textAlign: "center" }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: c.textPrimary, margin: "0 0 10px" }}>
        {t("Girişi uygulamada tamamla")}
      </h1>
      <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 20px", lineHeight: 1.5 }}>
        {t("Giriş doğrulandı. Devam etmek için Projelio uygulamasına dönmen gerekiyor.")}
      </p>

      <a
        href={uygulamadaAcAdresi()}
        onClick={() => setDenendi(true)}
        style={{
          display: "block",
          padding: "13px 18px",
          borderRadius: 10,
          background: c.accent,
          color: c.primaryDark,
          fontSize: 16,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        {t("Projelio'da aç")}
      </a>

      {/* Düğmeye basıldıysa ve kullanıcı hâlâ buradaysa intent açılmamış
          demektir: sebebini ve kalıcı çözümü ancak o zaman göstermek, ilk
          bakışta ekranı gereksiz yere kalabalıklaştırmıyor. */}
      {denendi && (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: "16px 0 0", lineHeight: 1.5 }}>
          {t(
            "Uygulama açılmadıysa: Ayarlar > Uygulamalar > Projelio > Varsayılan olarak aç bölümünden app.projelio.app bağlantılarını aç."
          )}
        </p>
      )}

      <button
        type="button"
        onClick={onTarayicidaDevam}
        style={{
          marginTop: 18,
          background: "none",
          border: "none",
          color: c.textSecondary,
          fontSize: 14,
          textDecoration: "underline",
        }}
      >
        {t("Bunun yerine tarayıcıda devam et")}
      </button>
    </div>
  );
}
