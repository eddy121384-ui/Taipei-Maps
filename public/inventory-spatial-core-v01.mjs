const EARTH_RADIUS_M=6371008.8;

const rad=d=>Number(d)*Math.PI/180;
const deg=r=>Number(r)*180/Math.PI;
const validNumber=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));

export function hasUsableCoordinate(home){
  return !!home&&validNumber(home.lon)&&validNumber(home.lat)&&Number(home.lat)>=-90&&Number(home.lat)<=90&&Number(home.lon)>=-180&&Number(home.lon)<=180;
}

export function haversineMeters(a,b){
  if(!a||!b||!validNumber(a.lon)||!validNumber(a.lat)||!validNumber(b.lon)||!validNumber(b.lat))return Infinity;
  const lat1=rad(a.lat),lat2=rad(b.lat),dLat=lat2-lat1,dLon=rad(Number(b.lon)-Number(a.lon));
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*EARTH_RADIUS_M*Math.asin(Math.min(1,Math.sqrt(h)));
}

export function locatedInventory(homes=[]){
  return (Array.isArray(homes)?homes:[]).filter(hasUsableCoordinate);
}

export function queryRadiusHomes(homes=[],center,radiusM=1000){
  const radius=Number(radiusM);
  if(!center||!validNumber(center.lon)||!validNumber(center.lat)||!Number.isFinite(radius)||radius<=0)return [];
  return locatedInventory(homes)
    .map(home=>({...home,distance_m:haversineMeters(center,home)}))
    .filter(home=>home.distance_m<=radius)
    .sort((a,b)=>a.distance_m-b.distance_m);
}

export function radiusCoverage(homes=[],center,radiusM=1000){
  const all=Array.isArray(homes)?homes:[];
  const located=locatedInventory(all);
  const inside=queryRadiusHomes(all,center,radiusM);
  return {
    total_candidates:all.length,
    located_candidates:located.length,
    unlocated_candidates:all.length-located.length,
    radius_m:Number(radiusM),
    inside_radius:inside.length,
    located_ratio:all.length?located.length/all.length:0,
  };
}

function destinationPoint(center,distanceM,bearingDeg){
  const delta=Number(distanceM)/EARTH_RADIUS_M;
  const theta=rad(bearingDeg);
  const phi1=rad(center.lat),lambda1=rad(center.lon);
  const sinPhi2=Math.sin(phi1)*Math.cos(delta)+Math.cos(phi1)*Math.sin(delta)*Math.cos(theta);
  const phi2=Math.asin(Math.max(-1,Math.min(1,sinPhi2)));
  const y=Math.sin(theta)*Math.sin(delta)*Math.cos(phi1);
  const x=Math.cos(delta)-Math.sin(phi1)*Math.sin(phi2);
  const lambda2=lambda1+Math.atan2(y,x);
  return [((deg(lambda2)+540)%360)-180,deg(phi2)];
}

export function radiusCircleFeature(center,radiusM=1000,steps=72){
  const n=Math.max(24,Math.min(180,Math.round(Number(steps)||72)));
  if(!center||!validNumber(center.lon)||!validNumber(center.lat))return {type:'Feature',properties:{radius_m:Number(radiusM)||0},geometry:{type:'Polygon',coordinates:[[]]}};
  const ring=[];
  for(let i=0;i<=n;i+=1)ring.push(destinationPoint(center,radiusM,(i/n)*360));
  return {type:'Feature',properties:{radius_m:Number(radiusM)},geometry:{type:'Polygon',coordinates:[ring]}};
}
