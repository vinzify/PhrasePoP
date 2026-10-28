import { useEffect, useRef, useState, type FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isEnabled, enable, disable } from '@tauri-apps/plugin-autostart';
import { X } from 'lucide-react';
import { getModels } from '../services/ai';
import {
  endpoint,
  errorText,
  persistedSettings,
  type AIConfig,
  type DesktopInfo,
  type Provider,
} from '../domain';

export default function Settings({
  config,
  desktop,
  onClose,
  onSave,
  onDesktop,
}: {
  config: AIConfig;
  desktop: DesktopInfo;
  onClose: () => void;
  onSave: (config: AIConfig) => void;
  onDesktop: (desktop: DesktopInfo) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(config);
  const [models, setModels] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [shortcut, setShortcut] = useState(desktop.shortcut);
  const [update, setUpdate] = useState<Update | null>(null);
  const requests = useRef<AbortController | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
    void isEnabled()
      .then(setAutostart)
      .catch(() => {});
    return () => requests.current?.abort();
  }, []);
  async function task(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      await work();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    try {
      localStorage.setItem('phrasepop-settings', persistedSettings(draft));
      onSave(draft);
      onClose();
    } catch {
      setNotice('Settings could not be saved. Nothing was overwritten; check disk access.');
    }
  }
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="settings-heading">
        <div>
          <span className="eyebrow">YOUR WORDS, YOUR WORKFLOW</span>
          <h2 id="settings-title">Make yourself at home.</h2>
        </div>
        <button className="icon-button" aria-label="Close settings" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <form onSubmit={save}>
        <section className="settings-section">
          <h3>Appearance</h3>
          <label>
            Theme
            <select
              aria-label="Theme"
              value={draft.theme}
              onChange={(event) =>
                setDraft({ ...draft, theme: event.target.value as 'dark' | 'light' })
              }
            >
              <option value="dark">Dark · default</option>
              <option value="light">Light</option>
            </select>
          </label>
          <p className="small">
            Saved on this device. Dark is the default, regardless of your system theme.
          </p>
        </section>
        <section className="settings-section">
          <h3>Your AI provider</h3>
          <p>
            Local models stay on the endpoint you configure. Cloud services receive your input when
            you request a rewrite.
          </p>
          <label>
            Provider
            <select
              aria-label="Provider"
              value={draft.provider}
              disabled={busy}
              onChange={(event) => {
                const provider = event.target.value as Provider;
                setDraft({
                  ...draft,
                  provider,
                  ollamaUrl: endpoint(provider),
                  model: '',
                  openAiKey: '',
                });
                setModels([]);
              }}
            >
              <option>Ollama</option>
              <option>LM Studio</option>
              <option>OpenAI</option>
              <option>Compatible</option>
            </select>
          </label>
          {draft.provider !== 'OpenAI' && (
            <label>
              Endpoint
              <input
                type="url"
                value={draft.ollamaUrl}
                disabled={busy}
                onChange={(event) => setDraft({ ...draft, ollamaUrl: event.target.value })}
                placeholder={endpoint(draft.provider) || 'https://your-provider.example/v1'}
              />
            </label>
          )}
          <div className="settings-field">
            <label htmlFor="model-id">Model ID</label>
            <div className="field-row">
              <input
                id="model-id"
                value={draft.model}
                list="model-options"
                disabled={busy}
                placeholder="Your provider’s model ID"
                onChange={(event) => setDraft({ ...draft, model: event.target.value })}
              />
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() =>
                  task(async () => {
                    const controller = new AbortController();
                    requests.current = controller;
                    const timer = setTimeout(() => controller.abort(), 15_000);
                    try {
                      const found = await getModels(draft, controller.signal);
                      setModels(found);
                      setNotice(
                        found.length
                          ? 'Models loaded. Pick one or enter its ID.'
                          : 'No models found. Load one in your local server first.',
                      );
                    } finally {
                      clearTimeout(timer);
                    }
                  })
                }
              >
                {busy ? 'Please wait…' : 'Find models'}
              </button>
            </div>
          </div>
          <datalist id="model-options">
            {models.map((model) => (
              <option key={model} value={model} />
            ))}
          </datalist>
          <label>
            API key · this session only
            <input
              type="password"
              autoComplete="off"
              value={draft.openAiKey}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, openAiKey: event.target.value })}
              placeholder={
                draft.provider === 'Ollama' || draft.provider === 'LM Studio'
                  ? 'Optional for local servers'
                  : 'Your provider API key'
              }
            />
          </label>
          <p className="small">
            API keys are held in memory. Saving removes any legacy plaintext key from local
            settings. OS-keychain storage is not included yet.
          </p>
        </section>
        <section className="settings-section">
          <h3>For replies that sound like you</h3>
          <label>
            Your context
            <textarea
              rows={3}
              value={draft.persona}
              onChange={(event) => setDraft({ ...draft, persona: event.target.value })}
              placeholder="Your role, preferred style, or context for replies."
              maxLength={5000}
            />
          </label>
          <p className="small">Saved locally. Included only when using “A reply in my voice”.</p>
        </section>
        <section className="settings-section">
          <h3>Desktop workflow</h3>
          <p>{desktop.shortcut_note}</p>
          {desktop.shortcut_supported ? (
            <div className="field-row">
              <label>
                Global shortcut
                <input value={shortcut} onChange={(event) => setShortcut(event.target.value)} />
              </label>
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() =>
                  task(async () => {
                    await invoke('set_shortcut', { shortcut });
                    onDesktop({ ...desktop, shortcut });
                    setNotice('Shortcut saved. Copy text first, then use the shortcut.');
                  })
                }
              >
                Apply shortcut
              </button>
            </div>
          ) : (
            <code>phrasepop --clipboard</code>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={autostart}
              disabled={busy}
              onChange={(event) => {
                const checked = event.target.checked;
                void task(async () => {
                  if (checked) await enable();
                  else await disable();
                  setAutostart(checked);
                });
              }}
            />
            Start in the tray when I sign in
          </label>
        </section>
        <section className="settings-section">
          <h3>Updates</h3>
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={() =>
              task(async () => {
                const available = await check();
                setUpdate(available);
                setNotice(
                  available
                    ? 'Version ' + available.version + ' is available.'
                    : 'You are on the latest available release.',
                );
              })
            }
          >
            Check for updates
          </button>
          {update && (
            <button
              className="primary"
              type="button"
              disabled={busy}
              onClick={() =>
                task(async () => {
                  await update.downloadAndInstall();
                  await relaunch();
                })
              }
            >
              Install v{update.version} &amp; restart
            </button>
          )}
        </section>
        {notice && (
          <p role="status" className="feedback">
            {notice}
          </p>
        )}
        <div className="settings-footer">
          <span>Local preferences. No account.</span>
          <button className="primary" type="submit" disabled={busy}>
            Save settings
          </button>
        </div>
      </form>
    </dialog>
  );
}
