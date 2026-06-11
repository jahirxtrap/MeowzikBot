const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'data', 'config.json');

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeAll(data) {
  fs.mkdirSync(path.dirname(FILE), {recursive: true});
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function getGuild(guildId) {
  return readAll()[guildId] || null;
}

function setGuild(guildId, cfg) {
  const all = readAll();
  all[guildId] = {...(all[guildId] || {}), ...cfg};
  writeAll(all);
  return all[guildId];
}

function getFavorites(guildId) {
  return (readAll()[guildId] || {}).favorites || [];
}

function isFavorite(guildId, trackId) {
  return getFavorites(guildId).some((f) => f.id === trackId);
}

function toggleFavorite(guildId, track) {
  if (!track || !track.id) return false;
  const all = readAll();
  const g = all[guildId] || {};
  const favs = g.favorites || [];
  const idx = favs.findIndex((f) => f.id === track.id);
  let added;
  if (idx >= 0) {
    favs.splice(idx, 1);
    added = false;
  } else {
    favs.unshift({id: track.id, title: track.title, url: track.url});
    added = true;
  }
  g.favorites = favs;
  all[guildId] = g;
  writeAll(all);
  return added;
}

module.exports = {getGuild, setGuild, getFavorites, isFavorite, toggleFavorite};
