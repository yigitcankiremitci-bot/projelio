import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Projelio",
    short_name: "Projelio",
    description: "Proje, görev, bütçe ve müşteri yönetimi — Lio ile WhatsApp'tan.",
    start_url: "/tr",
    display: "standalone",
    background_color: "#12151b",
    theme_color: "#12151b",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
