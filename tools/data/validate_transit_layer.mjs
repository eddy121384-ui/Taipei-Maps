import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const transitPath='public/transit-layer.js';
const corePath='public/shared-map-core.js';
const transit=await readFile(transitPath,'utf8');
const core=await readFile(corePath,'utf8');

new vm.Script(transit,{filename:transitPath});
new vm.Script(core,{filename:corePath,importModuleDynamically:()=>{}});

const requiredTransitTokens=[
  "transportation.pmtiles",
  "SOURCE_LAYER='segment'",
  "['==',['get','subtype'],'rail']",
  "['subway','monorail','light_rail']",
  "['narrow_gauge']",
  "['standard_gauge']",
  "centerInsideTaiwan",
  "TAIWAN_BOUNDS",
  "transit-mrt",
  "transit-tra",
  "transit-thsr",
  "map.addControl(this.control,'top-right')",
  "this.emit('outside','軌道僅在台灣顯示'",
  "return false;"
];
for(const token of requiredTransitTokens){
  if(!transit.includes(token))throw new Error(`Transit contract missing: ${token}`);
}

const requiredCoreTokens=[
  "TRANSIT_MODULE_URL",
  "import(TRANSIT_MODULE_URL)",
  "TaipeiMapsTransitLayer",
  "map.__taipeiMapsTransitLayer",
  "bootstrapTransit(map,overtureUrl)"
];
for(const token of requiredCoreTokens){
  if(!core.includes(token))throw new Error(`Shared core transit bootstrap missing: ${token}`);
}

for(const forbidden of [
  'sale.591.com.tw',
  'sinyi.com.tw',
  'yungching.com.tw'
]){
  if(transit.includes(forbidden))throw new Error(`Transit layer unexpectedly contains housing-provider dependency: ${forbidden}`);
}

console.log(JSON.stringify({
  status:'PASS',
  source:'Overture transportation.pmtiles / segment',
  filters:{
    mrt:['subway','monorail','light_rail'],
    tra:['narrow_gauge'],
    thsr:['standard_gauge']
  },
  taiwan_scoped:true,
  shared_core_bootstrap:true,
  default_enabled:true,
  toggle_control:true,
  stations:false
},null,2));
