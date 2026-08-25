import { access, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const repoRoot=path.resolve(__dirname,'../..');
const outDir=path.join(repoRoot,'public','generated');
const outputPath=path.join(outDir,'taipei_mrt_lines_official.geojson');
const auditPath=path.join(outDir,'taipei_mrt_lines_official.audit.json');

const SOURCE_URL='https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=1139b06e-8128-4a07-8148-f27f038bd8b4';
const SOURCE_NAME='臺北都會區大眾捷運系統路網GIS圖資';
const ifMissing=process.argv.includes('--if-missing');

const MRT_COLORS={
  BR:'#c48c31',
  R:'#e3002c',
  G:'#008659',
  O:'#f8b61c',
  BL:'#0070bd',
  Y:'#ffdb00'
};

const MRT_ROUTE_TO_LINE={
  '木柵線':'BR','內湖線':'BR',
  '淡水線':'R','信義線':'R',
  '新店線':'G','松山線':'G','小南門線':'G','碧潭支線':'G',
  '中和線':'O','蘆洲線':'O','新莊線':'O',
  '板橋線':'BL','南港線':'BL',
  '環狀線':'Y'
};

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
  if(lngDeg<120.8||lngDeg>122.0||latDeg<24.6||latDeg>25.5)throw new Error(`Transformed MRT coordinate outside expected Taipei metro bounds: ${lngDeg},${latDeg}`);
  return [lngDeg,latDeg];
}

function transformGeometry(geometry){
  if(!geometry)return null;
  if(geometry.type==='LineString')return {...geometry,coordinates:geometry.coordinates.map(([x,y])=>twd97ToWgs84(Number(x),Number(y)))};
  if(geometry.type==='MultiLineString')return {...geometry,coordinates:geometry.coordinates.map(line=>line.map(([x,y])=>twd97ToWgs84(Number(x),Number(y))))};
  return null;
}

async function exists(filePath){try{await access(filePath);return true;}catch{return false;}}

async function main(){
  await mkdir(outDir,{recursive:true});
  if(ifMissing&&await exists(outputPath)){
    console.log(`Taipei MRT official local dataset cache found: ${outputPath}`);
    return;
  }

  console.log('Downloading Taipei City official MRT GIS…');
  const response=await fetch(SOURCE_URL,{
    headers:{'accept':'application/json','user-agent':'Taipei-Maps official-data builder'}
  });
  if(!response.ok)throw new Error(`Taipei MRT official GIS HTTP ${response.status}`);

  const rawBytes=Buffer.from(await response.arrayBuffer());
  const sourceSha256=createHash('sha256').update(rawBytes).digest('hex');
  const rawText=new TextDecoder('utf-8',{fatal:true}).decode(rawBytes);
  const raw=JSON.parse(rawText);
  if(raw?.type!=='FeatureCollection')throw new Error(`Unexpected official MRT payload type: ${raw?.type}`);
  const crs=String(raw?.crs?.properties?.name||'');
  if(!crs.includes('3826'))throw new Error(`Unexpected Taipei MRT CRS: ${crs||'(missing)'}`);

  const features=[];
  const unmapped=new Set();
  const routeCounts={};
  const lineCounts={};
  for(const feature of raw.features||[]){
    const routeName=String(feature?.properties?.RouteName||'').trim();
    const lineCode=MRT_ROUTE_TO_LINE[routeName];
    if(!lineCode){if(routeName)unmapped.add(routeName);continue;}
    const geometry=transformGeometry(feature.geometry);
    if(!geometry)continue;
    routeCounts[routeName]=(routeCounts[routeName]||0)+1;
    lineCounts[lineCode]=(lineCounts[lineCode]||0)+1;
    features.push({
      type:'Feature',
      id:feature.id,
      geometry,
      properties:{
        route_name:routeName,
        line_code:lineCode,
        line_color:MRT_COLORS[lineCode],
        source:'Taipei City DORTS official GIS'
      }
    });
  }

  if(features.length<10)throw new Error(`Official Taipei MRT geometry unexpectedly small after normalization: ${features.length}`);
  for(const code of Object.keys(MRT_COLORS)){
    if(!lineCounts[code])throw new Error(`Official Taipei MRT output is missing expected line group: ${code}`);
  }

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
    output_feature_count:features.length,
    route_counts:routeCounts,
    line_counts:lineCounts,
    unmapped_route_names:[...unmapped].sort(),
    line_colors:MRT_COLORS
  };

  await writeFile(outputPath,JSON.stringify(output),'utf8');
  await writeFile(auditPath,JSON.stringify(audit,null,2)+'\n','utf8');

  console.log('Taipei MRT official local dataset: PASS');
  console.log(`  Raw features: ${audit.raw_feature_count}`);
  console.log(`  Colored output features: ${audit.output_feature_count}`);
  console.log(`  Lines: ${Object.entries(lineCounts).map(([k,v])=>`${k}=${v}`).join(', ')}`);
  console.log(`  Unmapped official route names: ${audit.unmapped_route_names.join(', ')||'none'}`);
  console.log(`  Source SHA-256: ${sourceSha256}`);
  console.log(`  Output: ${outputPath}`);
}

main().catch(error=>{
  console.error(`[ERROR] ${error?.stack||error}`);
  process.exitCode=1;
});
