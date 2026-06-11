const {REST, Routes} = require('discord.js');

function commandBody(client) {
  return client.commands.map((c) => c.data.toJSON());
}

async function registerGuild(client, guildId) {
  const rest = new REST().setToken(client.token);
  await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), {
    body: commandBody(client),
  });
}

async function registerAllGuilds(client) {
  for (const [guildId] of client.guilds.cache) {
    try {
      await registerGuild(client, guildId);
    } catch (err) {
      console.error(`Failed to register commands in guild ${guildId}:`, err.message);
    }
  }
  return client.guilds.cache.size;
}

module.exports = {registerGuild, registerAllGuilds};
