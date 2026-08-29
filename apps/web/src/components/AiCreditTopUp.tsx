import { useEffect, useState } from "react";
import { aiChat } from "../api/aiChat";
import type { AiCreditOrder, AiCreditPackage } from "../api/aiChat";
import { useThemeColors } from "../theme/useThemeColors";
import { IconSparkle, IconCheck } from "./icons";

const STATUS_LABEL: Record<AiCreditOrder["status"], string> = {
  pending_payment: "Ödeme bekleniyor",
  paid: "Ödendi",
  cancelled: "İptal edildi",
  failed: "Ödeme başarısız",
};

function formatTry(amount: number): string {
  return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₺`;
}

interface Props {
  /** Sipariş oluşturulduğunda bakiyeyi/hareketleri tazelemek için. */
  onChanged?: () => void;
}

/**
 * Kullanıcının kendi kredisini yüklediği bölüm.
 *
 * ÖDEME SAĞLAYICISI HENÜZ BAĞLI DEĞİL (bkz. AiPaymentProvider). Bağlanana kadar
 * akış şöyle: kullanıcı paket seçer, sipariş "ödeme bekleniyor" olarak açılır ve
 * ödeme elden/havale ile alınıp bir yönetici tarafından onaylanınca kredi yüklenir.
 * Arayüz bunu SAKLAMIYOR — kullanıcı, kredinin anında gelmeyeceğini sipariş
 * vermeden önce görüyor. Sağlayıcı bağlandığında `paymentConfigured` true döner ve
 * kullanıcı doğrudan ödeme sayfasına yönlendirilir; bu bileşende değişecek tek şey
 * odur.
 */
export default function AiCreditTopUp({ onChanged }: Props) {
  const c = useThemeColors();
  const [packages, setPackages] = useState<AiCreditPackage[]>([]);
  const [paymentConfigured, setPaymentConfigured] = useState(false);
  const [orders, setOrders] = useState<AiCreditOrder[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reloadOrders = () => aiChat.getCreditOrders().then(setOrders).catch(() => {});

  useEffect(() => {
    Promise.all([aiChat.getCreditPackages(), aiChat.getCreditOrders()])
      .then(([pkgs, ords]) => {
        setPackages(pkgs.packages);
        setPaymentConfigured(pkgs.paymentConfigured);
        setOrders(ords);
      })
      .catch(() => setError("Kredi paketleri yüklenemedi. Sayfayı yenilemeyi dene."))
      .finally(() => setLoading(false));
  }, []);

  const buy = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const { checkoutUrl } = await aiChat.createCreditOrder(selected);
      // Sağlayıcı bağlıysa ödeme sayfasına git; değilse sipariş listede belirir.
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }
      setSelected(null);
      await reloadOrders();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sipariş oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      await aiChat.cancelCreditOrder(id);
      await reloadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sipariş iptal edilemedi.");
    }
  };

  const openOrders = orders.filter((o) => o.status === "pending_payment");

  return (
    <section style={{ maxWidth: 480, marginBottom: 22 }}>
      <h2 style={{ fontSize: 15, fontWeight: 500, color: c.textSecondary, margin: "0 0 10px" }}>Kredi yükle</h2>

      {loading ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>Yükleniyor…</p>
      ) : (
        <>
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            {packages.map((p) => {
              const active = selected === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => setSelected(active ? null : p.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: `1.5px solid ${active ? c.primary : c.border}`,
                    background: active ? c.background : c.surface,
                  }}
                >
                  <IconSparkle size={17} color={active ? c.accentDark : c.accent} />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: "block", fontSize: 15, fontWeight: 500, color: c.textPrimary }}>
                      {p.label} — {p.credits.toLocaleString("tr-TR")} kredi
                    </span>
                    <span style={{ display: "block", fontSize: 13, color: c.textSecondary }}>{p.description}</span>
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: c.textPrimary, whiteSpace: "nowrap" }}>
                    {formatTry(p.priceTry)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Ödeme entegrasyonu gelene kadar kullanıcı ne olacağını ÖNCEDEN bilsin. */}
          {!paymentConfigured && (
            <p
              style={{
                margin: "0 0 12px",
                padding: "10px 12px",
                borderRadius: 9,
                background: `${c.warning}1A`,
                border: `1px solid ${c.warning}`,
                color: c.accentDark,
                fontSize: 13.5,
                lineHeight: 1.5,
              }}
            >
              Çevrim içi ödeme henüz açık değil. Siparişi oluşturduğunda ödeme talimatları için seninle iletişime
              geçilir; ödeme onaylandıktan sonra kredilerin hesabına yüklenir.
            </p>
          )}

          {error && <p style={{ color: c.danger, fontSize: 14, margin: "0 0 10px" }}>{error}</p>}

          <button
            onClick={buy}
            disabled={!selected || busy}
            style={{
              width: "100%",
              padding: "11px 0",
              borderRadius: 10,
              border: "none",
              background: selected && !busy ? c.primary : c.border,
              color: selected && !busy ? "#fff" : c.textSecondary,
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            {busy ? "Oluşturuluyor…" : paymentConfigured ? "Ödemeye geç" : "Sipariş oluştur"}
          </button>

          {openOrders.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 500, color: c.textSecondary, margin: "0 0 8px" }}>
                Bekleyen siparişlerin
              </h3>
              <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, overflow: "hidden", background: c.surface }}>
                {openOrders.map((o, i) => (
                  <div
                    key={o.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      borderTop: i === 0 ? "none" : `1px solid ${c.border}`,
                      fontSize: 14,
                    }}
                  >
                    <span style={{ flex: 1, color: c.textPrimary }}>
                      {o.credits.toLocaleString("tr-TR")} kredi
                      <span style={{ color: c.textSecondary }}> · {formatTry(o.priceAmount)}</span>
                      <span style={{ display: "block", fontSize: 12.5, color: c.textSecondary }}>
                        {STATUS_LABEL[o.status]} · {new Date(o.createdAt).toLocaleDateString("tr-TR")}
                      </span>
                    </span>
                    <button
                      onClick={() => cancel(o.id)}
                      style={{
                        background: "transparent",
                        border: `1px solid ${c.border}`,
                        borderRadius: 8,
                        padding: "5px 10px",
                        color: c.textSecondary,
                        fontSize: 13,
                      }}
                    >
                      İptal
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Yüklenmiş siparişler hareket listesinde zaten görünüyor; burada yalnızca
              yeni yüklenen bir siparişin karşılığını görmek için kısa bir onay. */}
          {orders.some((o) => o.status === "paid" && o.creditedAt) && (
            <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: c.textSecondary, marginTop: 12 }}>
              <IconCheck size={13} color={c.success} />
              Tamamlanan yüklemelerin aşağıdaki hareketler listesinde.
            </p>
          )}
        </>
      )}
    </section>
  );
}
