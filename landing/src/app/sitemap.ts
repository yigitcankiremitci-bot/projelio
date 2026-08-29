import type { MetadataRoute } from "next";
import { locales } from "@/i18n";
import { legalSlugs, site } from "@/lib/site";

const pages = ["", "pricing", "credits", "screenshots", "faq", "contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const lang of locales) {
    for (const page of pages) {
      entries.push({
        url: `${site.url}/${lang}${page ? `/${page}` : ""}`,
        lastModified: now,
        changeFrequency: page === "" ? "weekly" : "monthly",
        priority: page === "" ? 1 : 0.8,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [l, `${site.url}/${l}${page ? `/${page}` : ""}`]),
          ),
        },
      });
    }
    for (const slug of legalSlugs) {
      entries.push({
        url: `${site.url}/${lang}/legal/${slug}`,
        lastModified: now,
        changeFrequency: "yearly",
        priority: 0.3,
      });
    }
  }

  return entries;
}
