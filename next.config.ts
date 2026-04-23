import type { NextConfig } from "next";

const repoBasePath = "/ai-word-puzzle";
const isPagesBuild = process.env.GITHUB_ACTIONS === "true" || process.env.STATIC_EXPORT === "true";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  basePath: isPagesBuild ? repoBasePath : "",
  assetPrefix: isPagesBuild ? `${repoBasePath}/` : undefined,
};

export default nextConfig;
