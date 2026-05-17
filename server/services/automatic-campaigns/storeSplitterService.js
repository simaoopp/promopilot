import { automaticCampaignStores } from "./config.js";
import { parseInteiro } from "./numberUtils.js";

export function splitAutomaticCampaignByStore(items = []) {
  const result = Object.fromEntries(
    Object.values(automaticCampaignStores).map((store) => [store.key, []]),
  );

  for (const item of items) {
    for (const store of Object.values(automaticCampaignStores)) {
      const quantity = parseInteiro(item[store.quantityColumn]);

      if (quantity >= 1) {
        result[store.key].push({
          ...item,
          store: store.store,
          storeKey: store.key,
          storeLabel: store.label,
          quantidadeLoja: quantity,
        });
      }
    }
  }

  return result;
}
