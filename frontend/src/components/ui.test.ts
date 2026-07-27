import { describe, expect, it } from "vitest";
import { formatDate, formatMoney } from "./ui";

describe("format helpers", () => {
  it("formats monetary values in bolivianos", () => {
    const result = formatMoney(1250.5);

    expect(result).toContain("Bs");
    expect(result).toContain("1.251");
  });

  it("returns a dash when a date is missing", () => {
    expect(formatDate()).toBe("—");
    expect(formatDate(null)).toBe("—");
  });
});
