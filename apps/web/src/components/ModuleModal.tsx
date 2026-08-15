import { moduleModalWidth } from "../lib/moduleSurfaces";
import Modal from "./Modal";
import ModuleSurface, { type ModuleSurfaceProps } from "./ModuleSurface";

interface Props extends ModuleSurfaceProps {
  /** Katalogdaki tek cümlelik açıklama — başlığın altında görünür. */
  description?: string;
  onClose: () => void;
}

/**
 * Modal yüzeyinde açılan modül.
 *
 * Genişlik modülün arketipinden gelir (form 640, liste/panel 760): bugünkü
 * Modal varsayılanı 400px ve uzun metin orada iki kelimede bir kırılıyor.
 * Dar ekranda modal tam ekrana geçer.
 *
 * Bkz. docs/moduller/24-yerlesim-modul-yuzeyleri.md §2.4
 */
export default function ModuleModal({ description, onClose, ...surface }: Props) {
  return (
    <Modal
      title={surface.moduleName}
      subtitle={description}
      onClose={onClose}
      maxWidth={moduleModalWidth(surface.moduleKey)}
      mobileFullScreen
    >
      <ModuleSurface {...surface} />
    </Modal>
  );
}
