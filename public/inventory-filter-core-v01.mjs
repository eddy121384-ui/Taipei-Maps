export const DEFAULT_INVENTORY_FILTERS=Object.freeze({
  price_max_wan:null,
  ping_band:'any',
  age_min_years:null,
  building_form:'any',
  bedrooms_min:null,
});

const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const numberOrNull=v=>{
  if(v==null||v==='')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
};

export function normalizeInventoryFilters(input={}){
  const ping=['any','lt20','20_40','40_60','gte60'].includes(input.ping_band)?input.ping_band:'any';
  const form=['any','walkup','elevator'].includes(input.building_form)?input.building_form:'any';
  return {
    price_max_wan:numberOrNull(input.price_max_wan),
    ping_band:ping,
    age_min_years:numberOrNull(input.age_min_years),
    building_form:form,
    bedrooms_min:numberOrNull(input.bedrooms_min),
  };
}

export function activeInventoryFilterCount(input={}){
  const f=normalizeInventoryFilters(input);
  return [
    f.price_max_wan!=null,
    f.ping_band!=='any',
    f.age_min_years!=null,
    f.building_form!=='any',
    f.bedrooms_min!=null,
  ].filter(Boolean).length;
}

function matchPing(value,band){
  if(band==='any')return true;
  if(!finite(value))return false;
  const n=Number(value);
  if(band==='lt20')return n<20;
  if(band==='20_40')return n>=20&&n<40;
  if(band==='40_60')return n>=40&&n<60;
  return n>=60;
}

export function matchesInventoryFilters(home,input={}){
  const f=normalizeInventoryFilters(input);
  if(f.price_max_wan!=null&&(!finite(home?.asking_wan)||Number(home.asking_wan)>f.price_max_wan))return false;
  if(!matchPing(home?.total_ping,f.ping_band))return false;
  if(f.age_min_years!=null&&(!finite(home?.age_years)||Number(home.age_years)<f.age_min_years))return false;
  if(f.building_form!=='any'&&home?.building_form!==f.building_form)return false;
  if(f.bedrooms_min!=null&&(!finite(home?.bedrooms)||Number(home.bedrooms)<f.bedrooms_min))return false;
  return true;
}

export function isOfficiallyVerified(home){
  return home?.verification_status==='verified_exact'||home?.verification_status==='verified_shared';
}

export function isLocationCandidate(home){
  return home?.verification_status==='insufficient_location';
}

export function applyInventoryFilters(homes,{school=null,filters={},showMismatch=false,includeLocationCandidates=true}={}){
  return (Array.isArray(homes)?homes:[]).filter(home=>{
    if(school&&home?.query_school!==school)return false;
    const status=home?.verification_status;
    if(status==='mismatch'&&!showMismatch)return false;
    if(status==='insufficient_location'&&!includeLocationCandidates)return false;
    if(!['verified_exact','verified_shared','insufficient_location','mismatch'].includes(status))return false;
    return matchesInventoryFilters(home,filters);
  });
}

export function summarizeInventory(homes,opts={}){
  const visible=applyInventoryFilters(homes,opts);
  return {
    visible,
    total:visible.length,
    verified:visible.filter(isOfficiallyVerified).length,
    exact:visible.filter(h=>h.verification_status==='verified_exact').length,
    shared:visible.filter(h=>h.verification_status==='verified_shared').length,
    pending_location:visible.filter(isLocationCandidate).length,
    mismatch:visible.filter(h=>h.verification_status==='mismatch').length,
    active_filters:activeInventoryFilterCount(opts.filters),
  };
}
