(()=>{
  const dataset=window.TaipeiMapsSchoolDistrictData115;
  const fail=message=>{
    const text=`Taipei school-district data validation failed: ${message}`;
    window.TaipeiMapsSchoolDistrictDataError=text;
    window.TaipeiMapsSchoolDistrictDataReady=false;
    window.TaipeiMapsSchoolDistrictData115=null;
    console.error(text);
    return false;
  };
  if(!dataset?.coverage?.districts||!dataset?.levels?.elementary||!dataset?.levels?.junior){fail('bootstrap missing or malformed');return;}
  const districts=dataset.coverage.districts;
  const validation=dataset.generated?.validation;
  if(!validation){fail('generated validation metadata missing');return;}
  for(const level of ['elementary','junior']){
    const table=dataset.levels[level];
    const expected=validation[level];
    if(!expected?.districtCounts){fail(`${level} expected district counts missing`);return;}
    const actualTotal=Object.keys(table).length;
    if(actualTotal!==expected.villages){fail(`${level} villages ${actualTotal} != ${expected.villages}`);return;}
    for(const district of districts){
      const actual=Object.keys(table).filter(key=>key.startsWith(`${district}|`)).length;
      const wanted=expected.districtCounts[district];
      if(actual!==wanted){fail(`${level} ${district} villages ${actual} != ${wanted}`);return;}
    }
  }
  window.TaipeiMapsSchoolDistrictDataReady=true;
})();
