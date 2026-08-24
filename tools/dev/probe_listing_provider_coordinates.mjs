const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const DISTRICTS = {
  中正: { zip: '100', yungching: '中正區' },
  大同: { zip: '103', yungching: '大同區' },
  中山: { zip: '104', yungching: '中山區' },
  松山: { zip: '105', yungching: '松山區' },
  大安: { zip: '106', yungching: '大安區' },
  萬華: { zip: '108', yungching: '萬華區' },
  信義: { zip: '110', yungching: '信義區' },
  士林: { zip: '111', yungching: '士林區' },
  北投: { zip: '112', yungching: '北投區' },
  內湖: { zip: '114', yungching: '內湖區' },
  南港: { zip: '115', yungching: '南港區' },
  文山: { zip: '116', yungching: '文山區' },
};

const district = (process.argv[2] || '大安').replace(/區$/, '');
const meta = DISTRICTS[district];
if (!meta) {
  console.error(`[ERROR] Unknown Taipei district: ${district}`);
  process.exit(1);
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function getText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': UA,
        'accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-TW,zh;q=0.9,en;q=0.7',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await response.text();
    return { status: response.status, url: response.url, text };
  } finally {
    clearTimeout(timer);
  }
}

function uniqueMatches(text, regex, mapper = m => m[0], limit = 12) {
  const out = [];
  const seen = new Set();
  for (const match of text.matchAll(regex)) {
    const value = mapper(match);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= limit) break;
  }
  return out;
}

function coordinateEvidence(text) {
  const latKeys = uniqueMatches(text, /(?:["']?(?:lat|latitude)["']?\s*[:=]\s*["']?)(2[4-6](?:\.\d{3,})?)/gi, m => Number(m[1]), 20);
  const lngKeys = uniqueMatches(text, /(?:["']?(?:lng|lon|longitude)["']?\s*[:=]\s*["']?)(12[0-2](?:\.\d{3,})?)/gi, m => Number(m[1]), 20);
  const jsonPairs = uniqueMatches(
    text,
    /["']?(?:lat|latitude)["']?\s*[:=]\s*["']?(2[4-6]\.\d+)["']?[^\n\r<>]{0,240}?["']?(?:lng|lon|longitude)["']?\s*[:=]\s*["']?(12[0-2]\.\d+)["']?/gi,
    m => `${m[1]},${m[2]}`,
    20,
  );
  const reversePairs = uniqueMatches(
    text,
    /["']?(?:lng|lon|longitude)["']?\s*[:=]\s*["']?(12[0-2]\.\d+)["']?[^\n\r<>]{0,240}?["']?(?:lat|latitude)["']?\s*[:=]\s*["']?(2[4-6]\.\d+)["']?/gi,
    m => `${m[2]},${m[1]}`,
    20,
  );
  const genericPairs = uniqueMatches(
    text,
    /\b(2[4-6]\.\d{4,})\s*[,|]\s*(12[0-2]\.\d{4,})\b/g,
    m => `${m[1]},${m[2]}`,
    20,
  );
  return {
    lat_key_values: latKeys,
    lng_key_values: lngKeys,
    paired_candidates: [...new Set([...jsonPairs, ...reversePairs, ...genericPairs])].slice(0, 20),
  };
}

function extractSinyiHouseUrls(html) {
  return uniqueMatches(
    html,
    /(?:https?:\/\/www\.sinyi\.com\.tw)?\/buy\/house\/([A-Za-z0-9_-]+)/g,
    m => `https://www.sinyi.com.tw/buy/house/${m[1]}`,
    20,
  );
}

function extractYungchingHouseUrls(html) {
  const absolute = uniqueMatches(
    html,
    /https?:\/\/buy\.yungching\.com\.tw\/house\/([A-Za-z0-9_-]+)/g,
    m => `https://buy.yungching.com.tw/house/${m[1]}`,
    20,
  );
  const relative = uniqueMatches(
    html,
    /(?:href=["']?)\/?house\/([A-Za-z0-9_-]+)/g,
    m => `https://buy.yungching.com.tw/house/${m[1]}`,
    20,
  );
  return [...new Set([...absolute, ...relative])].slice(0, 20);
}

async function probeSinyi() {
  const listUrl = `https://www.sinyi.com.tw/buy/list/Taipei-city/${meta.zip}-zip`;
  const list = await getText(listUrl);
  const houses = extractSinyiHouseUrls(list.text);
  const result = {
    provider: 'sinyi',
    list_url: list.url,
    list_status: list.status,
    list_bytes: Buffer.byteLength(list.text),
    house_links_found: houses.length,
    first_house_url: houses[0] || null,
    list_coordinate_evidence: coordinateEvidence(list.text),
    mode_hint: houses.length ? 'SSR_OR_HYDRATED_HTML' : 'NO_HOUSE_LINKS_IN_RAW_HTML',
  };
  if (houses[0]) {
    await sleep(700);
    const detail = await getText(houses[0]);
    result.detail_status = detail.status;
    result.detail_bytes = Buffer.byteLength(detail.text);
    result.detail_coordinate_evidence = coordinateEvidence(detail.text);
    result.detail_has_map_terms = /map|latitude|longitude|\blat\b|\blng\b/i.test(detail.text);
  }
  return result;
}

async function probeYungching() {
  const cityDistrict = encodeURIComponent(`台北市-${meta.yungching}`);
  const listUrl = `https://buy.yungching.com.tw/region/${cityDistrict}_c`;
  const list = await getText(listUrl);
  const houses = extractYungchingHouseUrls(list.text);
  const result = {
    provider: 'yungching',
    list_url: list.url,
    list_status: list.status,
    list_bytes: Buffer.byteLength(list.text),
    house_links_found: houses.length,
    first_house_url: houses[0] || null,
    list_coordinate_evidence: coordinateEvidence(list.text),
    mode_hint: houses.length ? 'RAW_HTML_HAS_HOUSE_LINKS' : 'LIKELY_SPA_OR_DATA_FETCH_REQUIRED',
  };
  if (houses[0]) {
    await sleep(700);
    const detail = await getText(houses[0]);
    result.detail_status = detail.status;
    result.detail_bytes = Buffer.byteLength(detail.text);
    result.detail_coordinate_evidence = coordinateEvidence(detail.text);
    result.detail_has_map_terms = /map|latitude|longitude|\blat\b|\blng\b/i.test(detail.text);
  }
  return result;
}

console.log('==========================================================');
console.log(' Taipei-Maps provider coordinate probe (LOW FREQUENCY)');
console.log(` District: ${district}`);
console.log(' 2 providers; max one list + one detail GET per provider.');
console.log(' No login, no CAPTCHA/Cloudflare bypass, no data persistence.');
console.log('==========================================================\n');

const output = { district, timestamp: new Date().toISOString(), providers: [] };
for (const fn of [probeSinyi, probeYungching]) {
  try {
    const row = await fn();
    output.providers.push(row);
    console.log(JSON.stringify(row, null, 2));
  } catch (error) {
    const row = { provider: fn === probeSinyi ? 'sinyi' : 'yungching', error: String(error?.message || error) };
    output.providers.push(row);
    console.error(JSON.stringify(row, null, 2));
  }
  console.log('');
  await sleep(900);
}

console.log('--- verdict hints ---');
for (const row of output.providers) {
  const pairs = row?.detail_coordinate_evidence?.paired_candidates || row?.list_coordinate_evidence?.paired_candidates || [];
  if (pairs.length) console.log(`${row.provider}: coordinate candidate(s) found -> worth building adapter`);
  else if (row.provider === 'yungching' && row.mode_hint?.includes('SPA')) console.log('yungching: raw GET looks like SPA shell -> next probe would require normal browser rendering, not bypass');
  else console.log(`${row.provider}: no reliable lat/lng pair found in this low-frequency raw-page probe`);
}
