import Misafir from "@/components/Misafir";
import { getDict, type Locale } from "@/i18n";
import { dilliAdres, path, site } from "@/lib/site";

/**
 * Ana sayfa = uygulama. Giren kişi tanıtım okumaz, doğrudan işini yazmaya başlar
 * (bkz. components/Misafir.tsx, kurallar lib/misafir.ts).
 *
 * Alttaki yasal bağlantılar süs değil (gizlilik bu yüzden yazıyla duruyor): Google OAuth doğrulaması ve ödeme
 * kuruluşu ana sayfada gizlilik politikasını arıyor, kaldırılırsa inceleme düşer.
 */
export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = lang as Locale;
  const dict = getDict(lang);

  return (
    <Misafir
      dict={dict.misafir}
      locale={locale}
      girisHref={dilliAdres(`${site.appUrl}/login`, locale)}
      kayitHref={dilliAdres(`${site.appUrl}/register`, locale)}
      altBaglantilar={[
        { href: path(locale, "pricing"), label: dict.nav.pricing, ikon: "fiyat" },
        { href: path(locale, "faq"), label: dict.nav.faq, ikon: "sss" },
        { href: path(locale, "contact"), label: dict.nav.contact, ikon: "iletisim" },
        { href: path(locale, "legal/terms"), label: dict.legal.terms.title, ikon: "sartlar" },
        { href: path(locale, "legal/kvkk"), label: dict.legal.kvkk.title, ikon: "kvkk" },
        { href: path(locale, "legal/privacy"), label: dict.legal.privacy.title },
      ]}
      digerDil={locale === "tr" ? { href: "/en", label: "English" } : { href: "/tr", label: "Türkçe" }}
    />
  );
}
