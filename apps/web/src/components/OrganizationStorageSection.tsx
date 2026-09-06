import { useCallback, useEffect, useState } from "react";
import { cloudStorageApi, type CloudAccountRow, type OrganizationStorageInfo } from "../api/files";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";

/**
 * "Bu şirketin dosyaları hangi hesapta dursun?"
 *
 * NEDEN BURADA: depo hesabı, şirketin bütün dosyalarının kimin bulut kotasında
 * ve kimin erişiminde olacağını belirler — bir sahiplik kararı, o yüzden şirket
 * ayarlarının içinde. Seçim yapılmazsa eski davranış sürer: dosyalar şirket
 * sahibinin varsayılan hesabına düşer.
 *
 * DEĞİŞTİRMENİN SINIRI: seçim yalnızca BUNDAN SONRA kurulacak departman/iş
 * klasörlerini yönlendirir. Var olan dosyalar bulundukları hesapta kalır;
 * taşımak, kullanıcının Drive'ında bizim kopyalayamayacağımız bir iş. Metinde
 * bunu açıkça yazıyoruz, yoksa "değiştirdim ama eski dosyalar taşınmadı"
 * sürprizi oluyor.
 */
export default function OrganizationStorageSection({ organizationId }: { organizationId: string }) {
  const c = useThemeColors();
  const t = useT();
  const [accounts, setAccounts] = useState<CloudAccountRow[]>([]);
  const [info, setInfo] = useState<OrganizationStorageInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const [rows, current] = await Promise.all([
      cloudStorageApi.accounts().catch(() => [] as CloudAccountRow[]),
      cloudStorageApi.organizationStorage(organizationId).catch(() => ({ selected: false }) as OrganizationStorageInfo),
    ]);
    setAccounts(rows);
    setInfo(current);
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleChange = async (value: string) => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      if (!value) {
        await cloudStorageApi.clearOrganizationStorage(organizationId);
      } else {
        const [provider, accountId] = value.split(":") as ["google" | "microsoft", string];
        await cloudStorageApi.setOrganizationStorage(organizationId, provider, accountId);
      }
      await load();
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? t("Depo hesabı kaydedilemedi."));
    } finally {
      setBusy(false);
    }
  };

  if (!info) return null;

  const usable = accounts.filter((a) => a.driveReady);
  const selectedValue = info.selected ? `${info.provider}:${info.accountId}` : "";

  return (
    <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${c.border}` }}>
      <div style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, marginBottom: 4 }}>
        {t("Dosya deposu")}
      </div>
      <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>
        {t(
          "Bu şirketin dosyaları seçtiğiniz hesapta, şirket adını taşıyan bir klasörde toplanır. Seçim yalnızca bundan sonra açılacak klasörler için geçerlidir; hâlihazırdaki dosyalar bulundukları hesapta kalır."
        )}
      </p>

      {usable.length === 0 ? (
        <p style={{ fontSize: 15, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
          {t("Önce Ayarlar > Bağlantılar ekranından bir Drive ya da OneDrive hesabı bağlayın.")}
        </p>
      ) : (
        <select
          value={selectedValue}
          disabled={busy}
          onChange={(e) => void handleChange(e.target.value)}
          style={{ width: "100%" }}
        >
          <option value="">{t("Seçim yok — varsayılan hesabım kullanılsın")}</option>
          {usable.map((a) => (
            <option key={`${a.provider}:${a.id}`} value={`${a.provider}:${a.id}`}>
              {(a.label ? `${a.label} — ` : "") + a.email}
              {a.provider === "google" ? " (Drive)" : " (OneDrive)"}
            </option>
          ))}
        </select>
      )}

      {info.selected && !info.driveReady && (
        <p style={{ fontSize: 14, color: c.warning, margin: "8px 0 0", lineHeight: 1.5 }}>
          {t(
            "Seçili hesabın erişimi sona ermiş. Yeniden bağlanana kadar yeni dosyalar varsayılan hesaba düşer."
          )}
        </p>
      )}
      {saved && !error && (
        <p style={{ fontSize: 14, color: c.success, margin: "8px 0 0" }}>{t("Kaydedildi.")}</p>
      )}
      {error && <p style={{ fontSize: 14, color: c.danger, margin: "8px 0 0" }}>{error}</p>}
    </div>
  );
}
