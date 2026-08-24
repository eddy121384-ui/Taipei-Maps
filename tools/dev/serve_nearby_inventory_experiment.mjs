import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const repoRoot=path.resolve(__dirname,'../..');
const publicRoot=path.join(repoRoot,'public');
const port=Number(process.argv[2]||5173);
const host='127.0.0.1';
const startPath='/nearby-inventory-experiment.html';

const SECTION_IDS={中正:1,大同:2,中山:3,松山:4,大安:5,萬華:6,信義:7,士林:8,北投:9,內湖:10,南港:11,文山:12};
const contentTypes=new Map([
  ['.html','text/html; charset=utf-8'],['.js','text/javascript; charset=utf-8'],['.mjs','text/javascript; charset=utf-8'],
  ['.json','application/json; charset=utf-8'],['.geojson','application/geo+json; charset=utf-8'],['.css','text/css; charset=utf-8'],
  ['.png','image/png'],['.jpg','image/jpeg'],['.jpeg','image/jpeg'],['.svg','image/svg+xml'],['.ico','image/x-icon'],['.pmtiles','application/octet-stream'],
]);

const deviceId=randomUUID().replaceAll('-','');
const listCache=new Map();
const detailCache=new Map();
const LIST_TTL=5*60*1000;
const DETAIL_TTL=30*60*1000;
const MAX_PAGES=2;
const PAGE_SIZE=30;
const DETAIL_CONCURRENCY=4;

function cacheGet(map,key,ttl){const row=map.get(key);if(!row)return null;if(Date.now()-row.at>ttl){map.delete(key);return null;}return row.value;}
function cacheSet(map,key,value){map.set(key,{at:Date.now(),value});return value;}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

function headers591(){return {
  'user-agent':'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
  'device':'touch','deviceid':deviceId,'origin':'https://m.591.com.tw','referer':'https://m.591.com.tw/',
  'cookie':`T591_TOKEN=${deviceId}`,'accept':'application/json, text/plain, */*','accept-language':'zh-TW,zh;q=0.9,en;q=0.7',
};}

async function fetchJson(url,{timeoutMs=15000}={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{headers:headers591(),signal:controller.signal});
    const text=await response.text();
    if(!response.ok)throw new Error(`591 HTTP ${response.status}${text?` · ${text.slice(0,120)}`:''}`);
    try{return JSON.parse(text);}catch{throw new Error('591 回傳不是 JSON');}
  }finally{clearTimeout(timer);}
}

async function search591(sectionId,keyword=''){
  const key=`${sectionId}|${keyword}`;const cached=cacheGet(listCache,key,LIST_TTL);if(cached)return {...cached,cache:true};
  const all=[];let totalRows=null,pagesFetched=0;
  for(let page=0;page<MAX_PAGES;page++){
    const params=new URLSearchParams({type:'sale',version:'2017',regionid:'1',sectionidStr:String(sectionId),firstRow:String(page*PAGE_SIZE),newPageSize:String(PAGE_SIZE),device:'touch',device_id:deviceId,timestamp:String(Date.now())});
    if(keyword)params.set('keywords',keyword);
    const payload=await fetchJson(`https://bff-house.591.com.tw/v1/touch/sale/list?${params}`);
    pagesFetched++;
    if(totalRows==null&&Number.isFinite(Number(payload?.totalRows)))totalRows=Number(payload.totalRows);
    const rawItems=Array.isArray(payload?.data)?payload.data:[];
    const items=rawItems.filter(item=>item&&item.post_id!=null);
    all.push(...items);
    if(rawItems.length<PAGE_SIZE)break;
    await sleep(120);
  }
  const seen=new Set();const rows=all.filter(item=>{const id=String(item.post_id);if(seen.has(id))return false;seen.add(id);return true;});
  return {...cacheSet(listCache,key,{rows,totalRows,pages:pagesFetched}),cache:false};
}

async function detail591(postId){
  const id=String(postId).replace(/^S/i,'');const cached=cacheGet(detailCache,id,DETAIL_TTL);if(cached)return cached;
  const params=new URLSearchParams({id:`S${id}`,device:'touch',device_id:deviceId});
  const payload=await fetchJson(`https://bff-house.591.com.tw/v1/touch/sale/detail?${params}`);
  const d=payload?.data;if(!d||typeof d!=='object')return cacheSet(detailCache,id,null);
  const lat=Number(d.lat),lng=Number(d.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return cacheSet(detailCache,id,null);
  return cacheSet(detailCache,id,{id,lat,lng,title:String(d.title||''),price:String(d.price||''),unitPrice:String(d.unitprice||''),area:String(d.area||''),layout:String(d.layout||''),floor:String(d.floor||''),age:String(d.age||''),section:String(d.section||''),street:String(d.street||''),community:String(d.casesname||''),shape:String(d.shape||''),kind:String(d.kind||'')});
}

function haversineMeters(aLat,aLng,bLat,bLng){const R=6371008.8,toRad=v=>v*Math.PI/180;const dLat=toRad(bLat-aLat),dLng=toRad(bLng-aLng);const x=Math.sin(dLat/2)**2+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function normalizeSearchItem(item){const id=String(item.post_id||'').replace(/^S/i,'');return {id,title:String(item.title||''),price:String(item.price||''),area:String(item.area_str||''),layout:String(item.layout_str||''),unitPrice:String(item.area_price||''),section:String(item.section||''),region:String(item.region||''),address:String(item.community_addr||''),photo:String(item.photo_src||item.photo||'')};}

async function mapLimit(items,limit,fn){const out=new Array(items.length);let cursor=0;async function worker(){while(true){const index=cursor++;if(index>=items.length)return;try{out[index]=await fn(items[index],index);}catch(error){out[index]={error};}await sleep(80);}}await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out;}

async function nearby591({lat,lng,radius,district,keyword}){
  const sectionId=SECTION_IDS[district];if(!sectionId)throw new Error(`目前研究版只支援台北 12 區；無法解析 ${district||'此位置'}`);
  const search=await search591(sectionId,keyword);
  const candidates=search.rows.map(normalizeSearchItem);
  const detailed=await mapLimit(candidates,DETAIL_CONCURRENCY,async candidate=>({candidate,detail:await detail591(candidate.id)}));
  const listings=[];let geolocated=0,detailErrors=0;
  for(const row of detailed){
    if(row?.error){detailErrors++;continue;}const {candidate,detail}=row||{};if(!detail)continue;geolocated++;
    const distance=Math.round(haversineMeters(lat,lng,detail.lat,detail.lng));if(distance>radius)continue;
    listings.push({source:'591',id:detail.id,title:detail.title||candidate.title,price:detail.price||candidate.price,unitPrice:detail.unitPrice||candidate.unitPrice,area:detail.area||candidate.area,layout:detail.layout||candidate.layout,floor:detail.floor,age:detail.age,section:detail.section||candidate.section,street:detail.street,address:candidate.address,community:detail.community,lat:detail.lat,lng:detail.lng,distance_m:distance,photo:candidate.photo,url:`https://sale.591.com.tw/home/house/detail/2/${detail.id}.html`});
  }
  listings.sort((a,b)=>a.distance_m-b.distance_m||Number(String(a.price).replace(/[^\d.]/g,''))-Number(String(b.price).replace(/[^\d.]/g,'')));
  return {provider:'591',district,sectionId,keyword:keyword||null,radius_m:radius,candidate_count:candidates.length,geolocated_count:geolocated,detail_error_count:detailErrors,total_rows:search.totalRows,list_pages:search.pages,cache_hit:search.cache,listings,coverage:'research-sample',coverage_note:`研究版只掃描 591 ${district}區${keyword?`、關鍵字「${keyword}」`:''}前 ${candidates.length} 筆搜尋候選，再用 detail 座標做半徑過濾；不是完整房源全集。`};
}

function json(res,status,payload){const body=JSON.stringify(payload);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(body)});res.end(body);}

function safePublicPath(requestUrl){const pathname=decodeURIComponent(new URL(requestUrl,`http://${host}:${port}`).pathname);const relative=pathname==='/'?startPath.slice(1):pathname.replace(/^\/+/, '');const resolved=path.resolve(publicRoot,relative);if(resolved!==publicRoot&&!resolved.startsWith(publicRoot+path.sep))return null;return resolved;}
function parseRange(rangeHeader,size){const match=/^bytes=(\d*)-(\d*)$/i.exec(rangeHeader||'');if(!match)return null;let start,end;if(match[1]===''&&match[2]!==''){const suffix=Number(match[2]);if(!Number.isFinite(suffix)||suffix<=0)return null;start=Math.max(0,size-suffix);end=size-1;}else{start=Number(match[1]);end=match[2]===''?size-1:Number(match[2]);}if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||start>=size)return null;return {start,end:Math.min(end,size-1)};}

const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/',`http://${host}:${port}`);
    if(url.pathname==='/api/nearby-listings'){
      if(req.method!=='GET'){json(res,405,{error:'GET only'});return;}
      const lat=Number(url.searchParams.get('lat')),lng=Number(url.searchParams.get('lng')),radius=Number(url.searchParams.get('radius')||500);
      const district=String(url.searchParams.get('district')||'').replace(/區$/,'').trim();const keyword=String(url.searchParams.get('keyword')||'').trim().slice(0,40);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<24||lat>26||lng<120||lng>122){json(res,400,{error:'Invalid Taiwan lat/lng'});return;}
      if(!Number.isFinite(radius)||radius<100||radius>2000){json(res,400,{error:'radius must be 100..2000m'});return;}
      console.log(`[591] nearby ${district} ${keyword||'-'} @ ${lat.toFixed(5)},${lng.toFixed(5)} r=${radius}m`);
      try{const result=await nearby591({lat,lng,radius,district,keyword});console.log(`[591] candidates=${result.candidate_count} geolocated=${result.geolocated_count} within=${result.listings.length} cache=${result.cache_hit}`);json(res,200,result);}catch(error){console.error('[591] request failed:',error?.message||error);json(res,502,{error:String(error?.message||error),provider:'591',blocked:false,note:'研究版不做 CAPTCHA / Cloudflare 繞過。若 591 改版或阻擋，這裡會直接失敗。'});}return;
    }

    const filePath=safePublicPath(req.url||'/');if(!filePath){res.writeHead(403,{'Content-Type':'text/plain; charset=utf-8'});res.end('Forbidden');return;}
    let target=filePath;let info=await stat(target);if(info.isDirectory()){target=path.join(target,'index.html');info=await stat(target);}
    const contentType=contentTypes.get(path.extname(target).toLowerCase())||'application/octet-stream';const common={'Content-Type':contentType,'Cache-Control':'no-store','Accept-Ranges':'bytes'};
    const range=parseRange(req.headers.range,info.size);if(req.headers.range&&!range){res.writeHead(416,{...common,'Content-Range':`bytes */${info.size}`});res.end();return;}
    if(range){const length=range.end-range.start+1;res.writeHead(206,{...common,'Content-Range':`bytes ${range.start}-${range.end}/${info.size}`,'Content-Length':length});if(req.method==='HEAD'){res.end();return;}createReadStream(target,{start:range.start,end:range.end}).pipe(res);return;}
    res.writeHead(200,{...common,'Content-Length':info.size});if(req.method==='HEAD'){res.end();return;}createReadStream(target).pipe(res);
  }catch(error){const code=error?.code==='ENOENT'?404:500;res.writeHead(code,{'Content-Type':'text/plain; charset=utf-8'});res.end(code===404?'Not found':`Server error: ${error?.message||error}`);}
});

server.listen(port,host,()=>{const url=`http://${host}:${port}${startPath}`;console.log(`Taipei-Maps nearby inventory research server: ${url}`);console.log('591 mode: mobile public BFF, low-frequency + cache, no anti-bot bypass');console.log('Press Ctrl+C to stop.');if(process.platform==='win32')spawn('cmd',['/c','start','',url],{detached:true,stdio:'ignore'}).unref();});
server.on('error',error=>{console.error(`[ERROR] Local server failed: ${error?.message||error}`);process.exitCode=1;});
