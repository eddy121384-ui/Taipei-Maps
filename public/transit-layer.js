(()=>{
  const TAIWAN_BOUNDS={west:118.0,south:21.5,east:123.8,north:26.7};
  const SOURCE_ID='overture-transportation';
  const SOURCE_LAYER='segment';
  const TAIPEI_MRT_SOURCE_ID='taipei-mrt-official';
  const TAIPEI_MRT_GEOJSON_URL='https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=1139b06e-8128-4a07-8148-f27f038bd8b4';

  // Taipei Metro / TDX line-color convention.
  const MRT_COLORS={
    BR:'#c48c31',
    R:'#e3002c',
    G:'#008659',
    O:'#f8b61c',
    BL:'#0070bd',
    Y:'#ffdb00'
  };

  // DORTS GIS uses the historical physical-line names rather than today's
  // through-service names. Map those authoritative geometries to the current
  // passenger-facing line colors.
  const MRT_ROUTE_TO_LINE={
    '木柵線':'BR','內湖線':'BR',
    '淡水線':'R','信義線':'R',
    '新店線':'G','松山線':'G','小南門線':'G',
    '中和線':'O','蘆洲線':'O','新莊線':'O',
    '板橋線':'BL','南港線':'BL',
    '環狀線':'Y'
  };

  const LAYERS={
    mrtCasing:'transit-mrt-casing',mrt:'transit-mrt',
    traCasing:'transit-tra-casing',tra:'transit-tra',
    thsrCasing:'transit-thsr-casing',thsr:'transit-thsr',
    mrtOfficialCasing:'transit-mrt-official-casing',mrtOfficial:'transit-mrt-official'
  };
  const ALL_LAYER_IDS=Object.values(LAYERS);

  function transportationUrl(buildingUrl,release){
    if(buildingUrl&&/\/buildings\.pmtiles(?:\?.*)?$/.test(buildingUrl)){
      return buildingUrl.replace(/\/buildings\.pmtiles(?:\?.*)?$/, '/transportation.pmtiles');
    }
    if(release){
      return `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${release}/transportation.pmtiles`;
    }
    throw new Error('Overture building URL or release is required for transit overlay');
  }

  function centerInsideTaiwan(map){
    const c=map.getCenter();
    return c.lng>=TAIWAN_BOUNDS.west&&c.lng<=TAIWAN_BOUNDS.east&&c.lat>=TAIWAN_BOUNDS.south&&c.lat<=TAIWAN_BOUNDS.north;
  }

  const width=['interpolate',['linear'],['zoom'],8,1.35,11,2.0,14,3.0,17,4.8];
  const casingWidth=['interpolate',['linear'],['zoom'],8,2.8,11,3.7,14,5.2,17,7.2];
  const officialMrtWidth=['interpolate',['linear'],['zoom'],9,1.7,11,2.4,14,3.5,17,5.1];
  const officialMrtCasingWidth=['interpolate',['linear'],['zoom'],9,3.2,11,4.1,14,5.7,17,7.7];

  function railFilter(classes){
    return ['all',
      ['==',['get','subtype'],'rail'],
      ['in',['get','class'],['literal',classes]]
    ];
  }

  function lineLayer(id,filter,color,isCasing=false,opacity=null){
    return {
      id,type:'line',source:SOURCE_ID,'source-layer':SOURCE_LAYER,minzoom:8,
      filter,
      layout:{visibility:'none','line-cap':'round','line-join':'round'},
      paint:{
        'line-color':color,
        'line-width':isCasing?casingWidth:width,
        'line-opacity':opacity??(isCasing?.88:.96)
      }
    };
  }

  function officialMrtLayer(id,isCasing=false){
    return {
      id,type:'line',source:TAIPEI_MRT_SOURCE_ID,minzoom:9,
      layout:{visibility:'none','line-cap':'round','line-join':'round'},
      paint:{
        'line-color':isCasing?'rgba(255,255,255,.97)':['get','line_color'],
        'line-width':isCasing?officialMrtCasingWidth:officialMrtWidth,
        'line-opacity':isCasing?.94:.99
      }
    };
  }

  // Inverse TWD97 TM2 zone 121 (EPSG:3826) -> WGS84. Keeping this tiny
  // conversion local avoids adding another runtime library just for one
  // government GeoJSON source.
  function twd97ToWgs84(x,y){
    const a=6378137.0,b=6356752.314245,k0=.9999,dx=250000.0,lon0=121*Math.PI/180;
    const e2=1-(b*b)/(a*a),sqrt1=Math.sqrt(1-e2),e1=(1-sqrt1)/(1+sqrt1);
    const M=y/k0;
    const mu=M/(a*(1-e2/4-3*e2*e2/64-5*e2*e2*e2/256));
    const J1=3*e1/2-27*e1*e1*e1/32;
    const J2=21*e1*e1/16-55*e1*e1*e1*e1/32;
    const J3=151*e1*e1*e1/96;
    const J4=1097*e1*e1*e1*e1/512;
    const fp=mu+J1*Math.sin(2*mu)+J2*Math.sin(4*mu)+J3*Math.sin(6*mu)+J4*Math.sin(8*mu);
    const ep2=e2/(1-e2),sinFp=Math.sin(fp),cosFp=Math.cos(fp),tanFp=Math.tan(fp);
    const C1=ep2*cosFp*cosFp,T1=tanFp*tanFp;
    const N1=a/Math.sqrt(1-e2*sinFp*sinFp);
    const R1=a*(1-e2)/Math.pow(1-e2*sinFp*sinFp,1.5);
    const D=(x-dx)/(N1*k0);
    const D2=D*D,D3=D2*D,D4=D2*D2,D5=D4*D,D6=D3*D3;
    const lat=fp-(N1*tanFp/R1)*(D2/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*D4/24+(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*D6/720);
    const lon=lon0+(D-(1+2*T1+C1)*D3/6+(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*D5/120)/cosFp;
    return [lon*180/Math.PI,lat*180/Math.PI];
  }

  function transformGeometry(geometry){
    if(!geometry)return null;
    if(geometry.type==='LineString')return {...geometry,coordinates:geometry.coordinates.map(([x,y])=>twd97ToWgs84(Number(x),Number(y)))};
    if(geometry.type==='MultiLineString')return {...geometry,coordinates:geometry.coordinates.map(line=>line.map(([x,y])=>twd97ToWgs84(Number(x),Number(y))))};
    return null;
  }

  function normalizeOfficialMrt(raw){
    const crs=String(raw?.crs?.properties?.name||'');
    if(crs&&!crs.includes('3826'))throw new Error(`Unexpected Taipei MRT CRS: ${crs}`);
    const features=[];
    for(const feature of raw?.features||[]){
      const routeName=String(feature?.properties?.RouteName||'').trim();
      const lineCode=MRT_ROUTE_TO_LINE[routeName];
      if(!lineCode)continue;
      const geometry=transformGeometry(feature.geometry);
      if(!geometry)continue;
      features.push({
        type:'Feature',
        id:feature.id,
        geometry,
        properties:{route_name:routeName,line_code:lineCode,line_color:MRT_COLORS[lineCode]}
      });
    }
    if(features.length<10)throw new Error(`Official Taipei MRT geometry unexpectedly small: ${features.length}`);
    return {type:'FeatureCollection',features};
  }

  class TransitToggleControl{
    constructor(layer){this.layer=layer;this.container=null;this.button=null;}
    onAdd(){
      const container=document.createElement('div');
      container.className='maplibregl-ctrl maplibregl-ctrl-group';
      const button=document.createElement('button');
      button.type='button';
      button.setAttribute('aria-label','切換捷運、台鐵與高鐵路線');
      button.textContent='🚇';
      button.style.fontSize='16px';
      button.style.lineHeight='1';
      button.onclick=()=>this.layer.setEnabled(!this.layer.enabled);
      container.appendChild(button);
      this.container=container;this.button=button;
      this.update();
      return container;
    }
    onRemove(){this.container?.remove();this.container=null;this.button=null;}
    update({inTaiwan=centerInsideTaiwan(this.layer.map)}={}){
      if(!this.button)return;
      this.button.style.opacity=inTaiwan?'1':'.42';
      this.button.style.background=this.layer.enabled&&inTaiwan?'#e8f1f8':'';
      this.button.title=!inTaiwan?'軌道路線僅在台灣顯示':`軌道 ${this.layer.enabled?'ON':'OFF'} · 捷運 / 台鐵 / 高鐵`;
      this.button.setAttribute('aria-pressed',this.layer.enabled&&inTaiwan?'true':'false');
    }
  }

  class TransitLayer{
    constructor(map,{overtureBuildingUrl=null,release=null,enabled=true,onState=null}={}){
      this.map=map;
      this.enabled=Boolean(enabled);
      this.onState=typeof onState==='function'?onState:()=>{};
      this.url=transportationUrl(overtureBuildingUrl,release);
      this.initialized=false;
      this.officialMrtReady=false;
      this.control=null;
      this._moveHandler=()=>this.sync();
    }

    emit(state,message,extra={}){
      this.onState({state,message,...extra});
      this.map.fire('taipei-maps-transitchange',{state,message,enabled:this.enabled,...extra});
    }

    async loadOfficialTaipeiMrt(beforeId){
      const response=await fetch(TAIPEI_MRT_GEOJSON_URL,{cache:'force-cache'});
      if(!response.ok)throw new Error(`Taipei MRT GIS HTTP ${response.status}`);
      const raw=await response.json();
      const data=normalizeOfficialMrt(raw);
      if(!this.map.getSource(TAIPEI_MRT_SOURCE_ID)){
        this.map.addSource(TAIPEI_MRT_SOURCE_ID,{type:'geojson',data,attribution:'© 臺北市政府捷運工程局'});
      }
      for(const layer of [officialMrtLayer(LAYERS.mrtOfficialCasing,true),officialMrtLayer(LAYERS.mrtOfficial,false)]){
        if(!this.map.getLayer(layer.id))this.map.addLayer(layer,beforeId);
      }
      this.officialMrtReady=true;
      return data.features.length;
    }

    async init(){
      if(this.initialized)return true;
      if(!window.pmtiles)throw new Error('PMTiles runtime is unavailable');
      try{
        this.emit('loading','軌道交通資料載入中…');
        const archive=new pmtiles.PMTiles(this.url);
        const [,metadata]=await Promise.all([archive.getHeader(),archive.getMetadata()]);
        const sourceLayers=(metadata?.vector_layers||[]).map(row=>row?.id).filter(Boolean);
        if(!sourceLayers.includes(SOURCE_LAYER)){
          throw new Error(`Overture transportation PMTiles missing ${SOURCE_LAYER} source-layer`);
        }

        if(!this.map.getSource(SOURCE_ID)){
          this.map.addSource(SOURCE_ID,{type:'vector',url:`pmtiles://${this.url}`,attribution:'© Overture Maps Foundation / source contributors'});
        }

        const mrtFilter=railFilter(['subway','monorail','light_rail']);
        const traFilter=railFilter(['narrow_gauge']);
        const thsrFilter=railFilter(['standard_gauge']);
        const layers=[
          // Overture remains a muted fallback for metro/LRT segments that are
          // outside or absent from the Taipei government network dataset.
          lineLayer(LAYERS.mrtCasing,mrtFilter,'rgba(255,255,255,.78)',true,.58),
          lineLayer(LAYERS.mrt,mrtFilter,'#78909c',false,.58),
          lineLayer(LAYERS.traCasing,traFilter,'rgba(255,255,255,.96)',true),
          lineLayer(LAYERS.tra,traFilter,'#2e7d32'),
          lineLayer(LAYERS.thsrCasing,thsrFilter,'rgba(255,255,255,.96)',true),
          lineLayer(LAYERS.thsr,thsrFilter,'#f57c00')
        ];
        const beforeId=this.map.getLayer('building')?'building':undefined;
        for(const layer of layers)if(!this.map.getLayer(layer.id))this.map.addLayer(layer,beforeId);

        try{
          const count=await this.loadOfficialTaipeiMrt(beforeId);
          console.info(`Taipei official MRT geometry ready: ${count} feature(s)`);
        }catch(error){
          console.warn('Official Taipei MRT geometry unavailable; keeping Overture metro fallback',error);
        }

        this.initialized=true;
        this.map.on('moveend',this._moveHandler);
        this.control=new TransitToggleControl(this);
        this.map.addControl(this.control,'top-right');
        this.sync();
        return true;
      }catch(error){
        console.warn('Transit overlay unavailable',error);
        this.emit('error',`軌道交通暫時無法載入 · ${error?.message||error}`);
        return false;
      }
    }

    sync(){
      if(!this.initialized||!this.map.isStyleLoaded())return;
      const inTaiwan=centerInsideTaiwan(this.map);
      const visible=this.enabled&&inTaiwan;
      for(const id of ALL_LAYER_IDS){
        if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility',visible?'visible':'none');
      }
      this.control?.update({inTaiwan});
      if(!this.enabled)this.emit('off','軌道 OFF',{inTaiwan,officialMrt:this.officialMrtReady});
      else if(!inTaiwan)this.emit('outside','軌道僅在台灣顯示',{inTaiwan,officialMrt:this.officialMrtReady});
      else this.emit('ready',`軌道 ON · 捷運${this.officialMrtReady?'官方線色':' fallback'} / 台鐵 / 高鐵`,{inTaiwan,officialMrt:this.officialMrtReady});
    }

    setEnabled(enabled){
      this.enabled=Boolean(enabled);
      this.sync();
    }

    destroy(){
      this.map.off('moveend',this._moveHandler);
      if(this.control){try{this.map.removeControl(this.control);}catch{}this.control=null;}
      for(const id of [...ALL_LAYER_IDS].reverse())if(this.map.getLayer(id))this.map.removeLayer(id);
      if(this.map.getSource(TAIPEI_MRT_SOURCE_ID))this.map.removeSource(TAIPEI_MRT_SOURCE_ID);
      if(this.map.getSource(SOURCE_ID))this.map.removeSource(SOURCE_ID);
      this.initialized=false;
      this.officialMrtReady=false;
    }
  }

  window.TaipeiMapsTransitLayer={TransitLayer,TAIWAN_BOUNDS,SOURCE_ID,SOURCE_LAYER,TAIPEI_MRT_SOURCE_ID,TAIPEI_MRT_GEOJSON_URL,MRT_COLORS,MRT_ROUTE_TO_LINE,LAYERS,twd97ToWgs84,normalizeOfficialMrt};
})();
