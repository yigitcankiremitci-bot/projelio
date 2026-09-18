import { useCallback, useEffect, useState } from "react";
import { tlFiyat, type Subscription } from "@projelio/shared";
import { billingApi, type BillingAdminPlanRef, type BillingAdminSettings } from "../api/billing";
import { ApiError } from "../api/client";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";

/**
 * Yönetici: sağlayıcıdaki paket karşılıkları.
 *
 * NEDEN BU EKRAN VAR: iyzico'da bir ödeme planı açtığında referans kodu ORADA
 * üretilir ve tahsilat tutarı o planda sabitlenir. Kod tarafı bu ikisini
 * bilemez. Ortam değişkeninde tutmak, her fiyat değişikliğini SSH + yeniden
 * başlatmaya çevirirdi (086'daki model ayarlarıyla aynı gerekçe).
 *
 * BURADAKİ TUTAR, İYZİCO PLANINDAKİYLE AYNI OLMAK ZORUNDA. Ayrışırsa
 * kullanıcıya bir tutar gösterip başka bir tutar çekmiş oluruz — bu yüzden
 * alanın yanında uyarı duruyor.
 */
const DONEMLER: Array<"monthly" | "yearly"> = ["monthly", "yearly"];

export default function BillingAdminPanel() {
  const c = useThemeColors();
  const t = useT();
  const [ayarlar, setAyarlar] = useState<BillingAdminSettings | null>(null);
  const [abonelikler, setAbonelikler] = useState<Subscription[]>([]);
  const [taslak, setTaslak] = useState<Record<string, { code: string; price: string }>>({});
  const [kur, setKur] = useState("");
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState<string | null>(null);
  const [saglayici, setSaglayici] = useState("iyzico");

  const yenile = useCallback(() => {
    billingApi.admin
      .settings()
      .then((veri) => {
        setAyarlar(veri);
        setKur(veri.usdTryRate ? String(veri.usdTryRate) : "");
        const yeni: Record<string, { code: string; price: string }> = {};
        for (const ref of veri.refs) {
          yeni[anahtar(ref.provider, ref.planKey, ref.period)] = {
            code: ref.referenceCode ?? "",
            price: ref.priceAmount === null ? "" : String(ref.priceAmount),
          };
        }
        setTaslak(yeni);
      })
      .catch(() => {});
    billingApi.admin
      .subscriptions()
      .then(setAbonelikler)
      .catch(() => {});
  }, []);

  useEffect(yenile, [yenile]);

  const kaydet = async (planKey: string, period: "monthly" | "yearly") => {
    const k = anahtar(saglayici, planKey, period);
    const deger = taslak[k] ?? { code: "", price: "" };
    setKaydediliyor(k);
    setMesaj(null);
    try {
      const sonuc = await billingApi.admin.savePlanRef({
        provider: saglayici,
        planKey,
        period,
        referenceCode: deger.code.trim() || null,
        priceAmount: deger.price.trim() === "" ? null : Number(deger.price),
        // Mağazalarda fiyatı mağaza belirler; tutar alanı yalnızca iyzico için anlamlı.
        currency: saglayici === "iyzico" ? "TRY" : "USD",
      });
      setMesaj(sonuc.ok ? t("Kaydedildi.") : (sonuc.error ?? t("Kaydedilemedi.")));
      yenile();
    } catch (hata) {
      setMesaj(hata instanceof ApiError ? hata.message : t("Kaydedilemedi."));
    } finally {
      setKaydediliyor(null);
    }
  };

  const kurKaydet = async () => {
    setKaydediliyor("kur");
    try {
      const sonuc = await billingApi.admin.saveUsdTry(kur.trim() === "" ? null : Number(kur));
      setMesaj(sonuc.ok ? t("Kur kaydedildi, TL tutarlar yeniden hesaplandı.") : (sonuc.error ?? t("Kaydedilemedi.")));
      // Sunucu tutarları yeniden yazdı; tablo onları göstersin.
      if (sonuc.ok) yenile();
    } catch {
      setMesaj(t("Kaydedilemedi."));
    } finally {
      setKaydediliyor(null);
    }
  };

  if (!ayarlar) return null;

  const etiket = { color: c.textSecondary, fontSize: 12.5 };
  const girdi: React.CSSProperties = {
    background: c.background,
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    color: c.textPrimary,
    padding: "7px 9px",
    fontSize: 13.5,
    width: "100%",
  };

  return (
    <div>
      <h2 style={{ color: c.textPrimary, fontSize: 18, fontWeight: 500, margin: "0 0 6px" }}>{t("Paketler ve ödeme")}</h2>
      <p style={{ color: c.textSecondary, fontSize: 14, margin: "0 0 16px", maxWidth: 640, lineHeight: 1.55 }}>
        {t(
          "Paketlerin sağlayıcıdaki karşılığı. TL tutarlar aşağıdaki kurdan hesaplanır; kur kaydedilince hepsi birlikte güncellenir ve bir sonraki ödemeden itibaren geçerli olur."
        )}
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {ayarlar.providers.map((p) => (
          <button
            key={p}
            onClick={() => setSaglayici(p)}
            style={{
              border: `1px solid ${saglayici === p ? c.accent : c.border}`,
              background: saglayici === p ? c.accent : "transparent",
              color: saglayici === p ? "#fff" : c.textSecondary,
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {mesaj && <div style={{ color: c.textPrimary, fontSize: 13.5, marginBottom: 12 }}>{mesaj}</div>}

      <div style={{ display: "grid", gap: 12 }}>
        {ayarlar.plans.map((plan) =>
          DONEMLER.map((period) => {
            const k = anahtar(saglayici, plan.key, period);
            const deger = taslak[k] ?? { code: "", price: "" };
            return (
              <div
                key={k}
                style={{
                  display: "grid",
                  gridTemplateColumns: "150px 1fr 130px 90px",
                  gap: 10,
                  alignItems: "center",
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                }}
              >
                <div>
                  <div style={{ color: c.textPrimary, fontSize: 14, fontWeight: 500 }}>{plan.name}</div>
                  <div style={etiket}>
                    {period === "monthly" ? t("Aylık") : t("Yıllık")} · $
                    {(period === "monthly" ? plan.priceUsd.monthly : plan.priceUsd.yearly).toFixed(2)}
                  </div>
                </div>

                <input
                  value={deger.code}
                  onChange={(e) => setTaslak({ ...taslak, [k]: { ...deger, code: e.target.value } })}
                  placeholder={saglayici === "iyzico" ? t("Ödeme planı referans kodu") : t("Mağaza ürün kimliği")}
                  style={girdi}
                />

                {/* TL tutar ELLE GİRİLMEZ: kur kaydedilince sunucu USD × kur'dan
                    hesaplayıp yazar. Kur kutusunda kaydedilmemiş bir değer varsa
                    yeni tutar önizleme olarak yanında görünür. */}
                <div>
                  <input
                    value={saglayici === "iyzico" && deger.price !== "" ? `${deger.price} ₺` : ""}
                    readOnly
                    placeholder={saglayici === "iyzico" ? t("Kurdan hesaplanır") : t("Mağaza belirler")}
                    style={{ ...girdi, opacity: 0.75 }}
                  />
                  {saglayici === "iyzico" &&
                    (() => {
                      const onizleme = tlFiyat(
                        period === "monthly" ? plan.priceUsd.monthly : plan.priceUsd.yearly,
                        Number(kur)
                      );
                      return onizleme !== null && String(onizleme) !== deger.price ? (
                        <div style={{ ...etiket, color: c.accentDark, marginTop: 3 }}>
                          {t("Kaydedince: {tutar} ₺", { tutar: onizleme.toLocaleString("tr-TR") })}
                        </div>
                      ) : null;
                    })()}
                </div>

                <button
                  onClick={() => kaydet(plan.key, period)}
                  disabled={kaydediliyor !== null}
                  style={{
                    border: "none",
                    borderRadius: 8,
                    background: c.primaryDark,
                    color: "#fff",
                    padding: "8px 10px",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {kaydediliyor === k ? "…" : t("Kaydet")}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={etiket}>{t("USD/TRY kuru — kaydedince TL tutarlar USD × kur ile hesaplanıp 10 ₺'ye yukarı yuvarlanır")}</span>
        <input value={kur} onChange={(e) => setKur(e.target.value)} style={{ ...girdi, width: 110 }} placeholder="—" />
        <button
          onClick={kurKaydet}
          disabled={kaydediliyor !== null}
          style={{ border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary, borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer" }}
        >
          {t("Kaydet")}
        </button>
      </div>

      {/*
        TCMB günlük kuru — "Bu kuru yaz" kur kutusunu doldurur, Kaydet'e
        basınca TL tutarlar ondan hesaplanır. Bankalar kendi marjını eklediği
        için gerçek kart kuru buradaki efektif satışın bir miktar üstündedir;
        10 ₺'ye yukarı yuvarlama o farkı büyük ölçüde karşılıyor.
        Bülten alınamazsa (hafta sonu, tatil, TCMB erişilemiyor) satır hiç
        görünmez — boş bir kur göstermek yanlış karar verdirirdi.
      */}
      {ayarlar?.tcmb && (
        <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={etiket}>
            {t("TCMB")} {ayarlar.tcmb.tarih}: {t("efektif satış")} {ayarlar.tcmb.banknoteSelling.toFixed(4)} ₺ ·{" "}
            {t("döviz satış")} {ayarlar.tcmb.forexSelling.toFixed(4)} ₺
          </span>
          <button
            onClick={() => setKur(String(ayarlar.tcmb!.banknoteSelling))}
            style={{ border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary, borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}
          >
            {t("Bu kuru yaz")}
          </button>
          {/*
            %5 eşiği: bunun altındaki oynama, fiyatı yukarı yuvarlarken zaten
            bırakılan pay içinde kalıyor. Üstüne çıkınca TL fiyat gerçekten
            geride kalmış demektir ve yeni bir ödeme planı açmak gerekir.
          */}
          {ayarlar.tcmb.sapma !== null && ayarlar.tcmb.sapma > 0.05 && (
            <span style={{ ...etiket, color: c.danger }}>
              {t("Kayıtlı kur güncelin %{oran} gerisinde — güncel kuru yazıp kaydet.").replace(
                "{oran}",
                String(Math.round(ayarlar.tcmb.sapma * 100))
              )}
            </span>
          )}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <h3 style={{ color: c.textPrimary, fontSize: 15, fontWeight: 500, margin: "0 0 8px" }}>
          {t("Abonelikler")} ({abonelikler.length})
        </h3>
        {abonelikler.length === 0 ? (
          <div style={{ ...etiket }}>{t("Henüz abonelik yok.")}</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {abonelikler.slice(0, 20).map((a) => (
              <div key={a.id} style={{ ...etiket, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span style={{ color: c.textPrimary }}>{a.planKey}</span>
                <span>{a.period}</span>
                <span>{a.status}</span>
                <span>{a.source}</span>
                <span>{a.currentPeriodEnd ? new Date(a.currentPeriodEnd).toLocaleDateString("tr-TR") : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function anahtar(provider: string, planKey: string, period: string): string {
  return `${provider}|${planKey}|${period}`;
}
