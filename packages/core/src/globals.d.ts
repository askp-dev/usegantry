declare module "*.sqlite" {
  import type { Database } from "bun:sqlite";

  const db: Database;
  export default db;
}
declare module "*.html" {
  const text: string;
  export default text;
}
declare module "*.md" {
  const text: string;
  export default text;
}
declare module "*.mermaid" {
  const text: string;
  export default text;
}
declare module "*.yml" {
  const text: string;
  export default text;
}
