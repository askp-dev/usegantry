import { AI_INVENTORY_PATH, aiInventoryIsCurrent, buildAiInventory } from "../../compilers/ai-inventory";
import { defineRule } from "../helpers";

export const aia01AiInventory = defineRule(
  { id: "AIA-01", pillar: "LEGAL", severity: "HIGH", title: "Missing or Stale AI System Inventory (EU AI Act)", scope: "repo", profiles: ["eu-ai-act"] },
  (ctx, emit) => {
    const inv = buildAiInventory(ctx);
    if (!inv.usesAi || aiInventoryIsCurrent(ctx, inv.generated)) return;
    const missing = !ctx.hasFile(AI_INVENTORY_PATH);
    emit({
      file: missing ? "package.json" : AI_INVENTORY_PATH,
      line: 1,
      severity: missing ? "HIGH" : "MEDIUM",
      evidence: missing ? `${AI_INVENTORY_PATH} not found` : `${AI_INVENTORY_PATH} no longer matches the models, prompts and routes in the code`,
      impact: missing
        ? "This app uses AI models but keeps no inventory of them. Under the EU AI Act, deployers need to know which AI systems they run, from which provider, and where a human can intervene, to classify risk and meet transparency and AI-literacy duties."
        : "The AI inventory is out of date: a model, prompt, provider or AI route changed since it was generated, so your compliance record no longer describes the system you ship.",
      agentRemediationPrompt: `Run \`gantry legal --sync --profile eu-ai-act\` to ${missing ? "generate" : "regenerate"} ${AI_INVENTORY_PATH}, then fill in the risk classification and human-oversight notes below its end marker.`,
    });
  },
);
