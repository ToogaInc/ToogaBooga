import { IGuildInfo, IQuotaInfo } from "../definitions";
import { QuotaManager } from "../managers/QuotaManager";

export async function onQuotaEvent(quotaInfo: IQuotaInfo, guildDoc: IGuildInfo): Promise<void> {
    QuotaManager.upsertLeaderboardMessage(quotaInfo.messageId, quotaInfo, guildDoc);
    return;
}