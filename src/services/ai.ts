import { invoke } from '@tauri-apps/api/core';

export interface AIConfig {
    provider: 'Ollama' | 'OpenAI';
    ollamaUrl: string;
    model: string;
    openAiKey: string;
    persona: string;
}

export type GenerationMode = 'Professional' | 'Friendly' | 'Concise' | 'Academic' | 'Pirate' | 'GenZ' | 'Sarcastic' | 'Persuasive' | 'Shakespeare' | 'Yoda' | 'SmartReply';

const getToneDescription = (mode: GenerationMode) => {
    switch (mode) {
        case 'Professional': return "clear, professional, polished, and corporate without sounding robotic";
        case 'Friendly': return "warm, approachable, empathetic, and highly conversational";
        case 'Concise': return "extremely brief, direct, and to the point, removing all unnecessary fluff";
        case 'Academic': return "formal, precise, well-structured, using sophisticated vocabulary and an objective tone";
        case 'Pirate': return "like a stereotypical pirate, using heavy nautical slang, 'arr's, and pirate vernacular";
        case 'GenZ': return "highly fluent in internet slang, using Gen Z terminology natively without sounding forced (e.g. 'no cap', 'bet', 'vibes', 'fr')";
        case 'Sarcastic': return "incredibly dry, cynical, and sarcastic, as if you are exhausted by the universe";
        case 'Persuasive': return "highly convincing, structured, and sales-oriented, designed to make the reader agree with you";
        case 'Shakespeare': return "written like an authentic William Shakespeare play, using Early Modern English and poetic meter where appropriate";
        case 'Yoda': return "like Yoda from Star Wars, speaking in Object-Subject-Verb (OSV) word order and using Jedi-like wisdom";
        default: return mode;
    }
};

const buildPrompt = (text: string, mode: GenerationMode, persona: string) => {
    if (mode === 'SmartReply') {
        return `You are an AI assistant helping draft a direct reply on behalf of the user.
Here is the user's personal context and persona:
<persona>
${persona}
</persona>

Draft a natural response to the following incoming text. 

CRITICAL RULES:
1. Adopt the user's persona perfectly.
2. OUTPUT ONLY THE DIRECT REPLY. Absolutely no introductory text, no explanations, no conversational filler (e.g. do not say "Here is a reply:" or "Sure!").
3. DO NOT wrap your response in quotes.
4. Keep it relevant and to the point.

Incoming text:
"${text}"`;
    }

    const toneDescription = getToneDescription(mode);

    return `You are an expert copywriter. Your task is to rephrase the provided text to be ${toneDescription}.

CRITICAL RULES:
1. OUTPUT ONLY THE REPHRASED TEXT. Absolutely no introductory text, no explanations, no conversational filler (e.g. do not say "Here is the rephrased version:" or "Certainly!").
2. DO NOT wrap your response in quotes.
3. Preserve the original meaning and core information exactly.
4. Do not use markdown or formatting unless the original text used it.

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
