import { describe, expect, it } from "vitest";
import { matchRoute } from "./router";

describe("enrutador interno", () => {
  it("extrae y decodifica parámetros de rastreo", () => {
    expect(matchRoute("/rastreo/:code", "/rastreo/SCM-BO%202026")).toEqual({
      matched: true,
      params: { code: "SCM-BO 2026" },
    });
  });

  it("no acepta segmentos adicionales ni codificación inválida", () => {
    expect(matchRoute("/rastreo/:code", "/rastreo/ABC/eventos").matched).toBe(false);
    expect(matchRoute("/rastreo/:code", "/rastreo/%E0%A4%A").matched).toBe(false);
  });
});
