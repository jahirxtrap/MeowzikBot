const {SlashCommandBuilder} = require('discord.js');
const players = require('../lib/players');
const {replyTemp} = require('../lib/util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Leave the voice channel and clear the queue'),

  async execute(interaction) {
    const player = players.get(interaction.guildId);
    if (!player) {
      return replyTemp(interaction, '⚠️ I am not in a voice channel.');
    }
    player.destroy();
    return replyTemp(interaction, '👋 Left the voice channel.');
  },
};
