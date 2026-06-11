const {Events} = require('discord.js');
const {registerAllGuilds} = require('../lib/commands');
const panel = require('../lib/panel');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag} — meowzik is ready.`);
    const count = await registerAllGuilds(client);
    console.log(`📥 Slash commands registered in ${count} server(s).`);

    // Re-render saved panels so any layout changes show up after a restart.
    for (const [guildId] of client.guilds.cache) {
      await panel.refreshGuild(client, guildId).catch(() => {
      });
    }
  },
};
