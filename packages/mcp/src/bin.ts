#!/usr/bin/env bun
// `bunx @usegantry/mcp [path]`: the CLI's MCP server, without the rest of the CLI.
import { resolve } from "node:path";
import { main } from "@usegantry/cli/mcp";

process.exitCode = await main({ path: resolve(process.argv[2] ?? ".") });
