// SSE/NDJSON framing is independent of network chunk boundaries and UTF-8 byte boundaries.
export async function readStream(
  body: ReadableStream<Uint8Array>,
  format: 'sse' | 'ndjson',
  onChunk: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '',
    eventData: string[] = [],
    complete = false,
    bytes = 0,
    outputLength = 0;
  function dispatch(raw: string) {
    if (raw === '[DONE]') {
      complete = true;
      return;
    }
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new Error('The provider sent a malformed stream event. Partial text is preserved.');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('The provider sent a malformed stream event. Partial text is preserved.');
    if (value.error)
      throw new Error(
        typeof value.error === 'string' ? value.error : 'The provider reported a generation error.',
      );
    const choice = value.choices?.[0];
    if (choice?.delta?.refusal) throw new Error('The provider declined this request.');
    const text = format === 'ndjson' ? value.response : choice?.delta?.content;
    if (typeof text === 'string' && text) {
      outputLength += text.length;
      if (outputLength > 64_000)
        throw new Error('The response exceeded the 64,000-character preview limit.');
      onChunk(text);
    }
    if (choice?.finish_reason && choice.finish_reason !== 'stop')
      throw new Error(
        'Generation ended with ' + choice.finish_reason + '. Partial text is preserved.',
      );
    if (value.done === true || choice?.finish_reason === 'stop') complete = true;
  }
  function line(text: string) {
    text = text.replace(/\r$/, '');
    if (format === 'ndjson') {
      if (text.trim()) dispatch(text);
    } else if (text === '') {
      if (eventData.length) {
        dispatch(eventData.join('\n'));
        eventData = [];
      }
    } else if (text.startsWith('data:')) eventData.push(text.slice(5).replace(/^ /, ''));
  }
  try {
    while (!complete) {
      if (signal.aborted) throw new Error('Request cancelled.');
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer) line(buffer);
        if (eventData.length) dispatch(eventData.join('\n'));
        break;
      }
      bytes += value.byteLength;
      if (bytes > 2_000_000) throw new Error('The provider stream exceeded the 2 MB safety limit.');
      buffer += decoder.decode(value, { stream: true });
      let index;
      while (!complete && (index = buffer.indexOf('\n')) !== -1) {
        line(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
      }
    }
    if (signal.aborted) throw new Error('Request cancelled.');
    if (!complete)
      throw new Error('Connection ended before generation completed. Partial text is preserved.');
    if (!outputLength) throw new Error('The provider returned no text.');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
