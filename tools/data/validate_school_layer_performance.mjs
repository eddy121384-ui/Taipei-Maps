import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const publicRoot=path.resolve(here,'../../public');
const context={window:{},console};

function runFile(filePath){
  if(!fs.existsSync(filePath))throw new Error(`Missing runtime file: ${path.relative(publicRoot,filePath)}`);
  vm.runInNewContext(fs.readFileSync(filePath,'utf8'),context,{filename:filePath});
}

runFile(path.join(publicRoot,'taipei-school-districts-115.js'));
const bootstrap=context.window.TaipeiMapsSchoolDistrictData115;
const districts=bootstrap?.coverage?.districts||[];
if(districts.length!==12)throw new Error(`Expected 12 Taipei school shards, got ${districts.length}`);
for(const district of districts)runFile(path.join(publicRoot,'school-districts-115',`${district}.js`));
runFile(path.join(publicRoot,'school-district-data-guard.js'));
if(!context.window.TaipeiMapsSchoolDistrictDataReady)throw new Error(context.window.TaipeiMapsSchoolDistrictDataError||'School data guard failed');

const rendererPath=path.join(publicRoot,'school-district-layer.js');
const locationPath=path.join(publicRoot,'school-location-layer.js');
runFile(rendererPath);
runFile(locationPath);

const renderer=context.window.TaipeiMapsSchoolDistrictLayer;
const locations=context.window.TaipeiMapsSchoolLocationLayer;
if(!renderer?.SchoolDistrictLayer)throw new Error('SchoolDistrictLayer missing');
if(!locations?.SchoolLocationLayer)throw new Error('SchoolLocationLayer missing');

if(renderer.GEOMETRY_PAGE_SIZE!==1000)throw new Error(`Unexpected geometry page size ${renderer.GEOMETRY_PAGE_SIZE}`);
const view={west:121.53,south:25.02,east:121.57,north:25.06};
const padded=renderer.paddedBounds(view);
if(!renderer.boundsContain(padded,view))throw new Error('Padded geometry cache bounds do not contain the viewport');
if(renderer.boundsContain(view,padded))throw new Error('Viewport unexpectedly contains its padded cache bounds');
if(!renderer.boundsIntersect(view,{west:121.56,south:25.05,east:121.60,north:25.09}))throw new Error('Bounds intersection regression');
if(renderer.boundsIntersect(view,{west:139.6,south:35.5,east:139.9,north:35.8}))throw new Error('Distant bounds should not intersect');

const deduped=renderer.dedupeGeometryFeatures([
  {properties:{f_id:1,SDFKEY:'a'}},{properties:{f_id:1,SDFKEY:'a'}},{properties:{f_id:2,SDFKEY:'b'}}
]);
if(deduped.length!==2)throw new Error(`Geometry dedupe regression: expected 2, got ${deduped.length}`);

const districtLayer=new renderer.SchoolDistrictLayer({});
districtLayer.geometryRegions=[
  {id:1,bounds:{west:121.50,south:25.00,east:121.60,north:25.10},features:[],pages:1},
  {id:2,bounds:{west:121.40,south:24.90,east:121.45,north:24.95},features:[],pages:1},
];
const cacheHit=districtLayer.findCachedRegion(view);
if(cacheHit?.id!==1)throw new Error(`Viewport cache lookup regression: ${cacheHit?.id}`);
if(districtLayer.geometryRegions.at(-1)?.id!==1)throw new Error('Geometry cache hit should refresh LRU order');

const rendererSource=fs.readFileSync(rendererPath,'utf8');
for(const required of [
  "resultOffset:String(offset)",
  "orderByFields:'f_id ASC'",
  'GEOMETRY_CACHE_LIMIT=6',
  'minzoom:16.2',
  "cacheHit?'快取'",
]){
  if(!rendererSource.includes(required))throw new Error(`Renderer performance guard missing: ${required}`);
}

const locationLayer=new locations.SchoolLocationLayer({});
locationLayer.allFeatures=[{properties:{level:'elementary'}}];
locationLayer.queryCenter={lng:121.55,lat:25.04};
locationLayer.queryRadiusM=4500;
if(!locationLayer.cacheUsable({lng:121.555,lat:25.04},4500))throw new Error('Nearby school-point viewport should reuse cache');
if(locationLayer.cacheUsable({lng:121.58,lat:25.04},4500))throw new Error('Distant school-point viewport should refresh cache');
const oneKm=locations.distanceMeters(121.55,25.04,121.56,25.04);
if(oneKm<900||oneKm>1100)throw new Error(`Distance helper regression near Taipei: ${oneKm}`);

const locationSource=fs.readFileSync(locationPath,'utf8');
for(const required of ['this.allFeatures=[]','CACHE_REUSE_FRACTION=.28',"this.applyLevelFeatures('快取')"]){
  if(!locationSource.includes(required))throw new Error(`School-point cache guard missing: ${required}`);
}

function assertScriptOrder(htmlPath,label){
  const html=fs.readFileSync(htmlPath,'utf8');
  const scripts=[
    './taipei-school-districts-115.js',
    ...districts.map(d=>`./school-districts-115/${d}.js`),
    './school-district-data-guard.js',
    './school-district-layer.js',
    './school-location-layer.js',
  ];
  let previous=-1;
  for(const script of scripts){
    const index=html.indexOf(`src="${script}"`);
    if(index<0)throw new Error(`${label} does not load ${script}`);
    if(index<=previous)throw new Error(`${label} script order invalid at ${script}`);
    previous=index;
  }
}

assertScriptOrder(path.join(publicRoot,'mobile-preview.html'),'mobile-preview.html');
assertScriptOrder(path.join(publicRoot,'maplibre-pmtiles-provider-spike.html'),'desktop full-stack validation page');

console.log(JSON.stringify({
  schoolCatchmentPagination:'PASS',
  schoolCatchmentViewportCache:'PASS',
  schoolCatchmentNeighborLineDeclutter:'PASS',
  schoolPointViewportCache:'PASS',
  elementaryJuniorGeometryReuse:'PASS',
  mobileAndDesktopLoadOrder:'PASS',
},null,2));
