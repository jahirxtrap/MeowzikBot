const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {words} = require('./util');

const LIBRARY_DIR = path.join(__dirname, '..', 'library');
const AUDIO_FILE = /\.(mp3|m4a|ogg|opus|flac|wav)$/i;
const REF_PREFIX = 'library:';

function libraryFiles() {
  try {
    return fs.readdirSync(LIBRARY_DIR).filter((file) => AUDIO_FILE.test(file));
  } catch {
    return [];
  }
}

function splitName(file) {
  const name = file.replace(AUDIO_FILE, '');
  const dash = name.indexOf(' - ');
  return {
    name,
    artist: dash >= 0 ? name.slice(0, dash) : '',
    song: dash >= 0 ? name.slice(dash + 3) : name,
  };
}

function matches(file, asked) {
  const {name, song} = splitName(file);
  const known = new Set(words(name));
  return words(song).every((w) => asked.has(w)) && [...asked].every((w) => known.has(w));
}

function probeDuration(file) {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    let out = '';
    proc.stdout.on('data', (d) => (out += d));
    proc.on('error', () => resolve(0));
    proc.on('close', () => resolve(Math.round(Number(out)) || 0));
  });
}

async function libraryTrack(file, requestedBy) {
  const {name, artist} = splitName(file);
  const location = path.join(LIBRARY_DIR, file);
  return {
    id: `${REF_PREFIX}${file}`,
    title: name,
    url: `${REF_PREFIX}${file}`,
    file: location,
    duration: await probeDuration(location),
    thumbnail: null,
    uploader: artist,
    requestedBy: requestedBy || 'Unknown',
  };
}

function isLibraryRef(query) {
  return String(query || '').startsWith(REF_PREFIX);
}

async function findInLibrary(query, requestedBy) {
  if (isLibraryRef(query)) {
    const file = libraryFiles().find((f) => `${REF_PREFIX}${f}` === query);
    if (!file) throw new Error('That song is no longer in the library.');
    return libraryTrack(file, requestedBy);
  }
  const asked = new Set(words(query));
  const file = asked.size ? libraryFiles().find((f) => matches(f, asked)) : null;
  return file ? libraryTrack(file, requestedBy) : null;
}

async function relatedInLibrary(seed, excludeIds = []) {
  const exclude = new Set([...excludeIds, seed.id]);
  const pool = libraryFiles().filter((f) => !exclude.has(`${REF_PREFIX}${f}`));
  if (!pool.length) return null;
  return libraryTrack(pool[Math.floor(Math.random() * pool.length)], 'Autoplay');
}

function openLibraryStream(track) {
  const stream = fs.createReadStream(track.file);
  return {stream, process: {kill: () => stream.destroy()}};
}

module.exports = {isLibraryRef, findInLibrary, relatedInLibrary, openLibraryStream};
