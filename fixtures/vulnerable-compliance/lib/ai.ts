import OpenAI from "openai";
import { createDeepSeek } from "@ai-sdk/deepseek";

const openai = new OpenAI();
export const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY });

const SYSTEM_PROMPT = "You are a paralegal assistant. Summarise the matter documents.";

export async function summarise(text: string) {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
  });
  return res.choices[0].message.content;
}

export async function embed(text: string) {
  return openai.embeddings.create({ model: "text-embedding-3-small", input: text });
}
