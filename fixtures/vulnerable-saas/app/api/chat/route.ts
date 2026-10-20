import { openai } from "@/lib/openai";
import { prisma } from "@/lib/db";
import { streamText, tool } from "ai";
import { openai as openaiProvider } from "@ai-sdk/openai";

export async function POST(req: Request) {
  const body = await req.json();
  console.log("chat request", body);
  const user = await prisma.user.findUnique({ where: { id: body.userId } });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: `User ${user?.email} profile: ${JSON.stringify(user)}. Question: ${body.prompt}` },
    ],
  });
  const result = streamText({
    model: openaiProvider("gpt-4o"),
    prompt: body.prompt,
    tools: { search: tool({ description: "search", parameters: {} as any, execute: async () => "x" }) },
  });
  return Response.json({ text: completion.choices[0].message.content });
}
