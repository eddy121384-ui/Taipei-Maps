import { buildCanonical } from '../../public/buju-poi-canonical-v01.mjs';

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
  feature('d', '全聯萬華莒光店', '全聯福利中心', [121.51, 25.01], '台北市莒光路131號', ['AllThePlaces']),
  feature('e', '全聯萬華劍光店', '全聯福利中心', [121.51015, 25.01], 'B1 No 131 Juguang Rd', ['meta']),
];

const result = buildCanonical(rows);

if (result.stats.raw_records !== 5) throw new Error(`raw_records: ${result.stats.raw_records}`);
if (result.stats.canonical_poi !== 4) throw new Error(`canonical_poi: ${result.stats.canonical_poi}`);
if (result.stats.auto_merged_groups !== 1) throw new Error(`auto_merged_groups: ${result.stats.auto_merged_groups}`);
if (result.stats.raw_rows_absorbed !== 1) throw new Error(`raw_rows_absorbed: ${result.stats.raw_rows_absorbed}`);

const mergedFamilyMart = result.entities.find(entity => entity.brand === '全家' && entity.source_rows === 2);
if (!mergedFamilyMart) throw new Error('expected the close generic/specific FamilyMart pair to merge');

const pxMartRows = result.entities.filter(entity => entity.brand === '全聯');
if (pxMartRows.length !== 2) throw new Error('branch typo / bilingual-address case should remain unresolved in conservative v0.1');

console.log('PASS · Buju canonical POI v0.1 synthetic guard');
console.log(result.stats);
