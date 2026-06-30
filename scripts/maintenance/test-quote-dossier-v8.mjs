#!/usr/bin/env node
import { extractCustomerFromQuoteText, normalizeCustomerName } from "../../server/services/quote-dossiers/quoteDossierCustomerService.js";

const fixture = `
9700-231 ANGRA DO HEROISMO
POSTO SANTO
CANADA NOVA Nº7A
VASCO OLIVEIRA MENDES
Exmo.(s) Sr.(s)
Contribuinte N.º: 512043434
Orçamentos OR ORC.EXP1E/11797 Original
Instalação incluida
`;

const customer = extractCustomerFromQuoteText(fixture);
const invalid = normalizeCustomerName("Instalação incluida");

console.log(JSON.stringify({
  customer,
  invalidInstallation: invalid,
}, null, 2));

if (customer !== "VASCO OLIVEIRA MENDES") {
  console.error("❌ Cliente esperado: VASCO OLIVEIRA MENDES");
  process.exit(1);
}

if (invalid) {
  console.error("❌ Instalação incluida não pode ser cliente");
  process.exit(1);
}

console.log("✅ Customer parser v8 OK");
