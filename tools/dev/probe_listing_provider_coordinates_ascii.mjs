const aliases = {
  zhongzheng: '\u4e2d\u6b63',
  datong: '\u5927\u540c',
  zhongshan: '\u4e2d\u5c71',
  songshan: '\u677e\u5c71',
  daan: '\u5927\u5b89',
  wanhua: '\u842c\u83ef',
  xinyi: '\u4fe1\u7fa9',
  shilin: '\u58eb\u6797',
  beitou: '\u5317\u6295',
  neihu: '\u5167\u6e56',
  nangang: '\u5357\u6e2f',
  wenshan: '\u6587\u5c71',
};

const raw = String(process.argv[2] || '').trim();
if (raw) {
  process.argv[2] = aliases[raw.toLowerCase()] || raw;
}

await import('./probe_listing_provider_coordinates.mjs');
