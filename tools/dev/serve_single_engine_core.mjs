import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const publicRoot = path.join(repoRoot, "public");
const port = Number(process.argv[2] || 5173);
const host = "127.0.0.1";
const requestedStartPath = process.argv[3] || "/maplibre-single-engine-core.html";
const startPath = requestedStartPath.startsWith("/") ? requestedStartPath : `/${requestedStartPath}`;

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".geojson", "application/geo+json; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".pmtiles", "application/octet-stream"],
]);

function safePublicPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${host}:${port}`).pathname);
  const relative = pathname === "/" ? startPath.slice(1) : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(publicRoot, relative);
  if (resolved !== publicRoot && !resolved.startsWith(publicRoot + path.sep)) return null;
  return resolved;
}

function parseRange(rangeHeader, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader || "");
  if (!match) return null;

  let start;
  let end;
  if (match[1] === "" && match[2] !== "") {
    const suffixLength = Number(match[2]);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Number(match[2]);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

const server = createServer(async (req, res) => {
  try {
    const filePath = safePublicPath(req.url || "/");
    if (!filePath) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    let target = filePath;
    let info = await stat(target);
    if (info.isDirectory()) {
      target = path.join(target, "index.html");
      info = await stat(target);
    }

    const contentType = contentTypes.get(path.extname(target).toLowerCase()) || "application/octet-stream";
    const commonHeaders = {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "Accept-Ranges": "bytes",
    };

    const range = parseRange(req.headers.range, info.size);
    if (req.headers.range && !range) {
      res.writeHead(416, { ...commonHeaders, "Content-Range": `bytes */${info.size}` });
      res.end();
      return;
    }

    if (range) {
      const length = range.end - range.start + 1;
      res.writeHead(206, {
        ...commonHeaders,
        "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
        "Content-Length": length,
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      createReadStream(target, { start: range.start, end: range.end }).pipe(res);
      return;
    }

    res.writeHead(200, { ...commonHeaders, "Content-Length": info.size });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(target).pipe(res);
  } catch (error) {
    const code = error?.code === "ENOENT" ? 404 : 500;
    res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(code === 404 ? "Not found" : `Server error: ${error?.message || error}`);
  }
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}${startPath}`;
  console.log(`Taipei-Maps local server: ${url}`);
  console.log("HTTP byte-range support: ON (PMTiles ready)");
  console.log("Press Ctrl+C to stop.");
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  }
});

server.on("error", (error) => {
  console.error(`[ERROR] Local server failed: ${error?.message || error}`);
  process.exitCode = 1;
});
