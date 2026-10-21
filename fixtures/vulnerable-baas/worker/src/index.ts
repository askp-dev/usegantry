interface Env {
  DB: D1Database;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const userId = req.headers.get("x-user-id");
    if (url.pathname === "/note") {
      // EDGE-02: any caller reads any tenant's note by id
      const note = await env.DB.prepare("SELECT * FROM notes WHERE id = ?").bind(id).first();
      return Response.json(note);
    }
    // OK: tenant predicate
    const mine = await env.DB.prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?").bind(id, userId).first();
    return Response.json(mine);
  },
};
