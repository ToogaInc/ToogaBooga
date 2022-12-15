import { GuildMember } from "discord.js";
import { IGuildInfo, IQuotaInfo } from "../definitions";
import { QuotaManager } from "../managers/QuotaManager";

// Only used for this event, contains an object of the difference in QuotaInfo instead of having to manually calculate it
export interface INewQuota {
    member: GuildMember,
    roleId: string,
    logType: string,
    amt: number
}

export async function onQuotaEvent(quotaInfo: IQuotaInfo, guildDoc: IGuildInfo, newQuota: INewQuota): Promise<void> {
    // Update the quota embed in the leaderboard channel
    QuotaManager.upsertLeaderboardMessage(quotaInfo.messageId, quotaInfo, guildDoc);

    // Add quota pts for leaderboard-shop
    let quotaPoints = (quotaInfo.pointValues.find(x => x.key === newQuota.logType)?.value ?? 0) * newQuota.amt;
    if (newQuota.logType.startsWith("Run")) {
        // See if we have RunComplete for all dungeons instead of specific dungeons
        const baseLogType = newQuota.logType.split(":")[0];
        const quotaRule = quotaInfo.pointValues.find(x => x.key === baseLogType);
        if (quotaRule) {
            quotaPoints = quotaRule.value * newQuota.amt;
        }
    }

    await QuotaManager.addQuotaPts(newQuota.member, guildDoc.guildId, quotaPoints);
    return;
}