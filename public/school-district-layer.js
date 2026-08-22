(()=>{
  const SOURCE_ID='school-catchment';
  const FILL_ID='school-catchment-fill';
  const LINE_ID='school-catchment-line';
  const LABEL_ID='school-catchment-label';
  const EMPTY={type:'FeatureCollection',features:[]};
  const TAIPEI_NEIGHBOR_QUERY='https://arcgis.tpgos.gov.taipei/arcgis/rest/services/CA/CIVILMAP_V3/MapServer/16/query';
  const PILOT_DISTRICTS=new Set(['大安','信義']);
  const PALETTE=['#8e6bbf','#4f8ecb','#50a987','#d08b48','#c85f71','#798f3f','#4b9ca8','#b56eae','#7c79c5','#be7a52','#5e9a68','#a1794f'];

  const whole=(school)=>({all:school});
  const split=(...pairs)=>({rules:pairs.map(([spec,school])=>({spec,school}))});

  // 115學年度官方里鄰學區對照表。這個 pilot 先把大安、信義做成真正的「鄰界 polygon → 學區」；
  // 不是學校點位，也不以 Voronoi/距離推估學區。
  const ELEMENTARY={
    // 大安區
    '大安|龍陣':whole('建安'),'大安|住安':whole('建安'),'大安|龍雲':whole('建安'),'大安|群英':whole('建安'),
    '大安|義安':split(['1,2','仁愛'],['3-7','仁愛、建安共同學區'],['8-20','建安']),
    '大安|群賢':whole('建安'),
    '大安|通安':split(['1,4-7,19,20','仁愛、三興共同學區'],['2,3','仁愛'],['8-16','三興'],['17,18','三興、建安共同學區']),
    '大安|通化':split(['1-4','仁愛'],['5-8,10,11,14-17,20,21','仁愛、三興共同學區'],['9,12,13,18,19,22,23','三興']),
    '大安|永康':whole('金華'),
    '大安|福住':split(['1,2,5,6,9-11,17','新生'],['3,4,7,8,12-16','金華、新生共同學區']),
    '大安|錦安':split(['11,12,15,16','新生'],['1,2,5,6,8','金華'],['3,4,7,9,10,13,14,17,18','金華、新生共同學區']),
    '大安|龍安':split(['1-10','龍安、新生共同學區'],['11-17','金華、新生共同學區']),
    '大安|新龍':whole('龍安、建安共同學區'),'大安|光明':whole('金華'),'大安|錦泰':whole('金華'),'大安|錦華':whole('金華'),
    '大安|和安':whole('幸安'),'大安|仁慈':whole('仁愛'),'大安|德安':whole('仁愛'),'大安|敦安':whole('仁愛'),'大安|敦煌':whole('仁愛'),'大安|建倫':whole('仁愛'),'大安|建安':whole('仁愛'),
    '大安|光武':split(['1-11,24-28','仁愛'],['12-23','敦化']),
    '大安|大學':split(['1-3,6-8,22','龍安'],['4','龍安、古亭共同學區'],['5,9-21,23,24','古亭']),
    '大安|黎孝':whole('大安'),'大安|黎元':whole('大安'),'大安|黎和':whole('大安'),
    '大安|學府':split(['1-4,16,17','銘傳、公館共同學區'],['5-15','公館']),
    '大安|民炤':whole('幸安'),'大安|古風':whole('古亭'),
    '大安|古莊':split(['1,3-18','古亭'],['2','古亭、龍安共同學區']),
    '大安|仁愛':whole('仁愛'),'大安|正聲':whole('光復'),'大安|華聲':whole('光復'),'大安|龍圖':whole('幸安、建安共同學區'),'大安|龍泉':whole('龍安、古亭共同學區'),'大安|龍坡':whole('龍安'),'大安|芳和':whole('大安'),'大安|全安':whole('建安'),'大安|龍淵':whole('國北教大附小'),
    '大安|龍生':split(['1-13','國北教大附小'],['14,15','龍安、國北教大附小共同學區（試辦）'],['16-20','龍安']),
    '大安|車層':split(['1-6,9-21,23-26','光復'],['7,8,22','仁愛']),
    '大安|光信':split(['1-17','光復'],['18-30','仁愛']),
    '大安|義村':whole('懷生'),'大安|誠安':whole('懷生'),'大安|昌隆':whole('懷生'),
    '大安|民輝':split(['1-18,24','幸安'],['19','忠孝'],['20,21','懷生、忠孝共同學區'],['22,23','懷生']),
    '大安|臨江':split(['1-5,7','三興、仁愛共同學區'],['6,8-15','三興']),
    '大安|法治':split(['3-9,11,12','建安'],['1,2,10','建安、三興共同學區']),
    '大安|虎嘯':split(['5,7-12','大安'],['1-4,6','大安、和平共同學區']),
    '大安|臥龍':split(['1-4','大安、和平共同學區'],['5-8','大安、龍安、建安、國北教大附小、和平共同學區']),
    '大安|龍門':split(['1-3,6-13','龍安'],['4,5','龍安、國北教大附小共同學區（試辦）']),

    // 信義區
    '信義|四維':whole('雙永'),
    '信義|四育':split(['1,2,8','松山、興雅共同學區'],['6-7,9,11-20','雙永'],['3-5','雙永、松山共同學區'],['10','雙永、松山、興雅共同學區']),
    '信義|永吉':split(['1-4','雙永、松山共同學區'],['5-17','雙永']),'信義|永春':whole('雙永'),'信義|五常':whole('興雅'),'信義|大仁':whole('雙永、福德共同學區'),
    '信義|廣居':split(['1-25','博愛'],['26-29','雙永、博愛共同學區']),
    '信義|黎平':whole('三興、大安共同學區'),'信義|五全':whole('興雅'),'信義|正和':whole('光復'),'信義|中行':whole('福德'),
    '信義|大道':split(['1-15,17-19','雙永'],['16,20-22','雙永、福德共同學區']),
    '信義|中坡':whole('福德'),'信義|黎忠':whole('三興、大安共同學區'),'信義|黎安':whole('大安'),'信義|黎順':whole('三興'),
    '信義|中興':split(['4,5,9-14','光復'],['1-3,6-8','三興']),
    '信義|三張':split(['6,22-36','信義'],['1-5,7-21','吳興']),
    '信義|三犁':split(['5,12,14,23','信義'],['1-4,6-11,13,15,16,18-22','吳興'],['17','信義、吳興共同學區']),
    '信義|泰和':whole('吳興'),'信義|六合':whole('吳興'),'信義|嘉興':whole('三興'),'信義|惠安':whole('吳興'),'信義|興雅':whole('興雅'),'信義|西村':whole('光復'),'信義|敦厚':whole('興雅'),
    '信義|新仁':split(['19','興雅'],['1-18,20-22','光復']),
    '信義|興隆':whole('光復'),'信義|六藝':whole('興雅'),'信義|安康':whole('博愛'),'信義|國業':whole('博愛'),'信義|松光':whole('雙永'),'信義|松隆':whole('福德、雙永共同學區'),
    '信義|富台':split(['1-5,7,9-13,17,18','雙永'],['6,8,14-16','雙永、博愛共同學區']),
    '信義|長春':whole('雙永'),'信義|松友':whole('博愛'),'信義|雅祥':whole('興雅'),
    '信義|景勤':split(['6-16','三興'],['1-5','信義']),
    '信義|景聯':split(['11,13,14','三興、信義共同學區'],['1-10,12,15-26','三興']),
    '信義|景新':whole('信義'),
    '信義|雙和':split(['1,11-23','信義'],['2-10,24','吳興'])
  };

  const JUNIOR={
    // 大安區
    '大安|德安':whole('仁愛'),'大安|敦安':whole('仁愛'),'大安|建安':whole('仁愛'),'大安|建倫':whole('仁愛'),'大安|敦煌':whole('仁愛'),'大安|光信':whole('仁愛'),'大安|車層':whole('仁愛'),
    '大安|臨江':split(['1-7','和平、大安、仁愛共同學區'],['8-15','和平、大安共同學區']),
    '大安|法治':whole('和平、大安共同學區'),'大安|華聲':whole('興雅、懷生、仁愛共同學區'),
    '大安|學府':split(['1-5,16,17','民族、和平共同學區'],['6-15','芳和、民族、和平共同學區']),
    '大安|古莊':whole('金華、民族、螢橋共同學區'),'大安|古風':whole('金華、民族、螢橋共同學區'),'大安|黎和':whole('芳和、信義、和平共同學區'),'大安|龍泉':whole('金華、民族、龍門共同學區'),
    '大安|光武':whole('仁愛、懷生共同學區'),'大安|黎孝':whole('芳和、信義、和平共同學區'),'大安|龍坡':whole('龍門、金華、民族共同學區'),'大安|黎元':whole('芳和、和平共同學區'),'大安|龍門':whole('龍門'),'大安|大學':whole('龍門、民族共同學區'),'大安|新龍':whole('龍門、金華共同學區'),
    '大安|誠安':whole('懷生'),'大安|龍淵':whole('龍門、和平、金華、民族共同學區'),'大安|正聲':whole('興雅、懷生、仁愛共同學區'),'大安|民輝':whole('懷生'),'大安|和安':whole('師大附中'),'大安|虎嘯':whole('和平'),'大安|昌隆':whole('懷生'),'大安|仁慈':whole('師大附中'),
    '大安|臥龍':split(['1-4','和平'],['5-8','和平、龍門共同學區']),
    '大安|義村':whole('懷生'),'大安|光明':whole('中正'),'大安|住安':whole('大安'),'大安|錦泰':whole('中正'),'大安|龍安':whole('金華'),'大安|義安':whole('大安'),'大安|錦華':whole('中正'),'大安|錦安':whole('金華'),
    '大安|通安':split(['1-3','仁愛'],['4-20','大安']),
    '大安|仁愛':split(['1-10','懷生、仁愛共同學區'],['11-23','仁愛']),
    '大安|芳和':split(['1-2,7-18','芳和、信義、和平共同學區'],['3-5,19-21','和平'],['6','芳和、和平共同學區']),
    '大安|通化':whole('大安、仁愛共同學區'),
    '大安|民炤':split(['2-17','金華'],['1,18-24','懷生']),
    '大安|群英':whole('大安'),'大安|群賢':whole('大安'),'大安|龍生':whole('龍門、金華、大安共同學區'),'大安|龍陣':whole('大安'),
    '大安|龍圖':split(['1-6','金華'],['7-20','大安']),
    '大安|龍雲':whole('大安'),'大安|永康':whole('金華'),
    '大安|全安':split(['1-4','大安'],['5-17','大安、和平共同學區']),'大安|福住':whole('金華'),

    // 信義區
    '信義|黎平':split(['1-13','和平'],['14-24','芳和、信義共同學區']),'信義|雙和':whole('信義'),'信義|泰和':whole('信義'),'信義|長春':whole('永吉'),'信義|六合':whole('信義'),'信義|四育':whole('永吉'),'信義|惠安':whole('信義'),'信義|四維':whole('永吉'),'信義|嘉興':whole('信義'),'信義|五常':whole('永吉'),'信義|景新':whole('信義'),'信義|永吉':whole('永吉'),'信義|景聯':whole('信義'),'信義|永春':whole('永吉'),'信義|景勤':whole('信義'),'信義|雅祥':whole('永吉'),'信義|三張':whole('信義'),'信義|五全':whole('永吉'),'信義|三犁':whole('信義'),'信義|松光':whole('瑠公'),
    '信義|中興':split(['1-3,6-8','信義'],['4,5,9-14','信義、仁愛共同學區']),'信義|大道':whole('瑠公'),'信義|中坡':whole('瑠公'),'信義|黎安':whole('芳和、信義共同學區'),'信義|大仁':whole('瑠公'),'信義|黎忠':whole('芳和、信義共同學區'),'信義|中行':whole('瑠公'),'信義|黎順':whole('芳和、信義共同學區'),
    '信義|松隆':split(['1-6','興雅、瑠公共同學區'],['7-12','興雅']),'信義|正和':whole('仁愛'),'信義|松友':whole('興雅'),'信義|敦厚':whole('興雅'),'信義|六藝':whole('興雅'),'信義|興雅':whole('興雅'),'信義|興隆':whole('興雅、仁愛共同學區'),'信義|新仁':whole('興雅'),'信義|西村':whole('仁愛、興雅共同學區'),'信義|富台':whole('興雅'),'信義|國業':whole('興雅'),'信義|安康':whole('興雅'),'信義|廣居':whole('興雅')
  };

  function parseSpec(spec){
    const out=new Set();
    for(const token of String(spec||'').replace(/、/g,',').split(',').map(s=>s.trim()).filter(Boolean)){
      const m=token.match(/^(\d+)\s*-\s*(\d+)$/);
      if(m){for(let n=Number(m[1]);n<=Number(m[2]);n++)out.add(n);}
      else if(/^\d+$/.test(token))out.add(Number(token));
    }
    return out;
  }

  for(const table of [ELEMENTARY,JUNIOR]){
    for(const entry of Object.values(table))if(entry.rules)for(const r of entry.rules)r.neighbors=parseSpec(r.spec);
  }

  function cleanDistrict(s){return String(s||'').trim().replace(/市$/,'').replace(/區$/,'');}
  function cleanVillage(s){return String(s||'').trim().replace(/里$/,'');}
  function neighborNo(value){const n=Number(String(value??'').match(/\d+/)?.[0]);return Number.isFinite(n)?n:null;}

  function assignment(level,district,village,neighbor){
    const table=level==='junior'?JUNIOR:ELEMENTARY;
    const entry=table[`${cleanDistrict(district)}|${cleanVillage(village)}`];
    if(!entry)return null;
    if(entry.all)return entry.all;
    if(neighbor==null)return null;
    return entry.rules.find(r=>r.neighbors.has(neighbor))?.school||null;
  }

  function colorFor(label){
    let hash=0;for(const ch of String(label||''))hash=((hash<<5)-hash)+ch.charCodeAt(0)|0;
    return PALETTE[Math.abs(hash)%PALETTE.length];
  }

  function labelFor(school){
    const raw=String(school||'').trim();
    if(!raw.includes('共同學區'))return raw;
    const schools=raw.replace(/共同學區.*$/,'').replace(/[、，,]+$/,'').replace(/、/g,'・');
    return `${schools}\n共同學區`;
  }

  function roughCenter(feature){
    let minLng=Infinity,maxLng=-Infinity,minLat=Infinity,maxLat=-Infinity;
    const walk=node=>{
      if(!Array.isArray(node))return;
      if(node.length>=2&&Number.isFinite(Number(node[0]))&&Number.isFinite(Number(node[1]))){
        const lng=Number(node[0]),lat=Number(node[1]);
        minLng=Math.min(minLng,lng);maxLng=Math.max(maxLng,lng);minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat);return;
      }
      for(const child of node)walk(child);
    };
    walk(feature?.geometry?.coordinates);
    return Number.isFinite(minLng)?[(minLng+maxLng)/2,(minLat+maxLat)/2]:null;
  }

  function chooseLabelAnchors(features){
    const groups=new Map();
    for(const feature of features){
      const school=feature.properties?.school||'';
      const center=roughCenter(feature);
      if(!center)continue;
      if(!groups.has(school))groups.set(school,[]);
      groups.get(school).push({feature,center});
    }
    for(const items of groups.values()){
      const target=items.reduce((a,item)=>[a[0]+item.center[0],a[1]+item.center[1]],[0,0]).map(v=>v/items.length);
      let best=items[0],bestD=Infinity;
      for(const item of items){
        const dx=item.center[0]-target[0],dy=item.center[1]-target[1],d=dx*dx+dy*dy;
        if(d<bestD){best=item;bestD=d;}
      }
      best.feature.properties.showLabel=true;
    }
    return groups.size;
  }

  function popupHtml(p){
    const safe=s=>String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    const level=p.level==='junior'?'國中':'國小';
    const shared=String(p.school).includes('共同學區');
    const location=`${safe(p.district)}區・${safe(p.village)}里・第${safe(p.neighbor)}鄰`;
    return `<div style="font:13px/1.5 system-ui,-apple-system,sans-serif;min-width:210px;max-width:260px"><div style="font-size:15px;font-weight:800;color:#24303a">${safe(p.school)}</div><div style="display:inline-block;margin:5px 0 7px;padding:2px 7px;border-radius:999px;background:#edf3f7;color:#384955;font-size:11px;font-weight:700">${level}學區</div><div style="color:#5f6b75">${location}</div>${shared?'<div style="margin-top:7px;padding:6px 8px;border-radius:8px;background:#fff6df;color:#7b591d">共同學區：可對應多校，請再依當年度入學規定確認。</div>':''}<div style="margin-top:7px;font-size:10.5px;color:#7a848d">115學年度・臺北市教育局里鄰學區＋臺北市民政局鄰界</div></div>`;
  }

  class SchoolDistrictLayer{
    constructor(map,{onState}={}){
      this.map=map;this.onState=typeof onState==='function'?onState:()=>{};
      this.enabled=false;this.level='elementary';this.abortController=null;this.timer=null;this.lastKey='';
      this.boundMove=()=>this.schedule();
    }

    init(){
      if(this.map.getSource(SOURCE_ID))return;
      this.map.addSource(SOURCE_ID,{type:'geojson',data:EMPTY});
      const before=this.map.getLayer('building')?'building':undefined;
      this.map.addLayer({id:FILL_ID,type:'fill',source:SOURCE_ID,layout:{visibility:'none'},paint:{'fill-color':['get','color'],'fill-opacity':.25}},before);
      this.map.addLayer({id:LINE_ID,type:'line',source:SOURCE_ID,layout:{visibility:'none'},paint:{'line-color':'rgba(36,48,58,.34)','line-width':['interpolate',['linear'],['zoom'],13,.35,16,.9,18,1.25]}},before);
      this.map.addLayer({id:LABEL_ID,type:'symbol',source:SOURCE_ID,minzoom:14.35,filter:['==',['get','showLabel'],true],layout:{visibility:'none','text-field':['get','label'],'text-size':['interpolate',['linear'],['zoom'],14.35,11,16,12.5,18,13.5],'text-line-height':1.05,'text-max-width':9,'text-padding':22,'text-allow-overlap':false,'text-ignore-placement':false},paint:{'text-color':'#26323c','text-halo-color':'rgba(255,255,255,.94)','text-halo-width':1.35}});
      this.map.on('moveend',this.boundMove);
      this.map.on('click',FILL_ID,e=>{const f=e.features?.[0];if(!f)return;new maplibregl.Popup({maxWidth:'290px'}).setLngLat(e.lngLat).setHTML(popupHtml(f.properties||{})).addTo(this.map);});
      this.map.on('mouseenter',FILL_ID,()=>{this.map.getCanvas().style.cursor='pointer';});
      this.map.on('mouseleave',FILL_ID,()=>{this.map.getCanvas().style.cursor='';});
      this.syncVisibility();
    }

    setEnabled(on){this.enabled=!!on;this.syncVisibility();if(this.enabled)this.refresh(true);else this.emit('off','學區 OFF');}
    setLevel(level){if(!['elementary','junior'].includes(level))return;this.level=level;this.lastKey='';if(this.enabled)this.refresh(true);}
    syncVisibility(){for(const id of [FILL_ID,LINE_ID,LABEL_ID])if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility',this.enabled?'visible':'none');}
    schedule(){if(!this.enabled)return;clearTimeout(this.timer);this.timer=setTimeout(()=>this.refresh(false),180);}
    emit(state,message,extra={}){this.onState({state,message,level:this.level,...extra});}

    async refresh(force=false){
      if(!this.enabled||!this.map.isStyleLoaded())return;
      if(this.map.getZoom()<13.2){this.clear();this.emit('zoom','再放大一點即可顯示里鄰級學區邊界');return;}
      const b=this.map.getBounds();
      const key=[this.level,b.getWest().toFixed(3),b.getSouth().toFixed(3),b.getEast().toFixed(3),b.getNorth().toFixed(3)].join(':');
      if(!force&&key===this.lastKey)return;this.lastKey=key;
      this.abortController?.abort();this.abortController=new AbortController();
      this.emit('loading',`${this.level==='junior'?'國中':'國小'}學區載入中…`);
      const params=new URLSearchParams({
        where:"SECT_NAME IN ('大安區','信義區')",outFields:'SECT_NAME,LIE_NAME,LI_NO',returnGeometry:'true',
        geometry:`${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`,geometryType:'esriGeometryEnvelope',inSR:'4326',outSR:'4326',
        spatialRel:'esriSpatialRelIntersects',resultRecordCount:'1000',f:'geojson'
      });
      try{
        const response=await fetch(`${TAIPEI_NEIGHBOR_QUERY}?${params}`,{signal:this.abortController.signal,cache:'no-store'});
        if(!response.ok)throw new Error(`臺北鄰界 HTTP ${response.status}`);
        const fc=await response.json();
        const features=[];let unmatched=0;
        for(const f of fc.features||[]){
          const p=f.properties||{};const district=cleanDistrict(p.SECT_NAME),village=cleanVillage(p.LIE_NAME),neighbor=neighborNo(p.LI_NO);
          if(!PILOT_DISTRICTS.has(district))continue;
          const school=assignment(this.level,district,village,neighbor);
          if(!school){unmatched++;continue;}
          features.push({...f,properties:{...p,district,village,neighbor,school,label:labelFor(school),showLabel:false,level:this.level,color:colorFor(school),key:`${district}|${village}|${neighbor}`}});
        }
        const catchments=chooseLabelAnchors(features);
        const src=this.map.getSource(SOURCE_ID);if(src)src.setData({type:'FeatureCollection',features});
        this.emit('ready',`${this.level==='junior'?'國中':'國小'}學區 · ${catchments} 個學區 · ${features.length} 個鄰界 · 大安/信義 115學年度`,{count:features.length,catchments,unmatched});
      }catch(e){
        if(e?.name==='AbortError')return;console.warn('School district layer failed',e);this.clear();this.emit('error',`學區邊界暫時載入失敗 · ${e?.message||e}`);
      }
    }
    clear(){const src=this.map.getSource(SOURCE_ID);if(src)src.setData(EMPTY);}
  }

  window.TaipeiMapsSchoolDistrictLayer={SchoolDistrictLayer,assignment,ELEMENTARY,JUNIOR};
})();