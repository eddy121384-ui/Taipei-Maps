import { access, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const repoRoot=path.resolve(__dirname,'../..');
const outDir=path.join(repoRoot,'public','generated');
const outputPath=path.join(outDir,'taipei_mrt_stations_official.geojson');
const auditPath=path.join(outDir,'taipei_mrt_stations_official.audit.json');

const SOURCE_URL='https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=a63e3278-9d10-4916-9f24-e5a4d78afb31';
const SOURCE_NAME='臺北都會區大眾捷運系統車站點位圖';
const ifMissing=process.argv.includes('--if-missing');

function twd97ToWgs84(x,y){
  const a=6378137.0,b=6356752.314245,k0=.9999,dx=250000.0,lon0=121*Math.PI/180;
  const e2=1-(b*b)/(a*a),sqrt1=Math.sqrt(1-e2),e1=(1-sqrt1)/(1+sqrt1);
  const M=y/k0;
  const mu=M/(a*(1-e2/4-3*e2*e2/64-5*e2*e2*e2/256));
  const J1=3*e1/2-27*e1*e1*e1/32;
  const J2=21*e1*e1/16-55*e1*e1*e1*e1/32;
  const J3=151*e1*e1*e1/96;
  const J4=1097*e1*e1*e1*e1/512;
  const fp=mu+J1*Math.sin(2*mu)+J2*Math.sin(4*mu)+J3*Math.sin(6*mu)+J4*Math.sin(8*mu);
  const ep2=e2/(1-e2),sinFp=Math.sin(fp),cosFp=Math.cos(fp),tanFp=Math.tan(fp);
  const C1=ep2*cosFp*cosFp,T1=tanFp*tanFp;
  const N1=a/Math.sqrt(1-e2*sinFp*sinFp);
  const R1=a*(1-e2)/Math.pow(1-e2*sinFp*sinFp,1.5);
  const D=(x-dx)/(N1*k0);
  const D2=D*D,D3=D2*D,D4=D2*D2,D5=D4*D,D6=D3*D3;
  const lat=fp-(N1*tanFp/R1)*(D2/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*D4/24+(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*D6/720);
  const lon=lon0+(D-(1+2*T1+C1)*D3/6+(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*D5/120)/cosFp;
  const lngDeg=lon*180/Math.PI,latDeg=lat*180/Math.PI;
  if(!Number.isFinite(lngDeg)||!Number.isFinite(latDeg))throw new Error(`Non-finite transformed coordinate from ${x},${y}`);
  if(lngDeg<120.8||lngDeg>122.0||latDeg<24.6||latDeg>25.5)throw new Error(`Transformed MRT station coordinate outside expected Taipei metro bounds: ${lngDeg},${latDeg}`);
  return [lngDeg,latDeg];
}

async function exists(filePath){try{await access(filePath);return true;}catch{return false;}}

function cleanText(value){return String(value??'').replace(/\s+/g,' ').trim();}

async function main(){
  await mkdir(outDir,{recursive:true});
  if(ifMissing&&await exists(outputPath)){
    console.log(`Taipei MRT official station cache found: ${outputPath}`);
    return;
  }

  console.log('Downloading Taipei City official MRT station GIS…');
  const response=await fetch(SOURCE_URL,{
    headers:{'accept':'application/json','user-agent':'Taipei-Maps official-data builder'}
  });
  if(!response.ok)throw new Error(`Taipei MRT official station GIS HTTP ${response.status}`);

  const rawBytes=Buffer.from(await response.arrayBuffer());
  const sourceSha256=createHash('sha256').update(rawBytes).digest('hex');
  const rawText=new TextDecoder('utf-8',{fatal:true}).decode(rawBytes);
  const raw=JSON.parse(rawText);
  if(raw?.type!=='FeatureCollection')throw new Error(`Unexpected official MRT station payload type: ${raw?.type}`);
  const crs=String(raw?.crs?.properties?.name||'');
  if(!crs.includes('3826'))throw new Error(`Unexpected Taipei MRT station CRS: ${crs||'(missing)'}`);

  const grouped=new Map();
  let pointFeatureCount=0;
  for(const feature of raw.features||[]){
    if(feature?.geometry?.type!=='Point')continue;
    const stationName=cleanText(feature?.properties?.NAME);
    if(!stationName)continue;
    const [x,y]=feature.geometry.coordinates||[];
    const [lng,lat]=twd97ToWgs84(Number(x),Number(y));
    const location=cleanText(feature?.properties?.LOC);
    const row=grouped.get(stationName)||{name:stationName,coordinates:[],locations:new Set(),sourceIds:[]};
    row.coordinates.push([lng,lat]);
    if(location)row.locations.add(location);
    if(feature.id!==undefined&&feature.id!==null)row.sourceIds.push(feature.id);
    grouped.set(stationName,row);
    pointFeatureCount+=1;
  }

  const features=[...grouped.values()].map((row,index)=>{
    const lng=row.coordinates.reduce((sum,[x])=>sum+x,0)/row.coordinates.length;
    const lat=row.coordinates.reduce((sum,[,y])=>sum+y,0)/row.coordinates.length;
    return {
      type:'Feature',
      id:index,
      geometry:{type:'Point',coordinates:[lng,lat]},
      properties:{
        station_name:row.name,
        location:[...row.locations].join(' / '),
        source_point_count:row.coordinates.length,
        source:'Taipei City DORTS official station GIS'
      }
    };
  }).sort((a,b)=>String(a.properties.station_name).localeCompare(String(b.properties.station_name),'zh-Hant'));

  if(features.length<90)throw new Error(`Official Taipei MRT station geometry unexpectedly small after deduplication: ${features.length}`);
  for(const requiredName of ['台北車站','市政府站','大安站','板橋站','景平站','十四張站']){
    if(!features.some(feature=>feature.properties.station_name===requiredName)){
      throw new Error(`Official Taipei MRT station output is missing expected station: ${requiredName}`);
    }
  }

  const duplicatePlatformStations=features.filter(feature=>feature.properties.source_point_count>1).map(feature=>({
    station_name:feature.properties.station_name,
    source_point_count:feature.properties.source_point_count
  }));
  const output={type:'FeatureCollection',features};
  const audit={
    schema_version:1,
    source_name:SOURCE_NAME,
    source_url:SOURCE_URL,
    source_crs:crs,
    output_crs:'EPSG:4326',
    fetched_at:new Date().toISOString(),
    source_sha256:sourceSha256,
    raw_feature_count:(raw.features||[]).length,
    raw_point_feature_count:pointFeatureCount,
    output_station_count:features.length,
    duplicate_platform_stations:duplicatePlatformStations
  };

  await writeFile(outputPath,JSON.stringify(output),'utf8');
  await writeFile(auditPath,JSON.stringify(audit,null,2)+'\n','utf8');

  console.log('Taipei MRT official station dataset: PASS');
  console.log(`  Raw point features: ${pointFeatureCount}`);
  console.log(`  Deduplicated stations: ${features.length}`);
  console.log(`  Multi-point transfer stations merged: ${duplicatePlatformStations.length}`);
  console.log(`  Source SHA-256: ${sourceSha256}`);
  console.log(`  Output: ${outputPath}`);
}

main().catch(error=>{
  console.error(`[ERROR] ${error?.stack||error}`);
  process.exitCode=1;
});
