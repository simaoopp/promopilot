import { createCampaignSnapshot, normalizeCampaignSnapshot } from "./campaignHistory";

jest.mock("../lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

describe("campaignHistory", () => {
  it("cria snapshot com defaults consistentes", () => {
    const snapshot = createCampaignSnapshot({
      titulo: "Promo",
      dados: [{ id: 1 }],
      anoValidade: 2026,
      formatoEtiqueta: "a5",
      origem: "manual",
      createdBy: "Ana Silva",
      createdByEmail: "ana@example.com",
      store: "Loja da Praia",
      userId: "user-1",
    });

    expect(snapshot.titulo).toBe("Promo");
    expect(snapshot.totalArtigos).toBe(1);
    expect(snapshot.store).toBe("Loja da Praia");
    expect(snapshot.userId).toBe("user-1");
  });

  it("normaliza dados e valida store obrigatória", () => {
    expect(() => normalizeCampaignSnapshot({ titulo: "Promo" })).toThrow(/loja/i);

    const normalized = normalizeCampaignSnapshot({
      titulo: " Promo ",
      dados: [{ id: 1 }],
      store: " Loja da Praia ",
      createdBy: " Ana ",
    });

    expect(normalized.titulo).toBe("Promo");
    expect(normalized.store).toBe("Loja da Praia");
    expect(normalized.createdBy).toBe("Ana");
  });
});
