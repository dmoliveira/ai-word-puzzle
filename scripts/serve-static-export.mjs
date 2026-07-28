import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const outputDir = resolve(process.env.EXPORT_DIR ?? "out");
const basePath = (process.env.EXPORT_BASE_PATH ?? process.env.EXPECTED_BASE_PATH ?? "").trim();
const port = Number(process.env.EXPORT_PORT ?? 3201);

if (basePath && (!basePath.startsWith("/") || basePath.endsWith("/"))) {
  throw new Error("EXPORT_BASE_PATH must be empty or a leading-slash path without a trailing slash.");
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

function resolveRequest(pathname) {
  if (basePath && pathname !== basePath && !pathname.startsWith(`${basePath}/`)) {
    return null;
  }
  const stripped = basePath ? pathname.slice(basePath.length) : pathname;
  const relativePath = decodeURIComponent(stripped).replace(/^\/+/, "");
  const candidate = resolve(outputDir, relativePath || "index.html");
  if (candidate !== outputDir && !candidate.startsWith(`${outputDir}${sep}`)) {
    return null;
  }
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  const directoryIndex = resolve(candidate, "index.html");
  return existsSync(directoryIndex) ? directoryIndex : null;
}

const server = createServer((request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    if (basePath && url.pathname === basePath) {
      response.writeHead(308, { location: `${basePath}/` });
      response.end();
      return;
    }
    const pathname = resolveRequest(url.pathname);
    if (!pathname) {
      const fallback = resolve(outputDir, "404.html");
      response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      createReadStream(fallback).pipe(response);
      return;
    }
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": contentTypes[extname(pathname)] ?? "application/octet-stream",
    });
    createReadStream(pathname).pipe(response);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Static export available at http://127.0.0.1:${port}${basePath}/`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
