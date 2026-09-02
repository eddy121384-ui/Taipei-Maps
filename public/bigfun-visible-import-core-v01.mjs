const SAFE_SOURCE='bigfun-visible';

const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const compact=v=>clean(v).normalize('NFKC').replace(/\s+/g,'').replace(/^臺北市/,'台北市');
const num=s=>{if(s===null||s===undefined)return null;const raw=String(s).replace(/,/g,'').trim();if(!raw)return null;const n=Number(raw);return Number.isFinite(n)?n:null};
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const round1=v=>finite(v)?Math.round(Number(v)*10)/10:null;

export function extractBigFunAddressText(text=''){
  const raw=clean(text);
  const explicit=raw.match(/(?:相關地址|地址)\s*((?:台北市|臺北市)[\u3400-\u9fffA-Za-z0-9－\-之]+?)(?=\s*(?:調電傳|地圖歷|地圖街景|相關物件|刊登|比價|$))/);
  if(explicit?.[1])return clean(explicit[1]);
  const fallback=raw.match(/(?:台北市|臺北市)[^\s]{2,90}?(?:\d+號(?:之\d+)?(?:\d+樓(?:之\d+)?)?|\d+巷(?:\d+弄)?|(?:路|街|大道)(?:[一二三四五六七八九十0-9]+段)?)/);
  return clean(fallback?.[0]||'')||null;
}

export function parseVisibleListingText(text=''){
  const raw=clean(text);
  const lines=String(text??'').split(/\n+/).map(clean).filter(Boolean);
  const priceMatch=raw.match(/(?:總價|售價|開價)?\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*萬/);
  const pingMatch=raw.match(/(?:總坪|坪數|單價)?\s*([0-9]+(?:\.[0-9]+)?)\s*坪/);
  const ageMatch=raw.match(/(?:屋齡)?\s*([0-9]+(?:\.[0-9]+)?)\s*年/);
  const bedroomMatch=raw.match(/([0-9]+)\s*房/);
  const floorMatch=raw.match(/(?:樓層)?\s*([0-9]+(?:\s*\/\s*[0-9]+)?\s*(?:樓|F)?)/i);
  const explicitAddress=extractBigFunAddressText(raw);
  const addressLine=explicitAddress||lines.find(x=>/(台北市|臺北市).*(區|路|街|巷|弄|號)/.test(x)&&x.length<=120)||null;
  const title=lines.find(x=>x.length>=4&&x.length<=70&&!/(萬|坪|屋齡|房|樓層|相關地址|調電傳|地圖歷)/.test(x))||lines[0]||'BigFun 可見物件';
  return {title,asking_wan:priceMatch?num(priceMatch[1]):null,total_ping:pingMatch?num(pingMatch[1]):null,age_years:ageMatch?num(ageMatch[1]):null,bedrooms:bedroomMatch?num(bedroomMatch[1]):null,floor:floorMatch?clean(floorMatch[1]):null,address_text:addressLine,raw_visible_text:raw.slice(0,1600)};
}

function addressIdentity(address=''){
  const normalized=compact(address);
  if(!normalized)return {full:'',base:'',unit:''};
  const match=normalized.match(/^(.*?號(?:之\d+)?)(.*)$/);
  if(!match)return {full:normalized,base:normalized,unit:''};
  const tail=match[2]||'';
  const unit=tail.match(/(\d+樓(?:之\d+)?)/)?.[1]||'';
  return {full:normalized,base:match[1],unit};
}
function floorIdentity(value=''){
  const raw=compact(value).toUpperCase();
  if(!raw)return '';
  const m=raw.match(/(?:B)?\d+(?:樓|F)?/);
  return m?.[0]||raw;
}
export function canonicalBigFunPropertyKey(item={}){
  const address=addressIdentity(item.address_text);
  const floor=address.unit||floorIdentity(item.floor);
  const ping=round1(item.total_ping);
  const beds=finite(item.bedrooms)?Number(item.bedrooms):null;
  if(address.base){
    if(floor)return `address:${address.base}|floor:${floor}|ping:${ping??'?'}|beds:${beds??'?'}`;
    if(ping!==null||beds!==null)return `address:${address.base}|ping:${ping??'?'}|beds:${beds??'?'}`;
    return `address:${address.full}|title:${compact(item.title).slice(0,48)}`;
  }
  const sourceUrl=clean(item.source_url||item.page_url||'');
  return `source:${sourceUrl}|title:${compact(item.title).slice(0,64)}|price:${round1(item.asking_wan)??'?'}|ping:${ping??'?'}|beds:${beds??'?'}`;
}
function sourceUrls(item={}){
  return [...new Set([...(Array.isArray(item.source_urls)?item.source_urls:[]),item.source_url].map(clean).filter(Boolean))];
}
function mergeRecords(a,b){
  const urls=[...new Set([...sourceUrls(a),...sourceUrls(b)])];
  const asks=[a.asking_wan,b.asking_wan,...(Array.isArray(a.asking_values_wan)?a.asking_values_wan:[]),...(Array.isArray(b.asking_values_wan)?b.asking_values_wan:[])].filter(finite).map(Number);
  const minAsk=asks.length?Math.min(...asks):null,maxAsk=asks.length?Math.max(...asks):null;
  const prefer=(x,y)=>x!==null&&x!==undefined&&x!==''?x:y;
  const sameCoords=finite(a.lat)&&finite(a.lon)&&finite(b.lat)&&finite(b.lon)&&Math.abs(Number(a.lat)-Number(b.lat))<1e-7&&Math.abs(Number(a.lon)-Number(b.lon))<1e-7;
  return {...a,
    title:prefer(a.title,b.title),
    asking_wan:minAsk,
    asking_range_wan:asks.length?[minAsk,maxAsk]:null,
    asking_values_wan:[...new Set(asks)].sort((x,y)=>x-y),
    total_ping:prefer(a.total_ping,b.total_ping),age_years:prefer(a.age_years,b.age_years),bedrooms:prefer(a.bedrooms,b.bedrooms),floor:prefer(a.floor,b.floor),address_text:prefer(a.address_text,b.address_text),
    lat:sameCoords?Number(a.lat):prefer(a.lat,b.lat),lon:sameCoords?Number(a.lon):prefer(a.lon,b.lon),
    source_url:urls[0]||null,source_urls:urls,source_count:Math.max(urls.length,Number(a.source_count)||1,Number(b.source_count)||1),
    duplicate_collapsed_count:(Number(a.duplicate_collapsed_count)||1)+(Number(b.duplicate_collapsed_count)||1)
  };
}

export function normalizeBigFunVisibleRecord(record={},index=0){
  const parsed=parseVisibleListingText(record.visible_text||record.raw_visible_text||'');
  const sourceUrl=clean(record.source_url||record.href||'');
  const idSeed=sourceUrl||`${parsed.title}|${parsed.asking_wan??''}|${parsed.total_ping??''}|${record.address_text||parsed.address_text||''}|${index}`;
  let hash=2166136261;for(const ch of idSeed){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619)}
  const lat=num(record.lat),lon=num(record.lon??record.lng);
  return {id:`bigfun-visible-${(hash>>>0).toString(16)}`,source:SAFE_SOURCE,source_label:'BigFun visible',source_url:sourceUrl||null,source_urls:sourceUrl?[sourceUrl]:[],source_count:sourceUrl?1:0,captured_at:record.captured_at||null,page_url:clean(record.page_url||'')||null,title:clean(record.title||parsed.title),asking_wan:num(record.asking_wan)??parsed.asking_wan,asking_range_wan:null,asking_values_wan:[],total_ping:num(record.total_ping)??parsed.total_ping,age_years:num(record.age_years)??parsed.age_years,bedrooms:num(record.bedrooms)??parsed.bedrooms,floor:clean(record.floor||parsed.floor||'')||null,address_text:clean(record.address_text||parsed.address_text||'')||null,lat,lon,raw_visible_text:clean(record.visible_text||record.raw_visible_text||parsed.raw_visible_text).slice(0,1600),verification_status:'insufficient_location',research_only:true,duplicate_collapsed_count:1};
}

export function normalizeBigFunVisibleExport(payload={}){
  const rows=Array.isArray(payload)?payload:Array.isArray(payload.items)?payload.items:[];
  const dedup=new Map();
  rows.forEach((row,i)=>{
    const item=normalizeBigFunVisibleRecord(row,i),key=canonicalBigFunPropertyKey(item);
    dedup.set(key,dedup.has(key)?mergeRecords(dedup.get(key),item):item);
  });
  const items=[...dedup.values()].map(item=>{
    const asks=[item.asking_wan,...(item.asking_values_wan||[])].filter(finite).map(Number);
    const min=asks.length?Math.min(...asks):null,max=asks.length?Math.max(...asks):null;
    return {...item,asking_wan:min,asking_range_wan:asks.length?[min,max]:null,asking_values_wan:[...new Set(asks)].sort((a,b)=>a-b),source_urls:sourceUrls(item),source_count:Math.max(sourceUrls(item).length,Number(item.source_count)||0),canonical_property_key:canonicalBigFunPropertyKey(item)};
  });
  return {schema:'buju.bigfun-visible.v0.3',imported_at:new Date().toISOString(),source:SAFE_SOURCE,count:items.length,items};
}

export function toTemporaryInventoryHomes(payload={}){
  return normalizeBigFunVisibleExport(payload).items.map(x=>{
    const hasAddress=Boolean(x.address_text),sourceLat=finite(x.lat)?Number(x.lat):null,sourceLon=finite(x.lon)?Number(x.lon):null;
    const range=Array.isArray(x.asking_range_wan)?x.asking_range_wan.filter(finite).map(Number):[];
    const askingLabel=range.length===2&&range[1]>range[0]?`${range[0].toLocaleString()}–${range[1].toLocaleString()}萬`:x.asking_wan?`${x.asking_wan.toLocaleString()}萬`:'價格未解析';
    return {id:x.id,canonical_property_key:x.canonical_property_key,name:x.title,asking_wan:x.asking_wan,asking_range_wan:x.asking_range_wan,asking_label:askingLabel,total_ping:x.total_ping,age_years:x.age_years,bedrooms:x.bedrooms,floor:x.floor,street:x.address_text||'BigFun 可見資料 · 地址待確認',address_text:x.address_text||null,lon:hasAddress?null:sourceLon,lat:hasAddress?null:sourceLat,source_lon:sourceLon,source_lat:sourceLat,location_basis:hasAddress?'address-awaiting-official-doorplate':sourceLon!==null&&sourceLat!==null?'bigfun-dom-coordinate':null,source_label:`${x.source_label}${x.source_count>1?` · ${x.source_count} 刊登合併`:''}`,source_url:x.source_url||x.page_url||'https://www.ibigfun.com/',source_urls:x.source_urls||[],source_count:x.source_count||1,duplicate_collapsed_count:x.duplicate_collapsed_count||1,verification_status:'insufficient_location',official_junior:null,note:x.address_text?'BigFun 卡片提供相關地址；地圖位置優先以臺北市官方門牌資料重新定位。':'由使用者從 BigFun 搜尋結果手動匯入；地址／學區待驗證。',temporary_import:true,research_only:true};
  });
}
