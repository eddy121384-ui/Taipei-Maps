import {normalizeBigFunVisibleExport,toTemporaryInventoryHomes} from './bigfun-visible-import-core-v01.mjs';
import {geocodeBigFunHomes} from './bigfun-address-geocode-v01.mjs';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));

async function waitForMap(){for(let i=0;i<160;i+=1){if(window.__taipeiMapsDesktopMap&&window.maplibregl)return window.__taipeiMapsDesktopMap;await sleep(100)}throw new Error('desktop map bridge unavailable')}
function injectStyle(){if(document.querySelector('#bigfunVisibleImportStyle'))return;const s=document.createElement('style');s.id='bigfunVisibleImportStyle';s.textContent=`
.bigfun-import-panel{position:absolute;z-index:9;top:14px;left:14px;width:min(410px,calc(100vw - 28px));max-height:calc(100vh - 28px);overflow:auto;padding:12px 13px;border:1px solid #ccd5db;border-radius:15px;background:rgba(255,255,255,.98);box-shadow:0 10px 30px rgba(0,0,0,.18);display:none}.bigfun-import-panel.open{display:block}.bfi-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.bfi-title{font-size:16px;font-weight:900}.bfi-kicker{font-size:9px;color:#70808a;letter-spacing:.08em;font-weight:850}.bfi-close{width:28px;height:28px;border:0;border-radius:99px;background:#edf1f3}.bfi-note{margin:7px 0;font-size:10px;line-height:1.45;color:#687780}.bfi-stat{padding:8px 9px;border-radius:10px;background:#f3f6f7;font-size:11px}.bfi-actions{display:flex;gap:6px;margin:8px 0;flex-wrap:wrap}.bfi-actions button{border:1px solid #c4cdd3;border-radius:9px;background:#fff;padding:6px 8px;font-weight:800;font-size:10px}.bfi-list{display:grid;gap:6px}.bfi-card{border:1px solid #dfe5e8;border-radius:11px;padding:8px 9px;background:#fff}.bfi-row{display:flex;justify-content:space-between;gap:8px}.bfi-name,.bfi-price{font-size:12px;font-weight:850}.bfi-sub{font-size:9.7px;line-height:1.42;color:#71808a;margin-top:2px}.bfi-address{font-size:10px;line-height:1.4;color:#2b6c55;margin-top:4px;font-weight:800}.bfi-location{font-size:9.5px;line-height:1.4;margin-top:3px;color:#695090}.bfi-source{font-size:9.5px;color:#245b8f;text-decoration:none;font-weight:800}.bfi-marker{border:0;border-radius:999px;padding:5px 7px;background:#6b4f9b;color:white;font:850 10px/1 system-ui;box-shadow:0 3px 10px rgba(0,0,0,.25)}.bfi-attrib{font-size:9px;color:#7a858c}.bfi-attrib a{color:#526f8a}
`;document.head.appendChild(s)}

(async()=>{try{
  const map=await waitForMap();injectStyle();
  const summaryBtn=document.querySelector('#summaryBtn'),controls=summaryBtn?.closest('.controls');if(!controls)throw new Error('desktop controls unavailable');
  const button=document.createElement('button');button.id='bigfunVisibleImportBtn';button.textContent='📥 BigFun JSON';controls.appendChild(button);
  const input=document.createElement('input');input.type='file';input.accept='application/json,.json';input.style.display='none';document.body.appendChild(input);
  const panel=document.createElement('section');panel.id='bigfunVisibleImportPanel';panel.className='bigfun-import-panel';panel.innerHTML=`<div class="bfi-head"><div><div class="bfi-kicker">#77 · BIGFUN IMPORT v0.4</div><div class="bfi-title">BigFun 暫存房源</div></div><button id="bfiClose" class="bfi-close">×</button></div><div class="bfi-note">保留 BigFun 卡片上的「相關地址」。缺少座標時，卜居以臺北市政府公開門牌位置資料做本機精確門牌比對；學區仍需另外做官方學區驗證。</div><div id="bfiStat" class="bfi-stat">尚未匯入</div><div class="bfi-actions"><button id="bfiChoose">選擇 JSON</button><button id="bfiRelocate">重新門牌定位</button><button id="bfiClear">清除暫存</button></div><div class="bfi-attrib">地址定位來源：<a href="https://data.taipei/dataset/detail?id=b7c8e724-1e98-45ee-a0bd-f3840623ed97" target="_blank" rel="noopener">臺北市門牌位置數值資料</a>（民政局／公開資料）；查詢只走本機卜居 server。</div><div id="bfiList" class="bfi-list"></div>`;document.body.appendChild(panel);
  const stat=panel.querySelector('#bfiStat'),list=panel.querySelector('#bfiList');
  let payload={schema:'buju.bigfun-visible.v0.3',count:0,items:[]},homes=[];const markers=new Map();
  const sessionKey='buju.bigfun-visible.v0.4';let geocodeRun=0;

  function clearMarkers(){for(const m of markers.values())m.remove();markers.clear()}
  function renderMarkers(){clearMarkers();for(const h of homes){if(!finite(h.lon)||!finite(h.lat))continue;const el=document.createElement('button');el.className='bfi-marker';el.textContent=h.asking_wan?`${Math.round(h.asking_wan).toLocaleString()}萬`:'BigFun';el.title=`${h.name}\n${h.address_text||h.street||''}${h.location_basis==='taipei-official-doorplate'?'\n臺北市官方門牌座標':''}`;el.onclick=e=>{e.stopPropagation();map.easeTo({center:[Number(h.lon),Number(h.lat)],zoom:16,duration:400})};markers.set(h.id,new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([Number(h.lon),Number(h.lat)]).addTo(map))}}
  function fitLocated(){const located=homes.filter(h=>finite(h.lon)&&finite(h.lat));if(!located.length)return;const bounds=new maplibregl.LngLatBounds();located.forEach(h=>bounds.extend([Number(h.lon),Number(h.lat)]));map.fitBounds(bounds,{padding:90,maxZoom:16,duration:500})}
  function render(){const located=homes.filter(h=>finite(h.lon)&&finite(h.lat)).length,official=homes.filter(h=>h.location_basis==='taipei-official-doorplate').length,withAddress=homes.filter(h=>h.address_text).length;stat.innerHTML=`<strong>${homes.length}</strong> 戶暫存 · 有 BigFun 地址 ${withAddress} · 地圖定位 ${located}${official?`（${official} 戶官方門牌座標）`:''} · 待定位 ${homes.length-located}`;list.innerHTML='';for(const h of homes){const card=document.createElement('div');card.className='bfi-card';const meta=[h.total_ping?`${h.total_ping}坪`:null,h.age_years?`${h.age_years}年`:null,h.bedrooms?`${h.bedrooms}房`:null,h.floor].filter(Boolean).join(' · ');const loc=h.location_basis==='taipei-official-doorplate'?'📍 臺北市官方門牌座標':finite(h.lon)&&finite(h.lat)?'📍 BigFun 頁面座標':'○ 尚未定位';card.innerHTML=`<div class="bfi-row"><div><div class="bfi-name">${esc(h.name)}</div><div class="bfi-sub">${esc(meta)}</div></div><div class="bfi-price">${esc(h.asking_label)}</div></div><div class="bfi-address">${h.address_text?`BigFun 相關地址：${esc(h.address_text)}`:'BigFun 未解析到地址'}</div><div class="bfi-location">${loc} · 學區尚未官方驗證</div>${h.source_url?`<a class="bfi-source" href="${esc(h.source_url)}" target="_blank" rel="noopener">開啟 BigFun 來源 ↗</a>`:''}`;card.onclick=e=>{if(e.target.closest('a'))return;if(finite(h.lon)&&finite(h.lat))map.easeTo({center:[Number(h.lon),Number(h.lat)],zoom:16,duration:400})};list.appendChild(card)}renderMarkers()}

  async function locateAddresses({fit=true}={}){
    const run=++geocodeRun;const candidates=homes.filter(h=>!finite(h.lon)&&!finite(h.lat)&&h.address_text).length;if(!candidates){render();if(fit)fitLocated();return}
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
  window.TaipeiMapsBigFunVisibleImportV01={setPayload,clear,locateAddresses,getHomes:()=>homes.map(h=>({...h})),getPayload:()=>JSON.parse(JSON.stringify(payload))};
}catch(error){console.error('BigFun visible import bootstrap failed',error)}})();
