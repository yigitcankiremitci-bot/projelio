import { useState } from "react";
import { getModuleRecordConfig } from "../lib/moduleRecordConfigs";
import { colors } from "../theme/colors";
import MailboxPanel from "./MailboxPanel";
import ModuleRecordsPanel from "./ModuleRecordsPanel";

interface Props {
  organizationId?: string;
  departmentId?: string;
  jobId?: string;
  moduleKey: string;
  moduleName: string;
  canWrite?: boolean;
}

type Tab = "inbox" | "campaigns";

/**
 * E-posta modülü: iki iş, tek modül.
 *
 *   Gelen kutusu  — gelen postayı okumak ve yanıtlamak (canlı, Graph üzerinden)
 *   Kampanyalar   — planlanan/gönderilen toplu e-posta kayıtları (module_records)
 *
 * NEDEN AYNI MODÜLDE: kullanıcının kafasında ikisi de "e-posta". Ayrı modüller
 * yapmak, katalogda birbirine çok benzeyen iki satır doğururdu.
 *
 * NEDEN AYRI SEKMEDE: veri modelleri ve yaşam döngüleri hiç örtüşmüyor. Gelen
 * kutusu Projelio'da SAKLANMAZ (bkz. 064_mail_accounts.sql), kampanya kaydı
 * saklanır; biri bugünün işi, diğeri geçmişin defteri. Tek listede birleştirmek
 * ikisini de okunmaz yapardı.
 *
 * Varsayılan sekme gelen kutusu: modül açıldığında sorulan soru neredeyse her
 * zaman "bana ne gelmiş".
 */
export default function EmailModulePanel({
  organizationId,
  departmentId,
  jobId,
  moduleKey,
  moduleName,
  canWrite = true,
}: Props) {
  const c = colors.light;
  const [tab, setTab] = useState<Tab>("inbox");

  const tabButton = (value: Tab, label: string) => (
    <button
      onClick={() => setTab(value)}
      style={{
        fontSize: 12,
        padding: "4px 10px",
        borderRadius: 6,
        cursor: "pointer",
        border: `1px solid ${tab === value ? c.primary : c.border}`,
        background: tab === value ? `${c.primary}18` : "transparent",
        color: tab === value ? c.primary : c.textSecondary,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {tabButton("inbox", "Gelen kutusu")}
        {tabButton("campaigns", "Kampanyalar")}
      </div>

      {tab === "inbox" ? (
        <MailboxPanel
          organizationId={organizationId}
          departmentId={departmentId}
          jobId={jobId}
          canWrite={canWrite}
        />
      ) : (
        <ModuleRecordsPanel
          organizationId={organizationId}
          departmentId={departmentId}
          jobId={jobId}
          moduleKey={moduleKey}
          config={getModuleRecordConfig(moduleKey, moduleName)}
          canWrite={canWrite}
        />
      )}
    </div>
  );
}
