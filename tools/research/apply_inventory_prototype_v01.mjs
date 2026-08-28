import fs from 'node:fs';

const desktopPath='public/maplibre-pmtiles-provider-spike.html';
let html=fs.readFileSync(desktopPath,'utf8');
let desktopChanged=false;

if(!html.includes('window.__taipeiMapsDesktopMap=map;')){
  const re=/(\n  const map=core\.createMap\([^\n]+\);\n)/;
  if(!re.test(html))throw new Error('desktop map creation anchor not found');
  html=html.replace(re,`$1  window.__taipeiMapsDesktopMap=map;\n`);
  desktopChanged=true;
}

if(!html.includes('src="./inventory-prototype-v01.js"')){
  const anchor='</body>';
  if(!html.includes(anchor))throw new Error('desktop body closing anchor not found');
  html=html.replace(anchor,'<script type="module" src="./inventory-prototype-v01.js"></script>\n</body>');
  desktopChanged=true;
}

if(!html.includes('window.__taipeiMapsDesktopMap=map;')||!html.includes('inventory-prototype-v01.js'))throw new Error('inventory prototype wiring failed');
if(desktopChanged)fs.writeFileSync(desktopPath,html);

const inventoryPath='public/inventory-prototype-v01.js';
let js=fs.readFileSync(inventoryPath,'utf8');
let inventoryChanged=false;

if(!js.includes('requestedAssignment=null')){
  const anchor="    let mode=false,school='金華',selectedId=null;";
  if(!js.includes(anchor))throw new Error('inventory state anchor not found');
  js=js.replace(anchor,"    let mode=false,school='金華',selectedId=null,requestedAssignment=null;");
  inventoryChanged=true;
}

if(!js.includes('prototype 尚無此學區的房源 fixture')){
  const anchor="    function render(){\n      panel.querySelectorAll('[data-school]').forEach(b=>b.classList.toggle('active',b.dataset.school===school));\n      selectedId=null;detailEl.hidden=true;renderList();renderMarkers();if(mode)fitSchool();\n      inventoryStatus.textContent=`房源 prototype · ${SCHOOL_LABEL[school]} · 已驗證 ${verifiedHomes().length} 戶 · research fixture`;inventoryStatus.className='status good';\n    }";
  if(!js.includes(anchor))throw new Error('inventory render anchor not found');
  const replacement="    function render(){\n      panel.querySelectorAll('[data-school]').forEach(b=>b.classList.toggle('active',!!school&&b.dataset.school===school));\n      selectedId=null;detailEl.hidden=true;\n      if(!school){\n        clearMarkers();\n        const label=requestedAssignment||'這個國中學區';\n        statEl.innerHTML=`<strong>0</strong> 戶 prototype 房源<br><span style=\"color:#7a8790\">${esc(label)}目前 prototype 尚無此學區的房源 fixture。</span>`;\n        listEl.innerHTML='<div class=\"inventory-sub\">這不代表市場上沒有房子；只代表目前 #71 研究 fixture 尚未覆蓋。正式產品應由授權 live inventory provider 回答。</div>';\n        inventoryStatus.textContent=`房源 prototype · ${label} · 尚無 fixture`;inventoryStatus.className='status muted';\n        return;\n      }\n      renderList();renderMarkers();if(mode)fitSchool();\n      inventoryStatus.textContent=`房源 prototype · ${SCHOOL_LABEL[school]} · 已驗證 ${verifiedHomes().length} 戶 · research fixture`;inventoryStatus.className='status good';\n    }";
  js=js.replace(anchor,replacement);
  inventoryChanged=true;
}

if(!js.includes('selectFromOfficialAssignment')){
  const anchor="    function setMode(on){\n      mode=on;inventoryBtn.classList.toggle('active',on);inventoryBtn.textContent=`🏠 房源 ${on?'ON':'OFF'}`;panel.classList.toggle('open',on);\n      if(on){if(summaryBtn?.classList.contains('active'))summaryBtn.click();enableJuniorContext();render();}\n      else{clearMarkers();detailEl.hidden=true;inventoryStatus.textContent='房源 prototype READY · research fixture，不代表完整市場。';inventoryStatus.className='status muted';}\n    }";
  if(!js.includes(anchor))throw new Error('inventory mode anchor not found');
  const replacement=anchor+"\n    function selectFromOfficialAssignment(assignment){\n      const raw=String(assignment||'').trim();\n      if(!raw)return;\n      requestedAssignment=raw;\n      school=Object.keys(SCHOOL_LABEL).find(key=>raw.includes(key))||null;\n      setMode(true);\n    }\n    async function bindSchoolCatchmentSelection(){\n      const layerId='school-catchment-fill';\n      for(let i=0;i<120;i+=1){\n        if(map.getLayer(layerId)){\n          map.on('click',layerId,e=>{\n            const p=e.features?.[0]?.properties||{};\n            if(p.level!=='junior')return;\n            selectFromOfficialAssignment(p.school);\n          });\n          return;\n        }\n        await sleep(100);\n      }\n      console.warn('Inventory prototype could not bind school catchment click: layer unavailable');\n    }";
  js=js.replace(anchor,replacement);
  inventoryChanged=true;
}

if(!js.includes('TaipeiMapsInventoryPrototypeV01')){
  const anchor="    panel.querySelectorAll('[data-school]').forEach(b=>b.onclick=()=>{school=b.dataset.school;render();});\n    debugEl.onchange=()=>render();";
  if(!js.includes(anchor))throw new Error('inventory tab binding anchor not found');
  const replacement="    panel.querySelectorAll('[data-school]').forEach(b=>b.onclick=()=>{requestedAssignment=null;school=b.dataset.school;render();});\n    debugEl.onchange=()=>render();\n    window.TaipeiMapsInventoryPrototypeV01={selectFromOfficialAssignment,setMode,getState:()=>({mode,school,requestedAssignment})};\n    bindSchoolCatchmentSelection();";
  js=js.replace(anchor,replacement);
  inventoryChanged=true;
}

if(!js.includes('selectFromOfficialAssignment')||!js.includes('TaipeiMapsInventoryPrototypeV01')||!js.includes('prototype 尚無此學區的房源 fixture'))throw new Error('school-to-inventory interaction wiring failed');
if(inventoryChanged)fs.writeFileSync(inventoryPath,js);

console.log(JSON.stringify({desktopChanged,inventoryChanged,schoolClickBridge:'PASS'},null,2));