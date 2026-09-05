import { useState } from "react";
import { whatsappApi } from "../api/whatsapp";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";

/**
 * "WhatsApp'tan değişiklik yapılabilsin" anahtarı.
 *
 * Kullanıcı Projelio numarasına yazdığında Lio araçlarıyla cevap veriyor
 * (bkz. docs/whatsapp-lio-komut-plani.md). Bu anahtar kapalıyken yalnızca
 * OKUMA araçları veriliyor: "bütçe raporu çıkar" çalışır, "görev aç" çalışmaz.
 *
 * Açıklamadaki son cümle bilerek duruyor: kullanıcı anahtarı açarken neyin
 * HÂLÂ kapalı olduğunu görmezse "her şeyi açtım" sanır. Silme, arşivleme ve
 * bütçe hareketi bu kanalda hiçbir zaman yapılamıyor — onların onay diyaloğu
 * web ekranına bağlı.
 */
export default function WhatsappLioWritesToggle({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const c = useThemeColors();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = async () => {
    setBusy(true);
    setError("");
    try {
      await whatsappApi.setLioWrites(!enabled);
      onChanged();
    } catch (e: any) {
      setError(e?.message ?? "Ayar kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${c.border}` }}>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: busy ? "wait" : "pointer" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={toggle}
          disabled={busy}
          style={{ marginTop: 3, cursor: "inherit" }}
        />
        <span>
          <span style={{ fontSize: 15, color: c.textPrimary }}>{t("WhatsApp'tan değişiklik yapılabilsin")}</span>
          <span style={{ display: "block", fontSize: 14, color: c.textSecondary, marginTop: 4, lineHeight: 1.5 }}>
            Lio, WhatsApp'tan yazdığınız isteklerle görev açabilir, kayıt güncelleyebilir. Kapalıyken yalnızca
            sorularınızı yanıtlar. Silme ve bütçe işlemleri WhatsApp'tan hiçbir zaman yapılamaz.
          </span>
        </span>
      </label>
      {error && <p style={{ fontSize: 14, color: c.danger, margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}
