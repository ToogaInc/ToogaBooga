import { Message, PartialMessage } from "discord.js";
import { MongoManager } from "../managers/MongoManager";
import { HeadcountInstance } from "../instances/HeadcountInstance";
import { RaidInstance } from "../instances/RaidInstance";
import { ConfigChannels } from "../commands";

export async function onMessageDeleteEvent(msg: Message | PartialMessage): Promise<void> {
    if (!msg.guild) {
        return;
    }

    // See if we need to delete the headcount
    for (const [, headCountInstance] of HeadcountInstance.ActiveHeadcounts) {
        if (headCountInstance.controlPanelMessage?.id === msg.id
            || headCountInstance.headcountMessage?.id === msg.id) {
            await headCountInstance.cleanUpHeadcount();
            return;
        }
    }

    // See if we need to delete the raid
    for (const [, raidInstance] of RaidInstance.ActiveRaids) {
        if (raidInstance.controlPanelMsg?.id === msg.id
            || raidInstance.afkCheckMsg?.id === msg.id) {
            await raidInstance.cleanUpRaid(true);
            return;
        }
    }

    const guildDoc = await MongoManager.getOrCreateGuildDoc(msg.guild.id, true);
    // Modmail message?
    const thread = guildDoc.properties.modmailThreads.find(x => x.baseMsg === msg.id);
    if (thread) {
        await MongoManager.updateAndFetchGuildDoc({ guildId: msg.guild.id }, {
            $pull: {
                "properties.modmailThreads": {
                    baseMsg: msg.id
                }
            }
        });
        return;
    }

    if (msg.id === guildDoc.properties.rolePingMessageId) {
        if (guildDoc.channels.rolePingChannelId) {
            ConfigChannels.createNewRolePingMessage(msg.client, guildDoc);
        }
    }

    // ...
}