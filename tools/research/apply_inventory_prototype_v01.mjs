import fs from 'node:fs';

const path='public/maplibre-pmtiles-provider-spike.html';
let html=fs.readFileSync(path,'utf8');
let changed=false;

if(!html.includes('window.__taipeiMapsDesktopMap=map;')){
  const re=/(\n  const map=core\.createMap\([^\n]+\);\n)/;
  if(!re.test(html))throw new Error('desktop map creation anchor not found');
  html=html.replace(re,`$1  window.__taipeiMapsDesktopMap=map;\n`);
  changed=true;
}

if(!html.includes('src="./inventory-prototype-v01.js"')){
  const anchor='</body>';
  if(!html.includes(anchor))throw new Error('desktop body closing anchor not found');
  html=html.replace(anchor,'<script type="module" src="./inventory-prototype-v01.js"></script>\n</body>');
  changed=true;
}

if(!html.includes('window.__taipeiMapsDesktopMap=map;')||!html.includes('inventory-prototype-v01.js'))throw new Error('inventory prototype wiring failed');
if(changed)fs.writeFileSync(path,html);
console.log(changed?'PATCHED desktop inventory prototype bridge':'PASS desktop inventory prototype bridge already present');
