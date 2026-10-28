import { fetch as nativeFetch } from '@tauri-apps/plugin-http';
import { buildPrompt, endpoint, type AIConfig, type GenerationMode } from '../domain';
import { readStream } from './stream';

export function baseURL(config: AIConfig): string {
  const base =
    config.provider === 'OpenAI'
      ? endpoint('OpenAI')
      : config.ollamaUrl.trim() || endpoint(config.provider);
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error('Enter a complete http:// or https:// provider endpoint.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Use an HTTP(S) endpoint without credentials in its URL.');
  return base.replace(/\/+$/, '');
}

export async function getModels(config: AIConfig, signal?: AbortSignal): Promise<string[]> {
  const base = baseURL(config);
  const response = await nativeFetch(
    base + (config.provider === 'Ollama' ? '/api/tags' : '/models'),
    {
      signal,
      connectTimeout: 10_000,
      headers: config.openAiKey ? { Authorization: 'Bearer ' + config.openAiKey } : {},
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      'Model discovery returned HTTP ' + response.status + '. Check the endpoint and server.',
    );
  }
  const data = await response.json();
  const items = config.provider === 'Ollama' ? data.models : data.data;
  if (!Array.isArray(items)) throw new Error('The provider returned no model list.');
  return [
    ...new Set<string>(
      items
        .filter(
          (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object',
        )
        .map((item: Record<string, unknown>) => item[config.provider === 'Ollama' ? 'name' : 'id'])
        .filter((id: unknown): id is string => typeof id === 'string'),
    ),
  ]
    .sort()
    .slice(0, 500);
}

export async function generateAI(
  text: string,
  mode: GenerationMode,
  config: AIConfig,
  onChunk: (text: string) => void,
  signal: AbortSignal,
  fetcher: typeof fetch = nativeFetch,
): Promise<void> {
  if (!text.trim()) throw new Error('Paste or write some text first.');
  if (text.length > 50_000) throw new Error('Use an excerpt of up to 50,000 characters.');
  if (!config.model.trim()) throw new Error('Choose a model in Settings first.');
  if (config.provider === 'OpenAI' && !config.openAiKey.trim())
    throw new Error('Enter your API key in Settings for this session.');
  const base = baseURL(config);
  const ollama = config.provider === 'Ollama';
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 120_000);
  try {
    const prompt = buildPrompt(text, mode, config.persona);
    const response = await fetcher(base + (ollama ? '/api/generate' : '/chat/completions'), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(config.openAiKey ? { Authorization: 'Bearer ' + config.openAiKey } : {}),
      },
      body: JSON.stringify(
        ollama
          ? { model: config.model, prompt, stream: true }
          : {
              model: config.model,
              messages: [{ role: 'user', content: prompt }],
              stream: true,
            },
      ),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        'Provider returned HTTP ' + response.status + '. Check the endpoint, model, and API key.',
      );
    }
    if (!response.body) throw new Error('The provider returned no response body.');
    await readStream(response.body, ollama ? 'ndjson' : 'sse', onChunk, controller.signal);
  } catch (error) {
    if (timedOut)
      throw new Error(
        'The provider did not finish within two minutes. Check the local server or try a smaller model.',
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
