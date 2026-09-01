import fs from 'node:fs';

const path='public/maplibre-pmtiles-provider-spike.html';
let html=fs.readFileSync(path,'utf8');
const loader='<script type="module" src="./bigfun-visible-import-desktop-v01.js"></script>';
if(!html.includes(loader)){
  if(!html.includes('</body>'))throw new Error('desktop shell missing </body>');
  html=html.replace('</body>',`${loader}\n</body>`);
  fs.writeFileSync(path,html);
  console.log('APPLIED BigFun visible import desktop loader');
}else console.log('NOOP BigFun visible import desktop loader already present');
