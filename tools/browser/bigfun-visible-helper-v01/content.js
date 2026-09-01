(()=>{
  if(window.__BUJU_BIGFUN_VISIBLE_HELPER_V02__)return;
  window.__BUJU_BIGFUN_VISIBLE_HELPER_V02__=true;

  const STORAGE_KEY='buju.bigfun.collection.v0.2';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const isHelperNode=el=>Boolean(el?.closest?.('#bujuBigFunPanel,#bujuBigFunBtn'));
  const isRendered=el=>{
    if(!(el instanceof Element)||isHelperNode(el))return false;
    const r=el.getBoundingClientRect();
    const s=getComputedStyle(el);
    return r.width>=150&&r.height>=44&&r.width<=1000&&r.height<=720&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0;
  };
  const looksLikeListing=text=>{
    const t=clean(text);
    if(t.length<18||t.length>1400)return false;
    const price=/\$?\s*[0-9][0-9,]*(?:\.[0-9]+)?\s*萬/.test(t);
    const detail=/(坪|房|屋齡|樓層|公寓|大樓|華廈|電梯|主坪|總坪)/.test(t);
    return price&&detail;
  };
  const renderedImage=img=>{
    if(!(img instanceof HTMLImageElement)||isHelperNode(img))return false;
    const r=img.getBoundingClientRect();
    const s=getComputedStyle(img);
    return r.width>=70&&r.height>=50&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0;
  };
  const hasRenderedImage=el=>[...el.querySelectorAll?.('img')||[]].some(renderedImage);
  const score=el=>{
    const t=clean(el.innerText);
    let s=0;
    if(/\$?\s*[0-9][0-9,]*(?:\.[0-9]+)?\s*萬/.test(t))s+=4;
    if(/[0-9]+(?:\.[0-9]+)?\s*坪/.test(t))s+=3;
    if(/[0-9]+\s*房/.test(t))s+=2;
    if(/屋齡|樓層|公寓|大樓|華廈|電梯|主坪|總坪/.test(t))s+=1;
    if(el.querySelector('a[href]'))s+=1;
    if(hasRenderedImage(el))s+=4;
    const r=el.getBoundingClientRect();
    if(r.height>=90&&r.height<=420)s+=2;
    return s;
  };
  const dataNumber=(el,names)=>{
    for(const name of names){
      const direct=el.getAttribute?.(name);
      if(direct!==null&&direct!==''&&Number.isFinite(Number(direct)))return Number(direct);
      const child=el.querySelector?.(`[${name}]`);
      const v=child?.getAttribute(name);
      if(v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)))return Number(v);
    }
    return null;
  };
  const bestHref=el=>{
    const links=[...(el.matches?.('a[href]')?[el]:[]),...(el.querySelectorAll?.('a[href]')||[])];
    for(const a of links){
      if(!a?.href)continue;
      try{
        const u=new URL(a.href,location.href);
        if(u.origin===location.origin&&u.pathname!==location.pathname&&!/\/user\/(?:signin|logout)/.test(u.pathname))return u.href;
      }catch{}
    }
    return location.href;
  };
  const identityParts=el=>{
    const t=clean(el.innerText);
    return {
      price:t.match(/\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*萬/)?.[1]?.replace(/,/g,'')||'',
      ping:t.match(/([0-9]+(?:\.[0-9]+)?)\s*坪/)?.[1]||'',
      rooms:t.match(/([0-9]+)\s*房/)?.[1]||'',
      address:clean(t.match(/(?:台北市)?[^\s]{0,10}(?:區)[^\s]{0,28}(?:路|街|巷|弄|號)?/)?.[0]||'')
    };
  };
  const identityKey=el=>{
    const href=bestHref(el);
    const p=identityParts(el);
    const detail=`${p.price}|${p.ping}|${p.rooms}|${p.address}`;
    return href!==location.href?`${href}|${detail}`:detail;
  };
  const recordKey=record=>{
    const t=clean(record.visible_text);
    const price=t.match(/\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*萬/)?.[1]?.replace(/,/g,'')||'';
    const ping=t.match(/([0-9]+(?:\.[0-9]+)?)\s*坪/)?.[1]||'';
    const rooms=t.match(/([0-9]+)\s*房/)?.[1]||'';
    const href=clean(record.source_url||'');
    return `${href}|${price}|${ping}|${rooms}|${t.slice(0,140)}`;
  };
  const captureCandidate=(el,index)=>({
    capture_index:index,
    visible_text:clean(el.innerText).slice(0,1400),
    source_url:bestHref(el),
    page_url:location.href,
    captured_at:new Date().toISOString(),
    lat:dataNumber(el,['data-lat','data-latitude']),
    lon:dataNumber(el,['data-lng','data-lon','data-longitude'])
  });

  function imageBackedCandidates(){
    const cards=[];
    for(const img of [...document.images].filter(renderedImage)){
      let el=img.parentElement;
      let hops=0;
      while(el&&el!==document.body&&hops++<10){
        if(isRendered(el)&&looksLikeListing(el.innerText)){
          const r=el.getBoundingClientRect();
          if(r.height>=90&&r.height<=520&&r.width>=220){cards.push(el);break}
        }
        el=el.parentElement;
      }
    }
    return cards;
  }

  function genericCandidates(){
    return [...document.querySelectorAll('article,li,a[href],div')]
      .filter(isRendered)
      .filter(el=>looksLikeListing(el.innerText))
      .filter(el=>score(el)>=7)
      .sort((a,b)=>{
        const sa=score(a),sb=score(b);
        const aa=a.getBoundingClientRect().width*a.getBoundingClientRect().height;
        const ab=b.getBoundingClientRect().width*b.getBoundingClientRect().height;
        return sb-sa||aa-ab;
      });
  }

  function collapseCandidates(elements){
    const unique=[];
    const seenIdentity=new Set();
    for(const el of elements){
      if(isHelperNode(el))continue;
      const text=clean(el.innerText);
      const key=identityKey(el);
      if(!text||!key||seenIdentity.has(key))continue;
      if(unique.some(prev=>prev.contains(el)&&identityKey(prev)===key))continue;
      unique.push(el);seenIdentity.add(key);
      if(unique.length>=80)break;
    }
    return unique;
  }

  function scanLoadedPage(){
    const imageCards=collapseCandidates(imageBackedCandidates());
    const chosen=imageCards.length?imageCards:collapseCandidates(genericCandidates());
    return chosen.map((el,i)=>captureCandidate(el,i));
  }

  const loadBasket=()=>{
    try{
      const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
      return Array.isArray(parsed)?parsed:[];
    }catch{return []}
  };
  const saveBasket=items=>{
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(items))}catch{}
  };
  let basket=loadBasket();
  let current=[];

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const style=document.createElement('style');
  style.textContent=`#bujuBigFunBtn{position:fixed;right:18px;bottom:18px;z-index:2147483646;border:0;border-radius:999px;padding:11px 15px;background:#173f5f;color:#fff;font:800 14px/1 system-ui;box-shadow:0 5px 20px rgba(0,0,0,.28);cursor:pointer}#bujuBigFunPanel{position:fixed;z-index:2147483647;right:18px;bottom:66px;width:min(470px,calc(100vw - 36px));max-height:74vh;overflow:auto;background:#fff;color:#1d2730;border:1px solid #cfd8de;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.32);font:13px/1.4 system-ui;padding:12px;display:none}#bujuBigFunPanel.open{display:block}.bujuHead{display:flex;justify-content:space-between;gap:8px;align-items:center}.bujuHead strong{font-size:15px}.bujuClose{border:0;background:#eef2f4;border-radius:999px;width:28px;height:28px}.bujuNote{font-size:11px;color:#66747d;margin:6px 0 9px}.bujuStats{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:7px 0}.bujuStat{padding:8px;border-radius:10px;background:#f2f6f7}.bujuStat b{display:block;font-size:18px}.bujuActions{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.bujuActions button{border:1px solid #b9c5cc;border-radius:9px;background:#fff;padding:7px 9px;font-weight:750;cursor:pointer}.bujuActions .primary{background:#173f5f;color:white;border-color:#173f5f}.bujuActions .danger{color:#a12c2c}.bujuRow{display:grid;grid-template-columns:auto 1fr;gap:7px;padding:8px 2px;border-top:1px solid #eef1f3}.bujuRow input{margin-top:3px}.bujuText{font-size:11px;line-height:1.45;max-height:4.4em;overflow:hidden}.bujuCount{font-weight:850;font-size:11px;color:#53636c}`;
  document.head.appendChild(style);

  const button=document.createElement('button');button.id='bujuBigFunBtn';button.textContent='📦 卜居收集籃';document.body.appendChild(button);
  const panel=document.createElement('section');panel.id='bujuBigFunPanel';panel.innerHTML=`<div class="bujuHead"><strong>卜居 · BigFun 搜尋結果收集器</strong><button class="bujuClose" type="button">×</button></div><div class="bujuNote">每次只處理 BigFun 目前這一頁已載入的房源卡。你正常翻頁後再按「＋ 收集本頁」即可累積；不自動翻頁、不呼叫 BigFun API、不抓圖片／電話／屋主資料。</div><div class="bujuStats"><div class="bujuStat">本頁偵測<b id="bujuPageCount">0</b>戶</div><div class="bujuStat">已收集<b id="bujuBasketCount">0</b>戶</div></div><div id="bujuCount" class="bujuCount">尚未掃描本頁。</div><div class="bujuActions"><button id="bujuCollect" class="primary" type="button">＋ 收集本頁</button><button id="bujuRescan" type="button">重新掃描本頁</button><button id="bujuAll" type="button">全選</button><button id="bujuNone" type="button">全不選</button></div><div class="bujuActions"><button id="bujuDownload" class="primary" type="button">📦 下載全部 JSON</button><button id="bujuCopy" type="button">複製全部 JSON</button><button id="bujuClear" class="danger" type="button">清空收集籃</button></div><div id="bujuRows"></div>`;document.body.appendChild(panel);
  const rows=panel.querySelector('#bujuRows');
  const count=panel.querySelector('#bujuCount');
  const pageCount=panel.querySelector('#bujuPageCount');
  const basketCount=panel.querySelector('#bujuBasketCount');

  function render(){
    rows.innerHTML='';
    current.forEach((r,i)=>{const row=document.createElement('label');row.className='bujuRow';row.innerHTML=`<input type="checkbox" data-i="${i}" checked><span class="bujuText">${esc(r.visible_text)}</span>`;rows.appendChild(row)});
    pageCount.textContent=String(current.length);
    basketCount.textContent=String(basket.length);
    count.textContent=`本頁偵測 ${current.length} 戶；目前收集籃共 ${basket.length} 戶。`;
  }
  function rescan(){current=scanLoadedPage();render()}
  function selectedCurrent(){return current.filter((_,i)=>rows.querySelector(`input[data-i="${i}"]`)?.checked)}
  function collectPage(){
    const selected=selectedCurrent();
    const merged=new Map(basket.map(item=>[recordKey(item),item]));
    const before=merged.size;
    selected.forEach(item=>{const key=recordKey(item);if(!merged.has(key))merged.set(key,item)});
    basket=[...merged.values()];
    saveBasket(basket);
    basketCount.textContent=String(basket.length);
    count.textContent=`本頁加入 ${basket.length-before} 戶；已收集 ${basket.length} 戶。換到下一頁後再按一次即可累積。`;
  }
  function payload(){return {schema:'buju.bigfun-visible.v0.2',captured_at:new Date().toISOString(),page_url:location.href,count:basket.length,items:basket}}
  function download(){
    if(!basket.length){count.textContent='收集籃還是空的；先按「＋ 收集本頁」。';return}
    const p=payload();
    const blob=new Blob([JSON.stringify(p,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`buju-bigfun-collection-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  function clearBasket(){
    if(!basket.length)return;
    if(!confirm(`清空目前已收集的 ${basket.length} 戶？`))return;
    basket=[];saveBasket(basket);render();count.textContent='收集籃已清空。';
  }

  button.onclick=()=>{panel.classList.add('open');basket=loadBasket();rescan()};
  panel.querySelector('.bujuClose').onclick=()=>panel.classList.remove('open');
  panel.querySelector('#bujuRescan').onclick=rescan;
  panel.querySelector('#bujuCollect').onclick=collectPage;
  panel.querySelector('#bujuAll').onclick=()=>rows.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=true);
  panel.querySelector('#bujuNone').onclick=()=>rows.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=false);
  panel.querySelector('#bujuDownload').onclick=download;
  panel.querySelector('#bujuClear').onclick=clearBasket;
  panel.querySelector('#bujuCopy').onclick=async()=>{
    if(!basket.length){count.textContent='收集籃還是空的；先按「＋ 收集本頁」。';return}
    const text=JSON.stringify(payload(),null,2);
    try{await navigator.clipboard.writeText(text);count.textContent=`已複製收集籃 ${basket.length} 戶 JSON 到剪貼簿。`}catch{count.textContent='瀏覽器不允許剪貼簿；請使用「📦 下載全部 JSON」。'}
  };
})();
