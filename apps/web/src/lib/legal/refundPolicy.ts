/**
 * İptal ve İade Koşulları — Türkçe ve İngilizce.
 *
 * Mesafeli Satış Sözleşmesi'nin (distanceSales.ts) cayma hakkı bölümü bu
 * metne atıf yapıyor: koşullar TEK yerde yazılı olsun diye ayrıntı orada
 * tekrarlanmıyor.
 *
 * Aynı metin tanıtım sitesinde de yayımlanıyor (landing/, src/i18n/legal.ts,
 * `refund` anahtarı). Birini değiştirirsen diğerini de güncelle.
 */
import type { LegalDoc } from "./legalDoc";

export const refundDoc: LegalDoc = {
  path: "/refund",
  text: {
    tr: {
      title: "İptal ve İade Koşulları",
      lede: "Aboneliğinizi ve Lio Bakiyesi alımlarınızı hangi koşullarda iptal edip iade alabileceğiniz.",
      effective: "12 Ağustos 2026",
    },
    en: {
      title: "Cancellation and Refund Policy",
      lede: "When you can cancel your subscription or Lio Units purchases and get a refund.",
      effective: "12 August 2026",
    },
  },
  sections: {
    tr: [
      {
        h: "1. Ücretsiz deneme",
        p: [
          "14 günlük deneme süresinde kart bilgisi alınmaz ve otomatik ücretlendirme yapılmaz. Süre sonunda paket seçmezseniz hesabınız ücretsiz Başlangıç paketine düşer.",
        ],
      },
      {
        h: "2. Abonelik iptali",
        p: [
          "Aboneliğinizi panelden tek tıkla iptal edebilirsiniz. İptal, bir sonraki yenilemeyi durdurur; ödemesi yapılmış dönem sonuna kadar hizmeti kullanmaya devam edersiniz.",
        ],
      },
      {
        h: "3. Abonelik iadesi",
        p: [
          "Yeni bir aboneliğin ilk 14 günü içinde, hizmeti önemli ölçüde kullanmadıysanız (ör. veri girişi ve kullanıcı davetleri sınırlıysa) tam iade talep edebilirsiniz.",
          "Yıllık aboneliklerde, ilk 14 gün geçtikten sonra kalan aylar için orantılı iade talebi değerlendirilir; kullanılan aylar tam ay olarak hesaplanır.",
        ],
      },
      {
        h: "4. Lio Bakiyesi iadesi",
        p: [
          "Satın alınan Lio Bakiyesinin hiç kullanılmamış olması şartıyla, satın alma tarihinden itibaren 14 gün içinde iade edilir. Kısmen kullanılmış paketlerde kalan birim oranında iade değerlendirilir.",
          "Hediye (bonus) birimler iade hesabına dâhil edilmez.",
        ],
      },
      {
        h: "5. İade süreci",
        p: [
          "İade talebinizi info@projelio.app adresine, sipariş numarasıyla birlikte iletin. Talep 3 iş günü içinde değerlendirilir; onaylanan iadeler ödemenin yapıldığı yönteme, bankaya bağlı olarak 5–14 iş günü içinde yansır.",
        ],
      },
      {
        h: "6. İstisnalar",
        p: [
          "Kullanım koşullarının ihlali nedeniyle kapatılan hesaplar, kurumsal özel geliştirme bedelleri ve tamamlanmış eğitim/danışmanlık hizmetleri iade kapsamı dışındadır.",
        ],
      },
    ],
    en: [
      {
        h: "1. Free trial",
        p: [
          "No card details are taken during the 14-day trial and nothing is charged automatically. If you don't choose a plan, your account drops to the free Starter plan.",
        ],
      },
      {
        h: "2. Cancelling a subscription",
        p: [
          "You can cancel from the panel in one click. Cancellation stops the next renewal; you keep using the service until the end of the paid period.",
        ],
      },
      {
        h: "3. Subscription refunds",
        p: [
          "Within the first 14 days of a new subscription you may request a full refund if the service has not been used substantially (for example, limited data entry and user invitations).",
          "For annual subscriptions after the first 14 days, a pro-rata refund for remaining months may be considered; used months are counted as full months.",
        ],
      },
      {
        h: "4. Lio Units refunds",
        p: [
          "Purchased Lio Units are refunded within 14 days of purchase provided they are entirely unused. For partially used packs, a refund proportional to the remaining balance may be considered.",
          "Bonus Lio Units are excluded from refund calculations.",
        ],
      },
      {
        h: "5. Refund process",
        p: [
          "Send your request with the order number to info@projelio.app. Requests are reviewed within 3 business days; approved refunds appear on the original payment method within 5–14 business days depending on your bank.",
        ],
      },
      {
        h: "6. Exceptions",
        p: [
          "Accounts closed for breach of the Terms, custom enterprise development fees, and completed training or consultancy services are outside the scope of refunds.",
        ],
      },
    ],
  },
};
