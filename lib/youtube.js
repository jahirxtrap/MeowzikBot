const {spawn} = require('node:child_process');
const {isSunoUrl, resolveSuno} = require('./suno');

const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';

function runYtdlp(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
    });
  });
}

async function getSpotifyQuery(url) {
  const m = url.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([a-zA-Z0-9]+)/);
  if (!m) return null;

  const res = await fetch(`https://open.spotify.com/embed/track/${m[1]}`, {
    headers: {'User-Agent': 'Mozilla/5.0'},
  });
  if (!res.ok) return null;
  const html = await res.text();
  const jm = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!jm) return null;

  let entity;
  try {
    entity = JSON.parse(jm[1]).props.pageProps.state.data.entity;
  } catch {
    return null;
  }
  if (!entity || !entity.name) return null;

  const artists = (entity.artists || []).map((a) => a && a.name).filter(Boolean);
  const artistStr = artists.length ? artists.join(' ') : entity.subtitle || '';
  return `${artistStr} ${entity.name}`.trim();
}

async function resolveTrack(query, requestedBy) {
  let term = String(query || '').trim();
  let isUrl = /^https?:\/\//i.test(term);

  if (isSunoUrl(term)) {
    return resolveSuno(term, requestedBy);
  }

  if (/open\.spotify\.com/i.test(term)) {
    const spotify = await getSpotifyQuery(term);
    if (!spotify) {
      throw new Error('Could not read that Spotify link (only single track links are supported).');
    }
    term = spotify;
    isUrl = false;
  }

  const finalQuery = isUrl ? term : `${term} audio`;

  const json = await runYtdlp([
    '-J',
    '--no-playlist',
    '--default-search', 'ytsearch1',
    '--no-warnings',
    finalQuery,
  ]);

  let info = JSON.parse(json);
  if (info.entries && info.entries.length) info = info.entries[0];
  if (!info || !info.id) throw new Error('No results found.');

  const thumbnail =
    info.thumbnail ||
    (Array.isArray(info.thumbnails) && info.thumbnails.length
      ? info.thumbnails[info.thumbnails.length - 1].url
      : null);

  return {
    id: info.id,
    title: info.title || 'Unknown',
    url: info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
    duration: info.duration || 0,
    thumbnail,
    uploader: info.uploader || info.channel || '',
    requestedBy: requestedBy || 'Unknown',
  };
}

function getPlaylistId(query) {
  const m = String(query || '').match(/[?&]list=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

function isSoundcloudUrl(query) {
  return /^https?:\/\/(?:www\.|m\.)?soundcloud\.com\//i.test(String(query || ''));
}

function isSoundcloudSet(query) {
  if (!isSoundcloudUrl(query)) return false;
  try {
    return /\/sets\//i.test(new URL(query).pathname);
  } catch {
    return false;
  }
}

function isPlaylistUrl(query) {
  return !!getPlaylistId(query) || isSoundcloudSet(query);
}

function pickThumbnail(e) {
  if (e.thumbnail) return e.thumbnail;
  if (Array.isArray(e.thumbnails) && e.thumbnails.length) {
    return e.thumbnails[e.thumbnails.length - 1].url;
  }
  return null;
}

async function resolvePlaylist(url, requestedBy, limit = 100) {
  if (isSoundcloudUrl(url)) {
    const out = await runYtdlp([
      '--yes-playlist',
      '-J',
      '--playlist-end', String(limit),
      '--no-warnings',
      url,
    ]);
    const data = JSON.parse(out);
    const entries = (data.entries || []).filter((e) => e && e.id);
    return entries.map((e) => ({
      id: e.id,
      title: e.title || 'Unknown',
      url: e.webpage_url || e.url,
      duration: e.duration || 0,
      thumbnail: pickThumbnail(e),
      uploader: e.uploader || e.channel || '',
      requestedBy: requestedBy || 'Unknown',
    }));
  }

  const out = await runYtdlp([
    '--flat-playlist',
    '--yes-playlist',
    '-J',
    '--playlist-end', String(limit),
    '--no-warnings',
    url,
  ]);

  const data = JSON.parse(out);
  const entries = (data.entries || []).filter((e) => e && e.id);
  return entries.map((e) => ({
    id: e.id,
    title: e.title || 'Unknown',
    url: `https://www.youtube.com/watch?v=${e.id}`,
    duration: e.duration || 0,
    thumbnail: `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
    uploader: e.uploader || e.channel || '',
    requestedBy: requestedBy || 'Unknown',
  }));
}

async function getRelated(seedId, excludeIds = []) {
  const exclude = new Set(excludeIds);
  const out = await runYtdlp([
    '--flat-playlist',
    '-J',
    '--playlist-end', '25',
    '--no-warnings',
    `https://www.youtube.com/watch?v=${seedId}&list=RD${seedId}`,
  ]);

  const data = JSON.parse(out);
  const entries = (data.entries || []).filter(
    (e) => e && e.id && e.id !== seedId && !exclude.has(e.id),
  );
  if (!entries.length) return null;

  const pool = entries.slice(0, 12);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return {
    id: pick.id,
    title: pick.title || 'Unknown',
    url: `https://www.youtube.com/watch?v=${pick.id}`,
    duration: pick.duration || 0,
    thumbnail: `https://i.ytimg.com/vi/${pick.id}/hqdefault.jpg`,
    uploader: pick.uploader || pick.channel || '',
  };
}

function createStream(track) {
  const proc = spawn(
    YTDLP,
    [
      '-f', 'bestaudio[ext=webm]/bestaudio/best',
      '-o', '-',
      '--no-playlist',
      '--quiet',
      '--no-warnings',
      track.streamUrl || track.url,
    ],
    {stdio: ['ignore', 'pipe', 'ignore']},
  );
  return {stream: proc.stdout, process: proc};
}

module.exports = {resolveTrack, createStream, getRelated, isPlaylistUrl, resolvePlaylist};
