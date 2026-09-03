(()=>{
  if(window.__BUJU_LISTING_COLLECTOR_V04__)return;
  window.__BUJU_LISTING_COLLECTOR_V04__=true;

  const STORAGE_KEY='buju.listing.collection.v0.1';
  const LEGACY_BIGFUN_KEY='buju.bigfun.collection.v0.3';
  const SCHEMA='buju.listing-collection.v0.1';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const multiline=v=>String(v??'').split(/\n+/).map(clean).filter(Boolean).join('\n');
  const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const ADAPTERS=[
    {id:'bigfun',label:'BigFun',hosts:['ibigfun.com'],cardSelectors:['article','li','[class*="house"]','[class*="estate"]','[class*="object"]'],linkHints:[/house|object|sale|buy|detail|case/i]},
    {id:'591',label:'591',hosts:['591.com.tw'],cardSelectors:['.house-list-item','.item-info','.list-item','article','li[class*="item"]'],linkHints:[/home\//i,/house/i,/sale/i,/detail/i]},
    {id:'yungching',label:'永慶房屋',hosts:['yungching.com.tw'],cardSelectors:['.house-item','.m-list-item','.item','article','li'],linkHints:[/buy\//i,/house/i,/case/i,/object/i]},
    {id:'sinyi',label:'信義房屋',hosts:['sinyi.com.tw'],cardSelectors:['.buy-list-item','.house-item','.card','article','li'],linkHints:[/buy\//i,/house/i,/product/i,/detail/i]},
    {id:'rakuya',label:'樂屋網',hosts:['rakuya.com.tw'],cardSelectors:['.obj-item','.house-item','.item','article','li'],linkHints:[/buy\//i,/sale/i,/object/i,/detail/i]},
    {id:'5168',label:'5168實價登錄比價王',hosts:['5168.com.tw'],cardSelectors:['.house-list-item','.house-item','.item','article','li'],linkHints:[/buy/i,/sale/i,/house/i,/detail/i]},
    {id:'housefun',label:'好房網',hosts:['housefun.com.tw'],cardSelectors:['.house-item','.item','article','li'],linkHints:[/buy/i,/house/i,/case/i,/detail/i]}
  ];
  const FALLBACK={id:'generic',label:location.hostname,hosts:[],cardSelectors:['article','li','div'],linkHints:[/buy|sale|house|home|detail|object|case/i]};
  const adapter=ADAPTERS.find(a=>a.hosts.some(h=>location.hostname===h||location.hostname.endsWith(`.${h}`)))||FALLBACK;

  const CITY='(?:台北市|臺北市|新北市|桃園市|台中市|臺中市|台南市|臺南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|台東縣|臺東縣|澎湖縣)';
  const ADDRESS_RE=new RegExp(`${CITY}[^\s，,。；;]{2,100}?(?:\d+號(?:之\d+)?(?:\d+樓(?:之\d+)?)?|\d+巷(?:\d+弄)?(?:\d+號)?|(?:路|街|大道)(?:[一二三四五六七八九十0-9]+段)?)`);
  const extractAddress=text=>{
    const t=clean(text);
    const explicit=t.match(new RegExp(`(?:相關地址|房屋地址|物件地址|地址)\s*[:：]?\s*(${CITY}[^\s，,。；;]{2,110})`));
    const raw=clean(explicit?.[1]||t.match(ADDRESS_RE)?.[0]||'');
    if(!raw)return null;
    return raw.replace(/(?:調電傳|地圖歷|地圖街景|相關物件|刊登|比價).*$/,'').slice(0,120)||null;
  };
  const extractFacts=text=>{
    const t=clean(text);
    const price=t.match(/(?:總價|售價|開價)?\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*萬/);
    const ping=t.match(/(?:總坪|坪數|建坪|權狀)?\s*([0-9]+(?:\.[0-9]+)?)\s*坪/);
    const rooms=t.match(/([0-9]+)\s*房/);
    const age=t.match(/(?:屋齡)?\s*([0-9]+(?:\.[0-9]+)?)\s*年/);
    const floor=t.match(/(?:樓層)?\s*((?:B?\d+|[一二三四五六七八九十]+)\s*(?:樓|F)(?:之\d+)?(?:\s*\/\s*(?:B?\d+|[一二三四五六七八九十]+)\s*(?:樓|F))?)/i);
    return {asking_wan:price?Number(price[1].replace(/,/g,'')):null,total_ping:ping?Number(ping[1]):null,bedrooms:rooms?Number(rooms[1]):null,age_years:age?Number(age[1]):null,floor:clean(floor?.[1]||'')||null};
  };

  const isCollectorNode=el=>Boolean(el?.closest?.('#bujuListingCollectorPanel,#bujuListingCollectorBtn'));
  const isRendered=el=>{
    if(!(el instanceof Element)||isCollectorNode(el))return false;
    const r=el.getBoundingClientRect(),s=getComputedStyle(el);
    return r.width>=150&&r.height>=44&&r.width<=1200&&r.height<=760&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0;
  };
  const renderedImage=img=>{
    if(!(img instanceof HTMLImageElement)||isCollectorNode(img))return false;
    const r=img.getBoundingClientRect(),s=getComputedStyle(img);
    return r.width>=70&&r.height>=50&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0;
  };
  const looksLikeListing=text=>{
    const t=clean(text);
    if(t.length<18||t.length>1800)return false;
    const hasPrice=/(?:總價|售價|開價)?\s*\$?\s*[0-9][0-9,]*(?:\.[0-9]+)?\s*萬/.test(t);
    const hasHouseFact=/(坪|房|屋齡|樓層|公寓|大樓|華廈|電梯|透天|主坪|總坪|建坪)/.test(t);
    return hasPrice&&hasHouseFact;
  };
  const hasRenderedImage=el=>[...(el.querySelectorAll?.('img')||[])].some(renderedImage);
  const score=el=>{
    const t=clean(el.innerText);let s=0;
    if(/[0-9][0-9,]*(?:\.[0-9]+)?\s*萬/.test(t))s+=4;
    if(/[0-9]+(?:\.[0-9]+)?\s*坪/.test(t))s+=3;
    if(/[0-9]+\s*房/.test(t))s+=2;
    if(/屋齡|樓層|公寓|大樓|華廈|電梯|透天|主坪|總坪|建坪/.test(t))s+=1;
    if(el.querySelector?.('a[href]'))s+=1;
    if(hasRenderedImage(el))s+=4;
    const r=el.getBoundingClientRect();if(r.height>=80&&r.height<=520)s+=2;
    return s;
  };
  const dataNumber=(el,names)=>{
    for(const name of names){
      const direct=el.getAttribute?.(name);
      if(direct!==null&&direct!==''&&finite(direct))return Number(direct);
      const child=el.querySelector?.(`[${name}]`),v=child?.getAttribute(name);
      if(v!==null&&v!==undefined&&v!==''&&finite(v))return Number(v);
    }
    return null;
  };
  const bestHref=el=>{
    const links=[...(el.matches?.('a[href]')?[el]:[]),...(el.querySelectorAll?.('a[href]')||[])].filter(a=>a?.href);
    const parsed=[];
    for(const a of links){try{const u=new URL(a.href,location.href);if(u.origin===location.origin&&u.href!==location.href&&!/login|signin|logout|member|javascript:/i.test(u.href))parsed.push(u)}catch{}}
    const hinted=parsed.find(u=>adapter.linkHints.some(re=>re.test(`${u.pathname}${u.search}`)));
    return (hinted||parsed[0])?.href||location.href;
  };
  const identityKey=el=>{
    const href=bestHref(el),facts=extractFacts(el.innerText),address=extractAddress(el.innerText)||'';
    const detail=`${facts.asking_wan??''}|${facts.total_ping??''}|${facts.bedrooms??''}|${address}`;
    return href!==location.href?`${adapter.id}|${href}|${detail}`:`${adapter.id}|${detail}`;
  };
  const recordKey=record=>{
    const facts=extractFacts(record.visible_text||''),href=clean(record.source_url||''),address=clean(record.address_text||extractAddress(record.visible_text||'')||'');
    return `${record.source_platform||record.source_label||'unknown'}|${href}|${facts.asking_wan??''}|${facts.total_ping??''}|${facts.bedrooms??''}|${address}`;
  };
  const captureCandidate=(el,index)=>{
    const text=multiline(el.innerText).slice(0,1800),facts=extractFacts(text);
    return {capture_index:index,source_platform:adapter.id,source_label:adapter.label,source_site:location.hostname,collector_adapter:adapter.id,visible_text:text,address_text:extractAddress(text),source_url:bestHref(el),page_url:location.href,captured_at:new Date().toISOString(),asking_wan:facts.asking_wan,total_ping:facts.total_ping,bedrooms:facts.bedrooms,age_years:facts.age_years,floor:facts.floor,lat:dataNumber(el,['data-lat','data-latitude']),lon:dataNumber(el,['data-lng','data-lon','data-longitude'])};
  };

  function selectorCandidates(){
    const out=[];
    for(const selector of adapter.cardSelectors){
      let nodes=[];try{nodes=[...document.querySelectorAll(selector)]}catch{}
      for(const el of nodes)if(isRendered(el)&&looksLikeListing(el.innerText)&&score(el)>=6)out.push(el);
    }
    return out;
  }
  function imageBackedCandidates(){
    const cards=[];
    for(const img of [...document.images].filter(renderedImage)){
      let el=img.parentElement,hops=0;
      while(el&&el!==document.body&&hops++<10){
        if(isRendered(el)&&looksLikeListing(el.innerText)){const r=el.getBoundingClientRect();if(r.height>=80&&r.height<=560&&r.width>=200){cards.push(el);break}}
        el=el.parentElement;
      }
    }
    return cards;
  }
  function genericCandidates(){
    return [...document.querySelectorAll('article,li,a[href],div')].filter(isRendered).filter(el=>looksLikeListing(el.innerText)).filter(el=>score(el)>=7).sort((a,b)=>{const sa=score(a),sb=score(b),aa=a.getBoundingClientRect().width*a.getBoundingClientRect().height,ab=b.getBoundingClientRect().width*b.getBoundingClientRect().height;return sb-sa||aa-ab});
  }
  function collapseCandidates(elements){
    const unique=[],seen=new Set();
    for(const el of elements){
      if(isCollectorNode(el))continue;
      const text=clean(el.innerText),key=identityKey(el);if(!text||!key||seen.has(key))continue;
      if(unique.some(prev=>prev.contains(el)&&identityKey(prev)===key))continue;
      unique.push(el);seen.add(key);if(unique.length>=120)break;
    }
    return unique;
  }
  function scanLoadedPage(){
    const site=collapseCandidates(selectorCandidates()),images=collapseCandidates(imageBackedCandidates()),generic=collapseCandidates(genericCandidates());
    const chosen=site.length?site:images.length?images:generic;
    return chosen.map((el,i)=>captureCandidate(el,i));
  }

  const storageAvailable=()=>Boolean(globalThis.chrome?.storage?.local);
  async function rawLoadShared(){
    if(storageAvailable())return new Promise(resolve=>chrome.storage.local.get([STORAGE_KEY],x=>resolve(Array.isArray(x?.[STORAGE_KEY])?x[STORAGE_KEY]:[])));
    try{const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(parsed)?parsed:[]}catch{return []}
  }
  async function saveBasket(items){
    if(storageAvailable())return new Promise(resolve=>chrome.storage.local.set({[STORAGE_KEY]:items},resolve));
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(items))}catch{}
  }
  async function loadBasket(){
    const shared=await rawLoadShared();
    let legacy=[];try{const parsed=JSON.parse(localStorage.getItem(LEGACY_BIGFUN_KEY)||'[]');legacy=Array.isArray(parsed)?parsed:[]}catch{}
    if(!legacy.length)return shared;
    const merged=new Map(shared.map(x=>[recordKey(x),x]));
    for(const item of legacy){const migrated={source_platform:item.source_platform||'bigfun',source_label:item.source_label||'BigFun',source_site:item.source_site||'www.ibigfun.com',collector_adapter:item.collector_adapter||'bigfun',...item};const key=recordKey(migrated);if(!merged.has(key))merged.set(key,migrated)}
    const items=[...merged.values()];await saveBasket(items);return items;
  }

  let basket=[],current=[];
  const style=document.createElement('style');
  style.textContent=`#bujuListingCollectorBtn{position:fixed;left:18px;bottom:18px;z-index:2147483646;border:0;border-radius:999px;padding:11px 15px;background:#173f5f;color:#fff;font:800 14px/1 system-ui;box-shadow:0 5px 20px rgba(0,0,0,.28);cursor:pointer}#bujuListingCollectorPanel{position:fixed;z-index:2147483647;left:18px;bottom:66px;width:min(480px,calc(100vw - 36px));max-height:72vh;overflow:auto;background:#fff;color:#1d2730;border:1px solid #cfd8de;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.32);font:13px/1.4 system-ui;padding:12px;display:none}#bujuListingCollectorPanel.open{display:block}.bujuHead{display:flex;justify-content:space-between;gap:8px;align-items:center;cursor:move;user-select:none;touch-action:none}.bujuHead strong{font-size:15px}.bujuSite{font-size:10px;padding:3px 7px;border-radius:999px;background:#eef3f5;color:#53636c;font-weight:850}.bujuClose{border:0;background:#eef2f4;border-radius:999px;width:28px;height:28px;cursor:pointer}.bujuNote{font-size:11px;color:#66747d;margin:6px 0 9px}.bujuStats{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:7px 0}.bujuStat{padding:8px;border-radius:10px;background:#f2f6f7}.bujuStat b{display:block;font-size:18px}.bujuActions{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.bujuActions button{border:1px solid #b9c5cc;border-radius:9px;background:#fff;padding:7px 9px;font-weight:750;cursor:pointer}.bujuActions .primary{background:#173f5f;color:white;border-color:#173f5f}.bujuActions .danger{color:#a12c2c}.bujuRow{display:grid;grid-template-columns:auto 1fr;gap:7px;padding:8px 2px;border-top:1px solid #eef1f3}.bujuRow input{margin-top:3px}.bujuText{font-size:11px;line-height:1.45;max-height:6.2em;overflow:hidden;white-space:pre-line}.bujuAddr{display:block;color:#2d6d57;font-weight:750}.bujuSource{display:block;color:#596b76;font-size:9px;font-weight:850;margin-bottom:2px}.bujuCount{font-weight:850;font-size:11px;color:#53636c}`;
  document.head.appendChild(style);

  const button=document.createElement('button');button.id='bujuListingCollectorBtn';button.textContent='📦 卜居收集籃';document.body.appendChild(button);
  const panel=document.createElement('section');panel.id='bujuListingCollectorPanel';panel.innerHTML=`<div class="bujuHead"><strong>卜居 · 房源收集器 v0.4</strong><span class="bujuSite">${esc(adapter.label)}</span><button class="bujuClose" type="button">×</button></div><div class="bujuNote">只整理你目前已打開、已載入頁面上的公開房源資訊；不自動翻頁、不呼叫房仲內部 API。收集籃使用 extension 本機儲存，可跨 BigFun／591／永慶／信義／樂屋／5168／好房網累積。</div><div class="bujuStats"><div class="bujuStat">本頁偵測<b id="bujuPageCount">0</b>筆</div><div class="bujuStat">跨站已收集<b id="bujuBasketCount">0</b>筆</div></div><div id="bujuCount" class="bujuCount">尚未掃描本頁。</div><div class="bujuActions"><button id="bujuCollect" class="primary" type="button">＋ 收集本頁</button><button id="bujuRescan" type="button">重新掃描本頁</button><button id="bujuAll" type="button">全選</button><button id="bujuNone" type="button">全不選</button></div><div class="bujuActions"><button id="bujuDownload" class="primary" type="button">📦 下載全部 JSON</button><button id="bujuCopy" type="button">複製全部 JSON</button><button id="bujuClear" class="danger" type="button">清空收集籃</button></div><div id="bujuRows"></div>`;document.body.appendChild(panel);
  const rows=panel.querySelector('#bujuRows'),count=panel.querySelector('#bujuCount'),pageCount=panel.querySelector('#bujuPageCount'),basketCount=panel.querySelector('#bujuBasketCount');

  function render(){
    rows.innerHTML='';
    current.forEach((r,i)=>{const row=document.createElement('label');row.className='bujuRow';row.innerHTML=`<input type="checkbox" data-i="${i}" checked><span class="bujuText"><span class="bujuSource">${esc(r.source_label)} · ${esc(r.source_site)}</span>${r.address_text?`<span class="bujuAddr">📍 ${esc(r.address_text)}</span>`:''}${esc(r.visible_text)}</span>`;rows.appendChild(row)});
    pageCount.textContent=String(current.length);basketCount.textContent=String(basket.length);count.textContent=`${adapter.label} 本頁偵測 ${current.length} 筆刊登；跨站收集籃共 ${basket.length} 筆。`;
  }
  function rescan(){current=scanLoadedPage();render()}
  function selectedCurrent(){return current.filter((_,i)=>rows.querySelector(`input[data-i="${i}"]`)?.checked)}
  async function collectPage(){
    const selected=selectedCurrent(),merged=new Map(basket.map(item=>[recordKey(item),item])),before=merged.size;
    selected.forEach(item=>{const key=recordKey(item);if(!merged.has(key))merged.set(key,item)});basket=[...merged.values()];await saveBasket(basket);basketCount.textContent=String(basket.length);count.textContent=`${adapter.label} 本頁加入 ${basket.length-before} 筆；跨站已收集 ${basket.length} 筆。換頁或換網站後再按一次即可累積。`;
  }
  function payload(){
    const sourceSites=[...new Set(basket.map(x=>x.source_label||x.source_platform).filter(Boolean))];
    return {schema:SCHEMA,captured_at:new Date().toISOString(),page_url:location.href,collector_version:'0.4.0',source_sites:sourceSites,count:basket.length,items:basket};
  }
  function download(){
    if(!basket.length){count.textContent='收集籃還是空的；先按「＋ 收集本頁」。';return}
    const blob=new Blob([JSON.stringify(payload(),null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`buju-listing-collection-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  async function clearBasket(){if(!basket.length)return;if(!confirm(`清空跨網站已收集的 ${basket.length} 筆刊登？`))return;basket=[];await saveBasket(basket);render();count.textContent='跨站收集籃已清空。'}

  let drag=null;const head=panel.querySelector('.bujuHead');
  head.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;const r=panel.getBoundingClientRect();drag={dx:e.clientX-r.left,dy:e.clientY-r.top};panel.style.left=`${r.left}px`;panel.style.top=`${r.top}px`;panel.style.right='auto';panel.style.bottom='auto';head.setPointerCapture?.(e.pointerId)});
  head.addEventListener('pointermove',e=>{if(!drag)return;const maxX=Math.max(0,innerWidth-panel.offsetWidth),maxY=Math.max(0,innerHeight-panel.offsetHeight);panel.style.left=`${Math.max(0,Math.min(maxX,e.clientX-drag.dx))}px`;panel.style.top=`${Math.max(0,Math.min(maxY,e.clientY-drag.dy))}px`});
  const stopDrag=()=>{drag=null};head.addEventListener('pointerup',stopDrag);head.addEventListener('pointercancel',stopDrag);

  button.onclick=async()=>{panel.classList.add('open');basket=await loadBasket();rescan()};
  panel.querySelector('.bujuClose').onclick=()=>panel.classList.remove('open');
  panel.querySelector('#bujuRescan').onclick=rescan;
  panel.querySelector('#bujuCollect').onclick=collectPage;
  panel.querySelector('#bujuAll').onclick=()=>rows.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=true);
  panel.querySelector('#bujuNone').onclick=()=>rows.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=false);
  panel.querySelector('#bujuDownload').onclick=download;
  panel.querySelector('#bujuCopy').onclick=async()=>{if(!basket.length){count.textContent='收集籃還是空的。';return}try{await navigator.clipboard.writeText(JSON.stringify(payload(),null,2));count.textContent=`已複製 ${basket.length} 筆跨站刊登 JSON。`}catch{count.textContent='瀏覽器拒絕剪貼簿；請改用下載 JSON。'}};
  panel.querySelector('#bujuClear').onclick=clearBasket;
})()
