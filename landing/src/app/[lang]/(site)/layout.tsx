import { getDict, isLocale, defaultLocale, type Locale } from "@/i18n";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsappLio from "@/components/WhatsappLio";
import NewsletterPopup from "@/components/NewsletterPopup";

/**
 * Fiyatlar, SSS, yasal metinler gibi okuma sayfalarının kabuğu.
 * Ana sayfa bunun DIŞINDA: orası doğrudan uygulama, üstüne menü ve açılır pencere binmez.
 */
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : defaultLocale;
  const dict = getDict(locale);

  return (
    <>
      <a className="skip-link" href="#main">
        {locale === "en" ? "Skip to content" : "İçeriğe geç"}
      </a>
      {/* İnce film greni: koyu düz yüzeylerin "dijital" görünmesini kırar. */}
      <div className="grain" aria-hidden="true" />
      <Header dict={dict} locale={locale} />
      <main id="main">{children}</main>
      <Footer dict={dict} locale={locale} />
      <WhatsappLio dict={dict} />
      <NewsletterPopup dict={dict} locale={locale} />
    </>
  );
}
