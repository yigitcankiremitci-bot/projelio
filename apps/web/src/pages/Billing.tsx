import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { BillingOverview, BillingPlanView, Subscription } from "@projelio/shared";
import { billingApi } from "../api/billing";
import { ApiError } from "../api/client";
import { IconSparkle, IconStar } from "../components/icons";
import { demoHesap } from "../lib/demoHesap";
import { useT } from "../lib/i18n";
import { useCurrentUser } from "../lib/useCurrentUser";
import { useThemeColors } from "../theme/useThemeColors";

/**
 * Paket (abonelik) ekranı.
 *
 * FİYAT SUNUCUDAN GELİR. Burada hiçbir tutar sabit yazılmıyor: vitrin fiyatı
 * USD olarak katalogdan, tahsil edilecek tutar sağlayıcıdaki plandan geliyor
 * (bkz. backend billing.plans.ts / billing_plan_refs). İstemciye gömülen bir
 * fiyat, sunucudaki gerçek tutarla ayrışır ve kullanıcıya yanlış tutar gösterir.
 */

/** Ödeme dönüşünde çağırmak üzere jetonu saklarız (bkz. odemeDonusu). */
const JETON_ANAHTARI = "projelio.billing.token";

const DURUM_METINLERI: Record<Subscription["status"], string> = {
  pending: "Ödeme bekleniyor", // dil:anahtar
  trialing: "Deneme sürümü", // dil:anahtar
  active: "Etkin", // dil:anahtar
  past_due: "Ödeme alınamadı", // dil:anahtar
  canceled: "İptal edildi", // dil:anahtar
  expired: "Süresi doldu", // dil:anahtar
};

export default function BillingPage() {
  const c = useThemeColors();
  const t = useT();
  const [params, setParams] = useSearchParams();
  const { user: me } = useCurrentUser();
  const demoHesabi = me?.email?.toLowerCase() === demoHesap.email;

  const [veri, setVeri] = useState<BillingOverview | null>(null);
  /**
   * Tanıtım sitesinden gelen seçim (?plan=pro&period=yearly).
   * Dönem otomatik ayarlanır ve o kart vurgulanır; ödeme formu KENDİLİĞİNDEN
   * AÇILMAZ — kullanıcı ne satın aldığını bir kez daha görüp onaylasın.
   */
  const istenenPlan = params.get("plan");
  const [donem, setDonem] = useState<"monthly" | "yearly">(
    params.get("period") === "yearly" ? "yearly" : "monthly"
  );
  const [yukleniyor, setYukleniyor] = useState(true);
  const [islemde, setIslemde] = useState<string | null>(null);
  const [mesaj, setMesaj] = useState<{ tur: "iyi" | "kotu"; metin: string } | null>(null);
  const formKabi = useRef<HTMLDivElement | null>(null);

  const yenile = useCallback((signal?: AbortSignal) => {
    return billingApi
      .overview(signal)
      .then(setVeri)
      .catch(() => {})
      .finally(() => setYukleniyor(false));
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    yenile(ac.signal);
    return () => ac.abort();
  }, [yenile]);

  /**
   * Ödeme dönüşü. Sunucu tarafı callback'i zaten işledi; buradaki iş sonucu
   * göstermek ve — işlenmemişse — jetonla bir kez daha denemek.
   *
   * NEDEN İKİNCİ DENEME: tarayıcı callback'i ile iyzico'nun webhook'u arasında
   * bir yarış var ve ikisi de gecikebiliyor. Doğrulama ucu iki kez çağrılmaya
   * dayanıklı (dönem başına tek kredi), o yüzden denemenin maliyeti yok.
   */
  useEffect(() => {
    const durum = params.get("durum");
    if (!durum) return;

    const jeton = sessionStorage.getItem(JETON_ANAHTARI);
    if (durum === "basarili") {
      setMesaj({ tur: "iyi", metin: t("Paketin etkinleşti. Ayın kredisi hesabına yüklendi.") });
      sessionStorage.removeItem(JETON_ANAHTARI);
      void yenile();
    } else if (jeton) {
      billingApi
        .confirm(jeton)
        .then((abonelik) => {
          sessionStorage.removeItem(JETON_ANAHTARI);
          setMesaj(
            abonelik
              ? { tur: "iyi", metin: t("Paketin etkinleşti.") }
              : { tur: "kotu", metin: t("Ödeme henüz onaylanmadı. Birkaç dakika içinde tekrar bak.") }
          );
          void yenile();
        })
        .catch(() => setMesaj({ tur: "kotu", metin: t("Ödeme sonucu doğrulanamadı. Destekle iletişime geç.") }));
    } else {
      setMesaj({ tur: "kotu", metin: t("Ödeme tamamlanmadı.") });
    }

    params.delete("durum");
    setParams(params, { replace: true });
  }, [params, setParams, t, yenile]);

  /**
   * iyzico'nun ödeme formunu sayfaya basar.
   *
   * innerHTML ile eklenen <script> etiketleri TARAYICI TARAFINDAN ÇALIŞTIRILMAZ
   * (HTML5 kuralı); bu yüzden her script yeniden oluşturuluyor. Bu desen yalnızca
   * BURADA geçerli: içerik kendi sunucumuzun iyzico'dan alıp aktardığı yanıt.
   */
  const odemeFormunuAc = (html: string) => {
    const kap = formKabi.current;
    if (!kap) return;
    kap.innerHTML = html;
    kap.querySelectorAll("script").forEach((eski) => {
      const yeni = document.createElement("script");
      for (const nitelik of Array.from(eski.attributes)) yeni.setAttribute(nitelik.name, nitelik.value);
      yeni.text = eski.text;
      eski.replaceWith(yeni);
    });
  };

  const satinAl = async (plan: BillingPlanView) => {
    setMesaj(null);
    setIslemde(plan.key);
    try {
      const sonuc = await billingApi.checkout({ planKey: plan.key, period: donem });
      sessionStorage.setItem(JETON_ANAHTARI, sonuc.token);
      odemeFormunuAc(sonuc.checkoutFormContent);
    } catch (hata) {
      setMesaj({ tur: "kotu", metin: hata instanceof ApiError ? hata.message : t("Ödeme başlatılamadı.") });
    } finally {
      setIslemde(null);
    }
  };

  const iptalEt = async (abonelik: Subscription) => {
    if (!window.confirm(t("Paketin dönem sonuna kadar açık kalacak, sonra ücretsiz plana düşeceksin. İptal edilsin mi?"))) {
      return;
    }
    setIslemde("iptal");
    try {
      await billingApi.cancel(abonelik.id);
      setMesaj({ tur: "iyi", metin: t("Paketin iptal edildi. Dönem sonuna kadar kullanmaya devam edebilirsin.") });
      await yenile();
    } catch (hata) {
      setMesaj({ tur: "kotu", metin: hata instanceof ApiError ? hata.message : t("İptal edilemedi.") });
    } finally {
      setIslemde(null);
    }
  };

  const kartGuncelle = async (abonelik: Subscription) => {
    setIslemde("kart");
    try {
      const sonuc = await billingApi.cardUpdate(abonelik.id);
      odemeFormunuAc(sonuc.checkoutFormContent);
    } catch (hata) {
      setMesaj({ tur: "kotu", metin: hata instanceof ApiError ? hata.message : t("Kart güncelleme açılamadı.") });
    } finally {
      setIslemde(null);
    }
  };

  const abonelik = veri?.subscription ?? null;
  const aktifPlan = veri?.plans.find((p) => p.key === abonelik?.planKey);
  /*
    İptal edilmiş abonelik yeni paket almayı ENGELLEMEZ: dönem sonuna kadar
    kullanmaya devam ederken fikrini değiştirip geri dönebilmeli (sunucu tarafı
    da aynı kuralı uyguluyor, bkz. billing.service.ts YURURLUKTE).
  */
  const yururlukte = abonelik !== null && ["trialing", "active", "past_due"].includes(abonelik.status);

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: "0 0 6px" }}>{t("Paketim")}</h1>
      <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 22px", maxWidth: 620, lineHeight: 1.6 }}>
        {t("Paketindeki krediler her ay yenilenir. Yıllık ödemede iki ay bedava; krediler yine her ay yüklenir.")}
      </p>

      {mesaj && (
        <div
          style={{
            maxWidth: 620,
            marginBottom: 20,
            padding: "12px 14px",
            borderRadius: 10,
            fontSize: 14,
            lineHeight: 1.5,
            color: c.textPrimary,
            background: mesaj.tur === "iyi" ? "rgba(62,72,88,0.08)" : "rgba(192,129,63,0.10)",
            border: `1px solid ${mesaj.tur === "iyi" ? c.border : c.warning}`,
          }}
        >
          {mesaj.metin}
        </div>
      )}

      {demoHesabi && (
        <Uyari c={c}>{t("Demo hesabında paket satın alınamaz. Kendi hesabını açarsan paketler açılır.")}</Uyari>
      )}

      {veri && !veri.paymentConfigured && (
        <Uyari c={c}>{t("Ödeme sistemi henüz açılmadı. Paketler yakında satın alınabilir olacak.")}</Uyari>
      )}

      {veri?.testMode && (
        <Uyari c={c}>{t("Ödeme sistemi test modunda çalışıyor; gerçek tahsilat yapılmaz.")}</Uyari>
      )}

      {/* Mevcut abonelik */}
      {abonelik && (
        <div
          style={{
            maxWidth: 620,
            background: c.primaryDark,
            borderRadius: 14,
            padding: 22,
            color: "#fff",
            marginBottom: 26,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9, opacity: 0.8, fontSize: 13 }}>
            <IconSparkle size={16} color={c.accent} />
            {t("Mevcut paketin")}
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, margin: "8px 0 2px", letterSpacing: -0.5 }}>
            {aktifPlan?.name ?? abonelik.planKey}
          </div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            {t(DURUM_METINLERI[abonelik.status])}
            {abonelik.currentPeriodEnd &&
              ` · ${new Date(abonelik.currentPeriodEnd).toLocaleDateString("tr-TR")} ${
                abonelik.cancelAtPeriodEnd ? t("tarihinde sona erecek") : t("tarihinde yenilenecek")
              }`}
          </div>

          {abonelik.status === "past_due" && (
            <div style={{ fontSize: 13, marginTop: 12, opacity: 0.9, lineHeight: 1.5 }}>
              {t("Son ödeme alınamadı. Erişimin dönem sonuna kadar sürüyor; kartını güncellersen kesinti olmaz.")}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            {abonelik.source === "iyzico" && !abonelik.cancelAtPeriodEnd && (
              <>
                <button onClick={() => kartGuncelle(abonelik)} disabled={islemde !== null} style={koyuDugme(c)}>
                  {islemde === "kart" ? t("Açılıyor…") : t("Kartı güncelle")}
                </button>
                <button onClick={() => iptalEt(abonelik)} disabled={islemde !== null} style={koyuDugme(c, true)}>
                  {islemde === "iptal" ? t("İptal ediliyor…") : t("Paketi iptal et")}
                </button>
              </>
            )}
            {abonelik.source !== "iyzico" && (
              <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
                {abonelik.source === "app_store"
                  ? t("Bu paket App Store üzerinden alınmış; değişiklikler Ayarlar > Abonelikler'den yapılır.")
                  : abonelik.source === "play_store"
                    ? t("Bu paket Google Play üzerinden alınmış; değişiklikler Play Store > Abonelikler'den yapılır.")
                    : t("Bu paket elle tanımlanmış; değişiklik için destekle iletişime geç.")}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dönem seçici */}
      <div style={{ display: "inline-flex", background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 3, marginBottom: 18 }}>
        {(["monthly", "yearly"] as const).map((secenek) => (
          <button
            key={secenek}
            onClick={() => setDonem(secenek)}
            style={{
              border: "none",
              cursor: "pointer",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 14,
              background: donem === secenek ? c.primaryDark : "transparent",
              color: donem === secenek ? "#fff" : c.textSecondary,
            }}
          >
            {secenek === "monthly" ? t("Aylık") : t("Yıllık — 2 ay bedava")}
          </button>
        ))}
      </div>

      {yukleniyor ? (
        <div style={{ color: c.textSecondary, fontSize: 14 }}>{t("Yükleniyor…")}</div>
      ) : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", maxWidth: 900 }}>
          {(veri?.plans ?? [])
            .filter((plan) => plan.key !== "free")
            .map((plan) => {
              const tahsilat = donem === "monthly" ? plan.charge.monthly : plan.charge.yearly;
              const usd = donem === "monthly" ? plan.priceUsd.monthly : plan.priceUsd.yearly;
              const bu = yururlukte && abonelik?.planKey === plan.key;
              const satinAlinabilir = Boolean(tahsilat) && veri?.paymentConfigured && !demoHesabi && !yururlukte;

              return (
                <div
                  key={plan.key}
                  style={{
                    background: c.surface,
                    border: `1px solid ${plan.key === istenenPlan || plan.featured ? c.accent : c.border}`,
                    boxShadow: plan.key === istenenPlan ? `0 0 0 2px ${c.accent}33` : undefined,
                    borderRadius: 14,
                    padding: 20,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 17, fontWeight: 600, color: c.textPrimary }}>{plan.name}</span>
                    {plan.featured && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: c.accent }}>
                        <IconStar size={13} color={c.accent} filled /> {t("Popüler")}
                      </span>
                    )}
                  </div>

                  <div style={{ margin: "12px 0 2px", fontSize: 30, fontWeight: 600, color: c.textPrimary, letterSpacing: -0.5 }}>
                    ${usd.toFixed(2)}
                    <span style={{ fontSize: 14, fontWeight: 400, color: c.textSecondary }}>
                      {donem === "monthly" ? t(" / ay") : t(" / yıl")}
                    </span>
                  </div>

                  {/*
                    Tahsilat tutarı AYRI gösteriliyor: vitrin $ ama kart ₺ ile
                    çekiliyor. Kullanıcının ekstresinde göreceği rakam bu.
                  */}
                  <div style={{ fontSize: 13, color: c.textSecondary, minHeight: 20 }}>
                    {tahsilat
                      ? t("Kartından {tutar} çekilir").replace(
                          "{tutar}",
                          `${tahsilat.amount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${tahsilat.currency === "TRY" ? "₺" : tahsilat.currency}`
                        )
                      : t("Bu dönem şu an satın alınamıyor")}
                  </div>

                  <div style={{ marginTop: 14, fontSize: 14, color: c.textPrimary, fontWeight: 500 }}>
                    {plan.monthlyCredits.toLocaleString("tr-TR")} {t("kredi / ay")}
                  </div>

                  <ul style={{ margin: "12px 0 18px", padding: "0 0 0 18px", color: c.textSecondary, fontSize: 13.5, lineHeight: 1.75 }}>
                    {plan.features.map((ozellik) => (
                      <li key={ozellik}>{t(ozellik)}</li>
                    ))}
                  </ul>

                  <button
                    onClick={() => satinAl(plan)}
                    disabled={!satinAlinabilir || islemde !== null}
                    style={{
                      marginTop: "auto",
                      border: "none",
                      borderRadius: 10,
                      padding: "11px 14px",
                      fontSize: 15,
                      cursor: satinAlinabilir ? "pointer" : "default",
                      background: satinAlinabilir ? c.primaryDark : c.border,
                      color: satinAlinabilir ? "#fff" : c.textSecondary,
                    }}
                  >
                    {bu ? t("Mevcut paketin") : islemde === plan.key ? t("Açılıyor…") : t("Bu paketi seç")}
                  </button>
                </div>
              );
            })}
        </div>
      )}

      {/* iyzico ödeme formu buraya basılır (kendi açılır penceresini kurar). */}
      <div ref={formKabi} />
    </div>
  );
}

function Uyari({ c, children }: { c: ReturnType<typeof useThemeColors>; children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: 620,
        marginBottom: 20,
        padding: "12px 14px",
        borderRadius: 10,
        background: "rgba(192,129,63,0.10)",
        border: `1px solid ${c.accent}`,
        color: c.textPrimary,
        fontSize: 14,
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

function koyuDugme(c: ReturnType<typeof useThemeColors>, ikincil = false): React.CSSProperties {
  return {
    border: `1px solid ${ikincil ? "rgba(255,255,255,0.35)" : "transparent"}`,
    borderRadius: 9,
    padding: "9px 14px",
    fontSize: 14,
    cursor: "pointer",
    background: ikincil ? "transparent" : c.accent,
    color: "#fff",
  };
}
