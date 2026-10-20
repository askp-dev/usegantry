import { streamText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { ratelimit } from "@/lib/ratelimit";

const Body = z.object({ prompt: z.string().min(1).max(4000) });

export async function POST(req: Request) {
  const user = await requireUser();
  const { success } = await ratelimit.limit(user.id);
  if (!success) return new Response("Too many requests", { status: 429 });
  const { prompt } = Body.parse(await req.json());
  const result = streamText({
    model: openai("gpt-4o"),
    prompt,
    maxTokens: 1024,
    maxSteps: 5,
    abortSignal: AbortSignal.timeout(30_000),
    tools: { search: tool({ description: "search docs", parameters: z.object({ q: z.string() }), execute: async () => "none" }) },
  });
  return result.toDataStreamResponse();
}
