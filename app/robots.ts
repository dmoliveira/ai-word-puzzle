import type { MetadataRoute } from "next";
import { createSiteConfig } from "@/lib/site-config";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const site = createSiteConfig(process.env);

  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: site.publicUrl("sitemap.xml").toString(),
  };
}
