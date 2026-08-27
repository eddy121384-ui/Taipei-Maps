export const CHAINS = [
  {label:'7-ELEVEN',category:'convenience_store',brand:/^(?:7\s*[-‐‑–—]?\s*eleven|統一超商)$/i,name:/^(?:7\s*[-‐‑–—]?\s*eleven|統一超商)(?:[\s·・\-–—:：]*.{0,20}(?:店|門市))?$/i},
  {label:'全家',category:'convenience_store',brand:/^(?:family\s*mart|全家便利商店|全家)$/i,name:/^(?:family\s*mart|全家(?:便利商店)?)(?:[\s·・\-–—:：]*.{0,20}(?:店|門市))?$/i},
  {label:'萊爾富',category:'convenience_store',brand:/^(?:hi\s*[-‐‑–—]?\s*life|萊爾富(?:便利商店)?)$/i,name:/^(?:hi\s*[-‐‑–—]?\s*life|萊爾富(?:便利商店)?)(?:[\s·・\-–—:：]*.{0,20}(?:店|門市))?$/i},
  {label:'OK Mart',category:'convenience_store',brand:/^(?:ok\s*mart|ok超商)$/i,name:/^(?:ok\s*mart|ok超商)(?:[\s·・\-–—:：]*.{0,20}(?:店|門市))?$/i},
  {label:'全聯',category:'supermarket',brand:/^(?:px\s*mart|全聯福利中心|全聯)$/i,name:/^(?:px\s*mart|全聯(?:福利中心)?)(?:[\s·・\-–—:：]*.{0,24}(?:店|門市))?$/i},
  {label:'家樂福',category:'supermarket',brand:/^(?:carrefour(?:\s*market)?|家樂福(?:超市)?)$/i,name:/^(?:carrefour(?:\s*market)?|家樂福(?:超市)?)(?:[\s·・\-–—:：]*.{0,24}(?:店|門市))?$/i},
  {label:'美廉社',category:'supermarket',brand:/^(?:simple\s*mart|美廉社)$/i,name:/^(?:simple\s*mart|美廉社)(?:[\s·・\-–—:：]*.{0,20}(?:店|門市))?$/i}
];

export function parseMaybeJson(v){
  if(v==null||typeof v!=='string') return v;
  const s=v.trim();
  if(!s||(!s.startsWith('{')&&!s.startsWith('['))) return v;
  try{return JSON.parse(s);}catch{return v;}
}
export function primaryName(p){return String(p?.['@name']||parseMaybeJson(p?.names)?.primary||'').trim();}
export function rawBrand(p){const b=parseMaybeJson(p?.brand);return String(b?.names?.primary||b?.name||'').trim();}
export function chainRule(p){
  const name=primaryName(p),brand=rawBrand(p);
  for(const c of CHAINS){if((brand&&c.brand.test(brand))||(name&&c.name.test(name))) return c;}
  return null;
}
export function normalizeToken(v){
  return String(v||'').toLowerCase().replace(/臺/g,'台').replace(/[\s\-_‐‑–—·・()（）\[\]【】]/g,'').replace(/(?:福利中心|便利商店|超市|門市|分店|店)$/g,'').trim();
}
function stripBrandPrefixOnce(s,label){
  if(label==='7-ELEVEN')return s.replace(/^(?:7\s*[-‐‑–—]?\s*eleven|統一超商)/i,'');
  if(label==='全家')return s.replace(/^(?:family\s*mart|全家(?:便利商店)?)/i,'');
  if(label==='萊爾富')return s.replace(/^(?:hi\s*[-‐‑–—]?\s*life|萊爾富(?:便利商店)?)/i,'');
  if(label==='OK Mart')return s.replace(/^(?:ok\s*mart|ok超商)/i,'');
  if(label==='全聯')return s.replace(/^(?:px\s*mart|全聯(?:福利中心)?)/i,'');
  if(label==='家樂福')return s.replace(/^(?:carrefour(?:\s*market)?|家樂福(?:超市)?)/i,'');
  if(label==='美廉社')return s.replace(/^(?:simple\s*mart|美廉社)/i,'');
  return s;
}
export function branchName(p){
  const rule=chainRule(p),name=primaryName(p);if(!rule||!name)return'';
  let s=name;
  for(let i=0;i<3;i++){
    const trimmed=s.replace(/^[\s·・\-–—:：]+/,'').trim();
    const next=stripBrandPrefixOnce(trimmed,rule.label);
    if(next===trimmed){s=trimmed;break;}
    s=next;
  }
  return s.replace(/^[\s·・\-–—:：]+/,'').trim();
}
export function sourceDatasets(p){
  const s=parseMaybeJson(p?.sources);
  return Array.isArray(s)?[...new Set(s.map(x=>x?.dataset).filter(Boolean))]:[];
}
export function addressText(p){
  for(const v of [p?.addresses,p?.address,p?.['@address']]){
    if(v==null)continue;const parsed=parseMaybeJson(v);
    if(Array.isArray(parsed)){
      const out=parsed.map(x=>typeof x==='string'?x:Object.values(x||{}).filter(y=>typeof y==='string').join(' ')).filter(Boolean).join(' | ');if(out)return out;
    }
    if(typeof parsed==='object'){
      const out=Object.values(parsed).filter(y=>typeof y==='string').join(' ');if(out)return out;
    }
    if(typeof parsed==='string'&&parsed.trim())return parsed.trim();
  }
  return'';
}
export function featureKey(f){
  const p=f?.properties||{};return p.id||`${f?.geometry?.coordinates?.join(',')}|${primaryName(p)}|${rawBrand(p)}`;
}
export function haversine(a,b){
  const r=x=>x*Math.PI/180,R=6371000,dLat=r(b[1]-a[1]),dLon=r(b[0]-a[0]),h=Math.sin(dLat/2)**2+Math.cos(r(a[1]))*Math.cos(r(b[1]))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
export function normalizeAddress(v){return String(v||'').toLowerCase().replace(/臺/g,'台').replace(/[\s,，.。;；:\-_/\\()（）#號樓層之]/g,'').trim();}
export function isGenericChainName(p){
  const rule=chainRule(p);if(!rule)return false;
  const n=normalizeToken(primaryName(p)),b=normalizeToken(rule.label);
  return !branchName(p)&&(n===b||n==='familymart'||n==='pxmart'||n==='7eleven'||n==='hilife'||n==='okmart'||n==='carrefour'||n==='simplemart');
}
export function recordStrength(item){
  const p=item.f.properties||{};let s=0;
  if(rawBrand(p))s+=30;if(branchName(p))s+=25;if(addressText(p))s+=15;
  const src=sourceDatasets(p).map(x=>String(x).toLowerCase());
  if(src.some(x=>x.includes('alltheplaces')))s+=18;
  if(src.some(x=>x.includes('meta')))s+=8;
  if(src.some(x=>x.includes('microsoft')))s+=7;
  if(src.some(x=>x.includes('foursquare')))s+=3;
  if(!isGenericChainName(p))s+=12;else s-=10;
  return s;
}
export function classifyFeature(f){
  if(!f||f?.geometry?.type!=='Point')return null;
  const p=f.properties||{},rule=chainRule(p);if(!rule)return null;
  return {f,key:featureKey(f),cat:rule.category,brand:rule.label,branch:branchName(p),rawName:primaryName(p),rawBrand:rawBrand(p),address:addressText(p),sources:sourceDatasets(p),generic:isGenericChainName(p)};
}
export function reviewMax(cat){return cat==='supermarket'?100:50;}

const AREA_PREFIXES=['台北市','臺北市','中正','大同','中山','松山','大安','萬華','信義','士林','北投','內湖','南港','文山','北市'];
function stripAreaPrefix(v){
  const s=normalizeToken(v);
  for(const prefix of AREA_PREFIXES){const p=normalizeToken(prefix);if(s.startsWith(p)&&s.length-p.length>=2)return s.slice(p.length);}
  return s;
}
function editDistance(a,b){
  if(a===b)return 0;if(!a)return b.length;if(!b)return a.length;
  const prev=Array.from({length:b.length+1},(_,i)=>i),cur=new Array(b.length+1);
  for(let i=1;i<=a.length;i++){
    cur[0]=i;
    for(let j=1;j<=b.length;j++)cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    for(let j=0;j<=b.length;j++)prev[j]=cur[j];
  }
  return prev[b.length];
}
function branchRelation(a,b){
  const ba=normalizeToken(a.branch),bb=normalizeToken(b.branch);
  if(!ba||!bb)return {areaEquivalent:false,oneEdit:false};
  const sa=stripAreaPrefix(ba),sb=stripAreaPrefix(bb);
  const areaEquivalent=Boolean(sa&&sb&&sa===sb&&ba!==bb);
  const oneEdit=Boolean(ba.length>=4&&bb.length>=4&&Math.abs(ba.length-bb.length)<=1&&editDistance(ba,bb)<=1);
  return {areaEquivalent,oneEdit};
}
function pairFacts(a,b){
  const distance=haversine(a.f.geometry.coordinates,b.f.geometry.coordinates);
  const ba=normalizeToken(a.branch),bb=normalizeToken(b.branch),na=normalizeToken(a.rawName),nb=normalizeToken(b.rawName),aa=normalizeAddress(a.address),ab=normalizeAddress(b.address),relation=branchRelation(a,b);
  return {distance,sameBranch:Boolean(ba&&bb&&ba===bb),exactRaw:Boolean(na&&nb&&na===nb),sameAddress:Boolean(aa&&ab&&aa===ab),genericSpecific:Boolean(a.generic!==b.generic),areaEquivalent:relation.areaEquivalent,oneEditBranch:relation.oneEdit};
}
function mergeDecision(a,b){
  const e=pairFacts(a,b),max=reviewMax(a.cat);if(e.distance>max)return {...e,merge:false,reason:'outside-review-range',rank:0};
  if(e.sameAddress&&e.distance<=max)return {...e,merge:true,reason:'same-address',rank:6};
  if(e.sameBranch&&e.distance<=max)return {...e,merge:true,reason:'same-branch',rank:6};
  if(e.areaEquivalent&&e.distance<=25)return {...e,merge:true,reason:'branch-area-prefix-equivalent',rank:5};
  if(e.oneEditBranch&&e.distance<=20)return {...e,merge:true,reason:'near-branch-typo<=1-edit',rank:5};
  if(e.exactRaw&&e.distance<=max)return {...e,merge:true,reason:'exact-raw-name',rank:4};
  if(e.distance<=5)return {...e,merge:true,reason:'same-brand<=5m',rank:3};
  const genericLimit=a.cat==='supermarket'?35:20;
  if(e.genericSpecific&&e.distance<=genericLimit)return {...e,merge:true,reason:'generic+specific-nearby',rank:2};
  return {...e,merge:false,reason:'needs-more-evidence',rank:0};
}
function hash32(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
function maxSpan(items){let m=0;for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)m=Math.max(m,haversine(items[i].f.geometry.coordinates,items[j].f.geometry.coordinates));return m;}
function unique(values){return [...new Set(values.filter(Boolean))];}

export function buildCanonical(features){
  const byKey=new Map();
  for(const f of features||[]){const item=classifyFeature(f);if(item&&!byKey.has(item.key))byKey.set(item.key,item);}
  const items=[...byKey.values()];
  const groups=new Map();
  items.forEach((item,i)=>{const k=`${item.cat}|${item.brand}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);});
  const edges=[],nearPairs=[];
  for(const idxs of groups.values())for(let a=0;a<idxs.length;a++)for(let b=a+1;b<idxs.length;b++){
    const ia=idxs[a],ib=idxs[b],dec=mergeDecision(items[ia],items[ib]);
    if(dec.distance<=reviewMax(items[ia].cat)){
      const row={ia,ib,...dec};nearPairs.push(row);if(dec.merge)edges.push(row);
    }
  }
  edges.sort((x,y)=>y.rank-x.rank||x.distance-y.distance);
  const parent=items.map((_,i)=>i),members=new Map(items.map((_,i)=>[i,[i]])),accepted=[];
  const find=x=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;};
  const union=(ra,rb)=>{if(ra===rb)return ra;const ma=members.get(ra),mb=members.get(rb);if(ma.length<mb.length)[ra,rb]=[rb,ra];parent[rb]=ra;members.set(ra,[...members.get(ra),...members.get(rb)]);members.delete(rb);return ra;};
  for(const e of edges){
    let ra=find(e.ia),rb=find(e.ib);if(ra===rb){accepted.push(e);continue;}
    const candidate=[...members.get(ra),...members.get(rb)].map(i=>items[i]);
    if(maxSpan(candidate)<=reviewMax(items[e.ia].cat)){union(ra,rb);accepted.push(e);}
  }
  const finalGroups=new Map();items.forEach((item,i)=>{const r=find(i);if(!finalGroups.has(r))finalGroups.set(r,[]);finalGroups.get(r).push(i);});
  const entities=[];
  for(const idxs of finalGroups.values()){
    const rows=idxs.map(i=>items[i]);
    const rep=[...rows].sort((a,b)=>recordStrength(b)-recordStrength(a)||String(a.key).localeCompare(String(b.key)))[0];
    const branchCandidates=rows.filter(x=>x.branch).sort((a,b)=>recordStrength(b)-recordStrength(a));
    const branch=branchCandidates[0]?.branch||'';
    const rootSet=new Set(idxs);
    const reasons=unique(accepted.filter(e=>rootSet.has(e.ia)&&rootSet.has(e.ib)).map(e=>e.reason));
    const ids=rows.map(x=>x.f.properties?.id||x.key).sort();
    const sourceNames=unique(rows.map(x=>x.rawName));
    const sourceDatasetsAll=unique(rows.flatMap(x=>x.sources));
    const branches=unique(rows.map(x=>normalizeToken(x.branch))).filter(Boolean);
    const addresses=unique(rows.map(x=>normalizeAddress(x.address))).filter(Boolean);
    entities.push({
      canonical_id:`buju-poi-${hash32(`${rep.cat}|${rep.brand}|${ids.join('|')}`)}`,
      category:rep.cat,brand:rep.brand,branch,name:branch?`${rep.brand} ${branch}`:rep.brand,
      coordinates:rep.f.geometry.coordinates.slice(),source_rows:rows.length,source_ids:ids,source_names:sourceNames,sources:sourceDatasetsAll,
      representative_key:rep.key,representative_strength:recordStrength(rep),address:rep.address||'',merge_reasons:reasons,
      branch_conflict:branches.length>1,address_conflict:addresses.length>1
    });
  }
  const rootOf=i=>find(i);
  const unresolved=nearPairs.filter(p=>rootOf(p.ia)!==rootOf(p.ib));
  return {
    rawItems:items,entities,
    stats:{raw_records:items.length,canonical_poi:entities.length,auto_merged_groups:entities.filter(x=>x.source_rows>1).length,raw_rows_absorbed:items.length-entities.length,unresolved_nearby_pairs:unresolved.length,canonical_convenience:entities.filter(x=>x.category==='convenience_store').length,canonical_supermarket:entities.filter(x=>x.category==='supermarket').length},
    unresolved
  };
}
export function canonicalGeoJSON(entities){
  return {type:'FeatureCollection',features:(entities||[]).map(e=>({type:'Feature',geometry:{type:'Point',coordinates:e.coordinates},properties:{canonical_id:e.canonical_id,category:e.category,brand:e.brand,branch:e.branch||'',name:e.name,source_rows:e.source_rows,source_ids:JSON.stringify(e.source_ids),source_names:e.source_names.join(' | '),sources:e.sources.join(', '),address:e.address||'',merge_reasons:e.merge_reasons.join(', '),representative_strength:e.representative_strength,branch_conflict:e.branch_conflict?'yes':'no',address_conflict:e.address_conflict?'yes':'no'}}))};
}
export function rawGeoJSON(items){
  return {type:'FeatureCollection',features:(items||[]).map(x=>({type:'Feature',geometry:{type:'Point',coordinates:x.f.geometry.coordinates},properties:{key:x.key,category:x.cat,brand:x.brand,branch:x.branch||'',raw_name:x.rawName||'',raw_brand:x.rawBrand||'',address:x.address||'',sources:x.sources.join(', ')}}))};
}
