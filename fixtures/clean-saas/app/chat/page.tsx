"use client";
import { useChat } from "ai/react";

export default function ChatPage() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({ api: "/api/chat" });
  return (
    <main>
      {messages.map((m) => (
        <p key={m.id}>{m.content}</p>
      ))}
      <p className="text-xs">AI-generated. It can make mistakes, so verify important information.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="prompt">Ask a question</label>
        <input id="prompt" value={input} onChange={handleInputChange} />
      </form>
    </main>
  );
}
