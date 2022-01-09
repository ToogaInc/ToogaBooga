import {NewsChannel, ThreadChannel} from "discord.js";
import {MongoManager} from "../managers/MongoManager";
import {ModmailManager} from "../managers/ModmailManager";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";

export async function onThreadArchiveEvent(oldThread: ThreadChannel, newThread: ThreadChannel): Promise<void> {
    if (oldThread.archived || !newThread.archived) {
        return;
    }

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

    await ModmailManager.closeModmailThread(mmMessage, guildDoc);
}