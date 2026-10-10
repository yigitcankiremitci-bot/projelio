import { lazy, Suspense, useEffect, useState } from "react";
import { BAGLANTI_MODUL_KEY, MUSTERI_MODUL_KEY, type Task } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { IconUser } from "./icons";

// Kart penceresi Bağlantılar panelinin içinden geliyor; görev ekranları onu
// ancak tıklanınca yükler (panel büyük, her görev sayfasına binmesin).
const BaglantiKartiModal = lazy(() => import("./CustomersPanel").then((m) => ({ default: m.BaglantiKartiModal })));

/**
 * Kart adları bir kez çekilir, sayfada aynı kartı gösteren bütün görevler
 * paylaşır. Kartı görme yetkisi yoksa (başka departmandaki görevli) ad yerine
 * yalnızca tür yazılır.
 */
const adlar = new Map<string, Promise<string | null>>();
function kartAdi(id: string): Promise<string | null> {
  if (!adlar.has(id)) {
    adlar.set(
      id,
      api
        .get<{ displayName: string }>(`/party/${id}`)
        .then((p) => p.displayName)
        .catch(() => null)
    );
  }
  return adlar.get(id)!;
}

/**
 * Görevin hangi kişi kartından doğduğunu gösteren etiket ("Bağlantı: Ayşe
 * Yılmaz"). Tıklayınca kart modal pencerede açılır. Görev bir kişi kartından
 * doğmadıysa hiçbir şey çizmez.
 */
export default function KartEtiketi({
  task,
  size = 12,
}: {
  task: Pick<Task, "sourceModuleKey" | "sourceRecordId">;
  size?: number;
}) {
  const c = useThemeColors();
  const t = useT();
  const id = task.sourceRecordId;
  const kartMi = !!id && (task.sourceModuleKey === BAGLANTI_MODUL_KEY || task.sourceModuleKey === MUSTERI_MODUL_KEY);
  const [ad, setAd] = useState<string | null>(null);
  const [acik, setAcik] = useState(false);

  useEffect(() => {
    if (!kartMi || !id) return;
    let iptal = false;
    kartAdi(id).then((a) => !iptal && setAd(a));
    return () => {
      iptal = true;
    };
  }, [kartMi, id]);

  if (!kartMi || !id) return null;
  // Rol bağlamı: düz "Bağlantı" sözlükte "Link", düz "Müşteri" ise çoğul sayaç.
  const tur = task.sourceModuleKey === BAGLANTI_MODUL_KEY ? t("Bağlantı", { ctx: "rol" }) : t("Müşteri", { ctx: "rol" });
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAcik(true);
        }}
        title={t("Kartı aç")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: size - 1,
          padding: "1px 6px",
          borderRadius: 6,
          border: `1px solid ${c.border}`,
          background: "transparent",
          color: c.textSecondary,
          cursor: "pointer",
          maxWidth: 200,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <IconUser size={size} />
        {ad ? `${tur}: ${ad}` : tur}
      </button>
      {acik && (
        <Suspense fallback={null}>
          <BaglantiKartiModal partyId={id} onClose={() => setAcik(false)} />
        </Suspense>
      )}
    </>
  );
}
