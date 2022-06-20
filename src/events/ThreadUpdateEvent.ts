import { NewsChannel, ThreadChannel } from "discord.js";
import { MongoManager } from "../managers/MongoManager";
import { ModmailManager } from "../managers/ModmailManager";
import { GuildFgrUtilities } from "../utilities/fetch-get-request/GuildFgrUtilities";

export async function onThreadArchiveEvent(oldThread: ThreadChannel, newThread: ThreadChannel): Promise<void> {
    const guildDoc = await MongoManager.getOrCreateGuildDoc(oldThread.guild.id, true);
    if (!oldThread.parent
        || oldThread.parent instanceof NewsChannel
        || oldThread.parent.id !== guildDoc.channels.modmailChannelId) {
        return;
    }

    const mmMessage = await GuildFgrUtilities.fetchMessage(oldThread.parent, newThread.id);
    if (!mmMessage) {
        return;
    }

    if (oldThread.archived && !newThread.archived) {
        await ModmailManager.openModmailThread(guildDoc, mmMessage);
    }
    else if (!oldThread.archived && newThread.archived) {
        await ModmailManager.closeModmailThread(mmMessage, guildDoc);
    }
}