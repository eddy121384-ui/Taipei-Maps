const SAFE_SOURCE='bigfun-visible';

const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const num=s=>{if(s===null||s===undefined)return null;const raw=String(s).replace(/,/g,'').trim();if(!raw)return null;const n=Number(raw);return Number.isFinite(n)?n:null};

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

export function normalizeBigFunVisibleRecord(record={},index=0){
  const parsed=parseVisibleListingText(record.visible_text||record.raw_visible_text||'');
  const sourceUrl=clean(record.source_url||record.href||'');
  const idSeed=sourceUrl||`${parsed.title}|${parsed.asking_wan??''}|${parsed.total_ping??''}|${record.address_text||parsed.address_text||''}|${index}`;
  let hash=2166136261;for(const ch of idSeed){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619)}
  const lat=num(record.lat),lon=num(record.lon??record.lng);
  return {id:`bigfun-visible-${(hash>>>0).toString(16)}`,source:SAFE_SOURCE,source_label:'BigFun visible',source_url:sourceUrl||null,captured_at:record.captured_at||null,page_url:clean(record.page_url||'')||null,title:clean(record.title||parsed.title),asking_wan:num(record.asking_wan)??parsed.asking_wan,total_ping:num(record.total_ping)??parsed.total_ping,age_years:num(record.age_years)??parsed.age_years,bedrooms:num(record.bedrooms)??parsed.bedrooms,floor:clean(record.floor||parsed.floor||'')||null,address_text:clean(record.address_text||parsed.address_text||'')||null,lat,lon,raw_visible_text:clean(record.visible_text||record.raw_visible_text||parsed.raw_visible_text).slice(0,1600),verification_status:'insufficient_location',research_only:true};
}

export function normalizeBigFunVisibleExport(payload={}){
  const rows=Array.isArray(payload)?payload:Array.isArray(payload.items)?payload.items:[];
  const dedup=new Map();rows.forEach((row,i)=>{const item=normalizeBigFunVisibleRecord(row,i);if(!dedup.has(item.id))dedup.set(item.id,item)});
  return {schema:'buju.bigfun-visible.v0.3',imported_at:new Date().toISOString(),source:SAFE_SOURCE,count:dedup.size,items:[...dedup.values()]};
}

export function toTemporaryInventoryHomes(payload={}){
  return normalizeBigFunVisibleExport(payload).items.map(x=>({id:x.id,name:x.title,asking_wan:x.asking_wan,asking_label:x.asking_wan?`${x.asking_wan.toLocaleString()}萬`:'價格未解析',total_ping:x.total_ping,age_years:x.age_years,bedrooms:x.bedrooms,floor:x.floor,street:x.address_text||'BigFun 可見資料 · 地址待確認',address_text:x.address_text||null,lon:x.lon,lat:x.lat,location_basis:Number.isFinite(x.lon)&&Number.isFinite(x.lat)?'bigfun-dom-coordinate':null,source_label:x.source_label,source_url:x.source_url||x.page_url||'https://www.ibigfun.com/',verification_status:'insufficient_location',official_junior:null,note:x.address_text?'BigFun 卡片提供相關地址；尚未做官方地址／學區驗證。':'由使用者從 BigFun 搜尋結果手動匯入；地址／學區待驗證。',temporary_import:true,research_only:true}));
}
