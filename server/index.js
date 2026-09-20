import "dotenv/config";
import { createApp } from "./app.js";
import { startAiRateLimitCleanup } from "./middleware/aiRateLimit.js";
import { logRuntimeInfo, warnMissingRuntimeConfig } from "./bootstrap/runtimeInfo.js";
import { warmArticlesCache } from "./services/articleRepository.js";
import { startCampaignEmailWorker } from "./workers/campaignEmailWorker.js";
import { startCampaignEndNotificationWorker } from "./workers/campaignEndNotificationWorker.js";

warnMissingRuntimeConfig();

const app = createApp();
const PORT = process.env.PORT || 3001;

startAiRateLimitCleanup();

if (process.env.WARM_ARTICLES_CACHE !== "0") {
  warmArticlesCache();
}

startCampaignEmailWorker();
startCampaignEndNotificationWorker();

app.listen(PORT, "0.0.0.0", () => {
  logRuntimeInfo("LISTEN");
  console.log(`API ativa na porta ${PORT}`);
});
