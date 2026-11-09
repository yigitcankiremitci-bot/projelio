import Misafir from "@/components/Misafir";
import { getDict, type Locale } from "@/i18n";
import { dilliAdres, path, site } from "@/lib/site";

/**
 * Ana sayfa = uygulama. Giren kişi tanıtım okumaz, doğrudan işini yazmaya başlar
 * (bkz. components/Misafir.tsx, kurallar lib/misafir.ts).
 *
 * Alttaki yasal bağlantılar süs değil: Google OAuth doğrulaması ve ödeme
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
        { href: path(locale, "pricing"), label: dict.nav.pricing },
        { href: path(locale, "faq"), label: dict.nav.faq },
        { href: path(locale, "contact"), label: dict.nav.contact },
        { href: path(locale, "legal/privacy"), label: dict.legal.privacy.title },
        { href: path(locale, "legal/terms"), label: dict.legal.terms.title },
        { href: path(locale, "legal/kvkk"), label: dict.legal.kvkk.title },
      ]}
      digerDil={locale === "tr" ? { href: "/en", label: "English" } : { href: "/tr", label: "Türkçe" }}
    />
  );
}
