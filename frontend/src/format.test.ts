import { describe, expect, it } from "vitest";
import { money } from "./format";

describe("money", () => {
  it("formats an amount using the requested currency", () => {
    expect(money(1200, "INR")).toContain("₹");
    expect(money(1200, "INR")).toContain("1,200");
  });

  it("renders empty values as zero", () => {
    expect(money("", "INR")).toContain("0");
  });
});
