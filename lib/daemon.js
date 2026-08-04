const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PID_PATH = path.join(ROOT, '.detached.pid');
const LOG_PATH = path.join(ROOT, 'meowzik.log');
const ENTRY = path.join(ROOT, 'index.js');

function runningPid() {
  let pid;
  try {
    pid = Number.parseInt(fs.readFileSync(PID_PATH, 'utf8').trim(), 10);
  } catch {
    return null;
  }
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    try {
      fs.unlinkSync(PID_PATH);
    } catch {}
    return null;
  }
}

function spawnDetached() {
  const running = runningPid();
  if (running !== null) {
    console.error(`A detached bot is already running (pid ${running}). Use "npm run stop" first.`);
    process.exit(1);
  }

  const log = fs.openSync(LOG_PATH, 'a');
  const child = spawn(process.execPath, [ENTRY], {
    detached: true,
    stdio: ['ignore', log, log],
    cwd: ROOT,
    env: process.env,
  });
  child.unref();
  fs.writeFileSync(PID_PATH, String(child.pid), 'utf8');

  console.log(`  Detached   : pid ${child.pid}`);
  console.log(`  Log        : ${LOG_PATH}`);
  console.log('  Stop with  : npm run stop');
}

function stopDetached() {
  const pid = runningPid();
  if (pid === null) {
    console.log('No detached bot is running.');
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Stopped detached bot (pid ${pid}).`);
  } catch (err) {
    console.error(`Could not stop pid ${pid}: ${err.message}`);
  }
  try {
    fs.unlinkSync(PID_PATH);
  } catch {}
}

function handleCli(argv) {
  if (argv.includes('--stop')) {
    stopDetached();
    return true;
  }
  if (argv.includes('--detach')) {
    spawnDetached();
    return true;
  }
  return false;
}

module.exports = {handleCli, runningPid, spawnDetached, stopDetached, PID_PATH, LOG_PATH};
