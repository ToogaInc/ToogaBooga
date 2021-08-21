import {Interaction, NewsChannel, TextChannel} from "discord.js";
import {OneLifeBot} from "../OneLifeBot";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {MongoManager} from "../managers/MongoManager";
import {GlobalFgrUtilities} from "../utilities/fetch-get-request/GlobalFgrUtilities";
import {ModmailManager} from "../managers/ModmailManager";
import {VerifyManager} from "../managers/VerifyManager";
import {RaidInstance} from "../instances/RaidInstance";

export async function onInteractionEvent(interaction: Interaction): Promise<void> {
    // Must be a button.
    if (!interaction.isButton()) return;

    // Must be in a non-exempt guild.
    const guild = interaction.guild;
    if (!guild || OneLifeBot.BotInstance.config.ids.exemptGuilds.includes(guild.id)) return;

    // Make sure we aren't dealing with a bot.
    if (interaction.user.bot) return;

    // Get corresponding channel.
    const channel = interaction.channel;
    if (!channel || !channel.isText() || channel instanceof NewsChannel) return;
    const resolvedChannel = await channel.fetch();

    // Get guild document, users, and message.
    const [resolvedUser, resolvedMember, message, guildDoc] = await Promise.all([
        GlobalFgrUtilities.fetchUser(interaction.user.id),
        GuildFgrUtilities.fetchGuildMember(guild, interaction.user.id),
        GuildFgrUtilities.fetchMessage(resolvedChannel, interaction.message.id),
        MongoManager.getOrCreateGuildDoc(guild.id, true)
    ]);

    // All must exist.
    if (!resolvedMember || !resolvedUser || !message) return;

    // Check MODMAIL
    if (guildDoc.channels.modmailChannelId === resolvedChannel.id) {
        // Several choices.
        switch (interaction.customId) {
            case ModmailManager.MODMAIL_REPLY_ID: {
                await ModmailManager.respondToGeneralModmail(
                    message,
                    resolvedMember
                );
                return;
            }
            case ModmailManager.MODMAIL_DELETE_ID: {
                if ((message.embeds[0].description?.length ?? 0) <= 15) {
                    await message.delete().catch();
                    return;
                }
                await ModmailManager.askDeleteModmailMessage(
                    message,
                    resolvedMember
                );
                return;
            }
            case ModmailManager.MODMAIL_BLACKLIST_ID: {
                await ModmailManager.blacklistFromModmail(
                    message,
                    resolvedMember,
                    guildDoc
                );
                return;
            }
            case ModmailManager.MODMAIL_CREATE_ID: {
                await ModmailManager.convertToThread(
                    message,
                    resolvedMember
                );
                return;
            }
        }
    }

    const thread = guildDoc.properties.modmailThreads
        .find(x => x.channel === channel.id);
    if (thread) {
        switch (interaction.customId) {
            case ModmailManager.MODMAIL_REPLY_ID: {
                await ModmailManager.respondToThreadModmail(
                    thread,
                    resolvedMember,
                    guildDoc,
                    channel as TextChannel
                );
                return;
            }
            case ModmailManager.MODMAIL_DELETE_ID: {
                await ModmailManager.closeModmailThread(
                    channel as TextChannel,
                    thread,
                    guildDoc,
                    resolvedMember
                );
                return;
            }
            case ModmailManager.MODMAIL_BLACKLIST_ID: {
                await ModmailManager.blacklistFromModmail(
                    message,
                    resolvedMember,
                    guildDoc,
                    thread
                );
                return;
            }
        }
    }

    // Check VERIFICATION
    if (guildDoc.channels.verification.verificationChannelId === resolvedChannel.id) {
        await VerifyManager.verifyInteraction(interaction, guildDoc, MongoManager.getMainSection(guildDoc));
        return;
    }

    const relevantSec = guildDoc.guildSections
        .find(x => x.channels.verification.verificationChannelId === resolvedChannel.id);
    if (relevantSec) {
        await VerifyManager.verifyInteraction(interaction, guildDoc, relevantSec);
        return;
    }

    // Check AFK CHECKS (reconnect button)
    for (const [msgId, afkCheckInstance] of RaidInstance.ActiveRaids) {
        if (msgId !== message.id)
            continue;
        await afkCheckInstance.interactionEventFunction(interaction);
        return;
    }


}
