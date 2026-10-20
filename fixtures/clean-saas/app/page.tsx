"use client";
import { useEffect, useState } from "react";
import { Markdown } from "@/components/Markdown";

export default function Home() {
  const [docs, setDocs] = useState<Array<{ id: string; title: string }>>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch(`/api/posts?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => setDocs(data.posts));
  }, [q]);

  return (
    <main>
      <button type="button" onClick={() => setQ("")}>Reset filters</button>
      <img src="/hero.png" alt="Product dashboard" />
      <label htmlFor="search">Search</label>
      <input id="search" value={q} onChange={(e) => setQ(e.target.value)} />
      {docs.map((d) => (
        <Markdown key={d.id} html={d.title} />
      ))}
    </main>
  );
}
