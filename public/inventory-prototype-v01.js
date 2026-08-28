const FIXTURE_URL='./data/inventory/school-district-inventory-prototype-v01.json';
const VERIFIED=new Set(['verified_exact','verified_shared']);
const SCHOOL_LABEL={金華:'金華國中',中正:'中正國中'};

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function waitForMap(){
  for(let i=0;i<120;i+=1){
    const map=window.__taipeiMapsDesktopMap;
    if(map&&window.maplibregl)return map;
    await sleep(100);
  }
  throw new Error('desktop map bridge unavailable');
}

function injectStyle(){
  if(document.querySelector('#inventoryPrototypeStyle'))return;
  const style=document.createElement('style');
  style.id='inventoryPrototypeStyle';
  style.textContent=`
  .inventory-panel{position:absolute;z-index:7;top:14px;right:14px;width:min(405px,calc(100vw - 28px));max-height:calc(100vh - 28px);overflow:auto;padding:13px 14px 14px;border:1px solid #ccd3d9;border-radius:16px;background:rgba(255,255,255,.98);box-shadow:0 10px 30px rgba(0,0,0,.18);display:none}.inventory-panel.open{display:block}
  .inventory-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.inventory-title{font-size:17px;font-weight:850}.inventory-kicker{font-size:10px;font-weight:850;letter-spacing:.1em;color:#6d7a84}.inventory-close{width:30px;height:30px;padding:0;border:0;border-radius:999px;background:#edf1f3;font-size:18px}
  .inventory-tabs{display:flex;gap:6px;margin:10px 0}.inventory-tabs button{flex:1}.inventory-stat{padding:9px 10px;border-radius:11px;background:#f4f6f7;font-size:12px;line-height:1.45}.inventory-stat strong{font-size:18px}.inventory-debug{display:flex;align-items:center;gap:6px;margin:8px 0;font-size:11px;color:#68727d}.inventory-debug input{margin:0}
  .inventory-legend{display:flex;gap:8px;flex-wrap:wrap;font-size:10.5px;color:#66717b;margin:7px 0}.inventory-dot{width:9px;height:9px;border-radius:999px;display:inline-block;margin-right:3px}.inventory-dot.exact{background:#147a4b}.inventory-dot.shared{background:#bd7a05}.inventory-dot.mismatch{background:#b42318}
  .inventory-list{display:grid;gap:7px;margin-top:8px}.inventory-item{border:1px solid #dde3e7;border-radius:12px;padding:9px 10px;cursor:pointer;background:#fff}.inventory-item:hover{background:#f8fafb}.inventory-item.mismatch{border-style:dashed}.inventory-row{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.inventory-name{font-size:13px;font-weight:850}.inventory-price{font-size:13px;font-weight:850;white-space:nowrap}.inventory-sub{font-size:10.5px;color:#71808a;line-height:1.45;margin-top:3px}.inventory-badge{display:inline-block;padding:2px 6px;border-radius:999px;font-size:9.5px;font-weight:850;margin-top:5px}.inventory-badge.exact{background:#e7f6ee;color:#146c43}.inventory-badge.shared{background:#fff3d6;color:#8a5a00}.inventory-badge.mismatch{background:#fdebea;color:#a5271d}
  .inventory-detail{border-top:1px solid #e4e9ec;margin-top:10px;padding-top:9px}.inventory-detail[hidden]{display:none}.inventory-detail-grid{display:grid;grid-template-columns:90px 1fr;gap:5px 9px;font-size:11.5px}.inventory-detail-grid span:nth-child(odd){color:#697680}.inventory-detail-grid span:nth-child(even){text-align:right;font-weight:750}.inventory-warning{margin-top:8px;padding:8px 9px;border-radius:10px;background:#fff1ef;color:#9a271d;font-size:10.5px;line-height:1.45}.inventory-shared{margin-top:8px;padding:8px 9px;border-radius:10px;background:#fff6df;color:#7b570b;font-size:10.5px;line-height:1.45}.inventory-source{display:inline-block;margin-top:9px;font-size:11px;font-weight:800;color:#245b8f;text-decoration:none}.inventory-disclaimer{font-size:10px;color:#7a8790;line-height:1.4;margin-top:10px}
  .inv-marker{border:0;padding:5px 8px;border-radius:999px;color:#fff;font:800 11px/1 system-ui,sans-serif;box-shadow:0 2px 9px rgba(0,0,0,.25);cursor:pointer;white-space:nowrap}.inv-marker.exact{background:#147a4b}.inv-marker.shared{background:#bd7a05}.inv-marker.mismatch{background:#b42318}.inv-marker.selected{outline:3px solid rgba(32,43,51,.28);transform:translateY(-1px)}
  @media(max-width:1040px){.inventory-panel{top:auto;bottom:14px;max-height:54vh}}
  `;
  document.head.appendChild(style);
}

function statusClass(status){return status==='verified_exact'?'exact':status==='verified_shared'?'shared':'mismatch';}
function statusText(status){return status==='verified_exact'?'官方精確學區':status==='verified_shared'?'官方共同學區':'學區標示不符';}

(async()=>{
  try{
    const [map,res]=await Promise.all([waitForMap(),fetch(FIXTURE_URL,{cache:'no-store'})]);
    if(!res.ok)throw new Error(`fixture HTTP ${res.status}`);
    const fixture=await res.json();
    const homes=Array.isArray(fixture.homes)?fixture.homes:[];
    injectStyle();

    const summaryBtn=document.querySelector('#summaryBtn');
    const featureControls=summaryBtn?.closest('.controls');
    if(!featureControls)throw new Error('desktop feature controls missing');

    let inventoryBtn=document.querySelector('#inventoryBtn');
    if(!inventoryBtn){inventoryBtn=document.createElement('button');inventoryBtn.id='inventoryBtn';inventoryBtn.textContent='🏠 房源 OFF';featureControls.appendChild(inventoryBtn);}

    let inventoryStatus=document.querySelector('#inventoryStatus');
    if(!inventoryStatus){inventoryStatus=document.createElement('div');inventoryStatus.id='inventoryStatus';inventoryStatus.className='status muted';inventoryStatus.textContent='房源 prototype READY · research fixture，不代表完整市場。';document.querySelector('#summaryStatus')?.insertAdjacentElement('afterend',inventoryStatus);}

    const panel=document.createElement('section');
    panel.id='inventoryPanel';panel.className='inventory-panel';panel.setAttribute('aria-live','polite');
    panel.innerHTML=`<div class="inventory-head"><div><div class="inventory-kicker">#71 · RESEARCH INVENTORY UX</div><div class="inventory-title">學區現在有什麼房子？</div></div><button id="inventoryClose" class="inventory-close" aria-label="關閉房源">×</button></div><div class="inventory-tabs"><button data-school="金華" class="active">金華國中</button><button data-school="中正">中正國中</button></div><div id="inventoryStat" class="inventory-stat"></div><label class="inventory-debug"><input id="inventoryShowMismatch" type="checkbox"/> 研究模式：顯示學區 mismatch（不計入已驗證戶數）</label><div class="inventory-legend"><span><i class="inventory-dot exact"></i>精確</span><span><i class="inventory-dot shared"></i>共同學區</span><span><i class="inventory-dot mismatch"></i>不符</span></div><div id="inventoryDetail" class="inventory-detail" hidden></div><div id="inventoryList" class="inventory-list"></div><div class="inventory-disclaimer">這是產品體驗 fixture，不是完整即時市場清單。未來只應由授權 provider/feed 替換資料；官方 115 學區驗證邏輯保留。</div>`;
    document.body.appendChild(panel);

    const listEl=panel.querySelector('#inventoryList'),statEl=panel.querySelector('#inventoryStat'),detailEl=panel.querySelector('#inventoryDetail'),debugEl=panel.querySelector('#inventoryShowMismatch');
    const markers=new Map();
    let mode=false,school='金華',selectedId=null;

    function enableJuniorContext(){
      const districtBtn=document.querySelector('#districtBtn'),juniorBtn=document.querySelector('#juniorBtn');
      if(districtBtn&&!districtBtn.classList.contains('active'))districtBtn.click();
      if(juniorBtn&&!juniorBtn.classList.contains('mode-active'))juniorBtn.click();
    }
    function visibleHomes(){return homes.filter(h=>h.query_school===school&&(VERIFIED.has(h.verification_status)||debugEl.checked));}
    function verifiedHomes(){return homes.filter(h=>h.query_school===school&&VERIFIED.has(h.verification_status));}
    function clearMarkers(){for(const marker of markers.values())marker.remove();markers.clear();}
    function markerLabel(h){return h.asking_wan?`${Math.round(h.asking_wan).toLocaleString()}萬`:h.asking_label.replace(' 萬區間','');}
    function focusHome(home){
      selectedId=home.id;
      for(const [id,marker] of markers){marker.getElement().classList.toggle('selected',id===selectedId);}
      map.easeTo({center:[home.lon,home.lat],zoom:16,duration:550});
      const cls=statusClass(home.verification_status);
      detailEl.hidden=false;
      detailEl.innerHTML=`<div class="inventory-row"><div><div class="inventory-name">${esc(home.name)}</div><div class="inventory-sub">${esc(home.street)} · 位置 ${esc(home.location_precision_grade)}</div></div><div class="inventory-price">${esc(home.asking_label)}</div></div><span class="inventory-badge ${cls}">${esc(statusText(home.verification_status))}</span><div class="inventory-detail-grid"><span>單價</span><span>${esc(home.unit_price_label||'—')}</span><span>坪數</span><span>${home.total_ping?`${esc(home.total_ping)} 坪`:'—'}</span><span>格局／樓層</span><span>${esc([home.layout,home.floor].filter(Boolean).join(' · ')||'—')}</span><span>外部宣稱</span><span>${esc(home.external_school_claim)}</span><span>官方國小</span><span>${esc(home.official_elementary)}</span><span>官方國中</span><span>${esc(home.official_junior)}</span><span>官方里鄰</span><span>${esc(home.official_location)}</span></div>${home.verification_status==='mismatch'?`<div class="inventory-warning">⚠ ${esc(home.note)}</div>`:home.verification_status==='verified_shared'?`<div class="inventory-shared">◐ ${esc(home.note)}</div>`:''}<a class="inventory-source" href="${esc(home.source_url)}" target="_blank" rel="noopener">開啟來源 · ${esc(home.source_label)} ↗</a>`;
    }
    function renderMarkers(){
      clearMarkers();
      for(const home of visibleHomes()){
        const el=document.createElement('button');el.type='button';el.className=`inv-marker ${statusClass(home.verification_status)}`;el.textContent=markerLabel(home);el.title=`${home.name} · ${home.asking_label}`;el.onclick=e=>{e.stopPropagation();focusHome(home);};
        const marker=new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([home.lon,home.lat]).addTo(map);markers.set(home.id,marker);
      }
    }
    function renderList(){
      const verified=verifiedHomes(),exact=verified.filter(h=>h.verification_status==='verified_exact').length,shared=verified.filter(h=>h.verification_status==='verified_shared').length,mismatch=homes.filter(h=>h.query_school===school&&h.verification_status==='mismatch').length;
      statEl.innerHTML=`<strong>${verified.length}</strong> 戶已驗證 · 精確 ${exact} · 共同學區 ${shared}${mismatch?`<br><span style="color:#7a8790">另有 ${mismatch} 戶外部宣稱不符（預設排除）</span>`:''}`;
      listEl.innerHTML='';
      for(const home of visibleHomes()){
        const item=document.createElement('div');item.className=`inventory-item ${statusClass(home.verification_status)}`;item.innerHTML=`<div class="inventory-row"><div><div class="inventory-name">${esc(home.name)}</div><div class="inventory-sub">${esc(home.street)} · ${home.total_ping?`${esc(home.total_ping)}坪 · `:''}${esc(home.layout||'')}</div></div><div class="inventory-price">${esc(home.asking_label)}</div></div><span class="inventory-badge ${statusClass(home.verification_status)}">${esc(statusText(home.verification_status))}</span><div class="inventory-sub">官方國中：${esc(home.official_junior)}</div>`;item.onclick=()=>focusHome(home);listEl.appendChild(item);
      }
    }
    function fitSchool(){
      const pts=verifiedHomes().map(h=>[h.lon,h.lat]);if(!pts.length)return;
      const bounds=pts.reduce((b,p)=>b.extend(p),new maplibregl.LngLatBounds(pts[0],pts[0]));map.fitBounds(bounds,{padding:{top:90,bottom:90,left:590,right:440},maxZoom:15.8,duration:650});
    }
    function render(){
      panel.querySelectorAll('[data-school]').forEach(b=>b.classList.toggle('active',b.dataset.school===school));
      selectedId=null;detailEl.hidden=true;renderList();renderMarkers();if(mode)fitSchool();
      inventoryStatus.textContent=`房源 prototype · ${SCHOOL_LABEL[school]} · 已驗證 ${verifiedHomes().length} 戶 · research fixture`;inventoryStatus.className='status good';
    }
    function setMode(on){
      mode=on;inventoryBtn.classList.toggle('active',on);inventoryBtn.textContent=`🏠 房源 ${on?'ON':'OFF'}`;panel.classList.toggle('open',on);
      if(on){if(summaryBtn?.classList.contains('active'))summaryBtn.click();enableJuniorContext();render();}
      else{clearMarkers();detailEl.hidden=true;inventoryStatus.textContent='房源 prototype READY · research fixture，不代表完整市場。';inventoryStatus.className='status muted';}
    }

    inventoryBtn.onclick=()=>setMode(!mode);
    panel.querySelector('#inventoryClose').onclick=()=>setMode(false);
    panel.querySelectorAll('[data-school]').forEach(b=>b.onclick=()=>{school=b.dataset.school;render();});
    debugEl.onchange=()=>render();
    summaryBtn?.addEventListener('click',()=>setTimeout(()=>{if(summaryBtn.classList.contains('active')&&mode)setMode(false);},0));

    const eyebrow=document.querySelector('#eyebrow');if(eyebrow)eyebrow.textContent=eyebrow.textContent.replace('#65','#71').replace('LOCATION SUMMARY','LOCATION SUMMARY + INVENTORY UX');
    inventoryStatus.textContent=`房源 prototype READY · ${homes.length} research candidates · 金華/中正`;
  }catch(error){
    console.error('Inventory prototype bootstrap failed',error);
    const status=document.querySelector('#inventoryStatus');if(status){status.textContent=`房源 prototype unavailable · ${error?.message||error}`;status.className='status error';}
  }
})();
