const {Events} = require('discord.js');
const players = require('../lib/players');

module.exports = {
  name: Events.VoiceStateUpdate,
  execute(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;
    const player = players.get(guild.id);
    if (player) player.handleVoiceStateUpdate();
  },
};
