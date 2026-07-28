import type { MetadataRoute } from "next";
import { createSiteConfig } from "@/lib/site-config";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  const site = createSiteConfig(process.env);

  return {
    id: site.runtimePath("/"),
    name: "Astra Lexa — Daily Crossword & Word Quest",
    short_name: "Astra Lexa",
    description: "Accessible daily crosswords, custom seeded puzzles, and trace word quests with browser-local progress.",
    start_url: site.runtimePath("/"),
    scope: site.runtimePath("/"),
    display: "standalone",
    background_color: "#020817",
    theme_color: "#020817",
    icons: [
      { src: site.runtimePath("/icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: site.runtimePath("/icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
  };
}
