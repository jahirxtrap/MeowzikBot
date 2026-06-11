const {SlashCommandBuilder} = require('discord.js');
const players = require('../lib/players');
const {replyTemp} = require('../lib/util');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autoplay')
    .setDescription('Toggle autoplay — keeps playing similar songs when the queue ends')
    .addBooleanOption((o) =>
      o.setName('enabled').setDescription('Turn autoplay on or off (leave empty to toggle)'),
    ),

  async execute(interaction) {
    const player = players.getOrCreate(interaction.guild, interaction.client);
    const enabled = interaction.options.getBoolean('enabled');
    const on = enabled === null ? player.toggleAutoplay() : player.setAutoplay(enabled);

    return replyTemp(
      interaction,
      on
        ? '♾️ **Autoplay ON** — when the queue ends, I will keep playing songs similar to what was queued.'
        : '♾️ **Autoplay OFF**.',
      6000,
    );
  },
};
