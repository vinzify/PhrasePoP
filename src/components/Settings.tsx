import { useState, useEffect } from 'react';
import { ArrowLeft, Save } from 'lucide-react';

interface SettingsProps {
    onBack: () => void;
}

export default function Settings({ onBack }: SettingsProps) {
    const [provider, setProvider] = useState('Ollama');
    const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434');
    const [model, setModel] = useState('llama3');
    const [openAiKey, setOpenAiKey] = useState('');
    const [persona, setPersona] = useState('Name: User\\nRole: Professional\\nStyle: Direct, concise, polite.');

    useEffect(() => {
        // Load settings from local storage
        const saved = localStorage.getItem('phrasepop-settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            setProvider(parsed.provider || 'Ollama');
            setOllamaUrl(parsed.ollamaUrl || 'http://localhost:11434');
            setModel(parsed.model || 'llama3');
            setOpenAiKey(parsed.openAiKey || '');
            setPersona(parsed.persona || 'Name: User\\nRole: Professional\\nStyle: Direct, concise, polite.');
        }
    }, []);

    const handleSave = () => {
        localStorage.setItem('phrasepop-settings', JSON.stringify({
            provider,
            ollamaUrl,
            model,
            openAiKey,
            persona
        }));
        onBack();
    };

    return (
        <>
            <div className="header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button className="icon-btn" onClick={onBack}>
                        <ArrowLeft size={20} color="rgba(255,255,255,0.7)" />
                    </button>
                    <div className="title-area">
                        <h1>Settings</h1>
                        <p>Configure AI Providers and Personal Context</p>
                    </div>
                </div>
            </div>

            <div className="settings-grid" style={{ overflowY: 'auto', maxHeight: '400px', paddingRight: '8px' }}>
                <div className="settings-group">
                    <label>AI Provider</label>
                    <select value={provider} onChange={e => setProvider(e.target.value)}>
                        <option value="Ollama">Ollama (Local/Privacy)</option>
                        <option value="OpenAI">OpenAI</option>
                    </select>
                </div>

                {provider === 'Ollama' ? (
                    <>
                        <div className="settings-group fade-in-up">
                            <label>Ollama Base URL</label>
                            <input value={ollamaUrl} onChange={e => setOllamaUrl(e.target.value)} />
                        </div>
                        <div className="settings-group fade-in-up">
                            <label>Ollama Model Name</label>
                            <input value={model} onChange={e => setModel(e.target.value)} />
                        </div>
                    </>
                ) : (
                    <div className="settings-group fade-in-up">
                        <label>OpenAI API Key</label>
                        <input type="password" value={openAiKey} onChange={e => setOpenAiKey(e.target.value)} placeholder="sk-..." />
                    </div>
                )}

                <div className="settings-group fade-in-up" style={{ marginTop: '8px' }}>
                    <label>Smart Reply Persona Context</label>
                    <textarea
                        value={persona}
                        onChange={e => setPersona(e.target.value)}
                        placeholder="Tell the AI who you are so it can reply as you..."
                        style={{ minHeight: '120px', resize: 'vertical' }}
                    />
                </div>
            </div>

            <div className="action-bar" style={{ justifyContent: 'flex-end', marginTop: '16px' }}>
                <button className="primary-btn" onClick={handleSave}>
                    <Save size={16} />
                    <span>Save Configuration</span>
                </button>
            </div>
        </>
    );
}
