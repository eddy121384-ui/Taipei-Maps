import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const layerPath='public/healthcare-layer.js';
const builderPath='tools/data/build_taipei_healthcare.mjs';
const dataPath='public/generated/taipei_healthcare_facilities.geojson';
const layer=await readFile(layerPath,'utf8');
const builder=await readFile(builderPath,'utf8');
const data=JSON.parse(await readFile(dataPath,'utf8'));

new vm.Script(layer,{filename:layerPath});
const syntaxCopy=builder.replace(/^import .*$/gm,'').replace(/^const __filename=.*$/m,"const __filename='';").replace(/^const __dirname=.*$/m,"const __dirname='';");
new vm.Script(syntaxCopy,{filename:builderPath});

const layerTokens=[
  "GEOJSON_URL='/generated/taipei_healthcare_facilities.geojson'","SOURCE_ID='taipei-healthcare'","hospital:'#c62828'","clinic:'#00838f'",
  "type:'circle',source:SOURCE_ID","circle-radius","circle-color","circle-stroke-color",
  "minzoom:10.0","minzoom:11.2","minzoom:12.2","minzoom:13.7","facility_type","facility_name","district","address",
  "button.textContent='✚'","切換醫院與診所","maplibregl.Popup","臺北市政府衛生局","centerInsideTaipei","醫療資料目前涵蓋臺北市"
];
for(const token of layerTokens)if(!layer.includes(token))throw new Error(`Healthcare layer contract missing: ${token}`);

const builderTokens=[
  "DATASET_ID='ffdd5753-30db-4c38-b65f-b77892773d60'","rid:'3a02af7d-8c33-46c1-8226-c12a11610f6b'","rid:'04a3d195-ee97-467a-b066-e471ff99d15d'",
  "臺北市診所清冊","臺北市醫院清冊","經度","緯度","機構名稱","行政區","地址","TextDecoder(encoding,{fatal:true})","hospitals<30","clinics<1700"
];
for(const token of builderTokens)if(!builder.includes(token))throw new Error(`Healthcare builder contract missing: ${token}`);
if(layer.includes('google.com')||builder.includes('google.com'))throw new Error('Healthcare layer must not depend on Google Maps/Places content');

if(data?.type!=='FeatureCollection')throw new Error(`Generated healthcare data has unexpected type: ${data?.type}`);
const features=(data.features||[]).filter(f=>f?.geometry?.type==='Point');
const hospitals=features.filter(f=>f?.properties?.facility_type==='hospital').length;
const clinics=features.filter(f=>f?.properties?.facility_type==='clinic').length;
if(hospitals<30)throw new Error(`Generated hospital count unexpectedly small: ${hospitals}`);
if(clinics<1700)throw new Error(`Generated clinic count unexpectedly small: ${clinics}`);
for(const f of features){
  const [lng,lat]=f.geometry.coordinates||[];
  if(!(lng>=121.40&&lng<=121.75&&lat>=24.90&&lat<=25.25))throw new Error(`Healthcare point outside Taipei guard bounds: ${f?.properties?.facility_name}`);
  if(!String(f?.properties?.facility_name||'').trim())throw new Error('Generated healthcare feature missing facility_name');
}

console.log(JSON.stringify({status:'PASS',source:'Taipei City Department of Health open data',counts:{hospital:hospitals,clinic:clinics,total:features.length},marker_style:{hospital:'red point',clinic:'teal point'},hospital_point_minzoom:10.0,hospital_label_minzoom:11.2,clinic_point_minzoom:12.2,clinic_label_minzoom:13.7,google_dependency:false},null,2));
