import { NextResponse, type NextRequest } from "next/server";

/** Edge bundle'ı küçük tutmak için sözlükler burada import edilmez. */
const locales = ["tr", "en"] as const;
const defaultLocale = "tr";

const PUBLIC_FILE = /\.(.*)$/;

/** Dil öneki olmayan istekleri tarayıcı diline göre /tr veya /en'e yönlendirir. */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/manifest.webmanifest" ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const hasLocale = locales.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );
  if (hasLocale) return NextResponse.next();

  const accept = request.headers.get("accept-language") ?? "";
  const preferred = accept.toLowerCase().startsWith("tr") ? "tr" : accept.includes("tr") ? "tr" : "en";
  const locale = accept ? preferred : defaultLocale;

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
