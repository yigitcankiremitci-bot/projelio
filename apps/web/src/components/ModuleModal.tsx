import { useEffect, useState } from "react";
import type { ModuleAccess } from "@projelio/shared";
import { api } from "../api/client";
import { useLiveRoom } from "../lib/liveRoom";
import { moduleModalWidth, moduleSurface } from "../lib/moduleSurfaces";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import ModuleSurface, { type ModuleSurfaceProps } from "./ModuleSurface";
import ModuleTeamPanel from "./ModuleTeamPanel";

interface Props extends ModuleSurfaceProps {
  /** Katalogdaki tek cümlelik açıklama — başlığın altında görünür. */
  description?: string;
  /** Neredeyse tam ekran açılsın (bkz. Modal.nearlyFullScreen). */
  nearlyFullScreen?: boolean;
  onClose: () => void;
}

/**
 * Modal içinde açılan modül.
 *
 * Modül kartına tıklanınca modül artık HER ZAMAN burada açılır (kullanıcı
 * kararı, 2026-11-01): kartın bulunduğu sayfadan ayrılmadan çalışılıp
 * kapatılınca aynı yere dönülüyor. Kendi adresindeki sayfa (pages/ModulePage)
 * duruyor — sidebar ve paylaşılan bağlantılar oraya gider.
 *
 * Genişlik yüzeyden gelir: çalışma alanı olan (sayfa yüzeyli) modül geniş
 * açılır, form 900, kısa liste 760. Dar ekranda modal tam ekrana geçer.
 *
 * Yetki verilmediyse burada çözülür; sayfadaki gibi ekip paneli modülün altında.
 *
 * Bkz. docs/moduller/24-yerlesim-modul-yuzeyleri.md §2.4
 */
export default function ModuleModal({ description, nearlyFullScreen, onClose, access: verilenYetki, ...surface }: Props) {
  const c = useThemeColors();
  const { moduleKey, organizationId, departmentId, jobId } = surface;

  // Modül sayfasıyla aynı oda: modalde çalışan kişi de o modülde sayılsın.
  useLiveRoom(
    departmentId
      ? `department:${departmentId}/module/${moduleKey}`
      : jobId
      ? `job:${jobId}/module/${moduleKey}`
      : organizationId
      ? `organization:${organizationId}/module/${moduleKey}`
      : null
  );

  const [cozulenYetki, setCozulenYetki] = useState<ModuleAccess | null>(null);
  useEffect(() => {
    // Serbest çalışanda ayrı bir onay makamı yok: işin sahibi tam yetkili.
    if (verilenYetki !== undefined || jobId || !organizationId) return;
    let cancelled = false;
    const dept = departmentId ? `&departmentId=${departmentId}` : "";
    api
      .get<ModuleAccess>(
        `/organizations/${organizationId}/module-access?moduleKey=${encodeURIComponent(moduleKey)}${dept}`
      )
      .then((a) => {
        if (!cancelled) setCozulenYetki(a);
      })
      .catch(() => {
        if (!cancelled) setCozulenYetki(null);
      });
    return () => {
      cancelled = true;
    };
  }, [verilenYetki, organizationId, departmentId, jobId, moduleKey]);
  const access = verilenYetki !== undefined ? verilenYetki : cozulenYetki;

  const genislik = moduleSurface(moduleKey) === "page" ? 1100 : moduleModalWidth(moduleKey);

  return (
    <Modal title={surface.moduleName} subtitle={description} onClose={onClose} maxWidth={genislik} mobileFullScreen nearlyFullScreen={nearlyFullScreen}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <ModuleSurface {...surface} access={access} />
        <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 16 }}>
          <ModuleTeamPanel
            organizationId={organizationId}
            departmentId={departmentId}
            jobId={jobId}
            moduleKey={moduleKey}
            access={access ?? undefined}
          />
        </div>
      </div>
    </Modal>
  );
}
