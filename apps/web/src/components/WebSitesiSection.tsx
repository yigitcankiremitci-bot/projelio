import { useCallback, useEffect, useState } from "react";
import type { WebSitesiBaglantisi, WebSitesiOzeti } from "@projelio/shared";
import { webSitesiApi } from "../api/webSitesi";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import ConfirmDialog from "./ConfirmDialog";

/**
 * "Web sitesi" eklentisi — şirket ayarlarının içinde, Shopify kartının altında.
 *
 * Şirketin kendi (özel kodlu) sitesi Projelio'daki ürünleri anahtarla okur,
 * satışı bildirince stok burada düşer; ürün değişince Projelio siteye imzalı
 * bildirim gönderir. Sitenin geliştiricisi için belge: docs/web-sitesi-eklentisi.md.
 *
 * Kart yalnızca izinli hesaba (WEB_SITESI_EPOSTALARI) ve şirketi yönetebilene
 * görünür; değilse hiç çizilmez. Anahtar ve imza sırrı yalnızca açılışta bir
 * kez gösterilir (sır sonradan "göster" ile yeniden okunabilir, anahtar okunamaz).
 */

type Kopya = { anahtar?: string; webhookSiri?: string };

const ornekCurl = (apiKoku: string) => `curl ${apiKoku}/products \\
  -H "Authorization: Bearer psite_..."`;

export default function WebSitesiSection({ organizationId }: { organizationId: string }) {
  const c = useThemeColors();
  const t = useT();
  const [ozet, setOzet] = useState<WebSitesiOzeti | null>(null);
  const [ad, setAd] = useState("");
  const [siteAdresi, setSiteAdresi] = useState("");
  const [webhook, setWebhook] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bilgi, setBilgi] = useState("");
  const [sirlar, setSirlar] = useState<Kopya | null>(null);
  const [kaldirilacak, setKaldirilacak] = useState<string | null>(null);
  const [yenilenecek, setYenilenecek] = useState<string | null>(null);

  const load = useCallback(async () => {
    setOzet(await webSitesiApi.ozet(organizationId).catch(() => null));
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const calistir = async (is: () => Promise<void>, hataMetni: string) => {
    setBusy(true);
    setError("");
    setBilgi("");
    try {
      await is();
    } catch (e: any) {
      setError(e?.message ?? t(hataMetni));
    } finally {
      setBusy(false);
    }
  };

  const handleOlustur = () =>
    calistir(async () => {
      const r = await webSitesiApi.olustur(organizationId, {
        ad: ad.trim(),
        siteAdresi: siteAdresi.trim() || null,
        webhookAdresi: webhook.trim() || null,
      });
      setSirlar({ anahtar: r.anahtar, webhookSiri: r.webhookSiri });
      setAd("");
      setSiteAdresi("");
      setWebhook("");
      await load();
    }, "Bağlantı oluşturulamadı.");

  if (!ozet || !ozet.izinli) return null;

  const etiket = { fontSize: 13, color: c.textSecondary, display: "flex", flexDirection: "column" as const, gap: 4 };

  return (
    <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${c.border}` }}>
      <div style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, marginBottom: 4 }}>{t("Web sitesi")}</div>
      <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>
        {t(
          "Ürünleriniz kendi web sitenizde listelenir; sitede satış olunca stok burada da düşer. Bir ürünü değiştirdiğinizde site birkaç dakika içinde haberdar edilir. Kurulumu sitenizin geliştiricisi yapar."
        )}
      </p>

      {sirlar && (
        <SirKutusu
          sirlar={sirlar}
          apiKoku={ozet.apiKoku}
          onKapat={() => setSirlar(null)}
        />
      )}

      {ozet.baglantilar.map((b) => (
        <BaglantiKarti
          key={b.id}
          b={b}
          busy={busy}
          onGuncelle={(webhookAdresi) =>
            calistir(async () => {
              await webSitesiApi.guncelle(b.id, { webhookAdresi: webhookAdresi || null });
              setBilgi(t("Kaydedildi."));
              await load();
            }, "Kaydedilemedi.")
          }
          onDene={() =>
            calistir(async () => {
              const r = await webSitesiApi.dene(b.id);
              if (r.ok) setBilgi(t("Siteniz deneme bildirimini aldı."));
              else setError(`${t("Deneme bildirimi ulaşmadı.")} ${r.hata ?? ""}`);
              await load();
            }, "Deneme gönderilemedi.")
          }
          onYenidenGonder={() =>
            calistir(async () => {
              await webSitesiApi.yenidenGonder(b.id);
              setBilgi(t("Bütün ürünler sıraya alındı; birkaç dakika içinde siteye gönderilir."));
              await load();
            }, "Sıraya alınamadı.")
          }
          onSirGoster={() =>
            calistir(async () => {
              const r = await webSitesiApi.sirGoster(b.id);
              setSirlar({ webhookSiri: r.webhookSiri });
            }, "İmza sırrı okunamadı.")
          }
          onAnahtarYenile={() => setYenilenecek(b.id)}
          onKaldir={() => setKaldirilacak(b.id)}
        />
      ))}

      {ozet.baglantilar.length === 0 && !ozet.yapilandirildi && (
        <p style={{ fontSize: 14, color: c.warning, margin: 0 }}>{t("Web sitesi eklentisi bu sunucuda henüz açılmadı")}</p>
      )}

      {ozet.yapilandirildi && (
        <div style={{ border: `1px dashed ${c.border}`, borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary }}>
            {ozet.baglantilar.length ? t("Başka bir site bağla") : t("Sitenizi bağlayın")}
          </div>
          <label style={etiket}>
            {t("Ad")}
            <input value={ad} onChange={(e) => setAd(e.target.value)} placeholder={t("ör. Kurumsal site")} maxLength={80} disabled={busy} />
          </label>
          <label style={etiket}>
            {t("Site adresi (isteğe bağlı)")}
            <input value={siteAdresi} onChange={(e) => setSiteAdresi(e.target.value)} placeholder="https://magazam.com" disabled={busy} />
          </label>
          <label style={etiket}>
            {t("Bildirim (webhook) adresi — isteğe bağlı")}
            <input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://magazam.com/api/projelio" disabled={busy} />
            <span style={{ fontSize: 12 }}>
              {t("Boş bırakırsanız site ürünleri yalnızca kendisi okuyarak eşitler. Doluysa ürün değişince Projelio bu adrese haber verir.")}
            </span>
          </label>
          <div>
            <button
              type="button"
              disabled={busy || !ad.trim()}
              onClick={() => void handleOlustur()}
              style={{ background: c.primary, color: c.onPrimary, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 15, fontWeight: 500 }}
            >
              {t("Bağlantı oluştur")}
            </button>
          </div>
        </div>
      )}

      <details style={{ marginTop: 10 }}>
        <summary style={{ fontSize: 13, color: c.textSecondary, cursor: "pointer" }}>{t("Geliştirici için kısa bilgi")}</summary>
        <div style={{ fontSize: 13, color: c.textSecondary, lineHeight: 1.6, marginTop: 6 }}>
          <div>
            {t("API adresi")}: <code style={{ overflowWrap: "anywhere" }}>{ozet.apiKoku}</code>
          </div>
          <div>GET /products · GET /products/:sku · POST /stock-movements · GET /ping</div>
          <pre style={{ background: c.acilanAlan, padding: 8, borderRadius: 6, overflowX: "auto", margin: "6px 0 0", fontSize: 12 }}>
            {ornekCurl(ozet.apiKoku)}
          </pre>
          <div style={{ marginTop: 6 }}>
            {t("Anahtarı yalnızca sitenizin sunucusunda kullanın; tarayıcıya giden koda koymayın.")}
          </div>
        </div>
      </details>

      {bilgi && !error && <p style={{ fontSize: 14, color: c.success, margin: "8px 0 0", lineHeight: 1.5 }}>{bilgi}</p>}
      {error && <p style={{ fontSize: 14, color: c.danger, margin: "8px 0 0", lineHeight: 1.5, overflowWrap: "anywhere" }}>{error}</p>}

      {yenilenecek && (
        <ConfirmDialog
          title={t("Anahtarı yenile")}
          message={t("Eski anahtar hemen çalışmaz olur. Yeni anahtarı sitenize girene kadar site ürünleri okuyamaz ve stok bildiremez.")}
          confirmLabel={t("Anahtarı yenile")}
          danger
          onConfirm={() => {
            const id = yenilenecek;
            setYenilenecek(null);
            void calistir(async () => {
              const r = await webSitesiApi.anahtarYenile(id);
              setSirlar({ anahtar: r.anahtar });
              await load();
            }, "Anahtar yenilenemedi.");
          }}
          onCancel={() => setYenilenecek(null)}
        />
      )}

      {kaldirilacak && (
        <ConfirmDialog
          title={t("Web sitesi bağlantısını kaldır")}
          message={t("Anahtar çalışmaz olur ve siteye bildirim gitmez. Ürünleriniz ve stok geçmişi yerinde kalır.")}
          confirmLabel={t("Kaldır")}
          danger
          onConfirm={() => {
            const id = kaldirilacak;
            setKaldirilacak(null);
            void calistir(async () => {
              await webSitesiApi.kaldir(id);
              await load();
            }, "Bağlantı kaldırılamadı.");
          }}
          onCancel={() => setKaldirilacak(null)}
        />
      )}
    </div>
  );
}

function SirKutusu({ sirlar, apiKoku, onKapat }: { sirlar: Kopya; apiKoku: string; onKapat: () => void }) {
  const c = useThemeColors();
  const t = useT();
  const [kopyalandi, setKopyalandi] = useState("");
  const kopyala = async (deger: string, ad: string) => {
    try {
      await navigator.clipboard.writeText(deger);
      setKopyalandi(ad);
    } catch {
      setKopyalandi("");
    }
  };
  const satir = (baslik: string, deger: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 13, color: c.textSecondary }}>{baslik}</span>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <code style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", background: c.surface, border: `1px solid ${c.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 13 }}>
          {deger}
        </code>
        <button type="button" onClick={() => void kopyala(deger, baslik)} style={{ background: "none", border: `1px solid ${c.border}`, borderRadius: 6, padding: "6px 10px", fontSize: 13, color: c.textPrimary, cursor: "pointer" }}>
          {kopyalandi === baslik ? t("Kopyalandı") : t("Kopyala")}
        </button>
      </div>
    </div>
  );
  return (
    <div style={{ border: `1px solid ${c.accent}`, background: c.acilanAlan, borderRadius: 8, padding: 12, marginBottom: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      {sirlar.anahtar && (
        <p style={{ fontSize: 14, color: c.textPrimary, margin: 0, lineHeight: 1.5 }}>
          {t("Bu anahtarı şimdi kopyalayıp sitenizin geliştiricisine güvenli bir yoldan iletin. Bir daha gösterilmeyecek.")}
        </p>
      )}
      {satir(t("API adresi"), apiKoku)}
      {sirlar.anahtar && satir(t("API anahtarı"), sirlar.anahtar)}
      {sirlar.webhookSiri && satir(t("Bildirim imza sırrı"), sirlar.webhookSiri)}
      <div>
        <button type="button" onClick={onKapat} style={{ background: c.primary, color: c.onPrimary, border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 14 }}>
          {t("Kaydettim, kapat")}
        </button>
      </div>
    </div>
  );
}

function BaglantiKarti({
  b,
  busy,
  onGuncelle,
  onDene,
  onYenidenGonder,
  onSirGoster,
  onAnahtarYenile,
  onKaldir,
}: {
  b: WebSitesiBaglantisi;
  busy: boolean;
  onGuncelle: (webhookAdresi: string) => void;
  onDene: () => void;
  onYenidenGonder: () => void;
  onSirGoster: () => void;
  onAnahtarYenile: () => void;
  onKaldir: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [webhook, setWebhook] = useState(b.webhookAdresi ?? "");
  useEffect(() => setWebhook(b.webhookAdresi ?? ""), [b.webhookAdresi]);
  const zaman = (s: string | null) => (s ? new Date(s).toLocaleString() : t("henüz yok"));
  const kucuk = { fontSize: 13, color: c.textSecondary };
  const dugme = {
    background: "none",
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 14,
    color: c.textPrimary,
    cursor: "pointer",
  };

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: 12, marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>{b.ad}</div>
          <div style={{ ...kucuk, overflowWrap: "anywhere" }}>
            {b.siteAdresi ? (
              <a href={b.siteAdresi} target="_blank" rel="noreferrer" style={{ color: c.textSecondary }}>
                {b.siteAdresi}
              </a>
            ) : null}
            {b.siteAdresi ? " · " : ""}
            {t("Anahtar")}: <code>{b.anahtarOnEki}…</code>
          </div>
        </div>
        <button type="button" onClick={onKaldir} disabled={busy} style={{ background: "none", border: "none", color: c.danger, fontSize: 14, cursor: "pointer", padding: 0 }}>
          {t("Bağlantıyı kaldır")}
        </button>
      </div>

      <div style={kucuk}>
        {t("Sitenin son isteği")}: {zaman(b.sonIstekAt)} · {t("Son bildirim")}: {zaman(b.sonBildirimAt)}
        {b.bekleyenBildirim > 0 ? ` · ${t("Sırada")}: ${b.bekleyenBildirim}` : ""}
      </div>

      <label style={{ ...kucuk, display: "flex", flexDirection: "column", gap: 4 }}>
        {t("Bildirim (webhook) adresi")}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://magazam.com/api/projelio" disabled={busy} style={{ flex: "1 1 220px", minWidth: 0 }} />
          {webhook.trim() !== (b.webhookAdresi ?? "") && (
            <button type="button" disabled={busy} onClick={() => onGuncelle(webhook.trim())} style={dugme}>
              {t("Kaydet")}
            </button>
          )}
        </div>
      </label>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {b.webhookAdresi && (
          <>
            <button type="button" disabled={busy} onClick={onDene} style={dugme}>
              {t("Bağlantıyı dene")}
            </button>
            <button type="button" disabled={busy} onClick={onYenidenGonder} style={dugme}>
              {t("Tüm ürünleri yeniden gönder")}
            </button>
          </>
        )}
        <button type="button" disabled={busy} onClick={onSirGoster} style={dugme}>
          {t("İmza sırrını göster")}
        </button>
        <button type="button" disabled={busy} onClick={onAnahtarYenile} style={dugme}>
          {t("Anahtarı yenile")}
        </button>
      </div>

      {b.sonHata && (
        <p style={{ fontSize: 13, color: c.warning, margin: 0, lineHeight: 1.5, overflowWrap: "anywhere" }}>
          {t("Son hata")} ({zaman(b.sonHataAt)}): {t(b.sonHata)}
        </p>
      )}

      {b.sonHareketler.length > 0 && (
        <div>
          <div style={{ ...kucuk, marginBottom: 4 }}>{t("Siteden gelen son stok hareketleri")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {b.sonHareketler.map((h, i) => (
              <div key={i} style={{ fontSize: 13, color: c.textPrimary, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ color: h.tur === "iade" ? c.success : c.textPrimary }}>
                  {h.tur === "iade" ? "+" : "−"}
                  {h.miktar}
                </span>
                <span>{h.urunAdi}</span>
                <span style={{ color: c.textSecondary }}>
                  #{h.referans} · {t("Kalan")}: {h.sonrakiStok ?? "—"} · {new Date(h.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
