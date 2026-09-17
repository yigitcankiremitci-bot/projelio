/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: { formats: ["image/avif", "image/webp"] },
  // /credits -> /lio-units: "kredi" terimi ödeme kuruluşunca reddedildi;
  // eski bağlantılar ve arama motoru kayıtları kırılmasın.
  async redirects() {
    return [
      { source: "/:lang(tr|en)/credits", destination: "/:lang/lio-units", permanent: true },
      { source: "/credits", destination: "/lio-units", permanent: true },
    ];
  },
};
export default nextConfig;
