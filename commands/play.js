const {
  SlashCommandBuilder,
  MessageFlags,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');
const {addToQueue, NotInVoiceError} = require('../lib/playback');
const {formatDuration} = require('../lib/util');

const COLOR = 0x1e1e1e;

function textContainer(text) {
  return new ContainerBuilder()
    .setAccentColor(COLOR)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song (YouTube search/link, SoundCloud, or Suno link)')
    .addStringOption((o) =>
      o
        .setName('query')
        .setDescription('Song name, YouTube link, SoundCloud link, or Suno link')
        .setRequired(true),
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query', true);

    await interaction.reply({
      flags: MessageFlags.IsComponentsV2,
      components: [textContainer('🔎 Searching…')],
    });

    try {
      const result = await addToQueue({
        guild: interaction.guild,
        client: interaction.client,
        member: interaction.member,
        query,
      });

      if (result.playlist) {
        await interaction.editReply({
          components: [textContainer(`### ➕ Added to Queue\n**${result.count}** songs from the playlist.`)],
        });
        return;
      }

      const {track, playingNow} = result;
      const text =
        `### ${playingNow ? '🎶 Now Playing' : '➕ Added to Queue'}\n` +
        `**[${track.title}](${track.url})**\n` +
        `\`${formatDuration(track.duration)}\` · Requested by **${track.requestedBy}**`;

      const container = new ContainerBuilder().setAccentColor(COLOR);
      if (track.thumbnail) {
        container.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(track.thumbnail)),
        );
      } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
      }

      await interaction.editReply({components: [container]});
    } catch (err) {
      const msg =
        err instanceof NotInVoiceError ? err.message : `Could not play that: ${err.message}`;
      await interaction.editReply({components: [textContainer(`⚠️ ${msg}`)]});
    }
  },
};
