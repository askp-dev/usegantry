"use client";
import { useEffect, useState } from "react";

export default function Home() {
  const [docs, setDocs] = useState([]);
  const [filters, setFilters] = useState({ q: "" });

  useEffect(() => {
    fetch("/api/posts?q=" + filters.q)
      .then((r) => r.json())
      .then((data) => setDocs(data));
  }, [docs]);

  return (
    <main>
      <div onClick={() => setFilters({ q: "" })}>Reset filters</div>
      <img src="/hero.png" />
      <input placeholder="Search" />
      {docs.map((d: any) => (
        <article key={d.id} dangerouslySetInnerHTML={{ __html: d.body }} />
      ))}
    </main>
  );
}
