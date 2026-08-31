import fs from 'node:fs';

const MOBILE='public/mobile-school-inventory-v04.html';
const DESKTOP='public/maplibre-pmtiles-provider-spike.html';
const MOBILE_OVERLAY='https://cdn.jsdelivr.net/gh/eddy121384-ui/Taipei-Maps@6759807b70a498feddf50ba736903f200d4f955c/public/radius-inventory-mobile-v01.js';

function replaceOnce(text,needle,replacement,label){
  if(!text.includes(needle))throw new Error(`missing patch anchor: ${label}`);
  return text.replace(needle,replacement);
}

let mobile=fs.readFileSync(MOBILE,'utf8');
if(!mobile.includes('window.__taipeiMapsMobileMap=map')){
  mobile=replaceOnce(mobile,';map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),\'top-right\');',';window.__taipeiMapsMobileMap=map;map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),\'top-right\');','mobile map bridge');
}
if(!mobile.includes('radius-inventory-mobile-v01.js')){
  mobile=replaceOnce(mobile,'</body>',`<script type="module" src="${MOBILE_OVERLAY}"></script>\n</body>`,'mobile overlay loader');
}
fs.writeFileSync(MOBILE,mobile);

let desktop=fs.readFileSync(DESKTOP,'utf8');
if(!desktop.includes('radius-inventory-desktop-v01.js')){
  desktop=replaceOnce(desktop,'<script type="module" src="./inventory-prototype-v01.js"></script>','<script type="module" src="./inventory-prototype-v01.js"></script>\n<script type="module" src="./radius-inventory-desktop-v01.js"></script>','desktop overlay loader');
}
fs.writeFileSync(DESKTOP,desktop);

console.log('PASS apply map radius inventory v0.1 overlay · desktop + mobile');
