/**
 * Mesafeli Satış Sözleşmesi — Türkçe ve İngilizce.
 *
 * NEDEN UYGULAMADA DA VAR: satın alma tanıtım sitesinde değil PANELDE
 * yapılıyor (Ayarlar > Abonelik, Lio kredileri). Mesafeli Sözleşmeler
 * Yönetmeliği ön bilgilendirmenin ödemeden ÖNCE ve erişilebilir olmasını
 * istiyor; metni yalnızca projelio.app'te tutmak bu koşulu karşılamıyordu.
 *
 * Aynı metin tanıtım sitesinde de yayımlanıyor (landing/, src/i18n/legal.ts,
 * `distance` anahtarı). Birini değiştirirsen diğerini de güncelle; iki yerde
 * farklı yasal metin yayımlamak hukuki risktir.
 */
import type { LegalDoc } from "./legalDoc";

export const distanceDoc: LegalDoc = {
  path: "/distance",
  text: {
    tr: {
      title: "Mesafeli Satış Sözleşmesi",
      lede: "Online abonelik ve Lio Bakiyesi satın alımlarında geçerli sözleşme metni.",
      effective: "12 Ağustos 2026",
    },
    en: {
      title: "Distance Sales Agreement",
      lede: "The agreement that applies to online subscription and Lio Units purchases.",
      effective: "12 August 2026",
    },
  },
  sections: {
    tr: [
      {
        h: "1. Taraflar",
        p: [
          "SATICI: Yiğitcan Kiremitci (şahıs işletmesi), Küçükbakkalköy Mah. Dereboyu Cad. R5 Blok No: 3A İç Kapı No: 48, Ataşehir/İstanbul, Türkiye · Kozyatağı VD 25750888104 · info@projelio.app.",
          "ALICI: Projelio hizmetine abone olan veya Lio Bakiyesi satın alan gerçek ya da tüzel kişi.",
        ],
      },
      {
        h: "2. Sözleşmenin konusu",
        p: [
          "Bu sözleşme, ALICI'nın elektronik ortamda satın aldığı dijital abonelik ve Lio Bakiyesinin sunulmasına ilişkin, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri uyarınca tarafların hak ve yükümlülüklerini düzenler.",
        ],
      },
      {
        h: "3. Hizmet ve bedel",
        p: [
          "Satın alınan paketin adı, süresi ve KDV dahil toplam bedeli sipariş özetinde ve fatura üzerinde gösterilir. Ödeme, kredi/banka kartı veya havale/EFT ile peşin olarak yapılır.",
        ],
      },
      {
        h: "4. İfa ve teslim",
        p: [
          "Hizmet dijital olarak, ödemenin onaylanmasının ardından derhal ALICI'nın hesabına tanımlanır. Fiziki teslimat söz konusu değildir.",
        ],
      },
      {
        h: "5. Cayma hakkı",
        p: [
          "Mesafeli Sözleşmeler Yönetmeliği m.15/1-ğ uyarınca, elektronik ortamda anında ifa edilen ve tüketiciye anında teslim edilen gayrimaddi mallarda cayma hakkı bulunmamaktadır.",
          "Buna rağmen SATICI, ticari politikası gereği, hiç kullanılmamış abonelik ve Lio Bakiyesi alımları için satın alma tarihinden itibaren 14 gün içinde iade imkânı tanır. Detaylar İptal ve İade Koşulları sayfasındadır.",
        ],
      },
      {
        h: "6. Uyuşmazlıklar",
        p: [
          "ALICI, şikâyet ve itirazları için Ticaret Bakanlığı'nca ilan edilen parasal sınırlar dâhilinde ikametgâhının bulunduğu yerdeki Tüketici Hakem Heyetine veya Tüketici Mahkemesine başvurabilir.",
        ],
      },
    ],
    en: [
      {
        h: "1. Parties",
        p: [
          "SELLER: Yiğitcan Kiremitci (sole proprietorship), Küçükbakkalköy Mah. Dereboyu Cad. R5 Blok No: 3A, Interior Door No: 48, Ataşehir/İstanbul, Türkiye · Kozyatağı Tax Office, tax/ID no 25750888104 · info@projelio.app.",
          "BUYER: the natural or legal person subscribing to Projelio or purchasing Lio Units.",
        ],
      },
      {
        h: "2. Subject",
        p: [
          "This agreement governs the rights and obligations of the parties regarding digital subscriptions and Lio Units purchased electronically, under Turkish Consumer Protection Law no. 6502 and the Distance Contracts Regulation.",
        ],
      },
      {
        h: "3. Service and price",
        p: [
          "The name, period and total price including VAT of the purchased plan are shown in the order summary and on the invoice. Payment is made in advance by card or bank transfer.",
        ],
      },
      {
        h: "4. Delivery",
        p: [
          "The service is digital and is activated on the BUYER's account immediately after payment approval. There is no physical delivery.",
        ],
      },
      {
        h: "5. Right of withdrawal",
        p: [
          "Under art. 15/1-ğ of the Distance Contracts Regulation, there is no right of withdrawal for intangible goods performed instantly in electronic form.",
          "Nevertheless, as a matter of commercial policy the SELLER offers a refund for entirely unused subscriptions and Lio Units within 14 days of purchase. See the Cancellation and Refund page.",
        ],
      },
      {
        h: "6. Disputes",
        p: [
          "The BUYER may apply to the Consumer Arbitration Committee or Consumer Court at their place of residence, within the monetary limits announced by the Ministry of Trade.",
        ],
      },
    ],
  },
};
