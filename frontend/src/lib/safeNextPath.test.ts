import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/utils";

describe("safeNextPath", () => {
  it("accepte un chemin interne", () => {
    expect(safeNextPath("/orders?page=2")).toBe("/orders?page=2");
  });

  it("refuse toute sortie du site", () => {
    for (const value of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "", null, "/a\nb"]) {
      expect(safeNextPath(value)).toBeNull();
    }
  });
});
