import { buildCanonical } from '../../public/buju-poi-canonical-v02.mjs';

function feature(id, name, brand, coordinates, address = '', datasets = []) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: {
      id,
      '@name': name,
      brand: brand ? JSON.stringify({ names: { primary: brand } }) : '',
      addresses: address,
      sources: JSON.stringify(datasets.map(dataset => ({ dataset }))),
    },
  };
}

const rows = [
  feature('a', 'FamilyMart', '', [121.5, 25.0], '台北市某路1號', ['Foursquare']),
  feature('b', '全家測試店', '全家便利商店', [121.50005, 25.0], '台北市某路1號', ['AllThePlaces']),
  feature('c', '全家另一店', '全家便利商店', [121.5004, 25.0], '台北市某路20號', ['AllThePlaces']),
  feature('d', '全聯萬華莒光店', '全聯福利中心', [121.51, 25.01], '台北市萬華區莒光路131號B1', ['AllThePlaces']),
  feature('e', '全聯萬華劍光店', '全聯福利中心', [121.51015, 25.01], 'B1 No 131 Juguang Rd', ['meta']),
  feature('f', '全聯中正同安店', '全聯福利中心', [121.52, 25.02], '台北市中正區同安街10號', ['AllThePlaces']),
  feature('g', '全聯同安店', '全聯福利中心', [121.52007, 25.02], '10 Tongan St', ['meta']),
  feature('h', '全聯萬華西藏店', '全聯福利中心', [121.5300, 25.03], '台北市萬華區西藏路100號', ['AllThePlaces']),
  feature('i', '全聯萬華長沙店', '全聯福利中心', [121.5301, 25.03], '台北市萬華區長沙街100號', ['AllThePlaces']),
];

const result = buildCanonical(rows);

if (result.stats.raw_records !== 9) throw new Error(`raw_records: ${result.stats.raw_records}`);
if (result.stats.raw_rows_absorbed !== 3) throw new Error(`raw_rows_absorbed: ${result.stats.raw_rows_absorbed}`);

const family = result.entities.find(e => e.brand === '全家' && e.source_rows === 2);
if (!family) throw new Error('expected generic/specific FamilyMart pair to merge');

const typo = result.entities.find(e => e.brand === '全聯' && e.source_names.includes('全聯萬華莒光店') && e.source_names.includes('全聯萬華劍光店'));
if (!typo || typo.source_rows !== 2 || !typo.merge_reasons.includes('near-branch-typo<=1-edit')) throw new Error('expected validated 莒光/劍光 typo pair to merge');

const prefix = result.entities.find(e => e.brand === '全聯' && e.source_names.includes('全聯中正同安店') && e.source_names.includes('全聯同安店'));
if (!prefix || prefix.source_rows !== 2 || !prefix.merge_reasons.includes('branch-area-prefix-equivalent')) throw new Error('expected district-prefix-equivalent branch pair to merge');

const dangerous = result.entities.filter(e => e.source_names.includes('全聯萬華西藏店') || e.source_names.includes('全聯萬華長沙店'));
if (dangerous.length !== 2) throw new Error('distinct nearby branch names must remain separate');

console.log('PASS · Buju canonical POI v0.2 fuzzy-branch guard');
console.log(result.stats);
