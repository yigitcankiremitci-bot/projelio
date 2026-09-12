import { useEffect, useMemo, useState } from "react";
import type { ServiceAccount, ServiceAccountGrant } from "@projelio/shared";
import { hesaplarApi, type HesapKapsami } from "../../api/hesaplar";
import { useT } from "../../lib/i18n";
import { useThemeColors } from "../../theme/useThemeColors";
import Modal from "../Modal";

interface Props {
  kapsam: HesapKapsami;
  /** Boş: kapsamın TAMAMI paylaşılıyor. Dolu: yalnızca o hesap. */
  hesap?: ServiceAccount | null;
  uyeler: { id: string; label: string }[];
  onClose: () => void;
  onDegisti: () => void;
}

function tarih(deger?: string): string {
  if (!deger) return "—";
  return new Date(deger).toLocaleDateString("tr-TR", { dateStyle: "medium" });
}

/**
 * Paylaşım — yalnızca yöneticiye açık.
 *
 * İKİ GENİŞLİK: tek hesap ya da listenin tamamı. "Tamamı" izni tek tek
 * hesapları dolaşmak zorunda kalmamak için var (20 hesaplı bir şirkette
 * muhasebeciye tek tek izin vermek pratikte yapılmıyordu, sonuç şifrenin
 * WhatsApp'tan gönderilmesi oluyordu). İkisi ayrı satır olarak tutuluyor ki
 * denetim izinde hangisinin verildiği görünsün.
 *
 * KİŞİLER MODÜL EKİBİNDEN seçiliyor: modülü hiç göremeyen birine sır açmak,
 * kendisinin de göremeyeceği bir izin vermek olurdu — hesaplar ekranı ona hiç
 * açılmıyor. Sunucu da aynı kuralı uyguluyor; buradaki liste kolaylık.
 *
 * SÜRE İSTEĞE BAĞLI: "kampanya boyunca" gibi geçici paylaşımlar için. Boş
 * bırakılırsa süresiz — ama geri alınabilir, satır silinmediği için geçmiş de
 * kalır.
 */
export default function HesapPaylasModal({ kapsam, hesap, uyeler, onClose, onDegisti }: Props) {
  const c = useThemeColors();
  const t = useT();

  const [paylasimlar, setPaylasimlar] = useState<ServiceAccountGrant[]>([]);
  const [userId, setUserId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState("");

  const yukle = () => {
    hesaplarApi
      .paylasimlar(kapsam, hesap?.id)
      .then(setPaylasimlar)
      .catch((err) => setHata(err instanceof Error ? err.message : t("Paylaşımlar yüklenemedi")));
  };

  useEffect(yukle, [hesap?.id]);

  const paylasilanlar = useMemo(
    () => new Set(paylasimlar.filter((p) => p.active).map((p) => p.userId)),
    [paylasimlar]
  );
  const adaylar = uyeler.filter((u) => !paylasilanlar.has(u.id));

  const paylas = async () => {
    if (!userId) return;
    setBusy(true);
    setHata("");
    try {
      await hesaplarApi.paylas(kapsam, {
        userId,
        accountId: hesap?.id ?? null,
        // Gün sonuna kadar geçerli: tarih girildiğinde kullanıcı "o gün dahil"
        // diye düşünüyor, gün başı yazılsa izin bir gün eksik olurdu.
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
      });
      setUserId("");
      setExpiresAt("");
      yukle();
      onDegisti();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Paylaşılamadı"));
    } finally {
      setBusy(false);
    }
  };

  const kaldir = async (grant: ServiceAccountGrant) => {
    setBusy(true);
    setHata("");
    try {
      await hesaplarApi.paylasimiKaldir(grant.id);
      yukle();
      onDegisti();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Paylaşım kaldırılamadı"));
    } finally {
      setBusy(false);
    }
  };

  const hayalet = {
    fontSize: 12,
    background: "transparent",
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    padding: "4px 10px",
    cursor: "pointer",
    color: c.textSecondary,
  } as const;

  return (
    <Modal
      title={hesap ? t("{hesap} hesabını paylaş", { hesap: hesap.name }) : t("Tüm hesapları paylaş")}
      subtitle={
        hesap
          ? t("Paylaşılan kişi bu hesabın giriş bilgilerini görebilir; düzenleyemez. Her gösterim kaydedilir.")
          : t("Paylaşılan kişi bu listedeki TÜM hesapların giriş bilgilerini görebilir; düzenleyemez.")
      }
      onClose={onClose}
      maxWidth={560}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 180px", display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: c.textSecondary }}>{t("Kişi")}</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              style={{ fontSize: 13, padding: "6px 8px", width: "100%" }}
            >
              <option value="">{t("Seçin")}</option>
              {adaylar.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "0 1 150px", display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 12, color: c.textSecondary }}>{t("Bitiş (isteğe bağlı)")}</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              style={{ fontSize: 13, padding: "6px 8px", width: "100%" }}
            />
          </div>
          <button
            data-primary
            onClick={paylas}
            disabled={busy || !userId}
            style={{
              fontSize: 13,
              padding: "7px 14px",
              background: c.primary,
              color: c.onPrimary,
              border: "none",
              borderRadius: 8,
              cursor: busy || !userId ? "default" : "pointer",
              opacity: busy || !userId ? 0.6 : 1,
            }}
          >
            {t("Paylaş")}
          </button>
        </div>

        {adaylar.length === 0 && uyeler.length === 0 && (
          <span style={{ fontSize: 12, color: c.textSecondary }}>
            {t("Modül ekibinde kimse yok. Önce ekip sekmesinden kişi ekleyin.")}
          </span>
        )}

        {paylasimlar.length === 0 ? (
          <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Henüz paylaşılmadı.")}</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {paylasimlar.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  padding: "8px 10px",
                  border: `1px solid ${c.border}`,
                  borderRadius: 8,
                  background: c.surface,
                  opacity: p.active ? 1 : 0.55,
                }}
              >
                <span style={{ fontSize: 13, color: c.textPrimary, flex: 1, minWidth: 120 }}>
                  {p.userName ?? t("Silinmiş kullanıcı")}
                  {!hesap && p.accountName ? ` · ${p.accountName}` : ""}
                </span>
                <span style={{ fontSize: 11, color: c.textSecondary }}>
                  {p.active
                    ? p.expiresAt
                      ? t("{tarih} tarihine kadar", { tarih: tarih(p.expiresAt) })
                      : t("Süresiz")
                    : p.revokedAt
                    ? t("Kaldırıldı")
                    : t("Süresi geçti")}
                </span>
                {p.active && (
                  <button onClick={() => kaldir(p)} disabled={busy} style={{ ...hayalet, color: c.danger }}>
                    {t("Kaldır")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}
      </div>
    </Modal>
  );
}
