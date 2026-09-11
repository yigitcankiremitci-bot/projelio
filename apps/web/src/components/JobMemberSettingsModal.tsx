import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Job } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import { notifySidebarChanged } from "../lib/sidebarEvents";
import { IconLogout } from "./icons";
import { useT } from "../lib/i18n";

interface Props {
  job: Job;
  /** Ayrılınca silinecek proje üyeliği sayısı (bkz. GET /jobs/:id/members/me). */
  projectCount: number;
  onClose: () => void;
}

/**
 * İşin ekibindeki kişinin ayar penceresi. İŞİ KURAN kişininki ayrı
 * (bkz. EditJobModal): ad/kapak/arşiv onun kararı, üye hiçbirine dokunamaz.
 *
 * Şimdilik tek seçenek "İşten ayrıl". Kapaktaki dişliye doğrudan "ayrıl"
 * düğmesi koymak denendi ve bilerek geri alındı: ayrılma geri dönüşü olmayan
 * bir eylem, kapakta tek tıklık mesafede durmamalı — üstelik işin sahibi
 * dişli görürken üyenin bambaşka bir simge görmesi aynı yerin iki farklı şey
 * yaptığı anlamına geliyordu.
 */
export default function JobMemberSettingsModal({ job, projectCount, onClose }: Props) {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  return (
    <Modal title={t("İş ayarları")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 15, color: c.textSecondary, lineHeight: 1.5 }}>
          {projectCount > 0
            ? t(
                "Ayrılırsan bu iş listenden ve kenar çubuğundan kalkar; işin {n} projesindeki ekip üyeliğin de sona erer. Sana atanmış görevler işte kalır.",
                { n: projectCount }
              )
            : t(
                "Ayrılırsan bu iş listenden ve kenar çubuğundan kalkar; projelerine ve dosyalarına erişimin biter. Sana atanmış görevler işte kalır."
              )}
        </div>
        <button
          type="button"
          onClick={() => setLeaving(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            alignSelf: "flex-start",
            padding: "9px 14px",
            fontSize: 15,
            borderRadius: 8,
            border: `1px solid ${c.danger}`,
            background: "transparent",
            color: c.danger,
            cursor: "pointer",
          }}
        >
          <IconLogout size={16} color={c.danger} />
          {t("İşten ayrıl")}
        </button>
      </div>

      {leaving && (
        <ConfirmDialog
          title={t("İşten ayrıl")}
          message={t('"{is}" işinden ayrılmak istediğine emin misin? İşe ve projelerine erişimin kalkar.', {
            is: job.title,
          })}
          confirmLabel={t("Ayrıl")}
          danger
          onCancel={() => setLeaving(false)}
          onConfirm={async () => {
            await api.delete(`/jobs/${job.id}/members/me`);
            setLeaving(false);
            notifySidebarChanged();
            onClose();
            navigate("/");
          }}
        />
      )}
    </Modal>
  );
}
