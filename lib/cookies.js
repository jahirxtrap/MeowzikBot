const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROBE_URL = 'https://www.youtube.com/watch?v=2GipUJttGQc';
const SESSION_COOKIES = ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID', '__Secure-1PSID', '__Secure-1PAPISID'];

function fromNetscape(raw) {
  return raw
    .split('\n')
    .map((line) => ({httpOnly: line.startsWith('#HttpOnly_'), line: line.replace(/^#HttpOnly_/, '').trim()}))
    .filter(({line}) => line && !line.startsWith('#'))
    .map(({httpOnly, line}) => ({httpOnly, fields: line.split('\t')}))
    .filter(({fields}) => fields.length >= 7)
    .map(({httpOnly, fields}) => ({
      domain: fields[0],
      path: fields[2],
      secure: fields[3] === 'TRUE',
      expires: Number(fields[4]),
      name: fields[5],
      value: fields.slice(6).join('\t'),
      httpOnly,
    }));
}

function fromJson(raw) {
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : parsed.cookies;
  return list.map((c) => ({
    domain: c.hostOnly ? c.domain.replace(/^\./, '') : c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
    path: c.path || '/',
    secure: !!c.secure,
    expires: c.session || !c.expirationDate ? 0 : Math.floor(c.expirationDate),
    name: c.name,
    value: c.value,
    httpOnly: !!c.httpOnly,
  }));
}

function toNetscape(cookies) {
  const lines = ['# Netscape HTTP Cookie File', ''];
  for (const c of cookies) {
    lines.push(
      [
        `${c.httpOnly ? '#HttpOnly_' : ''}${c.domain}`,
        c.domain.startsWith('.') ? 'TRUE' : 'FALSE',
        c.path,
        c.secure ? 'TRUE' : 'FALSE',
        String(c.expires),
        c.name,
        c.value,
      ].join('\t'),
    );
  }
  return `${lines.join('\n')}\n`;
}

function readCookies(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return /^\s*[[{]/.test(raw) ? fromJson(raw) : fromNetscape(raw);
}

function readYoutubeCookies(file) {
  return readCookies(file).filter((c) => c.domain.includes('youtube.com'));
}

function missingSessionCookies(cookies) {
  const names = new Set(cookies.map((c) => c.name));
  return SESSION_COOKIES.filter((n) => !names.has(n));
}

function expiredSessionCookies(cookies) {
  const now = Math.floor(Date.now() / 1000);
  return cookies
    .filter((c) => SESSION_COOKIES.includes(c.name) && c.expires && c.expires < now)
    .map((c) => c.name);
}

function writeFile(contents, target) {
  const pending = `${target}.pending`;
  fs.writeFileSync(pending, contents, {mode: 0o600});
  fs.renameSync(pending, target);
}

function mergeRotated(jar, target) {
  const identity = (c) => `${c.domain}\t${c.path}\t${c.name}`;
  const merged = new Map(readCookies(target).map((c) => [identity(c), c]));
  for (const c of readCookies(jar)) merged.set(identity(c), c);
  writeFile(toNetscape([...merged.values()]), target);
}

function install(cookies, target, bin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meowzik-cookies-'));
  const staging = path.join(dir, 'cookies.txt');
  fs.writeFileSync(staging, toNetscape(cookies), {mode: 0o600});

  const probe = spawnSync(
    bin,
    ['--cookies', staging, '--simulate', '--no-warnings', '--print', '%(title)s', PROBE_URL],
    {encoding: 'utf8'},
  );

  const result =
    probe.status === 0
      ? {ok: true, title: probe.stdout.trim()}
      : {ok: false, error: (probe.stderr || '').trim().split('\n').pop()};

  if (result.ok) writeFile(fs.readFileSync(staging, 'utf8'), target);
  fs.rmSync(dir, {recursive: true, force: true});
  return result;
}

module.exports = {
  PROBE_URL,
  readYoutubeCookies,
  missingSessionCookies,
  expiredSessionCookies,
  mergeRotated,
  install,
};
