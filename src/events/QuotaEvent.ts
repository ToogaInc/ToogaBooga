import { IGuildInfo } from "../definitions";
// import { QuotaManager } from "../managers/QuotaManager";

export async function onQuotaEvent(guildId: string, guildDoc: IGuildInfo): Promise<void> {
    console.error("Quota event not implemented but was emitted.");
    return;

    // Upsert quota embeds here
    // May want to only emit with a quotaInfo instead of the entire guildDoc, much easier to pick out what embed is being updated
    
    // QuotaManager.upsertLeaderboardMessage(doc.mId, quotaInfo, guildDoc??)

    // todo: resetting, don't do it here though? gotta think of how to reset in eventbased
}