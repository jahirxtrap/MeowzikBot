const {SlashCommandBuilder} = require('discord.js');
const players = require('../lib/players');
const {replyTemp} = require('../lib/util');

module.exports = {
  data: new SlashCommandBuilder().setName('join').setDescription('Join your voice channel'),

  async execute(interaction) {
    const voiceChannel = interaction.member.voice && interaction.member.voice.channel;
    if (!voiceChannel) {
      return replyTemp(interaction, '⚠️ You must join a voice channel first.');
    }
    const player = players.getOrCreate(interaction.guild, interaction.client);
    player.connect(voiceChannel);
    return replyTemp(interaction, `✅ Joined **${voiceChannel.name}**.`);
  },
};
