const defaultSiteUrl = "https://dmoliveira.github.io/ai-word-puzzle/";

type SiteEnvironment = Readonly<Record<string, string | undefined>>;

function hasDotSegment(pathname: string) {
  return pathname.split("/").some((segment) => {
    try {
      const decoded = decodeURIComponent(segment).toLowerCase();
      return decoded === "." || decoded === "..";
    } catch {
      return true;
    }
  });
}

function getRawPath(url: string) {
  const withoutScheme = url.replace(/^[a-z][a-z\d+.-]*:\/\//i, "");
  const slashIndex = withoutScheme.indexOf("/");
  return slashIndex === -1 ? "/" : withoutScheme.slice(slashIndex).split(/[?#]/, 1)[0] || "/";
}

function normalizeSiteUrl(rawValue: string) {
  const raw = rawValue.trim();
  const rawPath = getRawPath(raw);
  if (/\/\//.test(rawPath) || hasDotSegment(rawPath)) {
    throw new Error("SITE_URL must not contain duplicate slashes or dot segments.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("SITE_URL must be an absolute HTTP(S) URL.");
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("SITE_URL must be a credential-free HTTP(S) URL without a query or fragment.");
  }

  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return url;
}

function normalizeBasePath(rawValue = "") {
  const basePath = rawValue.trim();
  if (!basePath) {
    return "";
  }

  if (!basePath.startsWith("/") || basePath.endsWith("/") || /[?#\s]/.test(basePath) || /\/\//.test(basePath) || hasDotSegment(basePath)) {
    throw new Error("PAGES_BASE_PATH must be empty or a leading-slash path without a trailing slash, query, fragment, whitespace, duplicate slash, or dot segment.");
  }

  return basePath;
}

export function createSiteConfig(environment: SiteEnvironment = process.env) {
  const explicitSiteUrl = environment.SITE_URL?.trim() ?? "";
  const siteUrl = normalizeSiteUrl(explicitSiteUrl || defaultSiteUrl);
  const basePath = normalizeBasePath(environment.PAGES_BASE_PATH);
  const publicPath = siteUrl.pathname === "/" ? "" : siteUrl.pathname.replace(/\/$/, "");

  if (explicitSiteUrl && publicPath !== basePath) {
    throw new Error(`Explicit SITE_URL pathname (${publicPath || "/"}) must exactly match PAGES_BASE_PATH (${basePath || "/"}).`);
  }

  function runtimePath(pathname = "/") {
    if (!pathname.startsWith("/") || /[?#]/.test(pathname) || /\/\//.test(pathname) || hasDotSegment(pathname)) {
      throw new Error("Runtime paths must be leading-slash paths without a query, fragment, duplicate slash, or dot segment.");
    }
    return pathname === "/" ? `${basePath}/` || "/" : `${basePath}${pathname}`;
  }

  function publicUrl(pathname = "") {
    return new URL(pathname.replace(/^\//, ""), siteUrl);
  }

  return {
    basePath,
    siteUrl,
    canonicalUrl: siteUrl.toString(),
    runtimePath,
    publicUrl,
  };
}

export { defaultSiteUrl };
