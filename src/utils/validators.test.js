import {
    STORE_OPTIONS,
    getPasswordValidationMessage,
    isValidPassword,
    isValidStore,
  } from "./validators";
  
  describe("validators", () => {
    it("valida stores permitidas", () => {
      expect(isValidStore(STORE_OPTIONS[0])).toBe(true);
      expect(isValidStore("Loja Inventada")).toBe(false);
    });
  
    it("aceita palavra-passe forte", () => {
      expect(isValidPassword("SenhaSegura9!")).toBe(true);
      expect(getPasswordValidationMessage("SenhaSegura9!")).toBe("");
    });
  
    it("rejeita palavra-passe fraca", () => {
      expect(isValidPassword("123456")).toBe(false);
      expect(getPasswordValidationMessage("123456")).toMatch(/pelo menos 8 caracteres/i);
    });
  });
  