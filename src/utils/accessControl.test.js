import {
    hasMissingProfileFields,
    isOnboardingRequired,
    profileRequiresPasswordChange,
    resolveInitialRoute,
  } from "./accessControl";
  
  describe("accessControl", () => {
    const user = { id: "user-1" };
  
    it("deteta perfil incompleto", () => {
      expect(hasMissingProfileFields(null)).toBe(true);
      expect(
        hasMissingProfileFields({
          first_name: "Ana",
          last_name: "Silva",
          store: "Loja da Praia",
        }),
      ).toBe(false);
    });
  
    it("deteta necessidade de onboarding", () => {
      expect(
        isOnboardingRequired({
          user,
          loadingProfile: false,
          profile: { first_name: "Ana", last_name: "", store: "Loja da Praia" },
        }),
      ).toBe(true);
  
      expect(
        isOnboardingRequired({
          user,
          loadingProfile: false,
          profile: {
            first_name: "Ana",
            last_name: "Silva",
            store: "Loja da Praia",
            must_change_password: false,
          },
        }),
      ).toBe(false);
    });
  
    it("deteta password obrigatória", () => {
      expect(profileRequiresPasswordChange({ must_change_password: true })).toBe(true);
      expect(profileRequiresPasswordChange({ must_change_password: false })).toBe(false);
    });
  
    it("resolve rota inicial corretamente", () => {
      expect(resolveInitialRoute({ user: null, onboardingRequired: false })).toBe("/login");
      expect(resolveInitialRoute({ user, onboardingRequired: true })).toBe("/login");
      expect(resolveInitialRoute({ user, onboardingRequired: false })).toBe("/Homepage");
    });
  });
  