import {normalizeBigFunVisibleExport,toTemporaryInventoryHomes} from './bigfun-visible-import-core-v01.mjs';
import {geocodeBigFunHomes} from './bigfun-address-geocode-v01.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const countListings=h=>Math.max(1,Number(h?.listing_count)||0,Number(h?.source_count)||0,Array.isArray(h?.source_listings)?h.source_listings.length:0);
const formatWan=v=>finite(v)?`${Math.round(Number(v)).toLocaleString()}萬`:'—';
const rangeWan=h=>{const r=Array.isArray(h?.asking_range_wan)?h.asking_range_wan.filter(finite).map(Number):[];if(r.length>=2&&r[1]>r[0])return `${Math.round(r[0]).toLocaleString()}–${Math.round(r[1]).toLocaleString()}萬`;return finite(h?.asking_wan)?formatWan(h.asking_wan):(h?.asking_label||'價格未解析')};

async function waitForMap(){for(let i=0;i<160;i+=1){if(window.__taipeiMapsDesktopMap&&window.maplibregl)return window.__taipeiMapsDesktopMap;await sleep(100)}throw new Error('desktop map bridge unavailable')}
function injectStyle(){if(document.querySelector('#bigfunVisibleImportStyle'))return;const s=document.createElement('style');s.id='bigfunVisibleImportStyle';s.textContent=`
.bigfun-import-panel{position:absolute;z-index:9;top:14px;left:14px;width:min(430px,calc(100vw - 28px));max-height:calc(100vh - 28px);overflow:auto;padding:12px 13px;border:1px solid #ccd5db;border-radius:15px;background:rgba(255,255,255,.98);box-shadow:0 10px 30px rgba(0,0,0,.18);display:none}.bigfun-import-panel.open{display:block}.bfi-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.bfi-title{font-size:16px;font-weight:900}.bfi-kicker{font-size:9px;color:#70808a;letter-spacing:.08em;font-weight:850}.bfi-close{width:28px;height:28px;border:0;border-radius:99px;background:#edf1f3}.bfi-note{margin:7px 0;font-size:10px;line-height:1.45;color:#687780}.bfi-stat{padding:8px 9px;border-radius:10px;background:#f3f6f7;font-size:11px;line-height:1.5}.bfi-actions{display:flex;gap:6px;margin:8px 0;flex-wrap:wrap}.bfi-actions button{border:1px solid #c4cdd3;border-radius:9px;background:#fff;padding:6px 8px;font-weight:800;font-size:10px}.bfi-list{display:grid;gap:7px}.bfi-card{border:1px solid #dfe5e8;border-radius:12px;padding:9px 10px;background:#fff}.bfi-card.multi{border-color:#c8d5dc;box-shadow:0 1px 0 rgba(45,63,72,.04)}.bfi-row{display:flex;justify-content:space-between;gap:8px}.bfi-name,.bfi-price{font-size:12px;font-weight:850}.bfi-price{text-align:right;white-space:nowrap}.bfi-sub{font-size:9.7px;line-height:1.42;color:#71808a;margin-top:2px}.bfi-address{font-size:10px;line-height:1.4;color:#2b6c55;margin-top:5px;font-weight:800}.bfi-location{font-size:9.5px;line-height:1.4;margin-top:3px;color:#695090}.bfi-property-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.bfi-chip{display:inline-block;padding:2px 6px;border-radius:999px;background:#eef3f5;color:#52616b;font-size:9px;font-weight:850}.bfi-chip.multi{background:#e8f1f8;color:#315d78}.bfi-spread{margin-top:5px;padding:6px 7px;border-radius:9px;background:#f7f9fa;color:#5b6871;font-size:9.5px;line-height:1.4}.bfi-listing-title{margin-top:8px;padding-top:7px;border-top:1px solid #edf0f2;font-size:9px;font-weight:900;color:#74818a;letter-spacing:.06em}.bfi-listings{display:grid;gap:4px;margin-top:4px}.bfi-listing{display:grid;grid-template-columns:minmax(80px,1fr) auto auto;gap:6px;align-items:center;padding:6px 7px;border-radius:9px;background:#f8fafb;font-size:9.5px}.bfi-broker{font-weight:850;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bfi-listing-price{font-weight:900;white-space:nowrap}.bfi-source{font-size:9px;color:#245b8f;text-decoration:none;font-weight:800;white-space:nowrap}.bfi-marker{border:0;border-radius:999px;padding:5px 7px;background:#6b4f9b;color:white;font:850 10px/1 system-ui;box-shadow:0 3px 10px rgba(0,0,0,.25);white-space:nowrap}.bfi-attrib{font-size:9px;color:#7a858c}.bfi-attrib a{color:#526f8a}
`;document.head.appendChild(s)}

(async()=>{try{
  const map=await waitForMap();injectStyle();
  const summaryBtn=document.querySelector('#summaryBtn'),controls=summaryBtn?.closest('.controls');if(!controls)throw new Error('desktop controls unavailable');
  const button=document.createElement('button');button.id='bigfunVisibleImportBtn';button.textContent='📥 BigFun JSON';controls.appendChild(button);
  const input=document.createElement('input');input.type='file';input.accept='application/json,.json';input.style.display='none';document.body.appendChild(input);
  const panel=document.createElement('section');panel.id='bigfunVisibleImportPanel';panel.className='bigfun-import-panel';panel.innerHTML=`<div class="bfi-head"><div><div class="bfi-kicker">#77 · BIGFUN IMPORT v0.5 · PROPERTY CLUSTERS</div><div class="bfi-title">BigFun 實體房屋 / 刊登</div></div><button id="bfiClose" class="bfi-close">×</button></div><div class="bfi-note">同一實體房屋只畫一顆 pin；不同房仲／不同刊登保留在同一張 Property Card。BigFun 地圖座標只當弱證據，有「相關地址」時優先用臺北市官方門牌座標重新定位。</div><div id="bfiStat" class="bfi-stat">尚未匯入</div><div class="bfi-actions"><button id="bfiChoose">選擇 JSON</button><button id="bfiRelocate">重新門牌定位</button><button id="bfiClear">清除暫存</button></div><div class="bfi-attrib">地址定位來源：<a href="https://data.taipei/dataset/detail?id=b7c8e724-1e98-45ee-a0bd-f3840623ed97" target="_blank" rel="noopener">臺北市門牌位置數值資料</a>（民政局／公開資料）；查詢只走本機卜居 server。</div><div id="bfiList" class="bfi-list"></div>`;document.body.appendChild(panel);
  const stat=panel.querySelector('#bfiStat'),list=panel.querySelector('#bfiList');
  let payload={schema:'buju.bigfun-visible.v0.3',count:0,items:[]},homes=[];const markers=new Map();
  const sessionKey='buju.bigfun-visible.v0.4';let geocodeRun=0;

  function clearMarkers(){for(const m of markers.values())m.remove();markers.clear()}
  function renderMarkers(){clearMarkers();for(const h of homes){if(!finite(h.lon)||!finite(h.lat))continue;const listingCount=countListings(h),el=document.createElement('button');el.className='bfi-marker';el.textContent=`${finite(h.asking_wan)?formatWan(h.asking_wan):'BigFun'}${listingCount>1?` · ×${listingCount}`:''}`;el.title=`${h.name}\n${h.address_text||h.street||''}\n${listingCount} 筆刊登${h.location_basis==='taipei-official-doorplate'?'\n臺北市官方門牌座標':''}`;el.onclick=e=>{e.stopPropagation();map.easeTo({center:[Number(h.lon),Number(h.lat)],zoom:16,duration:400})};markers.set(h.id,new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([Number(h.lon),Number(h.lat)]).addTo(map))}}
  function fitLocated(){const located=homes.filter(h=>finite(h.lon)&&finite(h.lat));if(!located.length)return;const bounds=new maplibregl.LngLatBounds();located.forEach(h=>bounds.extend([Number(h.lon),Number(h.lat)]));map.fitBounds(bounds,{padding:90,maxZoom:16,duration:500})}
  function listingRows(h){const rows=Array.isArray(h.source_listings)&&h.source_listings.length?h.source_listings:[{source_label:h.source_label||'BigFun 刊登',source_url:h.source_url,asking_wan:h.asking_wan,title:h.name}];return [...rows].sort((a,b)=>{const ap=finite(a.asking_wan)?Number(a.asking_wan):Infinity,bp=finite(b.asking_wan)?Number(b.asking_wan):Infinity;return ap-bp})}
  function spreadText(h){const r=Array.isArray(h.asking_range_wan)?h.asking_range_wan.filter(finite).map(Number):[];if(r.length<2||r[1]<=r[0])return null;const gap=r[1]-r[0],pct=r[0]>0?gap/r[0]*100:null;return `跨刊登價差 ${Math.round(gap).toLocaleString()}萬${finite(pct)?` · ${pct.toFixed(1)}%`:''} · 最低 ${Math.round(r[0]).toLocaleString()}萬`}
  function render(){
    const located=homes.filter(h=>finite(h.lon)&&finite(h.lat)).length,official=homes.filter(h=>h.location_basis==='taipei-official-doorplate').length,withAddress=homes.filter(h=>h.address_text).length;
    const listingTotal=homes.reduce((sum,h)=>sum+countListings(h),0),collapsed=homes.reduce((sum,h)=>sum+Math.max(0,(Number(h.duplicate_collapsed_count)||1)-1),0);
    stat.innerHTML=`<strong>${homes.length}</strong> 戶實體候選 · <strong>${listingTotal}</strong> 筆刊登${listingTotal>homes.length?` · ${listingTotal-homes.length} 筆為多重刊登`:''}${collapsed?` · 原始重複收斂 ${collapsed}`:''}<br>有 BigFun 地址 ${withAddress} · 地圖定位 ${located}${official?`（${official} 戶官方門牌座標）`:''} · 待定位 ${homes.length-located}`;
    list.innerHTML='';
    for(const h of homes){
      const rows=listingRows(h),listingCount=countListings(h),card=document.createElement('div');card.className=`bfi-card${listingCount>1?' multi':''}`;
      const meta=[h.total_ping?`${h.total_ping}坪`:null,h.age_years?`${h.age_years}年`:null,h.bedrooms?`${h.bedrooms}房`:null,h.floor].filter(Boolean).join(' · ');
      const loc=h.location_basis==='taipei-official-doorplate'?'📍 臺北市官方門牌座標':finite(h.lon)&&finite(h.lat)?(h.location_basis==='bigfun-dom-coordinate-fallback'?'△ BigFun 座標 fallback':'📍 BigFun 頁面座標'):'○ 尚未定位';
      const spread=spreadText(h);
      const listingHtml=rows.map((r,i)=>`<div class="bfi-listing"><span class="bfi-broker">${esc(r.source_label||`刊登 ${i+1}`)}</span><span class="bfi-listing-price">${finite(r.asking_wan)?formatWan(r.asking_wan):'—'}</span>${r.source_url?`<a class="bfi-source" href="${esc(r.source_url)}" target="_blank" rel="noopener">來源 ↗</a>`:'<span></span>'}</div>`).join('');
      card.innerHTML=`<div class="bfi-row"><div><div class="bfi-name">${esc(h.name)}</div><div class="bfi-sub">${esc(meta)}</div></div><div class="bfi-price">${esc(rangeWan(h))}</div></div><div class="bfi-property-meta"><span class="bfi-chip ${listingCount>1?'multi':''}">${listingCount} 筆刊登</span>${listingCount>1?'<span class="bfi-chip multi">1 戶實體房屋</span>':''}</div>${spread?`<div class="bfi-spread">${esc(spread)}</div>`:''}<div class="bfi-address">${h.address_text?`Canonical 地址：${esc(h.address_text)}`:'BigFun 未解析到地址'}</div><div class="bfi-location">${loc} · 學區尚未官方驗證</div><div class="bfi-listing-title">LISTINGS · 保留不同房仲 / 刊登</div><div class="bfi-listings">${listingHtml}</div>`;
      card.onclick=e=>{if(e.target.closest('a'))return;if(finite(h.lon)&&finite(h.lat))map.easeTo({center:[Number(h.lon),Number(h.lat)],zoom:16,duration:400})};list.appendChild(card)
    }
    renderMarkers()
  }

  async function locateAddresses({fit=true}={}){
    const run=++geocodeRun;const candidates=homes.filter(h=>h.address_text&&h.location_basis!=='taipei-official-doorplate').length;if(!candidates){render();if(fit)fitLocated();return}
    stat.innerHTML=`官方門牌定位中… 0 / ${candidates}`;
    const result=await geocodeBigFunHomes(homes,{onProgress:p=>{if(run!==geocodeRun)return;if(Number.isInteger(p.home_index)&&p.home){homes[p.home_index]={...p.home};renderMarkers()}stat.innerHTML=`官方門牌定位中… 已定位 ${p.located} · 查無 ${p.failed} · 略過 ${p.skipped||0} · cache ${p.cache_hits}`}});
    if(run!==geocodeRun)return;homes=result.homes;
    if(result.service_error==='doorplate_index_missing'){stat.innerHTML='⚠ 臺北市官方門牌索引尚未建立。請關閉此頁後重新執行 start-bigfun-visible-import-smoke.bat，首次會下載並建立本機門牌索引。';renderMarkers();return}
    if(result.service_error&&result.located===0){stat.innerHTML=`⚠ 門牌定位服務錯誤：${esc(result.service_error)}。BigFun 地址仍已保留。`;renderMarkers();return}
    render();if(fit)fitLocated();
  }
  function setPayload(raw){payload=normalizeBigFunVisibleExport(raw);homes=toTemporaryInventoryHomes(payload);sessionStorage.setItem(sessionKey,JSON.stringify(payload));render();panel.classList.add('open');button.classList.add('active');locateAddresses({fit:true})}
  function clear(){geocodeRun+=1;payload={schema:'buju.bigfun-visible.v0.3',count:0,items:[]};homes=[];sessionStorage.removeItem(sessionKey);clearMarkers();render();button.classList.remove('active')}

  button.onclick=()=>{panel.classList.toggle('open');if(panel.classList.contains('open')&&!homes.length)input.click()};
  panel.querySelector('#bfiClose').onclick=()=>panel.classList.remove('open');
  panel.querySelector('#bfiChoose').onclick=()=>input.click();
  panel.querySelector('#bfiRelocate').onclick=()=>locateAddresses({fit:true});
  panel.querySelector('#bfiClear').onclick=clear;
  input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{setPayload(JSON.parse(await file.text()))}catch(err){console.error(err);stat.textContent='匯入失敗：JSON 格式不正確'}finally{input.value=''}};
  try{const saved=sessionStorage.getItem(sessionKey);if(saved)setPayload(JSON.parse(saved));else render()}catch{clear()}
  window.TaipeiMapsBigFunVisibleImportV01={setPayload,clear,locateAddresses,getHomes:()=>homes.map(h=>({...h,source_listings:Array.isArray(h.source_listings)?h.source_listings.map(x=>({...x})):[]})),getPayload:()=>JSON.parse(JSON.stringify(payload))};
}catch(error){console.error('BigFun visible import bootstrap failed',error)}})();
