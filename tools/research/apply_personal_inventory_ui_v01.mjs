import fs from 'node:fs';

const desktop='public/inventory-prototype-v01.js';
const mobile='public/mobile-school-inventory-v04.html';

let d=fs.readFileSync(desktop,'utf8');
let m=fs.readFileSync(mobile,'utf8');

const oldDesktop="const FIXTURE_URL='./data/inventory/school-district-inventory-prototype-v01.json';";
const newDesktop="const FIXTURE_URL='./data/inventory/personal-research-current-v01.json';";
if(d.includes(oldDesktop))d=d.replace(oldDesktop,newDesktop);
if(!d.includes(newDesktop))throw new Error('desktop personal inventory data bridge missing');
d=d.replaceAll('research fixture','personal research snapshot').replaceAll("h.building_type_label||'—'","h.building_type_label||h.building_type||'—'");

const oldMobile="fetch(`${BASE}data/inventory/school-district-inventory-prototype-v01.json`)";
const newMobile="fetch('https://raw.githubusercontent.com/eddy121384-ui/Taipei-Maps/research/personal-inventory-v01/public/data/inventory/personal-research-current-v01.json',{cache:'no-store'})";
if(m.includes(oldMobile))m=m.replace(oldMobile,newMobile);
if(!m.includes('personal-research-current-v01.json'))throw new Error('mobile personal inventory data bridge missing');
m=m.replaceAll('Research fixture','Personal research snapshot').replaceAll('research fixture','personal research snapshot').replaceAll("h.building_type_label||'—'","h.building_type_label||h.building_type||'—'");

fs.writeFileSync(desktop,d);
fs.writeFileSync(mobile,m);
console.log('PASS personal inventory UI bridge · desktop + mobile');
