import { formatarEuro, parseNumero } from "./formatters";

describe("formatters", () => {
  test("parseNumero interpreta valores monetários portugueses com vírgula decimal", () => {
    expect(parseNumero("10,99")).toBe(10.99);
    expect(parseNumero("1 299,90€")).toBe(1299.9);
  });

  test("formatarEuro não gera NaN para preços com vírgula", () => {
    expect(formatarEuro("10,99")).toBe("10,99");
  });
});
