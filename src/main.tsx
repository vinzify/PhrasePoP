import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { loadSettings } from './domain';

async function start() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
    const { setupDemo } = await import('./demo');
    setupDemo();
  }
  try {
    document.documentElement.dataset.theme = loadSettings(
      localStorage.getItem('phrasepop-settings'),
    ).theme;
  } catch {
    document.documentElement.dataset.theme = 'dark';
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void start();
