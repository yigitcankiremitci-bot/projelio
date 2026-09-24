import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Department, DepartmentMember, ShopifyOzeti } from "@projelio/shared";
import { api } from "../api/client";
import { shopifyApi } from "../api/shopify";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { useCurrentUser } from "../lib/useCurrentUser";
import ConfirmDialog from "./ConfirmDialog";

/**
 * "Shopify mağazası" — şirket ayarlarının içinde.
 *
 * NEDEN BURADA: mağaza bağlamak şirketin kasasını ilgilendiren bir karar
 * (ödemeler gelir olarak düşecek), o yüzden yalnızca kurucunun gördüğü
 * ayarlarda. Sunucu kurucu olmayana 403 döner; kart o zaman hiç görünmez.
 * Sunucuda anahtarlar yoksa da görünmez — basılınca hata veren bir düğme
 * göstermektense hiç göstermemek.
 *
 * Shopify'dan dönüşte adres çubuğunda `?shopify=connected:<mağaza>` ya da
 * `?shopify=error:<mesaj>` olur; sonuç burada gösterilip parametre silinir.
 */
export default function ShopifySection({ organizationId }: { organizationId: string }) {
  const c = useThemeColors();
  const t = useT();
  const { user } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [ozet, setOzet] = useState<ShopifyOzeti | null>(null);
  const [magaza, setMagaza] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bilgi, setBilgi] = useState("");
  const [ekip, setEkip] = useState<{ id: string; ad: string }[]>([]);
  const [kaldirilacak, setKaldirilacak] = useState<string | null>(null);

  const load = useCallback(async () => {
    setOzet(await shopifyApi.ozet(organizationId).catch(() => null));
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Shopify'dan dönüşün sonucu — bir kez gösterilir, adres temizlenir.
  useEffect(() => {
    const sonuc = searchParams.get("shopify");
    if (!sonuc) return;
    if (sonuc.startsWith("connected:")) {
      setBilgi(t("Mağaza bağlandı. Yeni siparişler birkaç dakika içinde Müşteriler ekranına düşmeye başlar."));
    } else if (sonuc.startsWith("error:")) {
      setError(`${t("Shopify bağlantısı tamamlanamadı.")} ${t(sonuc.slice("error:".length))}`);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("shopify");
    setSearchParams(next, { replace: true });
  }, []);

  // Sorumlu seçenekleri: şirketin departman kadroları. Şirket düzeyinde tek
  // bir "ekip" ucu yok; departman sayısı küçük olduğu için tek tek okunuyor.
  useEffect(() => {
    if (!ozet?.magazalar.length) return;
    let iptal = false;
    (async () => {
      const m = new Map<string, string>();
      if (user) m.set(user.id, user.fullName || user.email || t("Ben"));
      const depts = await api.get<Department[]>(`/organizations/${organizationId}/departments`).catch(() => []);
      const listeler = await Promise.all(
        depts.map((d) => api.get<DepartmentMember[]>(`/departments/${d.id}/members`).catch(() => []))
      );
      for (const x of listeler.flat() as any[]) {
        if (x.userId && (x.status ?? "approved") === "approved" && !m.has(x.userId)) {
          m.set(x.userId, x.fullName ?? x.username ?? x.email ?? t("İsimsiz"));
        }
      }
      if (!iptal) setEkip(Array.from(m.entries()).map(([id, ad]) => ({ id, ad })));
    })();
    return () => {
      iptal = true;
    };
  }, [ozet?.magazalar.length, organizationId, user?.id]);

  const handleConnect = async () => {
    setBusy(true);
    setError("");
    try {
      const { url } = await shopifyApi.baglan(organizationId, magaza);
      window.location.href = url;
    } catch (e: any) {
      setError(e?.message ?? t("Mağaza bağlanamadı."));
      setBusy(false);
    }
  };

  const handleSorumlu = async (magazaId: string, sorumluId: string) => {
    setError("");
    try {
      await shopifyApi.sorumluAta(magazaId, sorumluId || null);
      await load();
    } catch (e: any) {
      setError(e?.message ?? t("Kaydedilemedi."));
    }
  };

  const handleRemove = async () => {
    if (!kaldirilacak) return;
    try {
      await shopifyApi.kaldir(kaldirilacak);
      setKaldirilacak(null);
      setBilgi("");
      await load();
    } catch (e: any) {
      setError(e?.message ?? t("Bağlantı kaldırılamadı."));
      setKaldirilacak(null);
    }
  };

  if (!ozet || (!ozet.yapilandirildi && ozet.magazalar.length === 0)) return null;

  return (
    <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${c.border}` }}>
      <div style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, marginBottom: 4 }}>{t("Shopify mağazası")}</div>
      <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>
        {t(
          "Mağazanızdaki siparişler Müşteriler ekranına, ödenen tutarlar kasaya gelir olarak kendiliğinden düşer. Müşteri e-postası zaten kayıtlıysa yeni kart açılmaz, siparişi mevcut karta eklenir."
        )}
      </p>

      {ozet.magazalar.map((m) => (
        <div
          key={m.id}
          style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: 12, marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>{m.magazaAdi || m.shopDomain}</div>
              <div style={{ fontSize: 13, color: c.textSecondary, overflowWrap: "anywhere" }}>
                {m.shopDomain}
                {m.paraBirimi ? ` · ${m.paraBirimi}` : ""}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setKaldirilacak(m.id)}
              style={{ background: "none", border: "none", color: c.danger, fontSize: 14, cursor: "pointer", padding: 0 }}
            >
              {t("Bağlantıyı kaldır")}
            </button>
          </div>

          <div style={{ fontSize: 13, color: c.textSecondary }}>
            {m.sonOlayAt
              ? `${t("Son sipariş olayı")}: ${new Date(m.sonOlayAt).toLocaleString()}`
              : t("Henüz sipariş gelmedi.")}
          </div>

          <label style={{ fontSize: 13, color: c.textSecondary, display: "flex", flexDirection: "column", gap: 4 }}>
            {t("Yeni müşterilerin sorumlusu")}
            <select value={m.varsayilanSorumluId ?? ""} onChange={(e) => void handleSorumlu(m.id, e.target.value)} style={{ width: "100%" }}>
              <option value="">{t("Mağazayı bağlayan kişi")}</option>
              {ekip.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ad}
                </option>
              ))}
            </select>
          </label>

          {m.sonHata && (
            <p style={{ fontSize: 13, color: c.warning, margin: 0, lineHeight: 1.5, overflowWrap: "anywhere" }}>
              {t("Son hata")}: {t(m.sonHata)}
            </p>
          )}
        </div>
      ))}

      {ozet.yapilandirildi && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={magaza}
            onChange={(e) => setMagaza(e.target.value)}
            placeholder="magazam.myshopify.com"
            disabled={busy}
            style={{ flex: "1 1 200px", minWidth: 0 }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && magaza.trim()) {
                e.preventDefault();
                void handleConnect();
              }
            }}
          />
          <button
            type="button"
            disabled={busy || !magaza.trim()}
            onClick={() => void handleConnect()}
            style={{ background: c.primary, color: c.onPrimary, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 15, fontWeight: 500 }}
          >
            {busy ? t("Yönlendiriliyor…") : ozet.magazalar.length ? t("Başka mağaza bağla") : t("Mağaza bağla")}
          </button>
        </div>
      )}

      {bilgi && !error && <p style={{ fontSize: 14, color: c.success, margin: "8px 0 0", lineHeight: 1.5 }}>{bilgi}</p>}
      {error && <p style={{ fontSize: 14, color: c.danger, margin: "8px 0 0", lineHeight: 1.5 }}>{error}</p>}

      {kaldirilacak && (
        <ConfirmDialog
          title={t("Shopify bağlantısını kaldır")}
          message={t(
            "Uygulama mağazanızdan da kaldırılır ve yeni siparişler gelmez. Şimdiye kadar gelen siparişler, müşteri kartları ve kasadaki tahsilatlar yerinde kalır."
          )}
          confirmLabel={t("Kaldır")}
          danger
          onConfirm={handleRemove}
          onCancel={() => setKaldirilacak(null)}
        />
      )}
    </div>
  );
}
