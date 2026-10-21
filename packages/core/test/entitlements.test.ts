import { expect, test } from "bun:test";
import { FEATURE_TIER, FeatureLockedError, hasFeature, requireFeature, resolveTier } from "../src/entitlements";

test("launch: every feature is free", () => {
  expect(resolveTier()).toBe("agency");
  for (const f of Object.keys(FEATURE_TIER) as Array<keyof typeof FEATURE_TIER>) expect(hasFeature(f)).toBe(true);
});

test("gating works once a lower tier is resolved", () => {
  expect(hasFeature("scan", "community")).toBe(true);
  expect(hasFeature("legal", "community")).toBe(false);
  expect(hasFeature("legal", "pro")).toBe(true);
  expect(hasFeature("cert", "pro")).toBe(false);
  expect(() => requireFeature("cert", "community")).toThrow(FeatureLockedError);
  expect(() => requireFeature("vendorPack", "agency")).not.toThrow();
});
