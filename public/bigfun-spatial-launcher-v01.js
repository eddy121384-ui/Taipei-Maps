const BIGFUN_SEARCH_URL='https://www.ibigfun.com/Monitor';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function formatCenter(center){
  const lat=Number(center?.lat);
  const lng=Number(center?.lon ?? center?.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
  return `${lat.toFixed(7)},${lng.toFixed(7)}`;
}

function injectStyle(){
  if(document.querySelector('#bigfunSpatialLauncherStyle'))return;
  const style=document.createElement('style');
  style.id='bigfunSpatialLauncherStyle';
  style.textContent=`
.bigfun-launcher{display:grid;gap:6px;margin:8px 0 10px}.bigfun-launcher-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}.bigfun-launcher button{width:100%;min-height:38px;border:1px solid #1d5b89;border-radius:10px;background:#245f8d;color:#fff;font-weight:850;cursor:pointer}.bigfun-launcher button.secondary{background:#fff;color:#245f8d}.bigfun-launcher button:disabled{cursor:not-allowed;opacity:.45}.bigfun-launcher-note{font-size:9.5px;line-height:1.4;color:#687780}.bigfun-launcher-coords{font-variant-numeric:tabular-nums}
`;
  document.head.appendChild(style);
}

function platformConfig(){
  const desktop=document.querySelector('#radiusInventoryDesktop');
  if(desktop)return {panel:desktop,anchor:desktop.querySelector('#rdCoverage'),kind:'desktop'};
  const mobile=document.querySelector('#radiusInventorySheet');
  if(mobile)return {panel:mobile,anchor:mobile.querySelector('#radiusCoverage'),kind:'mobile'};
  return null;
}

async function waitForRadiusRuntime(){
  for(let i=0;i<160;i+=1){
    const api=window.TaipeiMapsRadiusInventoryV01;
    const config=platformConfig();
    if(api?.getState&&config?.anchor)return {api,config};
    await sleep(100);
  }
  throw new Error('radius inventory runtime unavailable');
}

async function copyText(text){
  if(!text)return false;
  try{
    if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}
  }catch{}
  const area=document.createElement('textarea');
  area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';
  document.body.appendChild(area);area.select();
  let ok=false;try{ok=document.execCommand('copy');}catch{}area.remove();return ok;
}

(async()=>{try{
  const {api,config}=await waitForRadiusRuntime();
  injectStyle();
  if(document.querySelector('#bigfunNearbyLauncher'))return;

  const wrap=document.createElement('div');
  wrap.id='bigfunNearbyLauncher';
  wrap.className='bigfun-launcher';
  wrap.innerHTML=`<div class="bigfun-launcher-actions"><button id="bigfunNearbyBtn" type="button">🔎 開 BigFun 找房比價</button><button id="bigfunCopyCenterBtn" class="secondary" type="button" disabled>📋 複製圓心座標</button></div><div id="bigfunNearbyNote" class="bigfun-launcher-note">先在卜居地圖選一個圓心。BigFun 按鈕只會開啟官方找房比價 UI；目前不會自動把座標送進 BigFun，也不會抓取 BigFun 資料。</div>`;
  config.anchor.insertAdjacentElement('afterend',wrap);

  const openButton=wrap.querySelector('#bigfunNearbyBtn');
  const copyButton=wrap.querySelector('#bigfunCopyCenterBtn');
  const note=wrap.querySelector('#bigfunNearbyNote');
  let lastKey='';

  function sync(){
    const center=api.getState()?.center;
    const coords=formatCenter(center);
    copyButton.disabled=!coords;
    if(coords===lastKey)return;
    lastKey=coords||'';
    if(!coords){
      note.textContent='先在卜居地圖選一個圓心。BigFun 按鈕只會開啟官方找房比價 UI；目前不會自動把座標送進 BigFun，也不會抓取 BigFun 資料。';
      return;
    }
    note.innerHTML=`卜居圓心 <span class="bigfun-launcher-coords">${Number(center.lat).toFixed(5)}, ${Number(center.lon).toFixed(5)}</span> · 可複製座標後，在 BigFun 正常 UI 進行人工定位。`;
  }

  openButton.addEventListener('click',()=>window.open(BIGFUN_SEARCH_URL,'_blank','noopener,noreferrer'));
  copyButton.addEventListener('click',async()=>{
    const coords=formatCenter(api.getState()?.center);
    if(!coords)return;
    const ok=await copyText(coords);
    const old=copyButton.textContent;
    copyButton.textContent=ok?'✓ 已複製':'複製失敗';
    window.setTimeout(()=>{copyButton.textContent=old;},1200);
  });

  sync();
  window.setInterval(sync,250);
  window.TaipeiMapsBigFunSpatialLauncherV01={
    getSearchUrl:()=>BIGFUN_SEARCH_URL,
    getCenterText:()=>formatCenter(api.getState()?.center),
    openBigFun:()=>{window.open(BIGFUN_SEARCH_URL,'_blank','noopener,noreferrer');return BIGFUN_SEARCH_URL;},
    copyCenter:async()=>copyText(formatCenter(api.getState()?.center)),
    platform:config.kind
  };
}catch(error){console.error('BigFun spatial launcher bootstrap failed',error)}})();
