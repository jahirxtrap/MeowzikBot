const {spawn} = require('node:child_process');
const {PassThrough} = require('node:stream');
const {BIN, SEARCH, hasCookies, baseArgs} = require('./ytdlp');
const {isSunoUrl, resolveSuno} = require('./suno');
const {LINK, words} = require('./util');
const {findInLibrary, isLibraryRef, openLibraryStream, relatedInLibrary} = require('./library');

const NEEDS_COOKIES = /Sign in to confirm|not a bot|--cookies|HTTP Error 403/i;
const SOUNDCLOUD_SHORT_LINK = /^https?:\/\/on\.soundcloud\.com\//i;
const VIDEO_TAG = /\s*[([][^()[\]]*\bvideo[^()[\]]*[)\]]/gi;
const INFO_LIFETIME_MS = {Youtube: 5 * 60 * 60 * 1000};
const TAKE_LENGTH = {min: 0.7, max: 1.05};

let cookiesRequired = false;

function spawnYtdlp(extraArgs) {
  return new Promise((resolve, reject) => {
    const {args, close} = baseArgs(cookiesRequired);
    const proc = spawn(BIN, [...args, ...extraArgs]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', (err) => {
      close();
      reject(err);
    });
    proc.on('close', (code) => {
      close();
      if (code === 0) return resolve(stdout);
      const err = new Error(stderr.trim() || `yt-dlp exited with code ${code}`);
      err.stdout = stdout;
      reject(err);
    });
  });
}

function startUsingCookies(errorText) {
  if (cookiesRequired || !hasCookies() || !NEEDS_COOKIES.test(errorText)) return false;
  cookiesRequired = true;
  console.log('yt-dlp: YouTube refused the anonymous client, retrying with cookies.');
  return true;
}

async function runYtdlp(args) {
  try {
    return await spawnYtdlp(args);
  } catch (err) {
    if (!startUsingCookies(err.message)) throw err;
    return spawnYtdlp(args);
  }
}

async function searchEntries(args) {
  let json;
  let failure;
  try {
    json = await runYtdlp(args);
  } catch (err) {
    json = err.stdout;
    failure = err;
  }
  const data = json?.trim() ? JSON.parse(json) : null;
  if (!data && failure) throw failure;
  if (!data) return [];
  return data.entries ? data.entries.filter((e) => e && e.id) : [data];
}

function reusableInfo(info) {
  const lifetime = INFO_LIFETIME_MS[info.extractor_key];
  if (!lifetime) return null;
  const {automatic_captions, subtitles, ...light} = info;
  return {json: JSON.stringify(light), expires: Date.now() + lifetime};
}

function freshInfo(track) {
  return track.info && track.info.expires > Date.now() ? track.info.json : null;
}

async function extractVideo(url) {
  return JSON.parse(await runYtdlp(['-J', '--no-playlist', '--no-warnings', url]));
}

function preloadTrack(track) {
  if (!track.preloading && INFO_LIFETIME_MS[track.extractor] && !freshInfo(track)) {
    track.preloading = extractVideo(track.url)
      .then((info) => {
        track.info = reusableInfo(info);
      })
      .catch(() => {})
      .finally(() => {
        track.preloading = null;
      });
  }
  return track.preloading;
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

function rankEntries(entries, term) {
  const asked = words(term);
  const named = entries.filter((e) => {
    const known = new Set(words(`${e.title} ${e.uploader || e.channel || ''}`));
    return asked.every((w) => known.has(w));
  });
  const [top] = named;
  if (!top) return [];
  const takes = named.filter((e) => {
    const length = e.duration / top.duration;
    return length >= TAKE_LENGTH.min && length <= TAKE_LENGTH.max;
  });
  const preferred = SEARCH.versions
    .map((version) => takes.find((e) => words(e.title).some((w) => version.includes(w))))
    .filter(Boolean);
  return [...new Set([...preferred, top])];
}

async function findEntries(term, isUrl) {
  const choosing = !isUrl && SEARCH.versions;
  const lookups = isUrl || !SEARCH.suffix ? [term] : [`${term}${SEARCH.suffix}`, term];

  let fallback = [];
  for (const lookup of lookups) {
    const entries = await searchEntries([
      '-J',
      '--no-playlist',
      '--default-search', SEARCH.prefix,
      ...SEARCH.args,
      ...(choosing ? ['--flat-playlist'] : []),
      '--no-warnings',
      lookup,
    ]);
    const found = choosing ? rankEntries(entries, term) : entries.slice(0, 1);
    if (found.length) return found;
    if (!fallback.length) fallback = entries.slice(0, 1);
  }
  return fallback;
}

async function firstPlayable(entries) {
  let failure = new Error('No results found.');
  for (const entry of entries) {
    if (entry._type !== 'url') return entry;
    try {
      return await extractVideo(entry.url);
    } catch (err) {
      failure = err;
    }
  }
  throw failure;
}

async function resolveTrack(query, requestedBy) {
  let term = String(query || '').trim();
  let isUrl = LINK.test(term);

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

  if (!isUrl) {
    const local = await findInLibrary(term, requestedBy);
    if (local) return local;
  }

  const info = await firstPlayable(await findEntries(term, isUrl));
  if (!info.id) throw new Error('No results found.');

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
    extractor: info.extractor_key,
    info: reusableInfo(info),
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

async function expandShortLink(link) {
  if (!SOUNDCLOUD_SHORT_LINK.test(link)) return link;
  const res = await fetch(link, {method: 'HEAD', redirect: 'manual'}).catch(() => null);
  return res?.headers.get('location') || link;
}

async function normalizeQuery(query) {
  const text = String(query || '').trim();
  const link = text.match(LINK)?.[0];
  return link ? expandShortLink(link) : text;
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
    extractor: e.ie_key,
  }));
}

async function getRelated(seed, excludeIds = []) {
  if (isLibraryRef(seed.url)) return relatedInLibrary(seed, excludeIds);
  const exclude = new Set(excludeIds);
  const feed = isSoundcloudUrl(seed.url)
    ? `${seed.url}/recommended`
    : `https://www.youtube.com/watch?v=${seed.id}&list=RD${seed.id}`;

  const out = await runYtdlp([
    '--flat-playlist',
    '-J',
    '--playlist-end', '25',
    '--no-warnings',
    feed,
  ]);

  const data = JSON.parse(out);
  const entries = (data.entries || []).filter(
    (e) => e && e.id && e.id !== seed.id && !exclude.has(e.id),
  );
  if (!entries.length) return null;

  const pool = entries.slice(0, 12);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const url = pick.webpage_url || pick.url || `https://www.youtube.com/watch?v=${pick.id}`;
  return {
    id: pick.id,
    title: pick.title || 'Unknown',
    url,
    duration: pick.duration || 0,
    thumbnail:
      pickThumbnail(pick) ||
      (isSoundcloudUrl(url) ? null : `https://i.ytimg.com/vi/${pick.id}/hqdefault.jpg`),
    uploader: pick.uploader || pick.channel || '',
  };
}

async function resolveRelated(related) {
  const title = related.title.replace(VIDEO_TAG, '').trim() || related.title;
  const lookups = isSoundcloudUrl(related.url) ? [related.url, title] : [title];
  for (const lookup of lookups) {
    const track = await resolveTrack(lookup).catch(() => null);
    if (track) return track;
  }
  return related;
}

function createStream(track) {
  if (track.file) return openLibraryStream(track);
  const output = new PassThrough();
  let proc;
  let stopped = false;

  const finish = () => {
    if (!output.writableEnded) output.end();
  };

  const start = () => {
    if (stopped) return finish();
    const {args, close} = baseArgs(cookiesRequired);
    const info = freshInfo(track);
    proc = spawn(
      BIN,
      [
        ...args,
        '-f', 'bestaudio[ext=webm]/bestaudio/best',
        '-o', '-',
        '--no-playlist',
        '--quiet',
        '--no-warnings',
        ...(info ? ['--load-info-json', '-'] : [track.streamUrl || track.url]),
      ],
      {stdio: [info ? 'pipe' : 'ignore', 'pipe', 'pipe']},
    );
    proc.stdin?.on('error', () => {});
    proc.stdin?.end(info);

    let stderr = '';
    let started = false;
    proc.stdout.once('data', () => (started = true));
    proc.stdout.pipe(output, {end: false});
    proc.stderr.on('data', (d) => (stderr += d));
    proc.on('error', () => {
      close();
      finish();
    });
    proc.on('close', (code) => {
      close();
      const failedEarly = code !== 0 && !started && !stopped;
      const cookiesAdded = failedEarly && startUsingCookies(stderr);
      if (failedEarly && info) track.info = null;
      if (failedEarly && (info || cookiesAdded)) return start();
      if (code !== 0 && !stopped && stderr.trim()) {
        console.error(`yt-dlp stream failed: ${stderr.trim().split('\n').pop()}`);
      }
      finish();
    });
  };

  const stop = () => {
    stopped = true;
    proc?.stdout.destroy();
    proc?.kill('SIGTERM');
  };

  Promise.resolve(track.preloading).then(start);
  output.on('close', stop);
  return {stream: output, process: {kill: stop}};
}

module.exports = {
  resolveTrack,
  resolveRelated,
  resolvePlaylist,
  preloadTrack,
  createStream,
  getRelated,
  isPlaylistUrl,
  normalizeQuery,
};
