import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Copy, Loader2, CheckCircle2, MessageSquareText } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { generateAI, type GenerationMode } from '../services/ai';

interface MainViewProps {
    onOpenSettings: () => void;
    initialText: string;
}

export default function MainView({ onOpenSettings, initialText }: MainViewProps) {
    const [inputText, setInputText] = useState(initialText);
    const [outputText, setOutputText] = useState('');
    const [tone, setTone] = useState('Professional');
    const [isGenerating, setIsGenerating] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('phrasepop-settings');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.defaultTone) {
                    setTone(parsed.defaultTone);
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
    }, []);

    useEffect(() => {
        setInputText(initialText || '');
        setOutputText(''); // Reset output when new text arrives
    }, [initialText]);

    const handleGenerate = async () => {
        if (!inputText) return;
        setIsGenerating(true);
        setOutputText(''); // clear out old output

        try {
            const saved = localStorage.getItem('phrasepop-settings');
            let config = {
                provider: 'Ollama' as 'Ollama' | 'OpenAI',
                ollamaUrl: 'http://localhost:11434',
                model: 'llama3',
                openAiKey: '',
                persona: ''
            };

            if (saved) {
                const parsed = JSON.parse(saved);
                config = { ...config, ...parsed };
                // Fallbacks if older storage state left them strictly undefined/empty
                if (!config.ollamaUrl) config.ollamaUrl = 'http://localhost:11434';
                if (!config.model) config.model = 'llama3';
                if (!config.provider || (config.provider !== 'OpenAI' && config.provider !== 'Ollama')) {
                    config.provider = 'Ollama';
                }
            }

            await generateAI(inputText, tone as GenerationMode, config, (chunk) => {
                setOutputText(prev => prev + chunk);
            });
        } catch (err: any) {
            console.error(err);
            setOutputText(prev => prev + `\\n\\n[Error: ${err.message}]`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopy = async () => {
        try {
            if (outputText) {
                await invoke('set_clipboard', { text: outputText });
            } else if (inputText) {
                await invoke('set_clipboard', { text: inputText });
            }
            setCopied(true);
            setTimeout(async () => {
                setCopied(false);
                await invoke('hide_window'); // Hide after copy
            }, 1000);
        } catch (err) {
            console.error("Failed to copy", err);
        }
    };

    return (
        <>
            <div className="header" onMouseDown={() => getCurrentWindow().startDragging()}>
                <div className="title-area">
                    <h1>phrasePop</h1>
                    <p>Highlight text anywhere, press Ctrl+Alt+C</p>
                </div>
                <button className="icon-btn" onClick={onOpenSettings} title="Settings">
                    <SettingsIcon size={20} color="rgba(255,255,255,0.7)" />
                </button>
            </div>

            <div className="text-io-container">
                <div className="io-box">
                    <span className="io-label">Context / Original Text</span>
                    <textarea
                        className="io-textarea"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Waiting for text... (Highlight and press Ctrl+Alt+C)"
                    />
                </div>

                <div className="io-box">
                    <span className="io-label">AI Response</span>
                    <textarea
                        className="io-textarea"
                        value={outputText}
                        readOnly
                        placeholder="AI output will stream here..."
                    />
                </div>
            </div>

            <div className="action-bar">
                <div className="tone-selector">
                    <select
                        value={tone}
                        onChange={(e) => setTone(e.target.value)}
                        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', borderRadius: '6px', padding: '6px 10px', outline: 'none' }}
                    >
                        <option value="Professional">💼 Professional & Clear</option>
                        <option value="Friendly">😊 Warm & Friendly</option>
                        <option value="Concise">✂️ Concise & Direct</option>
                        <option value="Persuasive">🤝 Sales & Persuasive</option>
                        <option value="Academic">🎓 Academic & Formal</option>
                        <option value="GenZ">📱 Gen Z Intern</option>
                        <option value="Sarcastic">😒 Dry & Sarcastic</option>
                        <option value="Pirate">🏴‍☠️ Pirate (Fun)</option>
                        <option value="Shakespeare">🎭 Shakespeare</option>
                        <option value="Yoda">👽 Master Yoda</option>
                        <option value="SmartReply">💬 Smart Reply (Persona)</option>
                    </select>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="secondary-btn" onClick={handleCopy} disabled={!inputText && !outputText}>
                        {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                        <span>{copied ? 'Copied & Hidden' : 'Copy'}</span>
                    </button>
                    <button className="primary-btn" onClick={handleGenerate} disabled={!inputText || isGenerating}>
                        {isGenerating ? <Loader2 size={16} className="spinning" /> : <MessageSquareText size={16} />}
                        <span>{isGenerating ? 'Generating...' : 'Enhance'}</span>
                    </button>
                </div>
            </div>
        </>
    );
}
