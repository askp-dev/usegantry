import { redirect } from "next/navigation";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url")!;
  if (searchParams.get("next")) redirect(searchParams.get("next")!);
  const res = await fetch(target);
  return new Response(await res.text());
}
