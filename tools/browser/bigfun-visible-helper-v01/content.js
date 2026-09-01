(()=>{
  if(window.__BUJU_BIGFUN_VISIBLE_HELPER_V01__)return;
  window.__BUJU_BIGFUN_VISIBLE_HELPER_V01__=true;

  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const isHelperNode=el=>Boolean(el?.closest?.('#bujuBigFunPanel,#bujuBigFunBtn'));
  const isVisible=el=>{
    if(!(el instanceof Element)||isHelperNode(el))return false;
    const r=el.getBoundingClientRect();
    const s=getComputedStyle(el);
    return r.width>=150&&r.height>=44&&r.width<=900&&r.height<=600&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0;
  };
  const looksLikeListing=text=>{
    const t=clean(text);
    if(t.length<18||t.length>1200)return false;
    const price=/\$?\s*[0-9][0-9,]*(?:\.[0-9]+)?\s*萬/.test(t);
    const detail=/(坪|房|屋齡|樓層|公寓|大樓|華廈|電梯|主坪|總坪)/.test(t);
    return price&&detail;
  };
  const score=el=>{
    const t=clean(el.innerText);
    let s=0;
    if(/\$?\s*[0-9][0-9,]*(?:\.[0-9]+)?\s*萬/.test(t))s+=4;
    if(/[0-9]+(?:\.[0-9]+)?\s*坪/.test(t))s+=3;
    if(/[0-9]+\s*房/.test(t))s+=2;
    if(/屋齡|樓層|公寓|大樓|華廈|電梯|主坪|總坪/.test(t))s+=1;
    if(el.querySelector('a[href]'))s+=1;
    if(hasVisibleImage(el))s+=4;
    const r=el.getBoundingClientRect();
    if(r.height>=90&&r.height<=360)s+=2;
    return s;
  };
  const visibleImage=img=>{
    if(!(img instanceof HTMLImageElement)||isHelperNode(img))return false;
    const r=img.getBoundingClientRect();
    const s=getComputedStyle(img);
    return r.width>=70&&r.height>=50&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0;
  };
  const hasVisibleImage=el=>[...el.querySelectorAll?.('img')||[]].some(visibleImage);
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
      try{const u=new URL(a.href,location.href);if(u.origin===location.origin&&u.pathname!==location.pathname)return u.href}catch{}
    }
    return location.href;
  };
  const identityKey=el=>{
    const t=clean(el.innerText);
    const price=t.match(/\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*萬/)?.[1]?.replace(/,/g,'')||'';
    const ping=t.match(/([0-9]+(?:\.[0-9]+)?)\s*坪/)?.[1]||'';
    const rooms=t.match(/([0-9]+)\s*房/)?.[1]||'';
    const address=t.match(/(?:台北市)?[^\s]{0,10}(?:區)[^\s]{0,24}(?:路|街|巷|弄|號)?/)?.[0]||'';
    return `${price}|${ping}|${rooms}|${clean(address)}`;
  };
  const captureCandidate=(el,index)=>({
    capture_index:index,
    visible_text:clean(el.innerText).slice(0,1200),
    source_url:bestHref(el),
    page_url:location.href,
    captured_at:new Date().toISOString(),
    lat:dataNumber(el,['data-lat','data-latitude']),
    lon:dataNumber(el,['data-lng','data-lon','data-longitude'])
  });

  function imageBackedCandidates(){
    const cards=[];
    for(const img of [...document.images].filter(visibleImage)){
      let el=img.parentElement;
      let hops=0;
      while(el&&el!==document.body&&hops++<9){
        if(isVisible(el)&&looksLikeListing(el.innerText)){
          const r=el.getBoundingClientRect();
          if(r.height>=90&&r.height<=480&&r.width>=220){cards.push(el);break}
        }
        el=el.parentElement;
      }
    }
    return cards;
  }

  function genericCandidates(){
    return [...document.querySelectorAll('article,li,a[href],div')]
      .filter(isVisible)
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
    const seenElements=new Set();
    const seenIdentity=new Set();
    for(const el of elements){
      if(seenElements.has(el)||isHelperNode(el))continue;
      const text=clean(el.innerText);
      const key=identityKey(el);
      if(!text||seenIdentity.has(key))continue;
      if(unique.some(prev=>prev.contains(el)&&identityKey(prev)===key))continue;
      unique.push(el);seenElements.add(el);seenIdentity.add(key);
      if(unique.length>=60)break;
    }
    return unique;
  }

  function scanVisible(){
    const imageCards=collapseCandidates(imageBackedCandidates());
    const chosen=imageCards.length?imageCards:collapseCandidates(genericCandidates());
    return chosen.map((el,i)=>captureCandidate(el,i));
  }

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let current=[];

  const style=document.createElement('style');
  style.textContent=`#bujuBigFunBtn{position:fixed;right:18px;bottom:18px;z-index:2147483646;border:0;border-radius:999px;padding:11px 15px;background:#173f5f;color:#fff;font:800 14px/1 system-ui;box-shadow:0 5px 20px rgba(0,0,0,.28);cursor:pointer}#bujuBigFunPanel{position:fixed;z-index:2147483647;right:18px;bottom:66px;width:min(440px,calc(100vw - 36px));max-height:70vh;overflow:auto;background:#fff;color:#1d2730;border:1px solid #cfd8de;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.32);font:13px/1.4 system-ui;padding:12px;display:none}#bujuBigFunPanel.open{display:block}.bujuHead{display:flex;justify-content:space-between;gap:8px;align-items:center}.bujuHead strong{font-size:15px}.bujuClose{border:0;background:#eef2f4;border-radius:999px;width:28px;height:28px}.bujuNote{font-size:11px;color:#66747d;margin:6px 0 9px}.bujuActions{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.bujuActions button{border:1px solid #b9c5cc;border-radius:9px;background:#fff;padding:7px 9px;font-weight:750;cursor:pointer}.bujuActions .primary{background:#173f5f;color:white;border-color:#173f5f}.bujuRow{display:grid;grid-template-columns:auto 1fr;gap:7px;padding:8px 2px;border-top:1px solid #eef1f3}.bujuRow input{margin-top:3px}.bujuText{font-size:11px;line-height:1.45;max-height:4.4em;overflow:hidden}.bujuCount{font-weight:850}`;
  document.head.appendChild(style);

  const button=document.createElement('button');button.id='bujuBigFunBtn';button.textContent='📥 卜居匯出';document.body.appendChild(button);
  const panel=document.createElement('section');panel.id='bujuBigFunPanel';panel.innerHTML=`<div class="bujuHead"><strong>卜居 · BigFun 可見房源</strong><button class="bujuClose" type="button">×</button></div><div class="bujuNote">只讀取你目前畫面已呈現的文字與連結；優先辨識有房屋縮圖的最外層物件卡；不翻頁、不呼叫 BigFun API、不抓圖片／電話／屋主資料。</div><div id="bujuCount" class="bujuCount">尚未掃描</div><div class="bujuActions"><button id="bujuRescan" class="primary" type="button">重新掃描目前畫面</button><button id="bujuAll" type="button">全選</button><button id="bujuNone" type="button">全不選</button><button id="bujuDownload" type="button">下載 JSON</button><button id="bujuCopy" type="button">複製 JSON</button></div><div id="bujuRows"></div>`;document.body.appendChild(panel);
  const rows=panel.querySelector('#bujuRows'),count=panel.querySelector('#bujuCount');

  function render(){
    rows.innerHTML='';
    current.forEach((r,i)=>{const row=document.createElement('label');row.className='bujuRow';row.innerHTML=`<input type="checkbox" data-i="${i}" checked><span class="bujuText">${esc(r.visible_text)}</span>`;rows.appendChild(row)});
    count.textContent=`偵測到 ${current.length} 個可見候選；請先確認再匯出。`;
  }
  function rescan(){current=scanVisible();render()}
  function selected(){return current.filter((_,i)=>rows.querySelector(`input[data-i="${i}"]`)?.checked)}
  function payload(){const items=selected();return {schema:'buju.bigfun-visible.v0.1',captured_at:new Date().toISOString(),page_url:location.href,count:items.length,items}}
  function download(){const p=payload();const blob=new Blob([JSON.stringify(p,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`buju-bigfun-visible-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

  button.onclick=()=>{panel.classList.add('open');rescan()};
  panel.querySelector('.bujuClose').onclick=()=>panel.classList.remove('open');
  panel.querySelector('#bujuRescan').onclick=rescan;
  panel.querySelector('#bujuAll').onclick=()=>rows.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=true);
  panel.querySelector('#bujuNone').onclick=()=>rows.querySelectorAll('input[type="checkbox"]').forEach(x=>x.checked=false);
  panel.querySelector('#bujuDownload').onclick=download;
  panel.querySelector('#bujuCopy').onclick=async()=>{const text=JSON.stringify(payload(),null,2);try{await navigator.clipboard.writeText(text);count.textContent=`已複製 ${selected().length} 戶 JSON 到剪貼簿。`}catch{count.textContent='瀏覽器不允許剪貼簿；請使用「下載 JSON」。'}};
})();
