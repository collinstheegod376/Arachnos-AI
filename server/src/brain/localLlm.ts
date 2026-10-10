export interface LocalLlmOptions {
  host?: string;
  model?: string;
  timeoutMs?: number;
}

export class LocalLlmClient {
  private readonly host: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: LocalLlmOptions = {}) {
    this.host = options.host || process.env.OLLAMA_HOST || 'http://localhost:11434';
    this.model = options.model || process.env.OLLAMA_MODEL || 'llama3.1';
    this.timeoutMs = options.timeoutMs ?? 4000;
  }

  /**
   * Checks if local Ollama daemon is reachable
   */
  public async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${this.host}/api/tags`, {
        signal: controller.signal
      });
      clearTimeout(id);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Generate answer using Ollama with RAG grounding prompt
   */
  public async generateAnswer(
    query: string,
    contextChunks: { content: string; source_url: string; selector?: string }[]
  ): Promise<string | null> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), this.timeoutMs);

      const contextText = contextChunks
        .map((c, i) => `[Source ${i + 1}: ${c.source_url} (${c.selector || 'DOM'})]\n${c.content}`)
        .join('\n\n');

      const systemPrompt = `You are Arachnos Personal, a private local AI companion living in the user's browser.
You answer the user's questions based strictly on the browsing history and memories provided below.
Rules:
- Be concise, accurate, and direct.
- Cite the source URLs when stating facts.
- If the answer is not in the context, clearly say so.
- Never make up information outside the provided memory context.`;

      const prompt = `User Question: "${query}"\n\nMemories & Browsing Context:\n${contextText}\n\nAnswer:`;

      const res = await fetch(`${this.host}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          system: systemPrompt,
          stream: false,
          options: {
            temperature: 0.2,
            top_p: 0.9,
          }
        }),
        signal: controller.signal
      });

      clearTimeout(id);

      if (!res.ok) return null;
      const data: any = await res.json();
      return data.response ? data.response.trim() : null;
    } catch {
      return null;
    }
  }
}
