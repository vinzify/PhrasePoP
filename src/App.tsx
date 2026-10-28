import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { Settings2 } from 'lucide-react';
import MainView from './components/MainView';
import Settings from './components/Settings';
import { loadSettings, type DesktopInfo } from './domain';
import './App.css';

export default function App() {
  const [config, setConfig] = useState(() => {
    try {
      return loadSettings(localStorage.getItem('phrasepop-settings'));
    } catch {
      return loadSettings(null);
    }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [request, setRequest] = useState(0);
  const [version, setVersion] = useState('');
  const [desktop, setDesktop] = useState<DesktopInfo>({
    platform: '',
    wayland: false,
    shortcut_supported: false,
    shortcut: '',
    shortcut_note: 'Checking desktop capabilities…',
    clipboard_requested: false,
  });
  const [startupError, setStartupError] = useState('');
  useEffect(() => {
    document.documentElement.dataset.theme = config.theme;
  }, [config.theme]);
  useEffect(() => {
    let disposed = false;
    const cleanup: (() => void)[] = [];
    for (const [name, handler] of [
      [
        'clipboard-requested',
        () => {
          setShowSettings(false);
          setRequest((value) => value + 1);
        },
      ],
      ['open-settings', () => setShowSettings(true)],
    ] as const) {
      void listen(name, handler)
        .then((unlisten) => {
          if (disposed) unlisten();
          else cleanup.push(unlisten);
        })
        .catch(() => {});
    }
    void Promise.all([invoke<DesktopInfo>('get_desktop_info'), getVersion()])
      .then(([info, current]) => {
        if (disposed) return;
        setDesktop(info);
        setVersion(current);
        if (info.clipboard_requested) setRequest((value) => value + 1);
      })
      .catch(() => {
        if (!disposed)
          setStartupError('Desktop integration is unavailable. You can still paste and edit text.');
      });
    return () => {
      disposed = true;
      cleanup.forEach((unlisten) => unlisten());
    };
  }, []);
  return (
    <div className="writing-app">
      <header className="app-heading">
        <div className="wordmark">
          <span className="brand-square">
            P<span>↗</span>
          </span>
          <strong>
            PhrasePoP<span>.</span>
          </strong>
          <span className="app-tagline">A LITTLE CLARITY GOES A LONG WAY</span>
        </div>
        <button className="icon-button" aria-label="Settings" onClick={() => setShowSettings(true)}>
          <Settings2 size={19} />
        </button>
      </header>
      {startupError && (
        <p className="notice" role="status">
          {startupError}
        </p>
      )}
      <MainView config={config} request={request} onOpenSettings={() => setShowSettings(true)} />
      <footer className="app-footer">
        <span className="status-dot" />
        {desktop.wayland ? 'Wayland · clipboard-first' : desktop.platform || 'Desktop'}
        <span className="footer-right">
          NO BACKGROUND CLIPBOARD WATCHING <span>v{version || '—'}</span>
        </span>
      </footer>
      {showSettings && (
        <Settings
          config={config}
          desktop={desktop}
          onClose={() => setShowSettings(false)}
          onSave={setConfig}
          onDesktop={setDesktop}
        />
      )}
    </div>
  );
}
