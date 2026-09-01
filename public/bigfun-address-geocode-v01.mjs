const CACHE_KEY='buju.bigfun.address-geocode.v0.1';
const DEFAULT_ENDPOINT='https://nominatim.openstreetmap.org/search';
const MIN_INTERVAL_MS=1100;
const DEFAULT_MAX_REQUESTS=50;
const TAIPEI_BOUNDS={minLat:24.95,maxLat:25.22,minLon:121.35,maxLon:121.70};

const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export function normalizeTaipeiAddressForGeocode(address=''){
  return clean(address).replace(/^臺北市/,'台北市').replace(/\s+/g,'').replace(/(?:地下)?\d+樓(?:之\d+)?(?:.*)?$/,'').replace(/之\d+樓(?:.*)?$/,'');
}
export function isTaipeiCoordinate(lat,lon){const y=Number(lat),x=Number(lon);return Number.isFinite(y)&&Number.isFinite(x)&&y>=TAIPEI_BOUNDS.minLat&&y<=TAIPEI_BOUNDS.maxLat&&x>=TAIPEI_BOUNDS.minLon&&x<=TAIPEI_BOUNDS.maxLon}
function readCache(){if(typeof localStorage==='undefined')return {};try{const v=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}');return v&&typeof v==='object'?v:{}}catch{return {}}}
function writeCache(cache){if(typeof localStorage==='undefined')return;try{localStorage.setItem(CACHE_KEY,JSON.stringify(cache))}catch{}}
function configuredEndpoint(){if(typeof globalThis.BUJU_GEOCODER_ENDPOINT==='string'&&globalThis.BUJU_GEOCODER_ENDPOINT)return globalThis.BUJU_GEOCODER_ENDPOINT;if(typeof localStorage!=='undefined'){const saved=localStorage.getItem('buju.geocoder.endpoint');if(saved)return saved}return DEFAULT_ENDPOINT}

export async function geocodeBigFunHomes(homes=[],options={}){
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  if(typeof fetchImpl!=='function')return {homes:homes.map(h=>({...h})),attempted:0,located:0,failed:0,skipped:0,cache_hits:0};
  const onProgress=typeof options.onProgress==='function'?options.onProgress:()=>{};
  const maxRequests=Number.isFinite(Number(options.maxRequests))?Math.max(0,Number(options.maxRequests)):DEFAULT_MAX_REQUESTS;
  const endpoint=options.endpoint||configuredEndpoint();
  const cache=readCache(),out=homes.map(h=>({...h}));
  let attempted=0,networkRequests=0,located=0,failed=0,skipped=0,cacheHits=0,lastRequestAt=0;

  for(let i=0;i<out.length;i+=1){
    const home=out[i];if(finite(home.lat)&&finite(home.lon))continue;
    const query=normalizeTaipeiAddressForGeocode(home.address_text||home.street||'');if(!query||!/台北市.*區/.test(query))continue;
    attempted+=1;
    const cached=cache[query];
    if(cached&&isTaipeiCoordinate(cached.lat,cached.lon)){home.lat=Number(cached.lat);home.lon=Number(cached.lon);home.location_basis='address-geocode-osm';home.geocode_label=cached.display_name||null;cacheHits+=1;located+=1;onProgress({index:i+1,total:out.length,attempted,network_requests:networkRequests,located,failed,skipped,cache_hits:cacheHits,address:query,cached:true});continue}
    if(networkRequests>=maxRequests){skipped+=1;onProgress({index:i+1,total:out.length,attempted,network_requests:networkRequests,located,failed,skipped,cache_hits:cacheHits,address:query,cached:false});continue}
    const wait=Math.max(0,MIN_INTERVAL_MS-(Date.now()-lastRequestAt));if(wait)await sleep(wait);
    try{
      const params=new URLSearchParams({q:`${query}, 台灣`,format:'jsonv2',limit:'1',countrycodes:'tw','accept-language':'zh-TW',viewbox:'121.35,25.22,121.70,24.95',bounded:'1'});
      lastRequestAt=Date.now();networkRequests+=1;
      const response=await fetchImpl(`${endpoint}?${params.toString()}`,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error(`geocode HTTP ${response.status}`);
      const rows=await response.json(),first=Array.isArray(rows)?rows[0]:null;
      if(first&&isTaipeiCoordinate(first.lat,first.lon)){home.lat=Number(first.lat);home.lon=Number(first.lon);home.location_basis='address-geocode-osm';home.geocode_label=clean(first.display_name||'')||null;cache[query]={lat:home.lat,lon:home.lon,display_name:home.geocode_label,cached_at:new Date().toISOString()};writeCache(cache);located+=1}else failed+=1;
    }catch{failed+=1}
    onProgress({index:i+1,total:out.length,attempted,network_requests:networkRequests,located,failed,skipped,cache_hits:cacheHits,address:query,cached:false});
  }
  return {homes:out,attempted,network_requests:networkRequests,located,failed,skipped,cache_hits:cacheHits,endpoint};
}
