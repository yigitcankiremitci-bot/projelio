/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: { formats: ["image/avif", "image/webp"] },
  // Ana sayfa artık çalışan bir uygulama: başka bir site onu görünmez çerçeveye
  // alıp ziyaretçiye "Sil" düğmesine bastıramasın.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
  // /credits -> /lio-units: "kredi" terimi ödeme kuruluşunca reddedildi;
  // eski bağlantılar ve arama motoru kayıtları kırılmasın.
  async redirects() {
    return [
      { source: "/:lang(tr|en)/credits", destination: "/:lang/lio-units", permanent: true },
      { source: "/credits", destination: "/lio-units", permanent: true },
      // Eski arayüz uygulamada yaşıyor, projelio.app ise tanıtım sitesi. Geçici:
      // yeni tasarım oturunca kalkacak, tarayıcılar kalıcı diye önbelleğe almasın.
      {
        source: "/uiv1/:path*",
        destination: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.projelio.app"}/uiv1/:path*`,
        permanent: false,
      },
    ];
  },
};
export default nextConfig;
