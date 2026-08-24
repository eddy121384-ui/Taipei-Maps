(()=>{
  const SOURCE_ID='school-location';
  const POINT_ID='school-location-point';
  const LABEL_ID='school-location-label';
  const CATCHMENT_FILL_ID='school-catchment-fill';
  const EMPTY={type:'FeatureCollection',features:[]};
  const TWIN_CITY_BOUNDS={west:121.20,south:24.78,east:121.90,north:25.35};
  const CACHE_REUSE_FRACTION=.28;
  const PALETTE=['#8e6bbf','#4f8ecb','#50a987','#d08b48','#c85f71','#798f3f','#4b9ca8','#b56eae','#7c79c5','#be7a52','#5e9a68','#a1794f'];

  function inTwinCity(lng,lat){
    return lng>=TWIN_CITY_BOUNDS.west&&lng<=TWIN_CITY_BOUNDS.east&&lat>=TWIN_CITY_BOUNDS.south&&lat<=TWIN_CITY_BOUNDS.north;
  }

  function firstValue(obj,keys){
    for(const key of keys){
      if(obj&&obj[key]!==undefined&&obj[key]!==null&&String(obj[key]).trim()!=='')return obj[key];
    }
    return null;
  }

  function classifySchool(name,category=''){
    const text=`${name||''} ${category||''}`.replace(/\s+/g,'');
    if(!text||/幼兒園|幼稚園|大學|學院|補習|圖書館|博物館|美術館|文化中心|社教館|職訓/.test(text))return null;
    if(/國小|國民小學|小學/.test(text))return 'elementary';
    if(/國中|國民中學/.test(text))return 'junior';
    return null;
  }

  function shortName(name){
    return String(name||'')
      .replace(/^臺北市立/,'').replace(/^台北市立/,'').replace(/^新北市立/,'')
      .replace(/^臺北市/,'').replace(/^台北市/,'').replace(/^新北市/,'')
      .replace(/^(大安|信義|中正|松山|中山|萬華|文山|南港|內湖|士林|北投|大同)區/,'')
      .replace(/國民小學/,'國小').replace(/國民中學/,'國中')
      .trim();
  }

  function schoolColorKey(name){
    let key=shortName(name)
      .replace(/國民小學|國民中學|國小|國中/g,'')
      .replace(/^[·・\s]+|[·・\s]+$/g,'')
      .trim();
    if(/國立臺北教育大學附設實驗/.test(key))key='國北教大附小';
    return key||shortName(name)||String(name||'');
  }

  function colorFor(label){
    let hash=0;
    for(const ch of String(label||''))hash=((hash<<5)-hash)+ch.charCodeAt(0)|0;
    return PALETTE[Math.abs(hash)%PALETTE.length];
  }

  function normalizeRecord(record,index){
    if(!record||typeof record!=='object')return null;
    const name=String(firstValue(record,['name','NAME','Name','markname','markName','facilityName','設施名稱','名稱'])||'').trim();
    const category=String(firstValue(record,['category','CATEGORY','typeName','typename','class','kind','類別','種類'])||'').trim();
    const level=classifySchool(name,category);
    if(!level)return null;
    const lng=Number(firstValue(record,['lon','lng','longitude','LONGITUDE','x','X','經度']));
    const lat=Number(firstValue(record,['lat','latitude','LATITUDE','y','Y','緯度']));
    if(!Number.isFinite(lng)||!Number.isFinite(lat)||!inTwinCity(lng,lat))return null;
    const address=String(firstValue(record,['address','ADDRESS','addr','ADDR','fullAddress','門牌','地址'])||'').trim();
    const id=String(firstValue(record,['id','ID','objectid','OBJECTID','uid','UID'])||`${name}-${lng.toFixed(6)}-${lat.toFixed(6)}-${index}`);
    const colorKey=schoolColorKey(name);
    return {type:'Feature',id,geometry:{type:'Point',coordinates:[lng,lat]},properties:{id,name:name||'未命名學校',short_name:shortName(name)||name,level,address,source:'NLSC COM_009',color_key:colorKey,district_color:colorFor(colorKey)}};
  }

  function flattenResponse(payload){
    if(Array.isArray(payload))return payload;
    if(!payload||typeof payload!=='object')return [];
    for(const key of ['features','data','result','results','items','list','rows']){
      if(Array.isArray(payload[key]))return payload[key].map(item=>item?.properties?{...item.properties,...(item.geometry?.coordinates?{lon:item.geometry.coordinates[0],lat:item.geometry.coordinates[1]}:{})}:item);
    }
    const arrays=Object.values(payload).filter(Array.isArray);
    return arrays.length?arrays.flat():[];
  }

  function dedupe(features){
    const seen=new Set(),out=[];
    for(const f of features){
      const c=f.geometry?.coordinates||[],p=f.properties||{};
      const key=`${p.name}|${Number(c[0]).toFixed(5)}|${Number(c[1]).toFixed(5)}`;
      if(seen.has(key))continue;
      seen.add(key);out.push(f);
    }
    return out;
  }

  function distanceMeters(aLng,aLat,bLng,bLat){
    const rad=Math.PI/180;
    const lat1=aLat*rad,lat2=bLat*rad,dLat=(bLat-aLat)*rad,dLng=(bLng-aLng)*rad;
    const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
    return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  }

  function popupHtml(p){
    const safe=s=>String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
    const level=p.level==='junior'?'國中':'國小';
    return `<div style="font:13px/1.5 system-ui,-apple-system,sans-serif;min-width:180px"><strong>${safe(p.name)}</strong><br><span>${level} · 學校位置</span>${p.address?`<br><span style="color:#66717b">${safe(p.address)}</span>`:''}<br><span style="font-size:11px;color:#7a848d">校點色彩跟隨目前學區 · 位置資料：NLSC 文教設施</span></div>`;
  }

  class SchoolLocationLayer{
    constructor(map,{onState}={}){
      this.map=map;
      this.onState=typeof onState==='function'?onState:()=>{};
      this.enabled=false;
      this.level='elementary';
      this.abortController=null;
      this.timer=null;
      this.features=[];
      this.allFeatures=[];
      this.queryCenter=null;
      this.queryRadiusM=0;
      this.boundMove=()=>this.schedule();
      this.boundIdle=()=>this.syncDistrictColors();
    }

    init(){
      if(this.map.getSource(SOURCE_ID))return;
      this.map.addSource(SOURCE_ID,{type:'geojson',data:EMPTY});
      const before=this.map.getLayer('school-catchment-label')?'school-catchment-label':(this.map.getLayer('building')?'building':undefined);
      this.map.addLayer({
        id:POINT_ID,type:'circle',source:SOURCE_ID,
        filter:['==',['get','level'],this.level],
        layout:{visibility:'none'},
        paint:{
          'circle-radius':['interpolate',['linear'],['zoom'],13,4.5,15,6.25,17,7.75],
          'circle-color':['coalesce',['get','district_color'],'#24303a'],'circle-opacity':.98,
          'circle-stroke-color':'rgba(255,255,255,.98)','circle-stroke-width':['interpolate',['linear'],['zoom'],13,1.8,16,2.4]
        }
      },before);
      this.map.addLayer({
        id:LABEL_ID,type:'symbol',source:SOURCE_ID,minzoom:15.8,
        filter:['==',['get','level'],this.level],
        layout:{visibility:'none','text-field':['get','short_name'],'text-size':11,'text-offset':[0,1.15],'text-anchor':'top','text-max-width':9,'text-allow-overlap':false},
        paint:{'text-color':'#24303a','text-halo-color':'rgba(255,255,255,.96)','text-halo-width':1.3}
      });
      this.map.on('moveend',this.boundMove);
      this.map.on('idle',this.boundIdle);
      this.map.on('click',POINT_ID,e=>{const f=e.features?.[0];if(!f)return;new maplibregl.Popup({maxWidth:'280px'}).setLngLat(f.geometry.coordinates.slice()).setHTML(popupHtml(f.properties||{})).addTo(this.map);});
      this.map.on('mouseenter',POINT_ID,()=>{this.map.getCanvas().style.cursor='pointer';});
      this.map.on('mouseleave',POINT_ID,()=>{this.map.getCanvas().style.cursor='';});
      this.syncVisibility();
    }

    setEnabled(on){
      this.enabled=!!on;
      this.syncVisibility();
      if(this.enabled)this.refresh(true);else this.emit('off','校點 OFF');
    }

    setLevel(level){
      if(!['elementary','junior'].includes(level))return;
      this.level=level;
      for(const id of [POINT_ID,LABEL_ID])if(this.map.getLayer(id))this.map.setFilter(id,['==',['get','level'],this.level]);
      if(this.enabled){
        if(this.allFeatures.length){this.applyLevelFeatures('快取');}
        else this.refresh(true);
      }
    }

    syncVisibility(){
      for(const id of [POINT_ID,LABEL_ID])if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility',this.enabled?'visible':'none');
    }

    schedule(){if(!this.enabled)return;clearTimeout(this.timer);this.timer=setTimeout(()=>this.refresh(false),260);}

    queryRadius(){const z=this.map.getZoom();return z>=15?3200:z>=13?4500:5000;}

    cacheUsable(center,radius){
      if(!this.queryCenter||!this.allFeatures.length||radius>this.queryRadiusM)return false;
      const moved=distanceMeters(this.queryCenter.lng,this.queryCenter.lat,center.lng,center.lat);
      return moved<=this.queryRadiusM*CACHE_REUSE_FRACTION;
    }

    applyLevelFeatures(provenance='快取'){
      this.features=this.allFeatures.filter(f=>f.properties.level===this.level);
      const source=this.map.getSource(SOURCE_ID);if(source)source.setData({type:'FeatureCollection',features:this.features});
      requestAnimationFrame(()=>this.syncDistrictColors());
      this.emit('ready',`${this.level==='junior'?'國中':'國小'}校點 · ${this.features.length} 所 · ${provenance} · 色彩跟隨學區`);
    }

    syncDistrictColors(){
      if(!this.enabled||!this.features.length||!this.map.isStyleLoaded()||!this.map.getLayer(CATCHMENT_FILL_ID))return;
      let changed=false;
      for(const feature of this.features){
        const coord=feature.geometry?.coordinates;
        if(!coord)continue;
        const screen=this.map.project(coord);
        if(screen.x<0||screen.y<0||screen.x>this.map.getCanvas().clientWidth||screen.y>this.map.getCanvas().clientHeight)continue;
        const hit=this.map.queryRenderedFeatures(screen,{layers:[CATCHMENT_FILL_ID]})?.[0];
        const catchmentColor=hit?.properties?.color;
        if(catchmentColor&&feature.properties.district_color!==catchmentColor){
          feature.properties.district_color=catchmentColor;
          feature.properties.catchment_school=hit?.properties?.school||'';
          changed=true;
        }
      }
      if(changed){
        const source=this.map.getSource(SOURCE_ID);
        if(source)source.setData({type:'FeatureCollection',features:this.features});
      }
    }

    async refresh(force=false){
      if(!this.enabled||!this.map.isStyleLoaded())return;
      const c=this.map.getCenter();
      if(!inTwinCity(c.lng,c.lat)){this.clearVisible();this.emit('outside','校點目前只載入雙北');return;}
      if(this.map.getZoom()<12.8){this.clearVisible();this.emit('zoom','再放大一點即可顯示學校位置');return;}
      const radius=this.queryRadius();
      if(this.cacheUsable(c,radius)){
        this.applyLevelFeatures('快取');
        return;
      }

      this.abortController?.abort();this.abortController=new AbortController();
      this.emit('loading',`${this.level==='junior'?'國中':'國小'}校點載入中…`);
      const url=`https://api.nlsc.gov.tw/other/MarkBufferAnlys/edu/${c.lng.toFixed(6)}/${c.lat.toFixed(6)}/${radius}`;
      try{
        const response=await fetch(url,{signal:this.abortController.signal,cache:'no-store'});
        if(!response.ok)throw new Error(`NLSC HTTP ${response.status}`);
        const text=await response.text();
        let payload;try{payload=JSON.parse(text);}catch{throw new Error('NLSC 回傳格式不是 JSON');}
        const records=flattenResponse(payload);
        this.allFeatures=dedupe(records.map(normalizeRecord).filter(Boolean));
        this.queryCenter={lng:c.lng,lat:c.lat};this.queryRadiusM=radius;
        this.applyLevelFeatures('網路');
      }catch(e){
        if(e?.name==='AbortError')return;
        console.warn('School location layer failed',e);this.clearVisible();this.emit('error',`校點暫時載入失敗 · ${e?.message||e}`);
      }
    }

    clearVisible(){this.features=[];const source=this.map.getSource(SOURCE_ID);if(source)source.setData(EMPTY);}
    emit(state,message){this.onState({state,message,level:this.level,count:this.features.length});}
  }

  window.TaipeiMapsSchoolLocationLayer={SchoolLocationLayer,TWIN_CITY_BOUNDS,distanceMeters,CACHE_REUSE_FRACTION};
})();