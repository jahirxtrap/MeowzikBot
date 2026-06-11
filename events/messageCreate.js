const {Events, GatewayIntentBits} = require('discord.js');
const store = require('../lib/store');
const {addToQueue, NotInVoiceError} = require('../lib/playback');

async function sendTemporary(channel, content, ms = 5_000) {
  const msg = await channel.send({content}).catch(() => null);
  if (msg) setTimeout(() => msg.delete().catch(() => {
  }), ms);
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    if (!message.client.options.intents.has(GatewayIntentBits.MessageContent)) return;

    const cfg = store.getGuild(message.guild.id);
    if (!cfg || message.channel.id !== cfg.musicChannelId) return;

    const query = message.content.trim();
    if (!query) {
      message.delete().catch(() => {
      });
      return;
    }

    try {
      const result = await addToQueue({
        guild: message.guild,
        client: message.client,
        member: message.member,
        query,
      });
      message.delete().catch(() => {
      });
      const text = result.playlist
        ? `➕ Added **${result.count}** songs from the playlist`
        : `${result.playingNow ? '🎶 Now playing' : '➕ Added to queue'}: **${result.track.title}**`;
      await sendTemporary(message.channel, text);
    } catch (err) {
      message.delete().catch(() => {
      });
      const text =
        err instanceof NotInVoiceError
          ? 'Join a voice channel first.'
          : `Could not play that: ${err.message}`;
      await sendTemporary(message.channel, `⚠️ ${text}`);
    }
  },
};
