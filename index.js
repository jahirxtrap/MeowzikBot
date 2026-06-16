require('dotenv').config({quiet: true});
const fs = require('node:fs');
const path = require('node:path');
const {Client, Collection, GatewayIntentBits} = require('discord.js');

const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const _log = console.log.bind(console);
const _err = console.error.bind(console);
console.log = (...a) => _log(`[${stamp()}]`, ...a);
console.error = (...a) => _err(`[${stamp()}]`, ...a);

const {DISCORD_TOKEN} = process.env;
if (!DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsDir, file));
  if (command.data && command.execute) client.commands.set(command.data.name, command);
}

const eventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsDir, file));
  if (event.once) client.once(event.name, (...args) => event.execute(...args));
  else client.on(event.name, (...args) => event.execute(...args));
}

process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

client.login(DISCORD_TOKEN);
