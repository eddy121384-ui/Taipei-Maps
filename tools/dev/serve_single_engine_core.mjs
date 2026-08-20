import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const publicRoot = path.join(repoRoot, "public");
const port = Number(process.argv[2] || 5173);
const host = "127.0.0.1";
const startPath = "/maplibre-single-engine-core.html";

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
]);

function safePublicPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${host}:${port}`).pathname);
  const relative = pathname === "/" ? startPath.slice(1) : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(publicRoot, relative);
  if (resolved !== publicRoot && !resolved.startsWith(publicRoot + path.sep)) return null;
  return resolved;
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
    const info = await stat(target);
    if (info.isDirectory()) target = path.join(target, "index.html");
    const body = await readFile(target);
    res.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(target).toLowerCase()) || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch (error) {
    const code = error?.code === "ENOENT" ? 404 : 500;
    res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(code === 404 ? "Not found" : `Server error: ${error?.message || error}`);
  }
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}${startPath}`;
  console.log(`Taipei-Maps single-engine core: ${url}`);
  console.log("Press Ctrl+C to stop.");
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  }
});

server.on("error", (error) => {
  console.error(`[ERROR] Local server failed: ${error?.message || error}`);
  process.exitCode = 1;
});
