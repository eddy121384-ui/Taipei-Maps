const BIGFUN_MAP_BASE='https://www.ibigfun.com/map/latest';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export function buildBigFunMapUrl(center){
  const lat=Number(center?.lat);
  const lng=Number(center?.lon ?? center?.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
  const url=new URL(BIGFUN_MAP_BASE);
  url.searchParams.set('lat',lat.toFixed(7));
  url.searchParams.set('lng',lng.toFixed(7));
  return url.toString();
}

function injectStyle(){
  if(document.querySelector('#bigfunSpatialLauncherStyle'))return;
  const style=document.createElement('style');
  style.id='bigfunSpatialLauncherStyle';
  style.textContent=`
.bigfun-launcher{display:grid;gap:5px;margin:8px 0 10px}.bigfun-launcher button{width:100%;min-height:38px;border:1px solid #1d5b89;border-radius:10px;background:#245f8d;color:#fff;font-weight:850;cursor:pointer}.bigfun-launcher button:disabled{cursor:not-allowed;opacity:.45}.bigfun-launcher-note{font-size:9.5px;line-height:1.4;color:#687780}.bigfun-launcher-coords{font-variant-numeric:tabular-nums}
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

(async()=>{try{
  const {api,config}=await waitForRadiusRuntime();
  injectStyle();
  if(document.querySelector('#bigfunNearbyLauncher'))return;

  const wrap=document.createElement('div');
  wrap.id='bigfunNearbyLauncher';
  wrap.className='bigfun-launcher';
  wrap.innerHTML=`<button id="bigfunNearbyBtn" type="button" disabled>🔎 BigFun 搜這附近</button><div id="bigfunNearbyNote" class="bigfun-launcher-note">先在卜居地圖選一個圓心。只會開啟 BigFun 同座標頁面，不會從 BigFun 抓取資料。</div>`;
  config.anchor.insertAdjacentElement('afterend',wrap);

  const button=wrap.querySelector('#bigfunNearbyBtn');
  const note=wrap.querySelector('#bigfunNearbyNote');
  let lastKey='';

  function sync(){
    const state=api.getState();
    const center=state?.center;
    const url=buildBigFunMapUrl(center);
    button.disabled=!url;
    const key=url||'';
    if(key===lastKey)return;
    lastKey=key;
    if(!url){
      note.textContent='先在卜居地圖選一個圓心。只會開啟 BigFun 同座標頁面，不會從 BigFun 抓取資料。';
      return;
    }
    note.innerHTML=`圓心 <span class="bigfun-launcher-coords">${Number(center.lat).toFixed(5)}, ${Number(center.lon).toFixed(5)}</span> · 建議先登入 BigFun；目前只帶圓心，BigFun 搜尋半徑由 BigFun 頁面決定。`;
  }

  button.addEventListener('click',()=>{
    const state=api.getState();
    const url=buildBigFunMapUrl(state?.center);
    if(!url)return;
    window.open(url,'_blank','noopener,noreferrer');
  });

  sync();
  window.setInterval(sync,250);
  window.TaipeiMapsBigFunSpatialLauncherV01={buildBigFunMapUrl,openCurrent:()=>{const url=buildBigFunMapUrl(api.getState()?.center);if(url)window.open(url,'_blank','noopener,noreferrer');return url;},getTargetUrl:()=>buildBigFunMapUrl(api.getState()?.center),platform:config.kind};
}catch(error){console.error('BigFun spatial launcher bootstrap failed',error)}})();
