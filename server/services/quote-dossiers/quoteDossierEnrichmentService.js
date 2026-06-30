export async function enrichQuoteDossier(dossier = {}) {
  const items = Array.isArray(dossier.items) ? dossier.items : [];

  return {
    ...dossier,
    items,
    enrichmentSummary: {
      total: items.length,
      manual: items.length,
      matched: 0,
      web: 0,
      generic: 0,
      mode: "manual",
    },
  };
}
