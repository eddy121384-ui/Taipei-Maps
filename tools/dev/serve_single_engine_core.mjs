import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { normalizeDoorplateAddress } from "../data/taipei_doorplate_core_v01.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const publicRoot = path.join(repoRoot, "public");
const doorplateIndexPath = path.join(publicRoot, "generated", "taipei-doorplate-index-v01.json");
const port = Number(process.argv[2] || 5173);
const host = "127.0.0.1";
const requestedStartPath = process.argv[3] || "/maplibre-single-engine-core.html";
const startPath = requestedStartPath.startsWith("/") ? requestedStartPath : `/${requestedStartPath}`;
let doorplateIndexPromise = null;

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
  const relative = pathname === "/" ? startPath.slice(1).split("?")[0] : pathname.replace(/^\/+/, "");
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

function sendJson(res,status,payload){
  const body=Buffer.from(JSON.stringify(payload));
  res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Content-Length":body.length});
  res.end(body);
}

async function loadDoorplateIndex(){
  if(!doorplateIndexPromise){
    doorplateIndexPromise=readFile(doorplateIndexPath,"utf8").then(text=>JSON.parse(text)).catch(error=>{doorplateIndexPromise=null;throw error});
  }
  return doorplateIndexPromise;
}

async function handleDoorplateLookup(url,res){
  const address=url.searchParams.get("address")||"";
  const key=normalizeDoorplateAddress(address);
  if(!key){sendJson(res,400,{ok:false,code:"invalid_address"});return true}
  try{
    const index=await loadDoorplateIndex();
    const hit=index?.entries?.[key];
    if(!hit){sendJson(res,404,{ok:false,code:"not_found",address,key,source:index?.source||null});return true}
    const [lon,lat,matchedAddress,coordinateBasis]=hit;
    sendJson(res,200,{ok:true,match:"exact",address,key,matched_address:matchedAddress,lon,lat,coordinate_basis:coordinateBasis,source:index?.source||null});
  }catch(error){
    if(error?.code==="ENOENT")sendJson(res,503,{ok:false,code:"doorplate_index_missing",message:"Run tools/data/build_taipei_doorplate_index_v01.mjs --if-missing first."});
    else sendJson(res,500,{ok:false,code:"doorplate_index_error",message:error?.message||String(error)});
  }
  return true;
}

const server = createServer(async (req, res) => {
  try {
    const url=new URL(req.url||"/",`http://${host}:${port}`);
    if(url.pathname==="/__buju/taipei-doorplate"){
      await handleDoorplateLookup(url,res);
      return;
    }

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
  console.log("Taipei official doorplate lookup: /__buju/taipei-doorplate");
  console.log("Press Ctrl+C to stop.");
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  }
});

server.on("error", (error) => {
  console.error(`[ERROR] Local server failed: ${error?.message || error}`);
  process.exitCode = 1;
});
