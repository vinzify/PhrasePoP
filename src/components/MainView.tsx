import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowRight, ClipboardPaste, Copy, Check, Square, Sparkles } from 'lucide-react';
import { generateAI } from '../services/ai';
import { errorText, modes, type AIConfig, type GenerationMode } from '../domain';

export default function MainView({
  config,
  request,
  onOpenSettings,
}: {
  config: AIConfig;
  request: number;
  onOpenSettings: () => void;
}) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [tone, setTone] = useState<GenerationMode>(config.defaultTone);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const inputRef = useRef(input);
  inputRef.current = input;
  useEffect(() => {
    setTone(config.defaultTone);
  }, [config.defaultTone]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    let disposed = false;
    if (request > 0) {
      if (busyRef.current || inputRef.current.trim())
        setNotice(
          'Clipboard requested. Your existing draft is safe; use Paste from clipboard when ready.',
        );
      else
        void invoke<string>('read_clipboard')
          .then((text) => {
            if (!disposed) {
              if (text.length > 50_000) setNotice('Use an excerpt of up to 50,000 characters.');
              else if (!inputRef.current.trim() && !busyRef.current) setInput(text);
              else
                setNotice('Your draft changed while reading the clipboard. It was not replaced.');
            }
          })
          .catch((error) => {
            if (!disposed) setNotice(errorText(error));
          });
    }
    return () => {
      disposed = true;
    };
  }, [request]);
  async function paste() {
    if (busyRef.current) return;
    if (input.trim()) {
      setNotice(
        'Clear the input before importing another clipboard item, or paste directly into the text field.',
      );
      return;
    }
    setNotice('');
    try {
      const text = await invoke<string>('read_clipboard');
      if (text.length > 50_000) throw new Error('Use an excerpt of up to 50,000 characters.');
      if (inputRef.current.trim() || busyRef.current)
        throw new Error('Your draft changed while reading the clipboard. It was not replaced.');
      setInput(text);
      setOutput('');
    } catch (error) {
      setNotice(errorText(error));
    }
  }
  async function generate() {
    if (busyRef.current || !input.trim()) return;
    busyRef.current = true;
    setBusy(true);
    setOutput('');
    setNotice('');
    setCopied(false);
    const current = new AbortController();
    controller.current = current;
    try {
      await generateAI(
        input,
        tone,
        config,
        (chunk) => {
          if (!current.signal.aborted) setOutput((value) => value + chunk);
        },
        current.signal,
      );
      if (!current.signal.aborted) setNotice('Ready to review. Nothing was copied automatically.');
    } catch (error) {
      setNotice(
        current.signal.aborted ? 'Stopped. Any partial text is kept for review.' : errorText(error),
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await invoke('set_clipboard', { text: output });
      setCopied(true);
      setNotice('Result copied. Your source text is unchanged.');
    } catch (error) {
      setNotice(errorText(error));
    }
  }
  return (
    <main className="writing-main">
      <section className="intro">
        <span className="eyebrow">WORDS, WITH A LITTLE MORE INTENTION</span>
        <h1>
          Your thought.
          <br />
          <em>A clearer expression.</em>
        </h1>
        <p>
          A rewrite, a warmer tone, or a reply that sounds like you.
          <br />
          Keep the meaning. Lose the friction.
        </p>
      </section>
      <div className="workspace-bar">
        <div className="mode-picker">
          <label htmlFor="writing-mode">MAKE IT</label>
          <select
            id="writing-mode"
            value={tone}
            disabled={busy}
            onChange={(event) => setTone(event.target.value as GenerationMode)}
          >
            {modes.map((mode) => (
              <option key={mode} value={mode}>
                {mode === 'SmartReply' ? 'A reply in my voice' : mode}
              </option>
            ))}
          </select>
        </div>
        <span className="provider-label">
          {config.provider} <span> / </span>
          {config.model || 'No model selected'}
        </span>
      </div>
      <div className="writing-workspace">
        <section className="text-panel source-panel">
          <div className="panel-heading">
            <label htmlFor="source-text">
              <span className="panel-index">01</span> Your words
            </label>
            <button className="text-button" disabled={busy} onClick={paste}>
              <ClipboardPaste size={14} />
              Paste from clipboard
            </button>
          </div>
          <textarea
            id="source-text"
            aria-label="Your words"
            value={input}
            disabled={busy}
            maxLength={50_000}
            onChange={(event) => {
              setInput(event.target.value);
              setOutput('');
              setCopied(false);
              setNotice('');
            }}
            placeholder="Paste something that could use a little clarity…"
            spellCheck
          />
          <div className="panel-footer">
            <span>{[...input].length.toLocaleString()} characters</span>
            <button
              className="text-button"
              disabled={busy || !input}
              onClick={() => {
                setInput('');
                setOutput('');
                setNotice('');
              }}
            >
              Clear input
            </button>
          </div>
        </section>
        <section className="text-panel result-panel">
          <div className="panel-heading">
            <label htmlFor="result-text">
              <span className="panel-index">02</span> A fresh take
            </label>
            <span className="result-state">
              {busy ? 'WRITING…' : output ? 'YOURS TO REVIEW' : 'NOTHING SENT YET'}
            </span>
          </div>
          <textarea
            id="result-text"
            aria-label="A fresh take"
            value={output}
            readOnly
            placeholder="A clearer version will appear here. You’re always the editor."
            spellCheck={false}
          />
          <div className="panel-footer">
            <span>
              {output
                ? [...output].length.toLocaleString() + ' characters'
                : 'Your source stays intact'}
            </span>
            <button className="text-button" disabled={busy || !output} onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy result'}
            </button>
          </div>
        </section>
      </div>
      <div className="writing-actions">
        <p className="privacy-note">
          Text is sent only when you click Improve,
          <br />
          to the provider you choose. No automatic clipboard changes.
        </p>
        {!config.model && (
          <button className="secondary" onClick={onOpenSettings}>
            Choose a model
          </button>
        )}
        {busy ? (
          <button className="primary stop-button" onClick={() => controller.current?.abort()}>
            <Square size={14} />
            Stop generating
          </button>
        ) : (
          <button className="primary" disabled={!input.trim() || !config.model} onClick={generate}>
            <Sparkles size={16} />
            {tone === 'SmartReply' ? 'Draft a reply' : 'Improve this text'}
            <ArrowRight size={16} />
          </button>
        )}
      </div>
      {notice && (
        <p className="feedback" role="status">
          {notice}
        </p>
      )}
    </main>
  );
}
