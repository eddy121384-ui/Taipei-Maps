import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const htmlPath=path.join(root,'public','nearby-listing-experiment.html');
if(!fs.existsSync(htmlPath))throw new Error('nearby-listing-experiment.html is missing');
const html=fs.readFileSync(htmlPath,'utf8');

for(const required of [
  'id="radiusInput"',
  'data-radius="250"',
  'data-radius="500"',
  'data-radius="750"',
  'data-radius="1000"',
  'data-radius="1500"',
  'listing-radius-fill',
  'listing-radius-line',
  'https://www.sinyi.com.tw/buy/map',
  'https://sale.591.com.tw/map-index.html',
  'Area-buyMapType',
  'mapCenterPosition',
]){
  if(!html.includes(required))throw new Error(`Missing experiment contract: ${required}`);
}

const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
if(!inline.length)throw new Error('No inline experiment script found');
for(const [index,script] of inline.entries()){
  try{new vm.Script(script,{filename:`nearby-listing-experiment-inline-${index}.js`});}
  catch(error){throw new Error(`Inline script ${index} failed to compile: ${error.message}`);}
}

const source=inline.join('\n');
for(const required of ['circleFeature','districtAtPoint','selectPoint','syncCircle']){
  if(!source.includes(required))throw new Error(`Missing runtime helper: ${required}`);
}

console.log(JSON.stringify({nearbyListingExperiment:'PASS',radiusRange:'100-2000m',presets:[250,500,750,1000,1500],sinyiCenterHandoff:'PRESENT',fiveNineOneHandoff:'MANUAL_APPROXIMATE'},null,2));
