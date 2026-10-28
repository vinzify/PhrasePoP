import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, defaults, loadSettings, persistedSettings } from '../src/domain.ts';
import { baseURL, generateAI } from '../src/services/ai.ts';
import { readStream } from '../src/services/stream.ts';

function stream(text: string, chunkSize = 1): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) controller.close();
      else {
        controller.enqueue(bytes.slice(offset, offset + chunkSize));
        offset += chunkSize;
      }
    },
  });
}
const signal = () => new AbortController().signal;

test('settings preserve LM Studio and tolerate corrupt storage', () => {
  assert.equal(loadSettings('{bad').provider, 'Ollama');
  assert.equal(loadSettings('null').model, '');
  assert.equal(loadSettings('{"provider":"LM Studio","model":"local"}').provider, 'LM Studio');
  assert.equal(loadSettings('{"provider":"LM Studio"}').ollamaUrl, 'http://localhost:1234/v1');
});
test('dark is the default, while an explicit light preference survives storage', () => {
  assert.equal(loadSettings(null).theme, 'dark');
  assert.equal(loadSettings('{"theme":"system"}').theme, 'dark');
  assert.equal(loadSettings(persistedSettings({ ...defaults, theme: 'light' })).theme, 'light');
});
test('saved preferences exclude legacy and newly entered API keys', () => {
  const saved = persistedSettings({ ...defaults, openAiKey: 'fake-test-key', persona: 'designer' });
  assert.equal(JSON.parse(saved).openAiKey, undefined);
  assert(!saved.includes('fake-test-key'));
  assert.equal(JSON.parse(saved).persona, 'designer');
});
test('persona is included only in reply mode', () => {
  assert(!buildPrompt('hello', 'Professional', 'PRIVATE PERSONA').includes('PRIVATE PERSONA'));
  assert(buildPrompt('hello', 'SmartReply', 'PRIVATE PERSONA').includes('PRIVATE PERSONA'));
});
test('provider URLs are validated without overriding local selection', () => {
  assert.equal(
    baseURL({ ...defaults, provider: 'LM Studio', ollamaUrl: '' }),
    'http://localhost:1234/v1',
  );
  assert.throws(() => baseURL({ ...defaults, ollamaUrl: 'file:///tmp/key' }));
  assert.throws(() => baseURL({ ...defaults, ollamaUrl: 'https://user:password@example.com' }));
});
test('SSE survives single-byte chunks, UTF-8, CRLF, and metadata frames', async () => {
  let output = '';
  const data =
    ': keepalive\r\ndata: {"choices":[{"delta":{"role":"assistant"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":"Caffè 👋"}}]}\r\n\r\ndata: {"choices":[],"usage":{}}\n\ndata: [DONE]\n\n';
  await readStream(
    stream(data),
    'sse',
    (text) => {
      output += text;
    },
    signal(),
  );
  assert.equal(output, 'Caffè 👋');
});
test('SSE can finish at EOF without a final newline', async () => {
  let output = '';
  await readStream(
    stream('data: {"choices":[{"delta":{"content":"hi"},"finish_reason":"stop"}]}', 5),
    'sse',
    (text) => {
      output += text;
    },
    signal(),
  );
  assert.equal(output, 'hi');
});
test('Ollama NDJSON is decoded incrementally', async () => {
  let output = '';
  await readStream(
    stream('{"response":"hello ","done":false}\n{"response":"world","done":true}\n', 3),
    'ndjson',
    (text) => {
      output += text;
    },
    signal(),
  );
  assert.equal(output, 'hello world');
});
test('broken, empty, and truncated streams are not reported as complete', async () => {
  await assert.rejects(
    readStream(stream('data: {broken}\n\n'), 'sse', () => {}, signal()),
    /malformed/,
  );
  await assert.rejects(
    readStream(stream('data: [DONE]\n\n'), 'sse', () => {}, signal()),
    /no text/,
  );
  await assert.rejects(
    readStream(
      stream('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
      'sse',
      () => {},
      signal(),
    ),
    /before generation completed/,
  );
  await assert.rejects(
    readStream(
      stream('data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n\n'),
      'sse',
      () => {},
      signal(),
    ),
    /length/,
  );
});
test('cancellation and response-size limits stop consumption', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    readStream(stream(''), 'sse', () => {}, controller.signal),
    /cancelled/,
  );
  const data =
    'data: ' + JSON.stringify({ choices: [{ delta: { content: 'a'.repeat(64_001) } }] }) + '\n\n';
  await assert.rejects(
    readStream(stream(data, 100_000), 'sse', () => {}, signal()),
    /limit/,
  );
});
test('generation uses the selected model and LM Studio endpoint, not Ollama', async () => {
  let url = '',
    body = '';
  const fakeFetch: typeof fetch = async (input, init) => {
    url = String(input);
    body = String(init?.body);
    return new Response(
      stream('data: {"choices":[{"delta":{"content":"done"},"finish_reason":"stop"}]}\n\n'),
      { status: 200 },
    );
  };
  let output = '';
  await generateAI(
    'original',
    'Concise',
    {
      ...defaults,
      provider: 'LM Studio',
      ollamaUrl: 'http://localhost:1234/v1',
      model: 'chosen-model',
    },
    (text) => {
      output += text;
    },
    signal(),
    fakeFetch,
  );
  assert.equal(url, 'http://localhost:1234/v1/chat/completions');
  assert.equal(JSON.parse(body).model, 'chosen-model');
  assert.equal(output, 'done');
});
