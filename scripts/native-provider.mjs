import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Requires a Linux desktop and WebKitWebDriver matching the installed WebKitGTK.
// Only disposable settings, synthetic text, and a localhost HTTP fixture are used.
if (process.platform !== 'linux') throw new Error('This native check requires Linux.');
const directory = await mkdtemp(join(tmpdir(), 'phrasepop-native-provider-'));
let driver;
let session;
let base;
let diagnostics = '';
let mode = 'success';
const seen = [];
const server = http.createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const data = body ? JSON.parse(body) : null;
  seen.push({ path: request.url, data });
  response.setHeader('Content-Type', 'application/x-ndjson');
  response.write(JSON.stringify({ response: 'Native café ✅', done: false }) + '\n');
  if (mode === 'success') {
    response.end(JSON.stringify({ response: '', done: true }) + '\n');
  } else {
    const timer = setTimeout(() => response.end(), 15000);
    response.on('close', () => clearTimeout(timer));
  }
});
async function command(path, body, method = 'POST') {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (result.value?.error) throw Error(JSON.stringify(result.value));
  return result.value;
}
const js = (script, ...args) => command('/execute/sync', { script, args });
async function until(script, message) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await js(script)) return;
    await delay(100);
  }
  throw Error(message);
}
try {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const reservation = http.createServer();
  await new Promise((r) => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port;
  await new Promise((r) => reservation.close(r));
  base = `http://127.0.0.1:${port}`;
  driver = spawn(
    process.env.WEBKIT_WEBDRIVER || 'WebKitWebDriver',
    [`--port=${port}`, '--host=local'],
    {
      env: {
        ...process.env,
        TAURI_WEBVIEW_AUTOMATION: 'true',
        XDG_CONFIG_HOME: join(directory, 'config'),
        XDG_DATA_HOME: join(directory, 'data'),
        XDG_CACHE_HOME: join(directory, 'cache'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  driver.on('error', (error) => {
    diagnostics += error.message;
  });
  driver.stdout.on('data', (text) => {
    diagnostics += text;
  });
  driver.stderr.on('data', (text) => {
    diagnostics += text;
  });
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await fetch(base + '/status', { signal: AbortSignal.timeout(1000) });
      ready = true;
      break;
    } catch {
      await delay(100);
    }
  }
  if (!ready) throw Error('WebKitWebDriver unavailable: ' + diagnostics);
  const created = await command('/session', {
    capabilities: {
      alwaysMatch: {
        'webkitgtk:browserOptions': {
          binary: resolve(process.env.PHRASEPOP_BINARY || 'src-tauri/target/release/phrasepop'),
          args: [],
        },
      },
    },
  });
  session = created.sessionId;
  base += '/session/' + session;
  const handles = await command('/window/handles', null, 'GET');
  await command('/window', { handle: handles[0] });
  await js(
    "localStorage.setItem('phrasepop-settings', JSON.stringify(arguments[0])); location.reload(); return true",
    {
      provider: 'Ollama',
      ollamaUrl: endpoint,
      model: 'fixture-model',
      theme: 'dark',
      defaultTone: 'Professional',
      persona: '',
    },
  );
  await until(
    'return !!document.querySelector(\'textarea[aria-label="Your words"]\')',
    'No native editor',
  );
  await js(
    "const t=document.querySelector('textarea[aria-label=\"Your words\"]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Synthetic provider transport fixture.'); t.dispatchEvent(new Event('input',{bubbles:true})); return true",
  );
  await until(
    "return [...document.querySelectorAll('button')].some(b=>b.textContent.includes('Improve this text') && !b.disabled)",
    'Improve button disabled',
  );
  const improve =
    "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Improve this text')).click(); return true";
  await js(improve);
  await until(
    "return document.querySelector('textarea[aria-label=\"A fresh take\"]')?.value === 'Native café ✅' && ![...document.querySelectorAll('button')].some(b=>b.textContent.includes('Stop generating'))",
    'Native generation did not finish',
  );
  assert.equal(seen[0].path, '/api/generate');
  assert.equal(seen[0].data.model, 'fixture-model');
  assert.match(seen[0].data.prompt, /Synthetic provider transport fixture/);
  console.log(
    'PASS native WebKit → Tauri Rust HTTP → custom-port localhost NDJSON → Unicode result',
  );
  mode = 'cancel';
  await js(improve);
  await until(
    "return document.querySelector('textarea[aria-label=\"A fresh take\"]')?.value === 'Native café ✅' && [...document.querySelectorAll('button')].some(b=>b.textContent.includes('Stop generating'))",
    'No cancellable partial result',
  );
  await js(
    "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Stop generating')).click(); return true",
  );
  await until(
    "return document.body.innerText.includes('Stopped. Any partial text is kept for review.')",
    'Cancel was not surfaced',
  );
  assert.equal(
    await js('return document.querySelector(\'textarea[aria-label="A fresh take"]\').value'),
    'Native café ✅',
  );
  assert.equal(
    await js('return document.querySelector(\'textarea[aria-label="Your words"]\').value'),
    'Synthetic provider transport fixture.',
  );
  console.log(
    'PASS cancellation preserves source and partial result; no clipboard or cloud API used',
  );
} catch (error) {
  if (session)
    console.error(
      'Synthetic native page:',
      await js('return document.body.innerText').catch(() => 'Unavailable'),
    );
  throw error;
} finally {
  server.closeAllConnections();
  server.close();
  if (session) await command('', null, 'DELETE').catch(() => {});
  if (driver && driver.exitCode === null) {
    driver.kill('SIGTERM');
    await Promise.race([new Promise((r) => driver.once('exit', r)), delay(2000)]);
    if (driver.exitCode === null) driver.kill('SIGKILL');
  }
  await rm(directory, { recursive: true, force: true });
}
