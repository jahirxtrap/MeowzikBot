const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {holdsSession, replaceFile} = require('./cookies');

const BIN = process.env.YTDLP_PATH || 'yt-dlp';
const COOKIE_JAR = process.env.YTDLP_COOKIES || '';
const COOKIE_BROWSER = process.env.YTDLP_COOKIES_FROM_BROWSER || '';
const EXTRA_ARGS = process.env.YTDLP_ARGS || '';

const SEARCH_SOURCES = {
  youtube: {prefix: 'ytsearch1', suffix: ' audio', args: []},
  soundcloud: {prefix: 'scsearch5', suffix: '', args: ['--ignore-errors']},
};
const SEARCH = SEARCH_SOURCES[process.env.SEARCH_SOURCE] || SEARCH_SOURCES.youtube;

function splitArgs(raw) {
  const out = [];
  const token = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = token.exec(raw)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function hasCookies() {
  return !!(COOKIE_JAR || COOKIE_BROWSER);
}

function openCookieJar() {
  if (!COOKIE_JAR) return {args: ['--cookies-from-browser', COOKIE_BROWSER], close: () => {}};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meowzik-cookies-'));
  const copy = path.join(dir, 'cookies.txt');
  fs.copyFileSync(COOKIE_JAR, copy);
  return {
    args: ['--cookies', copy],
    close: () => {
      if (holdsSession(copy)) replaceFile(copy, COOKIE_JAR);
      fs.rmSync(dir, {recursive: true, force: true});
    },
  };
}

function baseArgs(withCookies) {
  const jar = withCookies && hasCookies() ? openCookieJar() : {args: [], close: () => {}};
  const args = [...jar.args];
  if (EXTRA_ARGS) args.push(...splitArgs(EXTRA_ARGS));
  return {args, close: jar.close};
}

module.exports = {BIN, COOKIE_JAR, SEARCH, hasCookies, baseArgs};
