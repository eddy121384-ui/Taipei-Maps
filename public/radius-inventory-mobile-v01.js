import {DEFAULT_INVENTORY_FILTERS,normalizeInventoryFilters,summarizeInventory} from 'https://cdn.jsdelivr.net/gh/eddy121384-ui/Taipei-Maps@1800e5a68c2a8cd0db5a226a05185bcec889ad78/public/inventory-filter-core-v01.mjs';
import {queryRadiusHomes,radiusCoverage,radiusCircleFeature} from 'https://cdn.jsdelivr.net/gh/eddy121384-ui/Taipei-Maps@1800e5a68c2a8cd0db5a226a05185bcec889ad78/public/inventory-spatial-core-v01.mjs';

const DATA_URL='https://cdn.jsdelivr.net/gh/eddy121384-ui/Taipei-Maps@61c5ca862ac06ef75b83d02b12714fa15ea492db/public/data/inventory/personal-research-current-v01.json';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));

async function waitForMap(){
  for(let i=0;i<160;i+=1){if(window.__taipeiMapsMobileMap&&window.maplibregl)return window.__taipeiMapsMobileMap;await sleep(100)}
  throw new Error('mobile map bridge unavailable');
}

function injectStyle(){
  if(document.querySelector('#radiusInventoryMobileStyle'))return;
  const style=document.createElement('style');
  style.id='radiusInventoryMobileStyle';
  style.textContent=`
.radiusSheet{position:absolute;z-index:12;left:10px;right:10px;bottom:calc(var(--hud) + 18px + env(safe-area-inset-bottom));max-height:min(60vh,570px);overflow:auto;padding:8px 11px 12px;border:1px solid rgba(255,255,255,.8);border-radius:18px;background:rgba(255,255,255,.98);box-shadow:0 12px 34px rgba(0,0,0,.24);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);transform:translateY(16px);opacity:0;pointer-events:none;transition:.17s ease}.radiusSheet.open{transform:translateY(0);opacity:1;pointer-events:auto}.radiusHead{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.radiusKicker{font-size:9px;letter-spacing:.08em;color:#74818a;font-weight:850}.radiusTitle{font-size:15px;font-weight:900}.radiusClose{width:30px;height:30px;min-height:30px;border:0;border-radius:999px;background:#edf1f3;padding:0;font-size:18px}.radiusChoices{display:flex;gap:5px;margin:8px 0;overflow-x:auto}.radiusChoices button{min-height:30px;padding:5px 8px;font-size:10px}.radiusStat{padding:8px 9px;border-radius:11px;background:#f3f6f7;font-size:11px;line-height:1.42}.radiusStat strong{font-size:18px}.radiusCoverage{margin:6px 0 8px;font-size:9.5px;line-height:1.42;color:#6a7780}.radiusFilters{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0}.radiusFilter{display:grid;gap:3px;font-size:9px;color:#6c7881;font-weight:800}.radiusFilter select{width:100%;min-width:0;border:1px solid #cbd4da;border-radius:9px;background:#fff;padding:7px 6px;font-size:11px}.radiusList{display:grid;gap:7px}.radiusCard{border:1px solid #dfe5e8;border-radius:12px;padding:8px 9px;background:#fff}.radiusRow{display:flex;justify-content:space-between;gap:8px}.radiusName,.radiusPrice{font-size:12px;font-weight:850}.radiusPrice{white-space:nowrap}.radiusSub{font-size:9.7px;line-height:1.42;color:#71808a;margin-top:2px}.radiusBadge{display:inline-block;margin-top:4px;padding:2px 6px;border-radius:999px;font-size:9px;font-weight:850}.radiusBadge.exact{background:#e7f6ee;color:#146c43}.radiusBadge.shared{background:#fff3d6;color:#8a5a00}.radiusBadge.mismatch{background:#fdebea;color:#a5271d}.radiusSource{display:inline-block;margin-top:6px;font-size:10px;font-weight:850;color:#245b8f;text-decoration:none}.radiusEmpty{padding:12px 8px;color:#67747d;font-size:11px;line-height:1.5}.radiusMarker{border:0;border-radius:999px;padding:5px 7px;color:#fff;font:850 10px/1 system-ui;box-shadow:0 3px 10px rgba(0,0,0,.28);white-space:nowrap}.radiusMarker.exact{background:#147a4b}.radiusMarker.shared{background:#bd7a05}.radiusMarker.mismatch{background:#b42318}.radiusCenterDot{width:16px;height:16px;border:3px solid #fff;border-radius:99px;background:#26323c;box-shadow:0 2px 8px rgba(0,0,0,.35)}
@media(min-width:760px){.radiusSheet{left:456px;right:auto;bottom:14px;width:410px;max-height:80vh}}
`;
  document.head.appendChild(style);
}

function statusClass(s){return s==='verified_exact'?'exact':s==='verified_shared'?'shared':'mismatch'}
function statusText(s){return s==='verified_exact'?'官方精確學區':s==='verified_shared'?'官方共同學區':'學區標示不符'}
function radiusLabel(m){return m>=1000?`${m/1000}km`:`${m}m`}
function distanceLabel(m){return m<1000?`${Math.round(m)}m`:`${(m/1000).toFixed(1)}km`}

(async()=>{try{
  const [map,res]=await Promise.all([waitForMap(),fetch(DATA_URL,{cache:'no-store'})]);
  if(!res.ok)throw new Error(`inventory HTTP ${res.status}`);
  const homes=(await res.json()).homes||[];
  injectStyle();

  const hud=document.querySelector('#hud'),inventoryBtn=document.querySelector('#inventoryBtn'),topHint=document.querySelector('#topHint'),existingSheet=document.querySelector('#sheet');
  const firstControls=hud?.querySelector('.controls');
  if(!hud||!firstControls)throw new Error('mobile HUD unavailable');

  const nearbyBtn=document.createElement('button');
  nearbyBtn.id='nearbyBtn';nearbyBtn.textContent='📍 附近';firstControls.appendChild(nearbyBtn);

  const sheet=document.createElement('section');sheet.id='radiusInventorySheet';sheet.className='radiusSheet';sheet.innerHTML=`
    <div class="handle"></div><div class="radiusHead"><div><div class="radiusKicker">#75 · MAP RADIUS INVENTORY v0.1</div><div class="radiusTitle">這裡附近有什麼房子？</div></div><button id="radiusClose" class="radiusClose">×</button></div>
    <div class="radiusChoices"><button data-radius="300">300m</button><button data-radius="500">500m</button><button data-radius="1000" class="active">1km</button><button data-radius="2000">2km</button></div>
    <div id="radiusStat" class="radiusStat"><strong>—</strong> 戶 · 點地圖開始</div><div id="radiusCoverage" class="radiusCoverage"></div>
    <div class="radiusFilters"><label class="radiusFilter">總價上限<select id="rPrice"><option value="">不限</option><option value="3000">3,000萬</option><option value="4000">4,000萬</option><option value="5000">5,000萬</option><option value="8000">8,000萬</option></select></label><label class="radiusFilter">坪數<select id="rPing"><option value="any">不限</option><option value="lt20">20坪以下</option><option value="20_40">20–40坪</option><option value="40_60">40–60坪</option><option value="gte60">60坪以上</option></select></label><label class="radiusFilter">屋齡<select id="rAge"><option value="">不限</option><option value="20">20年以上</option><option value="30">30年以上</option><option value="40">40年以上</option></select></label><label class="radiusFilter">型態<select id="rForm"><option value="any">不限</option><option value="walkup">公寓</option><option value="elevator">電梯</option></select></label><label class="radiusFilter">房數<select id="rBedrooms"><option value="">不限</option><option value="1">1房以上</option><option value="2">2房以上</option><option value="3">3房以上</option><option value="4">4房以上</option></select></label></div>
    <div id="radiusList" class="radiusList"></div><div class="disclaimer">附近搜尋只納入已有可信座標的 canonical homes；目前未定位候選不會用街道中心點假裝落在半徑內。</div>`;
  document.body.appendChild(sheet);

  const stat=sheet.querySelector('#radiusStat'),coverageEl=sheet.querySelector('#radiusCoverage'),list=sheet.querySelector('#radiusList');
  const controls={price:sheet.querySelector('#rPrice'),ping:sheet.querySelector('#rPing'),age:sheet.querySelector('#rAge'),form:sheet.querySelector('#rForm'),bedrooms:sheet.querySelector('#rBedrooms')};
  let active=false,center=null,radiusM=1000,filters={...DEFAULT_INVENTORY_FILTERS},centerMarker=null;
  const markers=new Map();

  function readFilters(){filters=normalizeInventoryFilters({price_max_wan:controls.price.value,ping_band:controls.ping.value,age_min_years:controls.age.value,building_form:controls.form.value,bedrooms_min:controls.bedrooms.value})}
  function clearMarkers(){for(const m of markers.values())m.remove();markers.clear()}
  function clearCircle(){if(centerMarker){centerMarker.remove();centerMarker=null}const src=map.getSource('mobile-radius-inventory-v01');if(src)src.setData({type:'FeatureCollection',features:[]})}
  function ensureCircle(){if(!map.getSource('mobile-radius-inventory-v01'))map.addSource('mobile-radius-inventory-v01',{type:'geojson',data:{type:'FeatureCollection',features:[]}});if(!map.getLayer('mobile-radius-inventory-fill'))map.addLayer({id:'mobile-radius-inventory-fill',type:'fill',source:'mobile-radius-inventory-v01',paint:{'fill-color':'#26323c','fill-opacity':0.08}});if(!map.getLayer('mobile-radius-inventory-line'))map.addLayer({id:'mobile-radius-inventory-line',type:'line',source:'mobile-radius-inventory-v01',paint:{'line-color':'#26323c','line-width':2,'line-opacity':0.75}})}
  function drawCircle(){if(!center||!map.isStyleLoaded())return;ensureCircle();map.getSource('mobile-radius-inventory-v01').setData(radiusCircleFeature(center,radiusM));if(centerMarker)centerMarker.remove();const el=document.createElement('div');el.className='radiusCenterDot';centerMarker=new maplibregl.Marker({element:el}).setLngLat([center.lon,center.lat]).addTo(map)}
  function renderMarkers(visible){clearMarkers();for(const h of visible){if(!finite(h.lon)||!finite(h.lat))continue;const el=document.createElement('button');el.className=`radiusMarker ${statusClass(h.verification_status)}`;el.textContent=h.asking_wan?`${Math.round(h.asking_wan).toLocaleString()}萬`:h.asking_label;el.onclick=e=>{e.stopPropagation();map.easeTo({center:[h.lon,h.lat],zoom:16,duration:400})};markers.set(h.id,new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([h.lon,h.lat]).addTo(map))}}
  function render(){readFilters();const coverage=radiusCoverage(homes,center,radiusM);coverageEl.textContent=`目前可定位 ${coverage.located_candidates}/${coverage.total_candidates} 戶；另外 ${coverage.unlocated_candidates} 戶待定位，暫不參與半徑判斷。`;if(!center){stat.innerHTML=`<strong>—</strong> 戶 · 點地圖搜尋 ${radiusLabel(radiusM)}`;list.innerHTML='<div class="radiusEmpty">在地圖上點你想住的地方，我會搜尋周圍目前已定位的公開在售候選。</div>';clearMarkers();return}const spatial=queryRadiusHomes(homes,center,radiusM);const s=summarizeInventory(spatial,{filters,showMismatch:false,includeLocationCandidates:false});stat.innerHTML=`<strong>${s.total}</strong> 戶符合 · ${radiusLabel(radiusM)} 內 · 定位覆蓋 ${coverage.located_candidates}/${coverage.total_candidates}`;list.innerHTML='';if(!s.total)list.innerHTML='<div class="radiusEmpty">目前已定位樣本在這個半徑／條件下沒有房源。這不代表完整市場沒有。</div>';for(const h of s.visible){const card=document.createElement('div');card.className='radiusCard';const meta=[distanceLabel(h.distance_m),h.total_ping?`${h.total_ping}坪`:null,h.age_years?`${h.age_years}年`:null,h.building_type,h.bedrooms?`${h.bedrooms}房`:null].filter(Boolean).join(' · ');card.innerHTML=`<div class="radiusRow"><div><div class="radiusName">${esc(h.name)}</div><div class="radiusSub">${esc(h.street)} · ${esc(meta)}</div></div><div class="radiusPrice">${esc(h.asking_label)}</div></div><span class="radiusBadge ${statusClass(h.verification_status)}">${statusText(h.verification_status)}</span><div class="radiusSub">官方國中：${esc(h.official_junior||'待確認')}</div><a class="radiusSource" href="${esc(h.source_url)}" target="_blank" rel="noopener">開啟來源 · ${esc(h.source_label)} ↗</a>`;card.onclick=e=>{if(e.target.closest('a'))return;map.easeTo({center:[h.lon,h.lat],zoom:16,duration:400})};list.appendChild(card)}renderMarkers(s.visible)}
  function setCenter(lngLat){center={lon:Number(lngLat.lng??lngLat.lon),lat:Number(lngLat.lat)};drawCircle();render();topHint.textContent=`📍 ${radiusLabel(radiusM)} 搜尋中 · 點別處可移動中心`}
  function setMode(on){active=!!on;nearbyBtn.classList.toggle('active',active);sheet.classList.toggle('open',active);if(active){existingSheet?.classList.remove('open');topHint.textContent=`📍 點地圖任意位置，搜尋 ${radiusLabel(radiusM)} 內房源`;render()}else{clearMarkers();clearCircle();center=null;topHint.textContent='🎓 點學區，或切「附近」點地圖'}}

  nearbyBtn.onclick=()=>setMode(!active);
  sheet.querySelector('#radiusClose').onclick=()=>setMode(false);
  for(const el of Object.values(controls))el.onchange=render;
  sheet.querySelectorAll('[data-radius]').forEach(b=>b.onclick=()=>{radiusM=Number(b.dataset.radius);sheet.querySelectorAll('[data-radius]').forEach(x=>x.classList.toggle('active',x===b));if(center)drawCircle();render();if(active&&!center)topHint.textContent=`📍 點地圖任意位置，搜尋 ${radiusLabel(radiusM)} 內房源`});
  inventoryBtn?.addEventListener('click',()=>{if(active)setMode(false)});
  map.on('click',e=>{if(!active)return;const layers=map.getLayer('school-catchment-fill')?['school-catchment-fill']:[];if(layers.length&&map.queryRenderedFeatures(e.point,{layers}).some(f=>f.properties?.level==='junior'))return;setCenter(e.lngLat)});
  for(let i=0;i<120;i+=1){if(map.getLayer('school-catchment-fill')){map.on('click','school-catchment-fill',()=>{if(active)setMode(false)});break}await sleep(100)}

  window.TaipeiMapsRadiusInventoryV01={setMode,setCenter,getState:()=>({active,center:center?{...center}:null,radiusM,filters:{...filters},coverage:radiusCoverage(homes,center,radiusM)})};
}catch(error){console.error('Radius inventory mobile bootstrap failed',error)}})();
