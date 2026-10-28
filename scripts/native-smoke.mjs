import { execFile, execFileSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

if (process.platform !== 'linux') throw new Error('This desktop smoke script is Linux-specific.');
const directory = await mkdtemp(join(tmpdir(), 'phrasepop-native-smoke-'));
const binary = resolve('src-tauri/target/release/phrasepop');
let child;
let diagnostics = '';
try {
  console.log(execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim());
  child = spawn(binary, [], {
    env: {
      ...process.env,
      XDG_CONFIG_HOME: join(directory, 'config'),
      XDG_DATA_HOME: join(directory, 'data'),
      XDG_CACHE_HOME: join(directory, 'cache'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (value) => {
    diagnostics += value;
  });
  child.stderr.on('data', (value) => {
    diagnostics += value;
  });
  await delay(6000);
  if (child.exitCode !== null || child.signalCode !== null)
    throw new Error('Native app exited during startup: ' + diagnostics);
  console.log(
    'Native process remained running on ' +
      process.env.XDG_CURRENT_DESKTOP +
      ' / ' +
      process.env.XDG_SESSION_TYPE +
      '.',
  );
  if (process.argv.includes('--a11y')) {
    const { stdout } = await promisify(execFile)(
      'python3',
      ['scripts/native-a11y.py', String(child.pid)],
      { timeout: 45000 },
    );
    console.log(stdout.trim());
  }
  if (diagnostics.trim()) console.log('Startup diagnostics:\n' + diagnostics.trim());
  console.log(
    'Only synthetic text was used. No clipboard reads/writes, external AI calls, or user settings were involved.',
  );
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(3000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  await rm(directory, { recursive: true, force: true });
}
