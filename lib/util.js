const {MessageFlags} = require('discord.js');

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return 'Live / Unknown';
  return formatClock(seconds);
}

function formatClock(seconds) {
  seconds = Math.max(0, Math.floor(seconds || 0));
  const s = seconds % 60;
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

async function replyTemp(interaction, content, ms = 5000) {
  try {
    await interaction.reply({content, flags: MessageFlags.Ephemeral});
    setTimeout(() => interaction.deleteReply().catch(() => {
    }), ms);
  } catch {
  }
}

module.exports = {formatDuration, replyTemp};
