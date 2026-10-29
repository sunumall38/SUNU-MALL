import { describe, expect, it } from "vitest";
import { normalizeSenegalPhone } from "./phone";

describe("normalizeSenegalPhone", () => {
  it.each([
    ["77 123 45 67", "+221771234567"],
    ["771234567", "+221771234567"],
    ["+221 77 123 45 67", "+221771234567"],
    ["221771234567", "+221771234567"],
    ["00221-77-123-45-67", "+221771234567"],
    ["0771234567", "+221771234567"],
    ["(33) 820 00 00", "+221338200000"],
  ])("accepte %s", (input, expected) => {
    expect(normalizeSenegalPhone(input)).toBe(expected);
  });

  it.each(["", "7712345", "77 123 45 678", "+33 6 12 34 56 78", "abc"])("refuse %s", (input) => {
    expect(normalizeSenegalPhone(input)).toBeNull();
  });
});
