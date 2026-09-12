require('dotenv').config({path: require('node:path').join(__dirname, '..', '.env'), quiet: true});

const fs = require('node:fs');
const {BIN, COOKIE_JAR} = require('../lib/ytdlp');
const {
  PROBE_URL,
  readYoutubeCookies,
  missingSessionCookies,
  expiredSessionCookies,
  install,
} = require('../lib/cookies');

const EXPORT_STEPS = [
  'Export the cookies again with a session actually open:',
  '  1. Open a private window and sign in to YouTube with a throwaway account.',
  '  2. Visit https://www.youtube.com/robots.txt so YouTube stops rotating the session.',
  '  3. Export with a Netscape cookies.txt or JSON browser extension.',
  '  4. Close the private window without signing out.',
].join('\n');

function fail(message, hint) {
  console.error(`FAIL  ${message}`);
  if (hint) console.error(`\n${hint}`);
  process.exit(1);
}

if (!COOKIE_JAR) fail('YTDLP_COOKIES is not set in .env');

const source = process.argv[2] || COOKIE_JAR;
if (!fs.existsSync(source)) fail(`No such file: ${source}`);

const cookies = readYoutubeCookies(source);
if (!cookies.length) {
  fail(`${source} holds no youtube.com cookies`, 'Export it from a tab logged into YouTube, not from google.com.');
}

const missing = missingSessionCookies(cookies);
if (missing.length) fail(`Not a logged-in export, missing: ${missing.join(', ')}`, EXPORT_STEPS);

const expired = expiredSessionCookies(cookies);
if (expired.length) fail(`Expired session cookies: ${expired.join(', ')}`, EXPORT_STEPS);

console.log(`OK    ${cookies.length} youtube.com cookies, session complete`);
console.log(`...   probing ${PROBE_URL}`);

const result = install(cookies, COOKIE_JAR, BIN);
if (!result.ok) {
  fail(
    `YouTube rejected the session: ${result.error}`,
    'The account may be blocked, unverified for age-restricted videos, or the export is stale.',
  );
}

console.log(`OK    ${result.title}`);
console.log(`OK    installed at ${COOKIE_JAR}`);
console.log('Restart the bot to pick them up: npm run stop && npm run detach');
