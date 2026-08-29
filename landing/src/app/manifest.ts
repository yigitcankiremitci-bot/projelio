import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Projelio",
    short_name: "Projelio",
    description: "Proje, görev, bütçe ve müşteri yönetimi — Lio ile WhatsApp'tan.",
    start_url: "/tr",
    display: "standalone",
    background_color: "#fbfaf8",
    theme_color: "#3e4858",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
