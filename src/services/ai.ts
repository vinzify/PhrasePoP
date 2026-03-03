import { invoke } from '@tauri-apps/api/core';

export interface AIConfig {
    provider: 'Ollama' | 'OpenAI';
    ollamaUrl: string;
    model: string;
    openAiKey: string;
    persona: string;
}

export type GenerationMode = 'Professional' | 'Friendly' | 'Concise' | 'Academic' | 'Pirate' | 'SmartReply';

const buildPrompt = (text: string, mode: GenerationMode, persona: string) => {
    if (mode === 'SmartReply') {
        return `You are acting as the user with the following persona context:
${persona}

Please draft a response to the following incoming message/email. Adopt the user's persona perfectly, and only output the final reply without any conversational filler or introductory text.

Message to reply to:
"${text}"`;
    }

    return `Please rephrase the following text to sound more ${mode}. Only output the final rephrased version without any conversational filler or quotation marks.

Text to rephrase:
"${text}"`;
};

export async function generateAI(
    text: string,
    mode: GenerationMode,
    config: AIConfig,
    onChunk: (chunk: string) => void
): Promise<void> {
    const prompt = buildPrompt(text, mode, config.persona);

    if (config.provider === 'Ollama') {
        try {
            const response = await invoke<string>('generate_ollama', {
                ollamaUrl: config.ollamaUrl,
                model: config.model || 'llama3',
                prompt: prompt
            });
            onChunk(response);
        } catch (e: any) {
            const errorMsg = typeof e === 'string' ? e : (e?.message || JSON.stringify(e));
            throw new Error(errorMsg);
        }
    } else {
        // OpenAI Integration
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.openAiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                stream: true,
            })
        });

        if (!response.ok) throw new Error(`OpenAI Error: ${response.statusText}`);

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader stream");

        const decoder = new TextDecoder("utf-8");
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\\n').filter(line => line.trim().startsWith('data: '));
            for (const line of lines) {
                const dataStr = line.replace('data: ', '').trim();
                if (dataStr === '[DONE]') return;
                try {
                    const parsed = JSON.parse(dataStr);
                    const content = parsed.choices[0]?.delta?.content;
                    if (content) onChunk(content);
                } catch (e) {
                    // Ignore malformed chunks
                }
            }
        }
    }
}
