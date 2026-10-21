import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

// BAAS-01 (HIGH): public query, no identity check, returns every user's notes
export const list = query({
  handler: async (ctx) => ctx.db.query("notes").collect(),
});

// BAAS-01 (CRITICAL): public mutation, anyone can delete any note
export const remove = mutation({
  args: { id: v.id("notes") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

// BAAS-01 (CRITICAL): webhook handler exported as a public mutation
export const stripeWebhook = mutation({
  args: { userId: v.id("users"), plan: v.string() },
  handler: async (ctx, { userId, plan }) => {
    await ctx.db.patch(userId, { role: plan });
  },
});

// OK: checks the identity and scopes to it
export const mine = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    return ctx.db
      .query("notes")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .collect();
  },
});

// OK: internal-only
export const purgeAll = internalMutation({
  handler: async (ctx) => {
    for (const n of await ctx.db.query("notes").collect()) await ctx.db.delete(n._id);
  },
});
