import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { HOSPITAL_CAMPUS_REGISTRY } from './taipei_hospital_campuses.mjs';

const layerPath='public/healthcare-layer.js';
const builderPath='tools/data/build_taipei_healthcare.mjs';
const dataPath='public/generated/taipei_healthcare_facilities.geojson';
const auditPath='public/generated/taipei_healthcare_facilities.audit.json';
const layer=await readFile(layerPath,'utf8');
const builder=await readFile(builderPath,'utf8');
const data=JSON.parse(await readFile(dataPath,'utf8'));
const audit=JSON.parse(await readFile(auditPath,'utf8'));

new vm.Script(layer,{filename:layerPath});
const syntaxCopy=builder.replace(/^import .*$/gm,'').replace(/^const __filename=.*$/m,"const __filename='';").replace(/^const __dirname=.*$/m,"const __dirname='';");
new vm.Script(syntaxCopy,{filename:builderPath});

const layerTokens=[
  "GEOJSON_URL='/generated/taipei_healthcare_facilities.geojson'","SOURCE_ID='taipei-healthcare'","hospital:'#c62828'","clinic:'#00838f'",
  "type:'circle',source:SOURCE_ID","circle-radius","circle-color","circle-stroke-color","['coalesce',['get','map_label'],['get','facility_name']]",
  "minzoom:10.0","minzoom:11.2","minzoom:12.2","minzoom:13.7","facility_type","facility_name","district","address",
  "button.textContent='✚'","切換醫院與診所","maplibregl.Popup","臺北市政府衛生局","centerInsideTaipei","醫療資料目前涵蓋臺北市","醫院院區"
];
for(const token of layerTokens)if(!layer.includes(token))throw new Error(`Healthcare layer contract missing: ${token}`);

const builderTokens=[
  "DATASET_ID='ffdd5753-30db-4c38-b65f-b77892773d60'","rid:'3a02af7d-8c33-46c1-8226-c12a11610f6b'","rid:'04a3d195-ee97-467a-b066-e471ff99d15d'",
  "臺北市診所清冊","臺北市醫院清冊","經度","緯度","機構名稱","行政區","地址","TextDecoder(encoding,{fatal:true})","rawHospitalRecords<30","hospitals<30","clinics<1700",
  "CACHE_SCHEMA_VERSION=2","reconcileHospitalCampuses","campus_reconciliation","physical hospital sites"
];
for(const token of builderTokens)if(!builder.includes(token))throw new Error(`Healthcare builder contract missing: ${token}`);
if(layer.includes('google.com')||builder.includes('google.com'))throw new Error('Healthcare layer must not depend on Google Maps/Places content');

if(Number(audit?.schema_version)<2)throw new Error(`Healthcare audit cache schema is stale: ${audit?.schema_version}`);
if(!Array.isArray(audit?.campus_reconciliation))throw new Error('Healthcare audit missing campus reconciliation lineage');
if(data?.type!=='FeatureCollection')throw new Error(`Generated healthcare data has unexpected type: ${data?.type}`);
const features=(data.features||[]).filter(f=>f?.geometry?.type==='Point');
const hospitalFeatures=features.filter(f=>f?.properties?.facility_type==='hospital');
const hospitals=hospitalFeatures.length;
const clinics=features.filter(f=>f?.properties?.facility_type==='clinic').length;
if(hospitals<30)throw new Error(`Generated hospital-site count unexpectedly small: ${hospitals}`);
if(clinics<1700)throw new Error(`Generated clinic count unexpectedly small: ${clinics}`);
for(const f of features){
  const [lng,lat]=f.geometry.coordinates||[];
  if(!(lng>=121.40&&lng<=121.75&&lat>=24.90&&lat<=25.25))throw new Error(`Healthcare point outside Taipei guard bounds: ${f?.properties?.facility_name}`);
  if(!String(f?.properties?.facility_name||'').trim())throw new Error('Generated healthcare feature missing facility_name');
}

const group=HOSPITAL_CAMPUS_REGISTRY.find(item=>item.group_id==='taipei-city-hospital');
if(!group)throw new Error('Taipei City Hospital campus registry missing');
const reconciled=hospitalFeatures.filter(f=>f?.properties?.campus_group_id===group.group_id);
if(reconciled.length!==group.campuses.length)throw new Error(`Taipei City Hospital physical campus count mismatch: expected ${group.campuses.length}, got ${reconciled.length}`);
const addresses=new Set(reconciled.map(f=>String(f.properties.address||'').trim()));
if(addresses.size!==group.campuses.length)throw new Error(`Taipei City Hospital campus addresses are not physically distinct: ${addresses.size}/${group.campuses.length}`);
for(const expected of group.campuses){
  const actual=reconciled.find(f=>f?.properties?.campus_id===expected.campus_id);
  if(!actual)throw new Error(`Missing reconciled hospital campus: ${expected.campus_id}`);
  if(actual.properties.facility_name!==expected.facility_name)throw new Error(`Campus name mismatch: ${expected.campus_id}`);
  if(actual.properties.address!==expected.address)throw new Error(`Campus address mismatch: ${expected.campus_id}`);
  if(actual.properties.facility_code!==group.parent_facility_code)throw new Error(`Campus parent facility code mismatch: ${expected.campus_id}`);
}
const fuyou=reconciled.find(f=>f.properties.campus_id==='fuyou');
if(!fuyou||fuyou.properties.address!=='臺北市中正區福州街12號')throw new Error('Fuyou physical campus regression: 福州街12號 must exist as an independent hospital point');
const unreconciledTpech=hospitalFeatures.filter(f=>String(f?.properties?.facility_name||'').includes('臺北市立聯合醫院')&&!f?.properties?.campus_group_id);
if(unreconciledTpech.length)throw new Error(`Raw Taipei City Hospital entity leaked past campus reconciliation: ${unreconciledTpech.map(f=>f.properties.facility_name).join(', ')}`);

console.log(JSON.stringify({
  status:'PASS',source:'Taipei City Department of Health + official physical-campus reconciliation',
  counts:{hospital_sites:hospitals,clinic:clinics,total:features.length,taipei_city_hospital_physical_sites:reconciled.length},
  fuyou_campus:{status:'present',address:fuyou.properties.address,coordinates:fuyou.geometry.coordinates},
  marker_style:{hospital:'red point',clinic:'teal point'},hospital_point_minzoom:10.0,hospital_label_minzoom:11.2,clinic_point_minzoom:12.2,clinic_label_minzoom:13.7,google_dependency:false
},null,2));
