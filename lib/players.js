const MusicPlayer = require('./MusicPlayer');

const players = new Map();

function get(guildId) {
  return players.get(guildId) || null;
}

function getOrCreate(guild, client) {
  let player = players.get(guild.id);
  if (!player) {
    player = new MusicPlayer(guild, client);
    players.set(guild.id, player);
  }
  return player;
}

function remove(guildId) {
  players.delete(guildId);
}

module.exports = {get, getOrCreate, remove, players};
