const CACHE_KEY='buju.bigfun.taipei-doorplate.v0.2';
const DEFAULT_ENDPOINT='/__buju/taipei-doorplate';
const TAIPEI_BOUNDS={minLat:24.95,maxLat:25.22,minLon:121.35,maxLon:121.70};

const clean=v=>String(v??'').normalize('NFKC').replace(/\s+/g,'').trim();
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));

export function normalizeTaipeiAddressForGeocode(address=''){
  return clean(address).replace(/^臺北市/,'台北市').replace(/(?:地下)?\d+樓(?:之\d+)?(?:.*)?$/,'').replace(/之\d+樓(?:.*)?$/,'');
}
export function isTaipeiCoordinate(lat,lon){const y=Number(lat),x=Number(lon);return Number.isFinite(y)&&Number.isFinite(x)&&y>=TAIPEI_BOUNDS.minLat&&y<=TAIPEI_BOUNDS.maxLat&&x>=TAIPEI_BOUNDS.minLon&&x<=TAIPEI_BOUNDS.maxLon}
function readCache(){if(typeof localStorage==='undefined')return {};try{const v=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}');return v&&typeof v==='object'?v:{}}catch{return {}}}
function writeCache(cache){if(typeof localStorage==='undefined')return;try{localStorage.setItem(CACHE_KEY,JSON.stringify(cache))}catch{}}

export async function geocodeBigFunHomes(homes=[],options={}){
  const fetchImpl=options.fetchImpl||globalThis.fetch;
  if(typeof fetchImpl!=='function')return {homes:homes.map(h=>({...h})),attempted:0,located:0,failed:0,skipped:0,cache_hits:0,service_error:'fetch_unavailable'};
  const onProgress=typeof options.onProgress==='function'?options.onProgress:()=>{};
  const endpoint=options.endpoint||DEFAULT_ENDPOINT;
  const cache=readCache(),out=homes.map(h=>({...h}));
  let attempted=0,requests=0,located=0,failed=0,skipped=0,cacheHits=0,serviceError=null;
  const emit=(i,query,cached)=>onProgress({home_index:i,home:{...out[i]},index:i+1,total:out.length,attempted,network_requests:requests,located,failed,skipped,cache_hits:cacheHits,address:query,cached,service_error:serviceError});

  for(let i=0;i<out.length;i+=1){
    const home=out[i];if(finite(home.lat)&&finite(home.lon))continue;
    const query=normalizeTaipeiAddressForGeocode(home.address_text||home.street||'');
    if(!query||!/^(?:台北市|臺北市).+區/.test(query)){skipped+=1;continue}
    attempted+=1;
    const cached=cache[query];
    if(cached&&isTaipeiCoordinate(cached.lat,cached.lon)){
      home.lat=Number(cached.lat);home.lon=Number(cached.lon);home.location_basis='taipei-official-doorplate';home.geocode_label=cached.matched_address||query;cacheHits+=1;located+=1;emit(i,query,true);continue;
    }
    try{
      requests+=1;
      const response=await fetchImpl(`${endpoint}?address=${encodeURIComponent(query)}`,{headers:{Accept:'application/json'}});
      const body=await response.json().catch(()=>null);
      if(response.status===503){serviceError=body?.code||'doorplate_index_missing';failed+=1;emit(i,query,false);break}
      if(!response.ok||!body?.ok){failed+=1;emit(i,query,false);continue}
      if(isTaipeiCoordinate(body.lat,body.lon)){
        home.lat=Number(body.lat);home.lon=Number(body.lon);home.location_basis='taipei-official-doorplate';home.geocode_label=clean(body.matched_address||query)||query;
        cache[query]={lat:home.lat,lon:home.lon,matched_address:home.geocode_label,cached_at:new Date().toISOString()};writeCache(cache);located+=1;
      }else failed+=1;
    }catch(error){failed+=1;serviceError=serviceError||`lookup_request_failed:${error?.message||error}`}
    emit(i,query,false);
  }
  return {homes:out,attempted,network_requests:requests,located,failed,skipped,cache_hits:cacheHits,endpoint,service_error:serviceError};
}
