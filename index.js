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

client.on('error', (err) => console.error('Client error:', err?.message || err));
client.on('shardError', (err) => console.error('Shard error:', err?.message || err));
client.on('shardDisconnect', (ev, id) => console.warn(`Shard ${id} disconnected (${ev?.code ?? '?'}); reconnecting…`));
client.on('shardReconnecting', (id) => console.warn(`Shard ${id} reconnecting…`));
client.on('shardResume', (id) => console.log(`Shard ${id} resumed.`));

const NET_ERR_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED',
  'EAI_AGAIN', 'ENOTFOUND', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', 'EHOSTDOWN',
]);
const isTransientNetError = (err) =>
  NET_ERR_CODES.has(err?.code) ||
  /handshake has timed out|opening handshake|timed out|socket hang up|network|ECONNRESET|WebSocket was closed/i
    .test(String(err?.message || ''));

process.on('unhandledRejection', (err) => {
  if (isTransientNetError(err)) return console.error('Transient network error (will retry):', err?.message || err);
  console.error('Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  if (isTransientNetError(err)) return console.error('Transient network error (ignored, auto-reconnect):', err?.message || err);
  console.error('Fatal uncaught exception, exiting for restart:', err);
  process.exit(1);
});

(async function start() {
  for (let attempt = 1; ; attempt++) {
    try {
      await client.login(DISCORD_TOKEN);
      return;
    } catch (err) {
      console.error(`Login failed (${err?.code || err?.message}); retrying in 15s [attempt ${attempt}]`);
      await new Promise((r) => setTimeout(r, 15000));
    }
  }
})();
