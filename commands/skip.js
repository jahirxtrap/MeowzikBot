const {SlashCommandBuilder} = require('discord.js');
const players = require('../lib/players');
const {replyTemp} = require('../lib/util');

module.exports = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip the current song'),

  async execute(interaction) {
    const player = players.get(interaction.guildId);
    if (!player || !player.current) {
      return replyTemp(interaction, '⚠️ Nothing is playing.');
    }
    player.skip();
    return replyTemp(interaction, '⏭️ Skipped.');
  },
};
