// Affiliate links for shop/deal results. All optional (Vite env vars, public by nature):
//   VITE_AMAZON_ASSOCIATE_TAG      Amazon UK Associates tag, e.g. pawesome-21
//   VITE_AWIN_AFFILIATE_ID         your Awin publisher id
//   VITE_AWIN_MID_ZOOPLUS          Awin advertiser id for zooplus UK
//   VITE_AWIN_MID_PETSATHOME       Awin advertiser id for Pets at Home
// With nothing set, links are returned unchanged.
const env = (import.meta as any).env || {};

export function affiliateUrl(raw: string, e: Record<string, string | undefined> = env): string {
  let u: URL;
  try { u = new URL(raw); } catch { return raw; }
  const host = u.hostname.toLowerCase();
  if (/(^|\.)amazon\.(co\.uk|com|de|fr|it|es|ie)$/.test(host) && e.VITE_AMAZON_ASSOCIATE_TAG) {
    u.searchParams.set('tag', e.VITE_AMAZON_ASSOCIATE_TAG);
    return u.toString();
  }
  const awin = (mid?: string) =>
    mid && e.VITE_AWIN_AFFILIATE_ID
      ? `https://www.awin1.com/cread.php?awinmid=${encodeURIComponent(mid)}&awinaffid=${encodeURIComponent(e.VITE_AWIN_AFFILIATE_ID)}&ued=${encodeURIComponent(raw)}`
      : raw;
  if (/(^|\.)zooplus\.co\.uk$/.test(host)) return awin(e.VITE_AWIN_MID_ZOOPLUS);
  if (/(^|\.)petsathome\.com$/.test(host)) return awin(e.VITE_AWIN_MID_PETSATHOME);
  return raw;
}

export function retailerSearchLinks(query: string) {
  const q = encodeURIComponent(query);
  return [
    { title: `Search “${query}” on Amazon UK`, price: 'View on site', source: 'Amazon UK', url: `https://www.amazon.co.uk/s?k=${q}+pet`, imageUrl: '', rating: '', dealInfo: 'Prime delivery on many items' },
    { title: `Search “${query}” on zooplus`, price: 'View on site', source: 'zooplus', url: `https://www.zooplus.co.uk/esearch.htm#!&search=${q}`, imageUrl: '', rating: '', dealInfo: 'Free delivery over £39' },
    { title: `Search “${query}” on Pets at Home`, price: 'View on site', source: 'Pets at Home', url: `https://www.petsathome.com/search?q=${q}`, imageUrl: '', rating: '', dealInfo: '' },
  ];
}
