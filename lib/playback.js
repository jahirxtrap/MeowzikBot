const players = require('./players');
const {resolveTrack, getPlaylistId, resolvePlaylist} = require('./youtube');

class NotInVoiceError extends Error {
}

async function addToQueue({guild, client, member, query}) {
  const voiceChannel = member.voice && member.voice.channel;
  if (!voiceChannel) {
    throw new NotInVoiceError('You must join a voice channel first.');
  }

  const player = players.getOrCreate(guild, client);
  player.connect(voiceChannel);

  const requestedBy = member.displayName || member.user.username;

  const playlistId = getPlaylistId(query);
  if (playlistId) {
    const tracks = await resolvePlaylist(query, requestedBy);
    if (!tracks.length) {
      throw new Error('That playlist is empty or unavailable.');
    }
    player.enqueueMany(tracks);
    return {playlist: true, count: tracks.length, track: tracks[0]};
  }

  const track = await resolveTrack(query, requestedBy);
  player.enqueue(track);
  const playingNow = player.current === track;
  return {playlist: false, track, playingNow};
}

module.exports = {addToQueue, NotInVoiceError};
