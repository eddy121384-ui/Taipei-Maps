import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const DESKTOP='public/maplibre-pmtiles-provider-spike.html';
const MOBILE='public/mobile-school-inventory-v04.html';
const SMOKE='start-map-radius-inventory-smoke.bat';
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();

function mustReplace(text,needle,replacement,label){
  if(text.includes(replacement))return text;
  if(!text.includes(needle))throw new Error(`missing ${label}: ${needle}`);
  return text.replace(needle,replacement);
}

let desktop=fs.readFileSync(DESKTOP,'utf8');
desktop=mustReplace(
  desktop,
  '<script type="module" src="./radius-inventory-desktop-v01.js"></script>',
  '<script type="module" src="./radius-inventory-desktop-v01.js"></script>\n<script type="module" src="./bigfun-spatial-launcher-v01.js"></script>',
  'desktop radius loader'
);
fs.writeFileSync(DESKTOP,desktop);

let mobile=fs.readFileSync(MOBILE,'utf8');
const mobileUrl=`https://cdn.jsdelivr.net/gh/eddy121384-ui/Taipei-Maps@${head}/public/bigfun-spatial-launcher-v01.js`;
const existing=/\n?<script type="module" src="https:\/\/cdn\.jsdelivr\.net\/gh\/eddy121384-ui\/Taipei-Maps@[a-f0-9]+\/public\/bigfun-spatial-launcher-v01\.js"><\/script>/;
if(existing.test(mobile)){
  mobile=mobile.replace(existing,`\n<script type="module" src="${mobileUrl}"></script>`);
}else{
  mobile=mustReplace(mobile,'</body>',`<script type="module" src="${mobileUrl}"></script>\n</body>`,'mobile body close');
}
fs.writeFileSync(MOBILE,mobile);

let smoke=fs.readFileSync(SMOKE,'utf8');
if(!smoke.includes('test_bigfun_spatial_launcher_v01.mjs')){
  smoke=mustReplace(
    smoke,
    '"%NODE_CMD%" tools\\dev\\test_map_radius_inventory_v01.mjs\r\nif errorlevel 1 goto :fail',
    '"%NODE_CMD%" tools\\dev\\test_map_radius_inventory_v01.mjs\r\nif errorlevel 1 goto :fail\r\n"%NODE_CMD%" tools\\dev\\test_bigfun_spatial_launcher_v01.mjs\r\nif errorlevel 1 goto :fail',
    'radius test command'
  );
  smoke=mustReplace(
    smoke,
    'echo   - Click another map point; search center should move.\r\n',
    'echo   - Click another map point; search center should move.\r\necho   - After choosing a center, [BigFun search nearby] should enable and open BigFun with the same lat/lng.\r\necho   - BigFun launcher must only deep-link; Buju must not fetch or scrape BigFun content.\r\n',
    'radius smoke checklist'
  );
}
fs.writeFileSync(SMOKE,smoke);

console.log(`Applied BigFun spatial launcher v0.1 using mobile pin ${head}.`);
