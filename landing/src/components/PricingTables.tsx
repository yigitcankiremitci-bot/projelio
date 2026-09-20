"use client";

import { useState } from "react";
import Link from "next/link";
import type { Dict, Locale } from "@/i18n";
import { checkoutHref, formatNumber, formatTRY, formatUSD, path } from "@/lib/site";
import { CheckSmall } from "./Icons";

type Plan = Dict["pricing"]["plans"][number];

/** Panelden gelen gerçek tutarlar (bkz. lib/plans.ts). */
export interface CanliFiyat {
  key: string;
  name?: string;
  /** Paketle her ay gelen Lio birimi (Lio Bakiyesi sayfasındaki öneri bunu kullanır). */
  monthlyCredits?: number;
  priceUsd: { monthly: number; yearly: number; yearlyMonthly?: number };
  charge: {
    monthly: { amount: number; currency: string } | null;
    yearly: { amount: number; currency: string } | null;
    yearlyMonthly: number | null;
  };
}

/**
 * Fiyat tabloları.
 *
 * FİYAT PANELDEN GELİR: `canli` dizisi doluysa tutarlar oradan okunur, boşsa
 * sözlükteki yedek kopya kullanılır (API kapalıyken site fiyatsız kalmasın).
 * Sözlükteki sayıya güvenip paneldekini yok saymak, sitede yazan fiyatla
 * çekilen tutarın ayrışması demekti.
 */
export default function PricingTables({
  dict,
  locale,
  canli = [],
}: {
  dict: Dict;
  locale: Locale;
  canli?: CanliFiyat[];
}) {
  // VARSAYILAN YILLIK: kullanıcı kararı (2026-09-18). Yıllıkta büyük rakam AYLIK
  // KARŞILIK olarak gösterilir, aylık fiyat üstü çizili yanında durur. Yıllık
  // toplam ve tahsil edilecek TL tutar altta AÇIKÇA yazar — ucuz görünüp gerçek
  // tutarı saklamak hem yanıltıcı hem de sanal POS denetiminde ret sebebi olurdu.
  const [yearly, setYearly] = useState(true);
  const donem = yearly ? "yearly" : "monthly";

  function aylikFiyat(plan: Plan): number {
    const eslesme = canli.find((c) => c.key === plan.key);
    return eslesme ? eslesme.priceUsd.monthly : plan.priceMonthly;
  }

  function yillikFiyat(plan: Plan): number {
    const eslesme = canli.find((c) => c.key === plan.key);
    return eslesme ? eslesme.priceUsd.yearly : plan.priceYearly;
  }

  /**
   * Gösterilen büyük rakam: aylıkta aylık fiyat, yıllıkta katalogdaki AYLIK
   * KARŞILIK (x,99). Yıllık / 12 hesaplanmıyor: 99,90 / 12 = 8,33 gibi
   * küsuratlar çıkıyordu; yıllık toplam zaten bu karşılıktan türetiliyor.
   */
  function gosterilen(plan: Plan): number {
    if (!yearly) return aylikFiyat(plan);
    const eslesme = canli.find((c) => c.key === plan.key);
    return eslesme?.priceUsd.yearlyMonthly ?? plan.priceYearlyMonthly;
  }

  /**
   * TAHSİLAT HER ZAMAN TL. Türkçe vitrinde büyük rakam da budur; dolar yalnızca
   * İngilizce sürümde, yurt dışından bakanlar fikir edinsin diye gösterilir ve
   * orada da "TL olarak tahsil edilir" notu düşülür.
   *
   * Sebebi yalnızca tercih değil: Türkiye'de yerleşik müşterilere dövizle
   * fiyatlama mevzuatça sınırlı (32 sayılı Karar / 2008-32/34 Tebliği) ve sanal
   * POS başvurusunda da soruldu. Kart her koşulda TL çekiliyor
   * (bkz. backend paytr.client.ts, para birimi sabit "TL").
   */
  function tahsilatTutari(plan: Plan): { amount: number; currency: string } | null {
    const eslesme = canli.find((c) => c.key === plan.key);
    return eslesme ? eslesme.charge[donem] : null;
  }

  function tahsilat(plan: Plan): string | null {
    const veri = tahsilatTutari(plan);
    if (!veri) return null;
    return veri.currency === "TRY" ? formatTRY(veri.amount, locale) : `${veri.amount} ${veri.currency}`;
  }

  /** Türkçe vitrindeki büyük rakam: aylıkta aylık TL, yıllıkta aylık karşılığın TL'si. */
  function buyukTl(plan: Plan): number | null {
    const eslesme = canli.find((c) => c.key === plan.key);
    if (!eslesme) return null;
    return yearly ? eslesme.charge.yearlyMonthly : (eslesme.charge.monthly?.amount ?? null);
  }

  return (
    <>
      <div className="stack center" style={{ alignItems: "center", gap: 18 }}>
        {/* Kaydırmalı anahtar: solda aylık, sağda yıllık. Etiketler de tıklanabilir. */}
        <div className="period-switch">
          <button type="button" className="period-label" data-active={!yearly} onClick={() => setYearly(false)}>
            {dict.common.monthly}
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={yearly}
            aria-label={dict.common.yearly}
            className="switch-track"
            data-on={yearly}
            onClick={() => setYearly(!yearly)}
          >
            <span className="switch-thumb" />
          </button>
          <button type="button" className="period-label" data-active={yearly} onClick={() => setYearly(true)}>
            {dict.common.yearly}
            <span className="save-badge">{dict.common.save}</span>
          </button>
        </div>
      </div>

      <div className="plans" style={{ marginTop: 34 }}>
        {dict.pricing.plans.map((plan) => {
          const cekilecek = tahsilat(plan);
          const buyuk = buyukTl(plan);
          // Türkçe vitrin ancak TL tutar gerçekten varsa TL'ye geçer.
          const trVitrin = locale !== "en" && buyuk !== null;
          const aylikTl = canli.find((c) => c.key === plan.key)?.charge.monthly?.amount ?? null;
          const yillikTl = tahsilat(plan);
          return (
            <div key={plan.key} className={plan.featured ? "plan plan-featured" : "plan"}>
              {plan.featured && <span className="plan-flag">{dict.common.mostPopular}</span>}
              <h3>{plan.name}</h3>
              <p className="plan-desc">{plan.desc}</p>

              <div className="price">
                {/*
                  Büyük rakam: Türkçede TL, İngilizcede USD. TL tutar API'den
                  gelmezse (kur tanımsız) dolara düşülür — sayfanın fiyatsız
                  kalması, referans bir rakam göstermekten kötü.
                */}
                {trVitrin ? (
                  <>
                    {yearly && aylikTl !== null && <s className="price-was">{formatTRY(aylikTl, locale)}</s>}
                    <span className="amount">{formatTRY(buyuk!, locale)}</span>
                  </>
                ) : (
                  <>
                    {yearly && <s className="price-was">{formatUSD(aylikFiyat(plan), locale)}</s>}
                    <span className="amount">{formatUSD(gosterilen(plan), locale)}</span>
                  </>
                )}
                <span className="per">{dict.common.perMonth}</span>
              </div>
              <div className="price-note">
                {trVitrin
                  ? yearly && yillikTl
                    ? dict.pricing.billedYearly.replace("{tutar}", yillikTl)
                    : plan.note
                  : `${yearly ? `${dict.pricing.billedYearly.replace("{tutar}", formatUSD(yillikFiyat(plan), locale))} · ` : ""}${
                      cekilecek
                        ? locale === "en"
                          ? `charged as ${cekilecek}`
                          : `${cekilecek} olarak tahsil edilir`
                        : plan.note
                    }`}
              </div>

              <div className="price-note" style={{ fontWeight: 600 }}>
                {formatNumber(plan.monthlyCredits, locale)} {dict.pricing.creditsLabel}
              </div>

              <ul>
                {plan.features.map((f) => (
                  <li key={f}>
                    <CheckSmall />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {/*
                Panele giden dış bağlantı: Next'in <Link>'i uygulama içi yollar
                için, bu adres başka bir alan adı.
              */}
              <a
                className={plan.featured ? "btn btn-primary btn-block" : "btn btn-ghost btn-block"}
                href={checkoutHref(plan.key, donem)}
              >
                {plan.cta}
              </a>
            </div>
          );
        })}
      </div>

      <p className="center small muted" style={{ marginTop: 22 }}>
        {dict.pricing.chargeNote} {dict.pricing.freeNote}
      </p>

      <div className="card center" style={{ marginTop: 26, padding: "24px 22px" }}>
        <h3 className="h3" style={{ marginBottom: 8 }}>
          {dict.pricing.enterprise.title}
        </h3>
        <p className="muted" style={{ marginBottom: 16 }}>
          {dict.pricing.enterprise.desc}
        </p>
        <Link className="btn btn-ghost" href={path(locale, "contact")}>
          {dict.pricing.enterprise.cta}
        </Link>
      </div>
    </>
  );
}
