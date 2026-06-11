const {SlashCommandBuilder} = require('discord.js');
const players = require('../lib/players');
const {replyTemp} = require('../lib/util');

module.exports = {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause or resume playback'),

  async execute(interaction) {
    const player = players.get(interaction.guildId);
    if (!player || !player.current) {
      return replyTemp(interaction, '⚠️ Nothing is playing.');
    }
    const paused = player.togglePause();
    player.updatePanel();
    return replyTemp(interaction, paused ? '⏸️ Paused.' : '▶️ Resumed.');
  },
};
