const {Events} = require('discord.js');
const {registerGuild} = require('../lib/commands');

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    try {
      await registerGuild(guild.client, guild.id);
      console.log(`📥 Registered commands in new server: ${guild.name} (${guild.id})`);
    } catch (err) {
      console.error(`Failed to register commands in new server ${guild.id}:`, err.message);
    }
  },
};
