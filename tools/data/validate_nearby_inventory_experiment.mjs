import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const htmlPath=path.join(root,'public','nearby-inventory-experiment.html');
const serverPath=path.join(root,'tools','dev','serve_nearby_inventory_experiment.mjs');
for(const file of [htmlPath,serverPath])if(!fs.existsSync(file))throw new Error(`Missing ${path.relative(root,file)}`);
const html=fs.readFileSync(htmlPath,'utf8');
const server=fs.readFileSync(serverPath,'utf8');

for(const required of [
  'id="radiusInput"','data-radius="250"','data-radius="500"','data-radius="750"','data-radius="1000"','data-radius="1500"',
  'listing-radius-fill','listing-radius-line','nearby-listings','nearby-listing-point','nearby-listing-label','school-location-point',
  '/api/nearby-listings','fetchNearbyListings','listingPopup','renderCards','selectCenter','districtAtPoint',
  '591 research','研究版不是完整房源聚合器',
])if(!html.includes(required))throw new Error(`Missing HTML experiment contract: ${required}`);

const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
if(!inline.length)throw new Error('No inline script in nearby-inventory-experiment.html');
for(const [index,script] of inline.entries()){
  try{new vm.Script(script,{filename:`nearby-inventory-inline-${index}.js`});}
  catch(error){throw new Error(`Inline script ${index} failed to compile: ${error.message}`);}
}

for(const required of [
  'https://bff-house.591.com.tw/v1/touch/sale/list',
  'https://bff-house.591.com.tw/v1/touch/sale/detail',
  'T591_TOKEN','MAX_PAGES=2','PAGE_SIZE=30','DETAIL_CONCURRENCY=4',
  "coverage:'research-sample'",'haversineMeters','nearby591','/api/nearby-listings',
  '不做 CAPTCHA / Cloudflare 繞過',
])if(!server.includes(required))throw new Error(`Missing server research contract: ${required}`);

for(const forbidden of ['cloudscraper','puppeteer-extra-plugin-stealth','playwright-extra','captcha solver','2captcha']){
  if(server.toLowerCase().includes(forbidden))throw new Error(`Anti-bot bypass must not be present: ${forbidden}`);
}

const sectionMatch=server.match(/const SECTION_IDS=\{([^}]+)\}/);
if(!sectionMatch)throw new Error('Taipei SECTION_IDS mapping missing');
for(const pair of ['中正:1','大同:2','中山:3','松山:4','大安:5','萬華:6','信義:7','士林:8','北投:9','內湖:10','南港:11','文山:12']){
  if(!sectionMatch[1].includes(pair))throw new Error(`Missing Taipei 591 section mapping: ${pair}`);
}

console.log(JSON.stringify({
  nearbyInventoryExperiment:'PASS',
  provider:'591 research only',
  radiusRange:'100-2000m',
  candidateCap:60,
  coordinateSource:'591 sale detail lat/lng',
  spatialFilter:'Haversine on local server',
  antiBotBypass:'ABSENT',
  warning:'sample coverage; not complete inventory',
},null,2));
