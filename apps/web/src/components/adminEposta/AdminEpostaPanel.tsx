import { useState } from "react";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import TabBar from "../TabBar";
import EpostaGonderBolumu from "./EpostaGonderBolumu";
import EpostaIpuclariBolumu from "./EpostaIpuclariBolumu";
import EpostaGecmisBolumu from "./EpostaGecmisBolumu";

/**
 * Admin > E-posta: gönderim, ipuçları ve geçmiş. Maliyet ayrı sekmede
 * (AdminEpostaMaliyetPanel) — orası para, burası içerik.
 */
type Bolum = "gonder" | "ipuclari" | "gecmis";

export default function AdminEpostaPanel() {
  const c = useThemeColors();
  const t = useT();
  const [bolum, setBolum] = useState<Bolum>("gonder");
  const [gecmisYenile, setGecmisYenile] = useState(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
      <p style={{ fontSize: 14, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
        {t("Kullanıcılara e-posta gönder, günlük ipucu dizisini yönet. Lio'nun yazdığı her e-postanın maliyeti E-posta maliyeti sekmesinde.")}
      </p>
      <TabBar
        tabs={[
          { key: "gonder", label: t("Gönder") },
          { key: "ipuclari", label: t("İpuçları") },
          { key: "gecmis", label: t("Geçmiş") },
        ]}
        active={bolum}
        onChange={(k) => setBolum(k as Bolum)}
      />
      {bolum === "gonder" && <EpostaGonderBolumu onGonderildi={() => setGecmisYenile((n) => n + 1)} />}
      {bolum === "ipuclari" && <EpostaIpuclariBolumu />}
      {bolum === "gecmis" && <EpostaGecmisBolumu yenile={gecmisYenile} />}
    </div>
  );
}
