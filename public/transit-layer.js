(()=>{
  const TAIWAN_BOUNDS={west:118.0,south:21.5,east:123.8,north:26.7};
  const NORTH_TAIWAN_BOUNDS={west:121.10,south:24.78,east:121.90,north:25.36};
  const SOURCE_ID='overture-transportation';
  const SOURCE_LAYER='segment';

  const TAIPEI_MRT_SOURCE_ID='taipei-mrt-official';
  const TAIPEI_MRT_GEOJSON_URL='/generated/taipei_mrt_lines_official.geojson';
  const TAIPEI_MRT_STATION_SOURCE_ID='taipei-mrt-stations-official';
  const TAIPEI_MRT_STATION_GEOJSON_URL='/generated/taipei_mrt_stations_official.geojson';

  const NORTH_URBAN_RAIL_SOURCE_ID='north-taiwan-urban-rail';
  const NORTH_URBAN_RAIL_GEOJSON_URL='/generated/north_taiwan_urban_rail_lines.geojson';
  const NORTH_URBAN_RAIL_STATION_SOURCE_ID='north-taiwan-urban-rail-stations';
  const NORTH_URBAN_RAIL_STATION_GEOJSON_URL='/generated/north_taiwan_urban_rail_stations.geojson';

  const INTERCITY_THSR_SOURCE_ID='taiwan-intercity-thsr';
  const INTERCITY_THSR_GEOJSON_URL='/generated/taiwan_intercity_thsr_lines.geojson';
  const INTERCITY_STATION_SOURCE_ID='taiwan-intercity-stations';
  const INTERCITY_STATION_GEOJSON_URL='/generated/taiwan_intercity_stations.geojson';

  const MRT_COLORS={BR:'#c48c31',R:'#e3002c',G:'#008659',O:'#f8b61c',BL:'#0070bd',Y:'#ffdb00'};
  const NORTH_URBAN_CODES=new Set(['V','K','LB','A']);
  const EXPECTED_MRT_COLORS=new Set(Object.values(MRT_COLORS));
  const GLOBAL_METRO_COLOR='#1976d2';
  const GLOBAL_RAIL_COLOR='#5f6b76';
  const TAIWAN_TRA_COLOR='#005ca8';
  const TAIWAN_THSR_COLOR='#f57c00';
  const TRA_DASH=[2.2,1.8];
  const THSR_DASH=[4.2,2.0];

  const LAYERS={
    mrtCasing:'transit-mrt-casing',mrt:'transit-mrt',
    traCasing:'transit-tra-casing',tra:'transit-tra',
    mrtOfficialCasing:'transit-mrt-official-casing',mrtOfficial:'transit-mrt-official',
    mrtStation:'transit-mrt-station',mrtStationLabel:'transit-mrt-station-label',
    northUrbanCasing:'transit-north-urban-casing',northUrban:'transit-north-urban',
    northUrbanStation:'transit-north-urban-station',northUrbanStationLabel:'transit-north-urban-station-label',
    thsrOfficialCasing:'transit-thsr-official-casing',thsrOfficial:'transit-thsr-official',
    traStation:'transit-tra-station',traStationLabel:'transit-tra-station-label',
    thsrStation:'transit-thsr-station',thsrStationLabel:'transit-thsr-station-label'
  };
  const GLOBAL_LAYER_IDS=[LAYERS.mrtCasing,LAYERS.mrt,LAYERS.traCasing,LAYERS.tra];
  const TAIPEI_LINE_LAYER_IDS=[LAYERS.mrtOfficialCasing,LAYERS.mrtOfficial];
  const TAIPEI_STATION_LAYER_IDS=[LAYERS.mrtStation,LAYERS.mrtStationLabel];
  const NORTH_URBAN_LINE_LAYER_IDS=[LAYERS.northUrbanCasing,LAYERS.northUrban];
  const NORTH_URBAN_STATION_LAYER_IDS=[LAYERS.northUrbanStation,LAYERS.northUrbanStationLabel];
  const INTERCITY_LINE_LAYER_IDS=[LAYERS.thsrOfficialCasing,LAYERS.thsrOfficial];
  const INTERCITY_STATION_LAYER_IDS=[LAYERS.traStation,LAYERS.traStationLabel,LAYERS.thsrStation,LAYERS.thsrStationLabel];
  const TAIWAN_ONLY_LAYER_IDS=[...TAIPEI_LINE_LAYER_IDS,...TAIPEI_STATION_LAYER_IDS,...NORTH_URBAN_LINE_LAYER_IDS,...NORTH_URBAN_STATION_LAYER_IDS,...INTERCITY_LINE_LAYER_IDS,...INTERCITY_STATION_LAYER_IDS];
  const ALL_LAYER_IDS=[...GLOBAL_LAYER_IDS,...TAIWAN_ONLY_LAYER_IDS];

  function transportationUrl(buildingUrl,release){
    if(buildingUrl&&/\/buildings\.pmtiles(?:\?.*)?$/.test(buildingUrl))return buildingUrl.replace(/\/buildings\.pmtiles(?:\?.*)?$/, '/transportation.pmtiles');
    if(release)return `https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/${release}/transportation.pmtiles`;
    throw new Error('Overture building URL or release is required for transit overlay');
  }
  function centerInsideBounds(map,bounds){const c=map.getCenter();return c.lng>=bounds.west&&c.lng<=bounds.east&&c.lat>=bounds.south&&c.lat<=bounds.north;}
  const centerInsideTaiwan=map=>centerInsideBounds(map,TAIWAN_BOUNDS);
  const centerInsideNorthTaiwan=map=>centerInsideBounds(map,NORTH_TAIWAN_BOUNDS);

  const width=['interpolate',['linear'],['zoom'],8,1.35,11,2.0,14,3.0,17,4.8];
  const casingWidth=['interpolate',['linear'],['zoom'],8,2.8,11,3.7,14,5.2,17,7.2];
  const localWidth=['interpolate',['linear'],['zoom'],9,1.7,11,2.4,14,3.5,17,5.1];
  const localCasingWidth=['interpolate',['linear'],['zoom'],9,3.2,11,4.1,14,5.7,17,7.7];

  function railFilter(classes){return ['all',['==',['get','subtype'],'rail'],['in',['get','class'],['literal',classes]]];}
  function lineLayer(id,filter,color,isCasing=false,opacity=null,dash=null){const paint={'line-color':color,'line-width':isCasing?casingWidth:width,'line-opacity':opacity??(isCasing?.88:.96)};if(dash&&!isCasing)paint['line-dasharray']=dash;return {id,type:'line',source:SOURCE_ID,'source-layer':SOURCE_LAYER,minzoom:8,filter,layout:{visibility:'none','line-cap':'round','line-join':'round'},paint};}
  function localRailLineLayer(id,source,isCasing=false,minzoom=9,dash=null){const paint={'line-color':isCasing?'rgba(255,255,255,.97)':['get','line_color'],'line-width':isCasing?localCasingWidth:localWidth,'line-opacity':isCasing?.94:.99};if(dash&&!isCasing)paint['line-dasharray']=dash;return {id,type:'line',source,minzoom,layout:{visibility:'none','line-cap':'round','line-join':'round'},paint};}
  function stationPointLayer(id,source,{filter=null,minzoom=10.5,stroke='#263238'}={}){const layer={id,type:'circle',source,minzoom,layout:{visibility:'none'},paint:{'circle-radius':['interpolate',['linear'],['zoom'],minzoom,2.5,13,3.4,16,4.6],'circle-color':'rgba(255,255,255,.99)','circle-opacity':.99,'circle-stroke-color':stroke,'circle-stroke-width':['interpolate',['linear'],['zoom'],minzoom,1.0,14,1.35,17,1.7],'circle-stroke-opacity':.96}};if(filter)layer.filter=filter;return layer;}
  function stationLabelLayer(id,source,{filter=null,minzoom=11.6}={}){const layer={id,type:'symbol',source,minzoom,layout:{visibility:'none','text-field':['get','station_name'],'text-size':['interpolate',['linear'],['zoom'],minzoom,10.5,14,11.5,17,13],'text-offset':[0,1.0],'text-anchor':'top','text-max-width':8,'text-allow-overlap':false,'text-ignore-placement':false},paint:{'text-color':'#263238','text-halo-color':'rgba(255,255,255,.97)','text-halo-width':1.35,'text-halo-blur':.25}};if(filter)layer.filter=filter;return layer;}

  function validateOfficialMrt(data){
    if(data?.type!=='FeatureCollection')throw new Error(`Local Taipei MRT dataset has unexpected type: ${data?.type}`);
    const features=(data.features||[]).filter(feature=>['LineString','MultiLineString'].includes(feature?.geometry?.type));
    if(features.length<10)throw new Error(`Local Taipei MRT geometry unexpectedly small: ${features.length}`);
    const lineCodes=new Set();
    for(const feature of features){const code=String(feature?.properties?.line_code||'');const color=String(feature?.properties?.line_color||'').toLowerCase();if(!MRT_COLORS[code])throw new Error(`Unexpected Taipei MRT line code: ${code||'(missing)'}`);if(!EXPECTED_MRT_COLORS.has(color))throw new Error(`Unexpected Taipei MRT line color: ${color||'(missing)'}`);lineCodes.add(code);}
    for(const code of Object.keys(MRT_COLORS))if(!lineCodes.has(code))throw new Error(`Local Taipei MRT dataset missing line group ${code}`);
    return {type:'FeatureCollection',features};
  }
  function validateStations(data,{context,minCount,expectedCodes=null,requiredNames=[]}){
    if(data?.type!=='FeatureCollection')throw new Error(`${context} station dataset has unexpected type: ${data?.type}`);
    const features=(data.features||[]).filter(feature=>feature?.geometry?.type==='Point');
    if(features.length<minCount)throw new Error(`${context} station geometry unexpectedly small: ${features.length}`);
    const names=new Set(),codes=new Set();
    for(const feature of features){const [lng,lat]=feature?.geometry?.coordinates||[];const name=String(feature?.properties?.station_name||'').trim();if(!name)throw new Error(`${context} station has a missing name`);if(!Number.isFinite(Number(lng))||!Number.isFinite(Number(lat)))throw new Error(`${context} station has invalid coordinates: ${name}`);const code=String(feature?.properties?.line_code||'').trim();if(code)codes.add(code);names.add(name);}
    if(expectedCodes)for(const code of expectedCodes)if(!codes.has(code))throw new Error(`${context} station dataset missing line group ${code}`);
    for(const name of requiredNames)if(!names.has(name))throw new Error(`${context} station dataset missing expected station: ${name}`);
    return {type:'FeatureCollection',features};
  }
  function validateOfficialMrtStations(data){return validateStations(data,{context:'Local Taipei MRT',minCount:90,requiredNames:['台北車站','市政府站','大安站','板橋站','景平站','十四張站']});}
  function validateNorthUrbanRail(data){
    if(data?.type!=='FeatureCollection')throw new Error(`North Taiwan urban rail dataset has unexpected type: ${data?.type}`);
    const features=(data.features||[]).filter(feature=>feature?.geometry?.type==='LineString');
    if(features.length<20)throw new Error(`North Taiwan urban rail geometry unexpectedly small: ${features.length}`);
    const codes=new Set();
    for(const feature of features){const code=String(feature?.properties?.line_code||'').trim();const color=String(feature?.properties?.line_color||'').trim();if(!NORTH_URBAN_CODES.has(code))throw new Error(`Unexpected North Taiwan urban rail code: ${code||'(missing)'}`);if(!/^#[0-9a-f]{6}$/i.test(color))throw new Error(`Unexpected North Taiwan urban rail color: ${color||'(missing)'}`);codes.add(code);}
    for(const code of NORTH_URBAN_CODES)if(!codes.has(code))throw new Error(`North Taiwan urban rail dataset missing line group ${code}`);
    return {type:'FeatureCollection',features};
  }
  function validateNorthUrbanStations(data){return validateStations(data,{context:'North Taiwan urban rail',minCount:45,expectedCodes:NORTH_URBAN_CODES});}
  function validateIntercityThsr(data){
    if(data?.type!=='FeatureCollection')throw new Error(`Taiwan THSR dataset has unexpected type: ${data?.type}`);
    const features=(data.features||[]).filter(feature=>feature?.geometry?.type==='LineString');
    if(features.length<10)throw new Error(`Taiwan THSR geometry unexpectedly small: ${features.length}`);
    for(const feature of features){if(String(feature?.properties?.line_code)!=='THSR')throw new Error('Taiwan THSR geometry contains a non-THSR feature');if(String(feature?.properties?.line_color||'').toLowerCase()!==TAIWAN_THSR_COLOR)throw new Error(`Unexpected THSR line color: ${feature?.properties?.line_color}`);}
    return {type:'FeatureCollection',features};
  }
  function validateIntercityStations(data){
    const normalized=validateStations(data,{context:'Taiwan intercity',minCount:190,expectedCodes:new Set(['TRA','THSR']),requiredNames:['高鐵南港站','高鐵台北站','高鐵板橋站','高鐵桃園站','高鐵左營站']});
    const traCount=normalized.features.filter(f=>f.properties?.line_code==='TRA').length;const thsrCount=normalized.features.filter(f=>f.properties?.line_code==='THSR').length;
    if(traCount<180)throw new Error(`Taiwan intercity TRA station set unexpectedly small: ${traCount}`);if(thsrCount<10)throw new Error(`Taiwan intercity THSR station set unexpectedly small: ${thsrCount}`);return normalized;
  }

  class TransitToggleControl{
    constructor(layer){this.layer=layer;this.container=null;this.button=null;}
    onAdd(){const container=document.createElement('div');container.className='maplibregl-ctrl maplibregl-ctrl-group';const button=document.createElement('button');button.type='button';button.setAttribute('aria-label','切換捷運與鐵路路線');button.textContent='🚇';button.style.fontSize='16px';button.style.lineHeight='1';button.onclick=()=>this.layer.setEnabled(!this.layer.enabled);container.appendChild(button);this.container=container;this.button=button;this.update();return container;}
    onRemove(){this.container?.remove();this.container=null;this.button=null;}
    update({inTaiwan=centerInsideTaiwan(this.layer.map),inNorth=centerInsideNorthTaiwan(this.layer.map)}={}){if(!this.button)return;this.button.style.opacity='1';this.button.style.background=this.layer.enabled?'#e8f1f8':'';this.button.title=this.layer.enabled?(inNorth?'軌道 ON · 北台灣捷運 / 輕軌 / 台鐵 / 高鐵站名':inTaiwan?'軌道 ON · 台鐵 / 高鐵站名 / 捷運':'軌道 ON · 全球捷運 / 鐵路'):'軌道 OFF · 捷運 / 鐵路';this.button.setAttribute('aria-pressed',this.layer.enabled?'true':'false');}
  }

  class TransitLayer{
    constructor(map,{overtureBuildingUrl=null,release=null,enabled=true,onState=null}={}){this.map=map;this.enabled=Boolean(enabled);this.onState=typeof onState==='function'?onState:()=>{};this.url=transportationUrl(overtureBuildingUrl,release);this.initialized=false;this.officialMrtReady=false;this.officialMrtStationsReady=false;this.northUrbanRailReady=false;this.northUrbanStationsReady=false;this.intercityThsrReady=false;this.intercityStationsReady=false;this.control=null;this._moveHandler=()=>this.sync();}
    emit(state,message,extra={}){this.onState({state,message,...extra});this.map.fire('taipei-maps-transitchange',{state,message,enabled:this.enabled,...extra});}
    applyRegionalAppearance(inTaiwan,inNorth=centerInsideNorthTaiwan(this.map)){
      const localReadyCount=(this.officialMrtReady?1:0)+(this.northUrbanRailReady?1:0);const completeCoverage=inNorth&&localReadyCount===2;const partialCoverage=inNorth&&localReadyCount===1;const casingOpacity=completeCoverage?.16:partialCoverage?.40:.88;const metroOpacity=completeCoverage?.18:partialCoverage?.44:.96;
      if(this.map.getLayer(LAYERS.mrtCasing))this.map.setPaintProperty(LAYERS.mrtCasing,'line-opacity',casingOpacity);
      if(this.map.getLayer(LAYERS.mrt)){this.map.setPaintProperty(LAYERS.mrt,'line-color',GLOBAL_METRO_COLOR);this.map.setPaintProperty(LAYERS.mrt,'line-opacity',metroOpacity);}
      if(this.map.getLayer(LAYERS.tra))this.map.setPaintProperty(LAYERS.tra,'line-color',inTaiwan?TAIWAN_TRA_COLOR:GLOBAL_RAIL_COLOR);
    }
    async loadOfficialTaipeiMrt(beforeId){const response=await fetch(TAIPEI_MRT_GEOJSON_URL,{cache:'no-store'});if(!response.ok)throw new Error(`Local Taipei MRT GIS HTTP ${response.status}; run start-transit-overlay-smoke.bat to build it`);const data=validateOfficialMrt(await response.json());if(!this.map.getSource(TAIPEI_MRT_SOURCE_ID))this.map.addSource(TAIPEI_MRT_SOURCE_ID,{type:'geojson',data,attribution:'© 臺北市政府捷運工程局'});for(const layer of [localRailLineLayer(LAYERS.mrtOfficialCasing,TAIPEI_MRT_SOURCE_ID,true),localRailLineLayer(LAYERS.mrtOfficial,TAIPEI_MRT_SOURCE_ID,false)])if(!this.map.getLayer(layer.id))this.map.addLayer(layer,beforeId);this.officialMrtReady=true;this.applyRegionalAppearance(centerInsideTaiwan(this.map));return data.features.length;}
    async loadOfficialTaipeiMrtStations(beforeId){const response=await fetch(TAIPEI_MRT_STATION_GEOJSON_URL,{cache:'no-store'});if(!response.ok)throw new Error(`Local Taipei MRT station GIS HTTP ${response.status}; run start-transit-overlay-smoke.bat to build it`);const data=validateOfficialMrtStations(await response.json());if(!this.map.getSource(TAIPEI_MRT_STATION_SOURCE_ID))this.map.addSource(TAIPEI_MRT_STATION_SOURCE_ID,{type:'geojson',data,attribution:'© 臺北市政府捷運工程局'});for(const layer of [stationPointLayer(LAYERS.mrtStation,TAIPEI_MRT_STATION_SOURCE_ID),stationLabelLayer(LAYERS.mrtStationLabel,TAIPEI_MRT_STATION_SOURCE_ID)])if(!this.map.getLayer(layer.id))this.map.addLayer(layer,beforeId);this.officialMrtStationsReady=true;return data.features.length;}
    async loadNorthUrbanRail(beforeId){const response=await fetch(NORTH_URBAN_RAIL_GEOJSON_URL,{cache:'no-store'});if(!response.ok)throw new Error(`Local North Taiwan urban rail HTTP ${response.status}; run start-transit-overlay-smoke.bat to build it`);const data=validateNorthUrbanRail(await response.json());if(!this.map.getSource(NORTH_URBAN_RAIL_SOURCE_ID))this.map.addSource(NORTH_URBAN_RAIL_SOURCE_ID,{type:'geojson',data,attribution:'© OpenStreetMap contributors · route relations'});for(const layer of [localRailLineLayer(LAYERS.northUrbanCasing,NORTH_URBAN_RAIL_SOURCE_ID,true),localRailLineLayer(LAYERS.northUrban,NORTH_URBAN_RAIL_SOURCE_ID,false)])if(!this.map.getLayer(layer.id))this.map.addLayer(layer,beforeId);this.northUrbanRailReady=true;this.applyRegionalAppearance(centerInsideTaiwan(this.map));return data.features.length;}
    async loadNorthUrbanStations(beforeId){const response=await fetch(NORTH_URBAN_RAIL_STATION_GEOJSON_URL,{cache:'no-store'});if(!response.ok)throw new Error(`Local North Taiwan urban rail station HTTP ${response.status}; run start-transit-overlay-smoke.bat to build it`);const data=validateNorthUrbanStations(await response.json());if(!this.map.getSource(NORTH_URBAN_RAIL_STATION_SOURCE_ID))this.map.addSource(NORTH_URBAN_RAIL_STATION_SOURCE_ID,{type:'geojson',data,attribution:'© OpenStreetMap contributors · route relations'});for(const layer of [stationPointLayer(LAYERS.northUrbanStation,NORTH_URBAN_RAIL_STATION_SOURCE_ID),stationLabelLayer(LAYERS.northUrbanStationLabel,NORTH_URBAN_RAIL_STATION_SOURCE_ID)])if(!this.map.getLayer(layer.id))this.map.addLayer(layer,beforeId);this.northUrbanStationsReady=true;return data.features.length;}
    async loadIntercityThsr(beforeId){const response=await fetch(INTERCITY_THSR_GEOJSON_URL,{cache:'no-store'});if(!response.ok)throw new Error(`Local THSR geometry HTTP ${response.status}; run start-transit-overlay-smoke.bat to build it`);const data=validateIntercityThsr(await response.json());if(!this.map.getSource(INTERCITY_THSR_SOURCE_ID))this.map.addSource(INTERCITY_THSR_SOURCE_ID,{type:'geojson',data,attribution:'© OpenStreetMap contributors · THSR route relations'});for(const layer of [localRailLineLayer(LAYERS.thsrOfficialCasing,INTERCITY_THSR_SOURCE_ID,true,7.5),localRailLineLayer(LAYERS.thsrOfficial,INTERCITY_THSR_SOURCE_ID,false,7.5,THSR_DASH)])if(!this.map.getLayer(layer.id))this.map.addLayer(layer,beforeId);this.intercityThsrReady=true;return data.features.length;}
    async loadIntercityStations(beforeId){const response=await fetch(INTERCITY_STATION_GEOJSON_URL,{cache:'no-store'});if(!response.ok)throw new Error(`Local TRA/THSR station HTTP ${response.status}; run start-transit-overlay-smoke.bat to build it`);const data=validateIntercityStations(await response.json());if(!this.map.getSource(INTERCITY_STATION_SOURCE_ID))this.map.addSource(INTERCITY_STATION_SOURCE_ID,{type:'geojson',data,attribution:'© 國營臺灣鐵路股份有限公司 / © OpenStreetMap contributors'});const traFilter=['==',['get','line_code'],'TRA'],thsrFilter=['==',['get','line_code'],'THSR'];const layers=[stationPointLayer(LAYERS.traStation,INTERCITY_STATION_SOURCE_ID,{filter:traFilter,minzoom:10.2,stroke:TAIWAN_TRA_COLOR}),stationLabelLayer(LAYERS.traStationLabel,INTERCITY_STATION_SOURCE_ID,{filter:traFilter,minzoom:11.2}),stationPointLayer(LAYERS.thsrStation,INTERCITY_STATION_SOURCE_ID,{filter:thsrFilter,minzoom:8.8,stroke:TAIWAN_THSR_COLOR}),stationLabelLayer(LAYERS.thsrStationLabel,INTERCITY_STATION_SOURCE_ID,{filter:thsrFilter,minzoom:9.7})];for(const layer of layers)if(!this.map.getLayer(layer.id))this.map.addLayer(layer,beforeId);this.intercityStationsReady=true;return data.features.length;}
    async init(){
      if(this.initialized)return true;if(!window.pmtiles)throw new Error('PMTiles runtime is unavailable');
      try{
        this.emit('loading','軌道交通資料載入中…');const archive=new pmtiles.PMTiles(this.url);const [,metadata]=await Promise.all([archive.getHeader(),archive.getMetadata()]);const sourceLayers=(metadata?.vector_layers||[]).map(row=>row?.id).filter(Boolean);if(!sourceLayers.includes(SOURCE_LAYER))throw new Error(`Overture transportation PMTiles missing ${SOURCE_LAYER} source-layer`);if(!this.map.getSource(SOURCE_ID))this.map.addSource(SOURCE_ID,{type:'vector',url:`pmtiles://${this.url}`,attribution:'© Overture Maps Foundation / source contributors'});
        const mrtFilter=railFilter(['subway','monorail','light_rail']),railBaseFilter=railFilter(['narrow_gauge','standard_gauge']);const layers=[lineLayer(LAYERS.mrtCasing,mrtFilter,'rgba(255,255,255,.96)',true,.88),lineLayer(LAYERS.mrt,mrtFilter,GLOBAL_METRO_COLOR,false,.96),lineLayer(LAYERS.traCasing,railBaseFilter,'rgba(255,255,255,.96)',true),lineLayer(LAYERS.tra,railBaseFilter,GLOBAL_RAIL_COLOR,false,null,TRA_DASH)];const beforeId=this.map.getLayer('building')?'building':undefined;for(const layer of layers)if(!this.map.getLayer(layer.id))this.map.addLayer(layer,beforeId);
        try{const count=await this.loadOfficialTaipeiMrt(beforeId);console.info(`Taipei official MRT local geometry ready: ${count} feature(s)`);}catch(error){this.officialMrtReady=false;console.warn('Local official Taipei MRT geometry unavailable; keeping blue Overture metro fallback',error);}
        try{const count=await this.loadOfficialTaipeiMrtStations(beforeId);console.info(`Taipei official MRT stations ready: ${count} station(s)`);}catch(error){this.officialMrtStationsReady=false;console.warn('Local official Taipei MRT stations unavailable; keeping rail lines without Taipei station labels',error);}
        try{const count=await this.loadNorthUrbanRail(beforeId);console.info(`North Taiwan urban rail local geometry ready: ${count} feature(s)`);}catch(error){this.northUrbanRailReady=false;console.warn('North Taiwan route-specific rail unavailable; keeping Overture metro fallback',error);}
        try{const count=await this.loadNorthUrbanStations(beforeId);console.info(`North Taiwan urban rail stations ready: ${count} station(s)`);}catch(error){this.northUrbanStationsReady=false;console.warn('North Taiwan urban rail stations unavailable; keeping rail lines without those station labels',error);}
        try{const count=await this.loadIntercityThsr(beforeId);console.info(`Taiwan THSR local geometry ready: ${count} feature(s)`);}catch(error){this.intercityThsrReady=false;console.warn('Local THSR geometry unavailable; keeping generic blue rail base',error);}
        try{const count=await this.loadIntercityStations(beforeId);console.info(`Taiwan TRA/THSR stations ready: ${count} station(s)`);}catch(error){this.intercityStationsReady=false;console.warn('Local TRA/THSR stations unavailable; keeping rail lines without intercity station labels',error);}
        this.applyRegionalAppearance(centerInsideTaiwan(this.map));this.initialized=true;this.map.on('moveend',this._moveHandler);this.control=new TransitToggleControl(this);this.map.addControl(this.control,'top-right');this.sync();return true;
      }catch(error){console.warn('Transit overlay unavailable',error);this.emit('error',`軌道交通暫時無法載入 · ${error?.message||error}`);return false;}
    }
    sync(){
      if(!this.initialized||!this.map.isStyleLoaded())return;const inTaiwan=centerInsideTaiwan(this.map),inNorth=centerInsideNorthTaiwan(this.map);this.applyRegionalAppearance(inTaiwan,inNorth);for(const id of GLOBAL_LAYER_IDS)if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility',this.enabled?'visible':'none');const setGroup=(ids,on)=>{for(const id of ids)if(this.map.getLayer(id))this.map.setLayoutProperty(id,'visibility',on?'visible':'none');};setGroup(TAIPEI_LINE_LAYER_IDS,this.enabled&&inNorth&&this.officialMrtReady);setGroup(TAIPEI_STATION_LAYER_IDS,this.enabled&&inNorth&&this.officialMrtStationsReady);setGroup(NORTH_URBAN_LINE_LAYER_IDS,this.enabled&&inNorth&&this.northUrbanRailReady);setGroup(NORTH_URBAN_STATION_LAYER_IDS,this.enabled&&inNorth&&this.northUrbanStationsReady);setGroup(INTERCITY_LINE_LAYER_IDS,this.enabled&&inTaiwan&&this.intercityThsrReady);setGroup(INTERCITY_STATION_LAYER_IDS,this.enabled&&inTaiwan&&this.intercityStationsReady);this.control?.update({inTaiwan,inNorth});const readiness={inTaiwan,inNorth,officialMrt:this.officialMrtReady,stations:this.officialMrtStationsReady,northUrbanRail:this.northUrbanRailReady,northUrbanStations:this.northUrbanStationsReady,intercityThsr:this.intercityThsrReady,intercityStations:this.intercityStationsReady};if(!this.enabled)this.emit('off','軌道 OFF',{...readiness,scope:'global'});else if(inNorth)this.emit('ready',`軌道 ON · 北台灣捷運 / 輕軌${this.officialMrtReady&&this.northUrbanRailReady?'路線色':''}${this.officialMrtStationsReady&&this.northUrbanStationsReady?' + 站名':''} / 台鐵 / 高鐵${this.intercityStationsReady?' + 車站':''}`,{...readiness,scope:'north-taiwan'});else if(inTaiwan)this.emit('ready',`軌道 ON · 台鐵 / 高鐵${this.intercityStationsReady?' + 車站':''} / 捷運`,{...readiness,scope:'taiwan'});else this.emit('ready','軌道 ON · 全球捷運 / 鐵路 · Overture',{...readiness,scope:'global'});
    }
    setEnabled(enabled){this.enabled=Boolean(enabled);this.sync();}
    destroy(){this.map.off('moveend',this._moveHandler);if(this.control){try{this.map.removeControl(this.control);}catch{}this.control=null;}for(const id of [...ALL_LAYER_IDS].reverse())if(this.map.getLayer(id))this.map.removeLayer(id);for(const id of [INTERCITY_STATION_SOURCE_ID,INTERCITY_THSR_SOURCE_ID,NORTH_URBAN_RAIL_STATION_SOURCE_ID,NORTH_URBAN_RAIL_SOURCE_ID,TAIPEI_MRT_STATION_SOURCE_ID,TAIPEI_MRT_SOURCE_ID,SOURCE_ID])if(this.map.getSource(id))this.map.removeSource(id);this.initialized=false;this.officialMrtReady=false;this.officialMrtStationsReady=false;this.northUrbanRailReady=false;this.northUrbanStationsReady=false;this.intercityThsrReady=false;this.intercityStationsReady=false;}
  }

  window.TaipeiMapsTransitLayer={TransitLayer,TAIWAN_BOUNDS,NORTH_TAIWAN_BOUNDS,SOURCE_ID,SOURCE_LAYER,TAIPEI_MRT_SOURCE_ID,TAIPEI_MRT_GEOJSON_URL,TAIPEI_MRT_STATION_SOURCE_ID,TAIPEI_MRT_STATION_GEOJSON_URL,NORTH_URBAN_RAIL_SOURCE_ID,NORTH_URBAN_RAIL_GEOJSON_URL,NORTH_URBAN_RAIL_STATION_SOURCE_ID,NORTH_URBAN_RAIL_STATION_GEOJSON_URL,INTERCITY_THSR_SOURCE_ID,INTERCITY_THSR_GEOJSON_URL,INTERCITY_STATION_SOURCE_ID,INTERCITY_STATION_GEOJSON_URL,MRT_COLORS,NORTH_URBAN_CODES,GLOBAL_METRO_COLOR,GLOBAL_RAIL_COLOR,TAIWAN_TRA_COLOR,TAIWAN_THSR_COLOR,TRA_DASH,THSR_DASH,LAYERS,GLOBAL_LAYER_IDS,TAIPEI_LINE_LAYER_IDS,TAIPEI_STATION_LAYER_IDS,NORTH_URBAN_LINE_LAYER_IDS,NORTH_URBAN_STATION_LAYER_IDS,INTERCITY_LINE_LAYER_IDS,INTERCITY_STATION_LAYER_IDS,TAIWAN_ONLY_LAYER_IDS,validateOfficialMrt,validateOfficialMrtStations,validateNorthUrbanRail,validateNorthUrbanStations,validateIntercityThsr,validateIntercityStations};
})();
