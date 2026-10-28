import { mockIPC } from '@tauri-apps/api/mocks';
import { defaults } from './domain';

export function setupDemo() {
  const mode = new URLSearchParams(location.search).get('demo');
  if (!localStorage.getItem('phrasepop-settings'))
    localStorage.setItem(
      'phrasepop-settings',
      JSON.stringify({ ...defaults, model: 'local-writer' }),
    );
  const state = {
    calls: [] as { command: string; args: Record<string, unknown> }[],
    requests: [] as { url: string; body: Record<string, unknown> | null }[],
  };
  Object.assign(window, { __phraseDemo: state });
  let next = 1;
  const clients = new Map<number, { url: string; method: string; data: number[] | null }>();
  const bodies = new Map<number, Uint8Array>();
  mockIPC(
    async (command, payload) => {
      const args = (payload || {}) as Record<string, unknown>;
      state.calls.push({ command, args });
      switch (command) {
        case 'plugin:app|version':
          return '1.2.0-beta.1';
        case 'get_desktop_info':
          return {
            platform: 'linux',
            wayland: true,
            shortcut_supported: false,
            shortcut: '',
            shortcut_note:
              'On Wayland, assign a desktop shortcut to phrasepop --clipboard. Copy text first.',
            clipboard_requested: false,
          };
        case 'read_clipboard':
          if (mode === 'slow-paste') await new Promise((resolve) => setTimeout(resolve, 400));
          return 'hey, can you send over a quick update on the project? i want to make sure we’re still on track for friday. thanks!';
        case 'set_clipboard':
          return;
        case 'plugin:autostart|is_enabled':
          return false;
        case 'plugin:autostart|enable':
        case 'plugin:autostart|disable':
          return;
        case 'plugin:updater|check':
          return null;
        case 'plugin:http|fetch': {
          const rid = next++;
          const client = args.clientConfig as {
            url: string;
            method: string;
            data: number[] | null;
          };
          clients.set(rid, client);
          state.requests.push({
            url: client.url,
            body: client.data
              ? JSON.parse(new TextDecoder().decode(new Uint8Array(client.data)))
              : null,
          });
          return rid;
        }
        case 'plugin:http|fetch_send': {
          const rid = Number(args.rid),
            client = clients.get(rid)!;
          let content: string;
          if (client.method === 'GET')
            content = JSON.stringify(
              client.url.endsWith('/api/tags')
                ? { models: [{ name: 'local-writer' }] }
                : { data: [{ id: 'my-lm-model' }] },
            );
          else {
            const answer =
              'Could you share a brief project update? I’d like to confirm we’re on track for Friday. Thank you.';
            content = client.url.endsWith('/api/generate')
              ? JSON.stringify({ response: answer, done: true }) + '\n'
              : 'data: ' +
                JSON.stringify({
                  choices: [{ delta: { content: answer }, finish_reason: 'stop' }],
                }) +
                '\n\n';
          }
          bodies.set(rid, new TextEncoder().encode(content));
          return {
            status: mode === 'error' ? 503 : 200,
            statusText: 'OK',
            url: client.url,
            headers: [['content-type', 'text/event-stream']],
            rid,
          };
        }
        case 'plugin:http|fetch_read_body': {
          if (mode === 'slow') await new Promise((resolve) => setTimeout(resolve, 1000));
          const rid = Number(args.rid),
            body = bodies.get(rid);
          if (!body) return [1];
          bodies.delete(rid);
          return [...body, 0];
        }
        case 'plugin:http|fetch_cancel':
        case 'plugin:http|fetch_cancel_body':
          return;
        default:
          throw new Error('Unexpected PhrasePoP demo command: ' + command);
      }
    },
    { shouldMockEvents: true },
  );
}
