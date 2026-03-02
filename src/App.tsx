import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import MainView from './components/MainView';
import Settings from './components/Settings';
import './App.css';

function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [capturedText, setCapturedText] = useState('');

  useEffect(() => {
    // Listen for the global shortcut trigger
    const unlisten = listen('open-phrase-pop', async () => {
      try {
        const text = await invoke<string>('capture_text');
        if (text) {
          setCapturedText(text);
          setShowSettings(false); // Make sure main view is showing
        }
      } catch (err) {
        console.error('Failed to capture text', err);
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, []);

  return (
    <div className="app-container">
      <div className="glass-panel fade-in-up">
        {showSettings ? (
          <Settings onBack={() => setShowSettings(false)} />
        ) : (
          <MainView 
            onOpenSettings={() => setShowSettings(true)} 
            initialText={capturedText} 
          />
        )}
      </div>
    </div>
  );
}

export default App;
