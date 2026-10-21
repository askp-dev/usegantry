import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({ email: v.string(), fullName: v.string(), role: v.string() }),
  notes: defineTable({ userId: v.id("users"), body: v.string() }),
});
