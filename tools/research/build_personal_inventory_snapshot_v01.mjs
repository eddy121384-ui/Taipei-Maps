import fs from 'node:fs';

const INPUT='public/data/inventory/personal-research-2026-08-29-v01.raw.json';
const OUTPUT='public/data/inventory/personal-research-current-v01.json';
const COVERAGE='public/data/inventory/personal-research-current-v01.coverage.json';

const raw=JSON.parse(fs.readFileSync(INPUT,'utf8'));
const rows=Array.isArray(raw.rows)?raw.rows:[];

const populated=v=>v!==null&&v!==undefined&&v!=='';
const completeness=row=>[
  'asking_wan','total_ping','age_years','building_type','bedrooms','floor','street','community','lon','lat','location_precision_grade'
].reduce((n,k)=>n+(populated(row[k])?1:0),0);
const buildingForm=type=>String(type||'').includes('公寓')||String(type||'').includes('透天')?'walkup':String(type||'').includes('電梯')||String(type||'').includes('華廈')?'elevator':null;

const groups=new Map();
for(const row of rows){
  const key=row.canonical_hint||`${row.source}:${row.source_listing_id||row.title}`;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(row);
}

function verification(group){
  const states=group.map(r=>r.verification_status).filter(Boolean);
  if(states.includes('verified_exact'))return 'verified_exact';
  if(states.includes('verified_shared'))return 'verified_shared';
  if(states.includes('mismatch'))return 'mismatch';
  return 'insufficient_location';
}

function uniqueNumbers(values){
  return [...new Set(values.filter(Number.isFinite).map(v=>Number(v)))].sort((a,b)=>a-b);
}

const homes=[];
for(const [key,group] of groups){
  const rep=[...group].sort((a,b)=>completeness(b)-completeness(a))[0];
  const asking=uniqueNumbers(group.map(r=>Number(r.asking_wan)).filter(v=>Number.isFinite(v)&&v>0));
  const sources=[...new Set(group.map(r=>r.source))].sort();
  const sourceListings=group.map(r=>({
    source:r.source,
    source_listing_id:r.source_listing_id||null,
    source_url:r.source_url,
    title:r.title,
    asking_wan:Number.isFinite(Number(r.asking_wan))&&Number(r.asking_wan)>0?Number(r.asking_wan):null
  }));
  const verifiedRow=group.find(r=>r.verification_status)||{};
  const status=verification(group);
  const askingMin=asking.length?asking[0]:null;
  const area=populated(rep.total_ping)?Number(rep.total_ping):null;
  const bedrooms=populated(rep.bedrooms)?Number(rep.bedrooms):null;
  const unitPrice=askingMin&&area?Number((askingMin/area).toFixed(2)):null;
  homes.push({
    id:key,
    canonical_home_id:key,
    query_school:rep.query_school,
    name:rep.community||rep.title,
    community:rep.community||null,
    street:rep.street||null,
    asking_wan:askingMin,
    asking_label:asking.length===0?'價格待補':asking.length===1?`${asking[0].toLocaleString('en-US')} 萬`:`${asking[0].toLocaleString('en-US')}–${asking.at(-1).toLocaleString('en-US')} 萬`,
    asking_range_wan:asking.length?[asking[0],asking.at(-1)]:null,
    unit_price_label:unitPrice?`約 ${unitPrice.toLocaleString('en-US')} 萬/坪（canonical min ask）`:null,
    total_ping:area,
    age_years:populated(rep.age_years)?Number(rep.age_years):null,
    building_type:rep.building_type||null,
    building_form:buildingForm(rep.building_type),
    bedrooms,
    layout:bedrooms>0?`${bedrooms}房`:bedrooms===0?'開放式／套房':null,
    floor:rep.floor||null,
    lon:populated(verifiedRow.lon)?Number(verifiedRow.lon):null,
    lat:populated(verifiedRow.lat)?Number(verifiedRow.lat):null,
    location_precision_grade:verifiedRow.location_precision_grade||null,
    verification_status:status,
    official_elementary:verifiedRow.official_elementary||null,
    official_junior:verifiedRow.official_junior||null,
    official_location:verifiedRow.official_location||null,
    external_school_claim:`${rep.query_school}國中`,
    source_school_claim:`${rep.query_school}國中`,
    source_count:sources.length,
    listing_count:group.length,
    sources,
    source_listings:sourceListings,
    source_url:sourceListings[0]?.source_url||null,
    source_label:sources.join(' + '),
    note:status==='insufficient_location'?'公開來源目前只足以辨識到街道／社區級，尚不足以用官方里鄰界驗證；不製造假座標。':status==='verified_shared'?'官方為共同學區，不能簡化成單一學校。':'',
    research_only:true
  });
}

homes.sort((a,b)=>a.query_school.localeCompare(b.query_school,'zh-Hant')||((a.asking_wan??Infinity)-(b.asking_wan??Infinity)));

const statusCounts=homes.reduce((acc,h)=>(acc[h.verification_status]=(acc[h.verification_status]||0)+1,acc),{});
const sourceCounts=rows.reduce((acc,r)=>(acc[r.source]=(acc[r.source]||0)+1,acc),{});
const schoolCoverage={};
for(const school of ['金華','中正']){
  const scoped=homes.filter(h=>h.query_school===school);
  schoolCoverage[school]={
    canonical_homes:scoped.length,
    verified_exact:scoped.filter(h=>h.verification_status==='verified_exact').length,
    verified_shared:scoped.filter(h=>h.verification_status==='verified_shared').length,
    insufficient_location:scoped.filter(h=>h.verification_status==='insufficient_location').length,
    mismatch:scoped.filter(h=>h.verification_status==='mismatch').length
  };
}

const fieldCompleteness={};
for(const field of ['asking_wan','total_ping','age_years','building_type','bedrooms','floor']){
  const count=homes.filter(h=>populated(h[field])).length;
  fieldCompleteness[field]={count,total:homes.length,ratio:Number((count/homes.length).toFixed(4))};
}

const coverage={
  schema_version:'0.1',
  snapshot_id:raw.snapshot_id,
  observed_at:raw.observed_at,
  research_only:true,
  complete_market_inventory:false,
  source_policy:raw.source_policy,
  sources:sourceCounts,
  raw_listing_rows:rows.length,
  canonical_unique_homes:homes.length,
  duplicate_rows_collapsed:rows.length-homes.length,
  cross_source_homes:homes.filter(h=>h.source_count>1).length,
  verification_status:statusCounts,
  school_coverage:schoolCoverage,
  field_completeness:fieldCompleteness
};

const output={
  schema_version:'0.1',
  snapshot_id:raw.snapshot_id,
  observed_at:raw.observed_at,
  research_only:true,
  complete_market_inventory:false,
  scope:raw.scope,
  coverage,
  homes
};

fs.writeFileSync(OUTPUT,JSON.stringify(output,null,2)+'\n');
fs.writeFileSync(COVERAGE,JSON.stringify(coverage,null,2)+'\n');
console.log(`PASS personal inventory snapshot · raw ${rows.length} → canonical ${homes.length} · duplicates ${rows.length-homes.length} · cross-source ${coverage.cross_source_homes}`);
console.log(JSON.stringify(schoolCoverage));
