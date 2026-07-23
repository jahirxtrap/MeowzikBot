const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function isSunoUrl(query) {
  return /^https?:\/\/(?:www\.)?suno\.(?:com|ai)\/(?:song|s)\//i.test(String(query || ''));
}

function extractId(str) {
  const m = String(str || '').match(UUID_RE);
  return m ? m[0] : null;
}

function metaContent(html, prop) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

async function resolveSuno(query, requestedBy) {
  const link = String(query || '').trim();
  const res = await fetch(link, {headers: {'User-Agent': 'Mozilla/5.0'}});
  if (!res.ok) throw new Error('Could not read that Suno link.');
  const html = await res.text();

  const id = extractId(res.url) || extractId(link) || extractId(html);
  if (!id) throw new Error('Could not read that Suno link (only public songs are supported).');

  const title = decodeEntities(metaContent(html, 'og:title')) || 'Unknown';
  const thumbnail = metaContent(html, 'og:image') || null;

  return {
    id,
    title,
    url: `https://suno.com/song/${id}`,
    streamUrl: `https://cdn1.suno.ai/${id}.mp3`,
    duration: 0,
    thumbnail,
    uploader: 'Suno',
    requestedBy: requestedBy || 'Unknown',
  };
}

module.exports = {isSunoUrl, resolveSuno};
