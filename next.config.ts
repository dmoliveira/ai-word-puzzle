import type { NextConfig } from "next";
import { createSiteConfig } from "./lib/site-config";

const { basePath } = createSiteConfig(process.env);

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  basePath,
};

export default nextConfig;
