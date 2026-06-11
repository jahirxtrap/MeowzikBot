const path = require('node:path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  MessageFlags,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const store = require('./store');
const {formatDuration} = require('./util');

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo.png');
const COLOR = 0x1e1e1e;
const LOOP_LABEL = {off: 'Loop: Off', track: 'Loop: Track', queue: 'Loop: Queue'};

function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function controlRows(paused, loopMode, shuffle, autoplay, favorited) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_back')
      .setEmoji('⏮️')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_pause')
      .setEmoji(paused ? '▶️' : '⏸️')
      .setLabel(paused ? 'Resume' : 'Pause')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_skip')
      .setEmoji('⏭️')
      .setLabel('Skip')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_stop')
      .setEmoji('⏹️')
      .setLabel('Stop')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('music_loop')
      .setEmoji('🔁')
      .setLabel('Loop')
      .setStyle(loopMode === 'off' ? ButtonStyle.Secondary : ButtonStyle.Success),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_shuffle')
      .setEmoji('🔀')
      .setLabel('Shuffle')
      .setStyle(shuffle ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_autoplay')
      .setEmoji('♾️')
      .setLabel('Autoplay')
      .setStyle(autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('music_add')
      .setEmoji('➕')
      .setLabel('Add song')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('music_favorite')
      .setEmoji('⭐')
      .setLabel('Favorite')
      .setStyle(favorited ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  return [row1, row2];
}

function buildPanel(player, guildId) {
  const current = player && player.current;
  const gid = guildId || (player && player.guild && player.guild.id) || null;
  const loopMode = player ? player.loopMode : 'off';
  const paused = player ? player.isPaused() : false;
  const autoplay = player ? player.autoplay : false;
  const shuffle = player ? player.shuffleMode : false;

  const container = new ContainerBuilder().setAccentColor(COLOR);
  let needLogo = false;

  if (current) {
    const header =
      `## ${paused ? '⏸️ Paused' : '🎶 Now Playing'}\n` +
      `**[${truncate(current.title, 80)}](${current.url})**\n` +
      `\`${formatDuration(current.duration)}\` · Requested by **${current.requestedBy}**`;

    if (!current.thumbnail) needLogo = true;
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(header))
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(current.thumbnail || 'attachment://logo.png'),
        ),
    );

    const next = player && player.queue.length ? player.queue[0] : null;
    if (next) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**Next:** ${truncate(next.title, 80)}`),
      );
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${LOOP_LABEL[loopMode]}`));
  } else {
    needLogo = true;
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://logo.png'),
      ),
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '## 🎶 Meowzik\nNothing is playing right now.\nPress **➕ Add song** (or use `/play`) to start.',
      ),
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
  );
  const favorited = current && gid ? store.isFavorite(gid, current.id) : false;
  container.addActionRowComponents(...controlRows(paused, loopMode, shuffle, autoplay, favorited));

  const future = player ? player.queue : [];
  if (future.length) {
    const qOpts = future
      .slice(0, 25)
      .map((t, i) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(truncate(`${i + 1}. ${t.title || 'Unknown'}`, 95))
          .setValue(`q:${i}:${t.id || i}`),
      );
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('music_jump')
          .setPlaceholder('🔜 Queue — jump to an upcoming song…')
          .addOptions(qOpts),
      ),
    );
  }

  const past = player ? player.played : [];
  if (past.length) {
    const hOpts = [];
    for (let i = past.length - 1; i >= 0 && hOpts.length < 25; i -= 1) {
      hOpts.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(truncate(`↩ ${past[i].title || 'Unknown'}`, 95))
          .setValue(`p:${i}:${past[i].id || i}`),
      );
    }
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('music_hist')
          .setPlaceholder('🕘 History — replay a song…')
          .addOptions(hOpts),
      ),
    );
  }

  const favorites = gid ? store.getFavorites(gid) : [];
  if (favorites.length) {
    const favOptions = favorites
      .slice(0, 25)
      .map((f, i) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(truncate(`⭐ ${f.title || 'Unknown'}`, 95))
          .setValue(`${i}:${f.id}`),
      );
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('music_fav')
          .setPlaceholder('⭐ Favorites — play one…')
          .addOptions(favOptions),
      ),
    );
  }

  const payload = {flags: MessageFlags.IsComponentsV2, components: [container]};
  if (needLogo) payload.files = [new AttachmentBuilder(LOGO_PATH, {name: 'logo.png'})];
  else payload.attachments = [];
  return payload;
}

async function renderInto(channel, guildId, player) {
  const cfg = store.getGuild(guildId);
  if (!cfg || !cfg.panelMessageId) return;

  const payload = buildPanel(player, guildId);
  const message = await channel.messages.fetch(cfg.panelMessageId).catch(() => null);

  if (message && message.flags.has(MessageFlags.IsComponentsV2)) {
    try {
      await message.edit(payload);
      return;
    } catch {
      await message.delete().catch(() => {
      });
    }
  } else if (message) {
    await message.delete().catch(() => {
    });
  }

  const fresh = await channel.send(payload).catch(() => null);
  if (fresh) store.setGuild(guildId, {panelMessageId: fresh.id});
}

async function refresh(player) {
  const cfg = store.getGuild(player.guild.id);
  if (!cfg || !cfg.musicChannelId) return;
  const channel = await player.client.channels.fetch(cfg.musicChannelId).catch(() => null);
  if (!channel) return;
  await renderInto(channel, player.guild.id, player);
}

async function refreshGuild(client, guildId) {
  const cfg = store.getGuild(guildId);
  if (!cfg || !cfg.musicChannelId) return;
  const channel = await client.channels.fetch(cfg.musicChannelId).catch(() => null);
  if (!channel) return;
  const player = require('./players').get(guildId);
  await renderInto(channel, guildId, player);
}

module.exports = {buildPanel, refresh, refreshGuild};
