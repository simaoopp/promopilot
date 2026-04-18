export const STORE_OPTIONS = [
    "Loja da Praia",
    "Loja de Angra",
    "Loja de Valados",
  ];
  
  const COMMON_PASSWORDS = new Set([
    "123",
    "1234",
    "12345",
    "123456",
    "password",
    "admin",
    "qwerty",
  ]);
  
  export function isBlank(value) {
    return !String(value || "").trim();
  }
  
  export function normalizeTextInput(value) {
    return String(value || "").trim();
  }
  
  export function isValidStore(store) {
    return STORE_OPTIONS.includes(normalizeTextInput(store));
  }
  
  export function isValidPassword(password) {
    const clean = normalizeTextInput(password);
  
    const minLength = clean.length >= 8;
    const hasLetter = /[A-Za-zÀ-ÿ]/.test(clean);
    const hasNumber = /\d/.test(clean);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-\/\[\];'`~+=]/.test(clean);
    const notCommon = !COMMON_PASSWORDS.has(clean.toLowerCase());
  
    return minLength && hasLetter && hasNumber && hasSpecial && notCommon;
  }
  
  export function getPasswordValidationMessage(password) {
    if (isValidPassword(password)) {
      return "";
    }
  
    return "A nova palavra-passe deve ter pelo menos 8 caracteres, incluir letras, números e 1 carácter especial, e não pode ser demasiado comum.";
  }
  