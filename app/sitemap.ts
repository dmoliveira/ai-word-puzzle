import type { MetadataRoute } from "next";
import { createSiteConfig } from "@/lib/site-config";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = createSiteConfig(process.env);

  return [{
    url: site.canonicalUrl,
    changeFrequency: "daily",
    priority: 1,
  }];
}
