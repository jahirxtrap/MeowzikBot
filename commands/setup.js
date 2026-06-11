const {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js');
const store = require('../lib/store');
const players = require('../lib/players');
const {buildPanel} = require('../lib/panel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Create or set the dedicated music channel with the control panel')
    .addChannelOption((o) =>
      o
        .setName('channel')
        .setDescription('Existing text channel to use (leave empty to create a new one)')
        .addChannelTypes(ChannelType.GuildText),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({flags: MessageFlags.Ephemeral});

    let channel = interaction.options.getChannel('channel');

    if (channel) {
      const existing = await channel.messages.fetch({limit: 5}).catch(() => null);
      if (existing && existing.size > 0) {
        channel = await channel.clone({reason: 'Meowzik music channel'});
      }
    } else {
      channel = await interaction.guild.channels.create({
        name: '🐈‍⬛┊meowzik',
        type: ChannelType.GuildText,
        parent: interaction.channel ? interaction.channel.parentId : null,
        topic: 'Type a song name or a YouTube link to play it · meowzik',
      });
    }

    const player = players.get(interaction.guildId);
    const message = await channel.send(buildPanel(player, interaction.guildId));

    store.setGuild(interaction.guildId, {
      musicChannelId: channel.id,
      panelMessageId: message.id,
    });

    await interaction
      .editReply({content: `✅ Music channel ready: <#${channel.id}>`})
      .catch(() => {
      });
    setTimeout(() => interaction.deleteReply().catch(() => {
    }), 4000);
  },
};
