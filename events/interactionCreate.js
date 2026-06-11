const {
  Events,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
const players = require('../lib/players');
const panel = require('../lib/panel');
const {addToQueue, NotInVoiceError} = require('../lib/playback');
const {replyTemp} = require('../lib/util');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`Command /${interaction.commandName} failed:`, err);
        const payload = {content: '⚠️ Something went wrong.', flags: MessageFlags.Ephemeral};
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload).catch(() => {
          });
        } else {
          await interaction.reply(payload).catch(() => {
          });
        }
      }
      return;
    }

    // "Add song" modal submit
    if (interaction.isModalSubmit() && interaction.customId === 'music_add_modal') {
      await handleAddModal(interaction);
      return;
    }

    if (
      interaction.isStringSelectMenu() &&
      (interaction.customId === 'music_jump' || interaction.customId === 'music_hist')
    ) {
      const player = players.get(interaction.guildId);
      const parts = (interaction.values[0] || '').split(':');
      const source = parts[0];
      const pos = parseInt(parts[1], 10);
      const id = parts.slice(2).join(':');

      let track = null;
      if (player && source === 'q') {
        track =
          player.queue[pos] && player.queue[pos].id === id
            ? player.queue[pos]
            : player.queue.find((t) => t.id === id);
        if (track) player.queue.splice(player.queue.indexOf(track), 1);
      } else if (player && source === 'p') {
        track =
          player.played[pos] && player.played[pos].id === id
            ? player.played[pos]
            : player.played.find((t) => t.id === id);
      }

      await interaction.deferUpdate().catch(() => {
      });
      if (!(track && player && player.playTrackNow(track))) {
        await panel.refreshGuild(interaction.client, interaction.guildId).catch(() => {
        });
      }
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'music_fav') {
      const value = interaction.values[0] || '';
      const id = value.slice(value.indexOf(':') + 1);
      await interaction.deferUpdate().catch(() => {
      });
      try {
        await addToQueue({
          guild: interaction.guild,
          client: interaction.client,
          member: interaction.member,
          query: `https://www.youtube.com/watch?v=${id}`,
        });
      } catch (err) {
        const msg =
          err instanceof NotInVoiceError ? 'Join a voice channel first.' : 'Could not play that.';
        await panel.refreshGuild(interaction.client, interaction.guildId).catch(() => {
        });
        await interaction.followUp({content: `⚠️ ${msg}`, flags: MessageFlags.Ephemeral}).catch(() => {
        });
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('music_')) {
      await handleButton(interaction);
    }
  },
};

async function handleButton(interaction) {
  const action = interaction.customId.slice('music_'.length);

  if (action === 'add') {
    const modal = new ModalBuilder().setCustomId('music_add_modal').setTitle('Add a song');
    const input = new TextInputBuilder()
      .setCustomId('query')
      .setLabel('Song name or YouTube link')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Search a song or paste a YouTube link')
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (action === 'autoplay') {
    const p = players.getOrCreate(interaction.guild, interaction.client);
    p.toggleAutoplay();
    return interaction.deferUpdate().catch(() => {
    });
  }

  if (action === 'shuffle') {
    const p = players.getOrCreate(interaction.guild, interaction.client);
    p.toggleShuffle();
    return interaction.deferUpdate().catch(() => {
    });
  }

  const player = players.get(interaction.guildId);

  if (action === 'back') {
    if (player && player.previous()) return interaction.deferUpdate().catch(() => {
    });
    return replyTemp(interaction, '⚠️ No previous song.');
  }

  if (!player || !player.current) {
    return replyTemp(interaction, '⚠️ Nothing is playing.');
  }

  switch (action) {
    case 'pause':
      player.togglePause();
      player.updatePanel();
      break;
    case 'skip':
      player.skip();
      break;
    case 'stop':
      player.stop();
      break;
    case 'loop':
      player.cycleLoop();
      break;
    case 'favorite':
      player.toggleFavorite();
      break;
    default:
      break;
  }

  await interaction.deferUpdate().catch(() => {
  });
}

async function handleAddModal(interaction) {
  const query = interaction.fields.getTextInputValue('query');
  await interaction.deferReply({flags: MessageFlags.Ephemeral});
  try {
    const result = await addToQueue({
      guild: interaction.guild,
      client: interaction.client,
      member: interaction.member,
      query,
    });
    const content = result.playlist
      ? `➕ Added **${result.count}** songs from the playlist.`
      : `${result.playingNow ? '🎶 Now playing' : '➕ Added to queue'}: **${result.track.title}**`;
    await interaction.editReply({content});
  } catch (err) {
    const msg =
      err instanceof NotInVoiceError ? err.message : `Could not play that: ${err.message}`;
    await interaction.editReply({content: `⚠️ ${msg}`});
  }

  setTimeout(() => interaction.deleteReply().catch(() => {
  }), 5000);
}
