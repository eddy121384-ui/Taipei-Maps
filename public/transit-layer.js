(()=>{
  const TAIWAN_BOUNDS={west:118.0,south:21.5,east:123.8,north:26.7};
  const SOURCE_ID='overture-transportation';
  const SOURCE_LAYER='segment';
  const TAIPEI_MRT_SOURCE_ID='taipei-mrt-official';
  const TAIPEI_MRT_GEOJSON_URL='/generated/taipei_mrt_lines_official.geojson';

  const MRT_COLORS={
    BR:'#c48c31',
    R:'#e3002c',
    G:'#008659',
    O:'#f8b61c',
    BL:'#0070bd',
    Y:'#ffdb00'
  };
  const EXPECTED_MRT_COLORS=new Set(Object.values(MRT_COLORS));
  const GLOBAL_METRO_COLOR='#1976d2';
  const GLOBAL_RAIL_COLOR='#5f6b76';
  const TAIWAN_TRA_COLOR='#2e7d32';
  const TAIWAN_THSR_COLOR='#f57c00';

  const LAYERS={
    mrtCasing:'transit-mrt-casing',mrt:'transit-mrt',
    traCasing:'transit-tra-casing',tra:'transit-tra',
    thsrCasing:'transit-thsr-casing',thsr:'transit-thsr',
    mrtOfficialCasing:'transit-mrt-official-casing',mrtOfficial:'transit-mrt-official'
  };
  const GLOBAL_LAYER_IDS=[LAYERS.mrtCasing,LAYERS.mrt,LAYERS.traCasing,LAYERS.tra,LAYERS.thsrCasing,LAYERS.thsr];
  const TAIWAN_ONLY_LAYER_IDS=[LAYERS.mrtOfficialCasing,LAYERS.mrtOfficial];
  const ALL_LAYER_IDS=[...GLOBAL_LAYER_IDS,...TAIWAN_ONLY_LAYER_IDS];

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

  function validateOfficialMrt(data){
    if(data?.type!=='FeatureCollection')throw new Error(`Local Taipei MRT dataset has unexpected type: ${data?.type}`);
    const features=(data.features||[]).filter(feature=>['LineString','MultiLineString'].includes(feature?.geometry?.type));
    if(features.length<10)throw new Error(`Local Taipei MRT geometry unexpectedly small: ${features.length}`);
    const lineCodes=new Set();
    for(const feature of features){
      const code=String(feature?.properties?.line_code||'');
      const color=String(feature?.properties?.line_color||'').toLowerCase();
      if(!MRT_COLORS[code])throw new Error(`Unexpected Taipei MRT line code: ${code||'(missing)'}`);
      if(!EXPECTED_MRT_COLORS.has(color))throw new Error(`Unexpected Taipei MRT line color: ${color||'(missing)'}`);
      lineCodes.add(code);
    }
    for(const code of Object.keys(MRT_COLORS))if(!lineCodes.has(code))throw new Error(`Local Taipei MRT dataset missing line group ${code}`);
    return {type:'FeatureCollection',features};
  }

  class TransitToggleControl{
    constructor(layer){this.layer=layer;this.container=null;this.button=null;}
    onAdd(){
      const container=document.createElement('div');
      container.className='maplibregl-ctrl maplibregl-ctrl-group';
      const button=document.createElement('button');
      button.type='button';
      button.setAttribute('aria-label','切換捷運與鐵路路線');
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
      this.button.style.opacity='1';
      this.button.style.background=this.layer.enabled?'#e8f1f8':'';
      this.button.title=this.layer.enabled
        ?(inTaiwan?'軌道 ON · 捷運 / 台鐵 / 高鐵':'軌道 ON · 全球捷運 / 鐵路')
        :'軌道 OFF · 捷運 / 鐵路';
      this.button.setAttribute('aria-pressed',this.layer.enabled?'true':'false');
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

    applyRegionalAppearance(inTaiwan){
      const officialDominates=inTaiwan&&this.officialMrtReady;
      if(this.map.getLayer(LAYERS.mrtCasing))this.map.setPaintProperty(LAYERS.mrtCasing,'line-opacity',officialDominates?.18:.88);
      if(this.map.getLayer(LAYERS.mrt)){
        this.map.setPaintProperty(LAYERS.mrt,'line-color',GLOBAL_METRO_COLOR);
        this.map.setPaintProperty(LAYERS.mrt,'line-opacity',officialDominates?.22:.96);
      }
      if(this.map.getLayer(LAYERS.tra))this.map.setPaintProperty(LAYERS.tra,'line-color',inTaiwan?TAIWAN_TRA_COLOR:GLOBAL_RAIL_COLOR);
      if(this.map.getLayer(LAYERS.thsr))this.map.setPaintProperty(LAYERS.thsr,'line-color',inTaiwan?TAIWAN_THSR_COLOR:GLOBAL_RAIL_COLOR);
    }

    async loadOfficialTaipeiMrt(beforeId){
      const response=await fetch(TAIPEI_MRT_GEOJSON_URL,{cache:'no-store'});
      if(!response.ok)throw new Error(`Local Taipei MRT GIS HTTP ${response.status}; run start-transit-overlay-smoke.bat to build it`);
      const data=validateOfficialMrt(await response.json());
      if(!this.map.getSource(TAIPEI_MRT_SOURCE_ID)){
        this.map.addSource(TAIPEI_MRT_SOURCE_ID,{type:'geojson',data,attribution:'© 臺北市政府捷運工程局'});
      }
      for(const layer of [officialMrtLayer(LAYERS.mrtOfficialCasing,true),officialMrtLayer(LAYERS.mrtOfficial,false)]){
        if(!this.map.getLayer(layer.id))this.map.addLayer(layer,beforeId);
      }
      this.officialMrtReady=true;
      this.applyRegionalAppearance(centerInsideTaiwan(this.map));
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
          // Overture metro remains a blue global base. In Taipei it fades back
          // when the authoritative local MRT geometry is available.
          lineLayer(LAYERS.mrtCasing,mrtFilter,'rgba(255,255,255,.96)',true,.88),
          lineLayer(LAYERS.mrt,mrtFilter,GLOBAL_METRO_COLOR,false,.96),
          // Outside Taiwan these rail classes are deliberately neutral: their
          // provider class must not be presented as TRA/THSR semantics abroad.
          lineLayer(LAYERS.traCasing,traFilter,'rgba(255,255,255,.96)',true),
          lineLayer(LAYERS.tra,traFilter,GLOBAL_RAIL_COLOR),
          lineLayer(LAYERS.thsrCasing,thsrFilter,'rgba(255,255,255,.96)',true),
          lineLayer(LAYERS.thsr,thsrFilter,GLOBAL_RAIL_COLOR)
        ];
        const beforeId=this.map.getLayer('building')?'building':undefined;
        for(const layer of layers)if(!this.map.getLayer(layer.id))this.map.addLayer(layer,beforeId);

        try{
          const count=await this.loadOfficialTaipeiMrt(beforeId);
          console.info(`Taipei official MRT local geometry ready: ${count} feature(s)`);
        }catch(error){
          this.officialMrtReady=false;
          this.applyRegionalAppearance(centerInsideTaiwan(this.map));
          console.warn('Local official Taipei MRT geometry unavailable; keeping blue Overture metro fallback',error);
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
      this.applyRegionalAppearance(inTaiwan);
      for(const id of GLOBAL_LAYER_IDS){
        if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility',this.enabled?'visible':'none');
      }
      const localVisible=this.enabled&&inTaiwan&&this.officialMrtReady;
      for(const id of TAIWAN_ONLY_LAYER_IDS){
        if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility',localVisible?'visible':'none');
      }
      this.control?.update({inTaiwan});
      if(!this.enabled)this.emit('off','軌道 OFF',{inTaiwan,officialMrt:this.officialMrtReady,scope:'global'});
      else if(inTaiwan)this.emit('ready',`軌道 ON · 捷運${this.officialMrtReady?'官方線色':'藍色 fallback'} / 台鐵 / 高鐵`,{inTaiwan,officialMrt:this.officialMrtReady,scope:'taiwan'});
      else this.emit('ready','軌道 ON · 全球捷運 / 鐵路 · Overture',{inTaiwan,officialMrt:this.officialMrtReady,scope:'global'});
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

  window.TaipeiMapsTransitLayer={TransitLayer,TAIWAN_BOUNDS,SOURCE_ID,SOURCE_LAYER,TAIPEI_MRT_SOURCE_ID,TAIPEI_MRT_GEOJSON_URL,MRT_COLORS,GLOBAL_METRO_COLOR,GLOBAL_RAIL_COLOR,TAIWAN_TRA_COLOR,TAIWAN_THSR_COLOR,LAYERS,GLOBAL_LAYER_IDS,TAIWAN_ONLY_LAYER_IDS,validateOfficialMrt};
})();
