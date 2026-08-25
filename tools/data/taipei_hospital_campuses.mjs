// Physical-campus reconciliation registry for hospital entities whose licensing record
// does not map 1:1 to real-world hospital sites.
//
// Taipei City Hospital campus authority:
// https://tpech.gov.taipei/News_Content.aspx?n=D1EF97D8120E41D7&s=FB0F86FF28525604&sms=87415A8B9CE81B16
//
// Tri-Service General Hospital multi-campus authority (MOHW 108-114 accreditation list):
// https://www.mohw.gov.tw/dl-99552-9299c250-c16f-4227-b655-506ad172b598.html
// The current MOHW row for facility code 0501110514 explicitly lists both Neihu
// (成功路二段325號) and Tingzhou (汀州路三段40號).
//
// Coordinates are curated WGS84 point locations cross-checked against public-sector
// address/POI records. The authoritative semantic fact is the official campus address;
// these coordinates exist only to place that address on the buyer-research map.

export const HOSPITAL_CAMPUS_REGISTRY=[
  {
    group_id:'taipei-city-hospital',
    parent_name:'臺北市立聯合醫院',
    parent_facility_code:'0101090517',
    official_campus_source:'https://tpech.gov.taipei/News_Content.aspx?n=D1EF97D8120E41D7&s=FB0F86FF28525604&sms=87415A8B9CE81B16',
    match_name_contains:['臺北市立聯合醫院'],
    campuses:[
      {campus_id:'zhongxing',facility_name:'臺北市立聯合醫院中興院區',map_label:'聯醫中興院區',district:'大同區',address:'臺北市大同區鄭州路145號',coordinates:[121.508887,25.050692]},
      {campus_id:'renai',facility_name:'臺北市立聯合醫院仁愛院區',map_label:'聯醫仁愛院區',district:'大安區',address:'臺北市大安區仁愛路四段10號',coordinates:[121.5453033447,25.0375404358]},
      {campus_id:'zhongxiao',facility_name:'臺北市立聯合醫院忠孝院區',map_label:'聯醫忠孝院區',district:'南港區',address:'臺北市南港區同德路87號',coordinates:[121.5861587524,25.0466041565]},
      {campus_id:'yangming',facility_name:'臺北市立聯合醫院陽明院區',map_label:'聯醫陽明院區',district:'士林區',address:'臺北市士林區雨聲街105號',coordinates:[121.5314865112,25.1048316956]},
      {campus_id:'songde',facility_name:'臺北市立聯合醫院松德院區',map_label:'聯醫松德院區',district:'信義區',address:'臺北市信義區松德路309號',coordinates:[121.5751575379,25.0305834018]},
      {campus_id:'heping',facility_name:'臺北市立聯合醫院和平院區',map_label:'聯醫和平院區',district:'中正區',address:'臺北市中正區中華路二段33號',coordinates:[121.5066833496,25.0355300903]},
      {campus_id:'fuyou',facility_name:'臺北市立聯合醫院婦幼院區',map_label:'聯醫婦幼院區',district:'中正區',address:'臺北市中正區福州街12號',coordinates:[121.5192888224,25.0290783959]},
      {campus_id:'linsen',facility_name:'臺北市立聯合醫院林森院區',map_label:'聯醫林森院區',district:'中山區',address:'臺北市中山區林森北路530號',coordinates:[121.5254745483,25.0634632111]},
      {campus_id:'kunming-tcm',facility_name:'臺北市立聯合醫院昆明院區／中醫中心',map_label:'聯醫昆明／中醫中心',district:'萬華區',address:'臺北市萬華區昆明街100號',coordinates:[121.50463,25.04431]}
    ]
  },
  {
    group_id:'tri-service-general-hospital',
    parent_name:'三軍總醫院附設民眾診療服務處',
    parent_facility_code:'0501110514',
    official_campus_source:'https://www.mohw.gov.tw/dl-99552-9299c250-c16f-4227-b655-506ad172b598.html',
    match_name_contains:['三軍總醫院附設民眾診療服務處'],
    campuses:[
      {campus_id:'neihu',facility_name:'三軍總醫院內湖院區',map_label:'三總內湖院區',district:'內湖區',address:'臺北市內湖區成功路二段325號',coordinates:[121.592611,25.0717589]},
      {campus_id:'tingzhou',facility_name:'三軍總醫院汀州院區',map_label:'三總汀州院區',district:'中正區',address:'臺北市中正區汀州路三段40號',coordinates:[121.5268825,25.0177184]}
    ]
  }
];

function clean(value){return String(value??'').trim();}

function belongsToGroup(feature,group){
  if(feature?.properties?.facility_type!=='hospital')return false;
  const code=clean(feature.properties.facility_code);
  const name=clean(feature.properties.facility_name);
  if(code&&code===group.parent_facility_code)return true;
  return group.match_name_contains.some(token=>name.includes(token));
}

function campusFeature(group,campus,{datasetId,hospitalResourceId}){
  return {
    type:'Feature',
    geometry:{type:'Point',coordinates:campus.coordinates},
    properties:{
      facility_type:'hospital',
      facility_type_zh:'醫院',
      facility_name:campus.facility_name,
      map_label:campus.map_label,
      district:campus.district,
      address:campus.address,
      category:'實體院區',
      facility_code:group.parent_facility_code,
      parent_facility_name:group.parent_name,
      campus_group_id:group.group_id,
      campus_id:campus.campus_id,
      physical_campus:true,
      source:'臺北市政府衛生局開放資料 + 醫院／衛福部官方院區資料',
      source_dataset_id:datasetId,
      source_resource_id:hospitalResourceId,
      source_campus_url:group.official_campus_source
    }
  };
}

export function reconcileHospitalCampuses(features,{datasetId,hospitalResourceId}){
  let output=[...features];
  const audit=[];
  for(const group of HOSPITAL_CAMPUS_REGISTRY){
    const matched=output.filter(feature=>belongsToGroup(feature,group));
    if(!matched.length)throw new Error(`Campus reconciliation source entity missing: ${group.parent_name}`);
    output=output.filter(feature=>!belongsToGroup(feature,group));
    const campusFeatures=group.campuses.map(campus=>campusFeature(group,campus,{datasetId,hospitalResourceId}));
    output.push(...campusFeatures);
    audit.push({
      group_id:group.group_id,
      parent_name:group.parent_name,
      parent_facility_code:group.parent_facility_code,
      replaced_raw_hospital_records:matched.length,
      physical_campus_sites:campusFeatures.length,
      campus_ids:group.campuses.map(c=>c.campus_id),
      official_campus_source:group.official_campus_source
    });
  }
  return {features:output,audit};
}
