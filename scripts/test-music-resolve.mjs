// Test the music-page resolution path of the upgraded TikTokExtractor
const url = process.argv[2] || 'https://www.tiktok.com/music/original-sound-7629029762698201876';
const m = url.match(/(?:music|audio)\/([\w%.\-]*\d{10,})/i);
if (!m) { console.log('not a music url'); process.exit(1); }
const embedUrl = `https://www.tiktok.com/embed/music/${m[1]}`;
const res = await fetch(embedUrl, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
});
console.log('embed status:', res.status);
const html = await res.text();
const seen = new Set();
for (const match of html.matchAll(/https:\/\/www\.tiktok\.com\/@([\w.\-]+)\/video\/(\d+)/g)) {
  const link = `https://www.tiktok.com/@${match[1]}/video/${match[2]}`;
  if (!seen.has(link)) { seen.add(link); console.log(' -', match[1], link); }
}
console.log('total:', seen.size);
