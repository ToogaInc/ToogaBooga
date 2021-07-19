import {GuildMember, MessageReaction, PartialMessageReaction, PartialUser, TextChannel, User} from "discord.js";
import {OneLifeBot} from "../OneLifeBot";
import {MongoManager} from "../managers/MongoManager";
import {ModmailManager} from "../managers/ModmailManager";
import {Emojis} from "../constants/Emojis";
import {IGuildInfo} from "../definitions/db/IGuildInfo";
import {IModmailThread} from "../definitions/IModmailThread";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {GlobalFgrUtilities} from "../utilities/fetch-get-request/GlobalFgrUtilities";

export async function onMessageReactionAdd(reaction: MessageReaction | PartialMessageReaction,
                                           user: User | PartialUser): Promise<void> {
    // Pre-check.
    if (!reaction.message.guild)
        return;

    // Must be in a guild that isn't exempt.
    const guild = reaction.message.guild;
    if (!guild)
        return;

    if (OneLifeBot.BotInstance.config.ids.exemptGuilds.includes(guild.id))
        return;

    // User must exist.
    const resolvedUser = await GlobalFgrUtilities.fetchUser(user.id);
    const resolvedMember = await GuildFgrUtilities.fetchGuildMember(guild, user.id);
    if (!resolvedUser || !resolvedMember)
        return;

    // No bots.
    if (resolvedUser.bot || user.bot)
        return;

    // Message must be valid.
    const message = await GuildFgrUtilities.fetchMessage(reaction.message.channel, reaction.message.id);
    if (!message)
        return;

    const [fetchedReaction, peopleThatReacted, guildDoc] = await Promise.all([
        await reaction.fetch(),
        await reaction.users.fetch(),
        await MongoManager.getOrCreateGuildDb(guild.id)
    ]);
    // End pre-check.

    const remReactionsChannels: string[] = [
        guildDoc.channels.modmail.modmailChannelId,
        guildDoc.channels.raids.controlPanelChannelId,
        guildDoc.channels.verification.manualVerificationChannelId,
        ...guildDoc.guildSections.map(x => x.channels.raids.controlPanelChannelId),
        ...guildDoc.guildSections.map(x => x.channels.verification.manualVerificationChannelId)
    ];

    // Remove reaction if it's in a channel where it should be removed.
    if (remReactionsChannels.includes(message.channel.id) && message.author.id === user.client.user?.id)
        await reaction.users.remove(user.id).catch();

    // Handle general modmail case.
    if (reaction.message.channel.id === guildDoc.channels.modmail.modmailChannelId) {
        await handleGeneralModmail(resolvedMember, fetchedReaction, guildDoc);
        return;
    }

    // Handle modmail thread case.
    const modmailThread = guildDoc.properties.modmailThreads
        .find(x => x.channel === message.channel.id);
    if (modmailThread) {
        await handleThreadedModmail(modmailThread, fetchedReaction, resolvedMember, guildDoc);
        return;
    }
}

/**
 * Handles a threaded modmail.
 * @param {IModmailThread} modmailThread The modmail thread.
 * @param {MessageReaction} reaction The message reaction.
 * @param {GuildMember} member The member that reacted to the modmail thread message.
 * @param {IGuildInfo} guildDoc The guild document.
 */
async function handleThreadedModmail(modmailThread: IModmailThread, reaction: MessageReaction,
                                     member: GuildMember, guildDoc: IGuildInfo): Promise<void> {
    const msg = await GuildFgrUtilities.fetchMessage(reaction.message.channel, reaction.message.id);
    if (!msg) return;
    const channel = msg.channel as TextChannel;

    // If the message that was reacted to was from this bot, then remove the reaction.
    if (msg.author.id === msg.client.user!.id)
        reaction.users.remove(member.id).then().catch();

    // Case 1: Reacted to the base message.
    if (msg.id === modmailThread.baseMsg) {
        switch (reaction.emoji.id) {
            case (Emojis.CLIPBOARD_EMOJI):
                await ModmailManager.respondToThreadModmail(modmailThread, member, guildDoc, channel);
                break;
            case (Emojis.RED_SQUARE_EMOJI):
                await ModmailManager.closeModmailThread(channel, modmailThread, guildDoc, member);
                break;
            case (Emojis.DENIED_EMOJI):
                await ModmailManager.blacklistFromModmail(msg, member, guildDoc, modmailThread);
                break;
        }

        return;
    }

    // Case 2: Reacted to a response message.
    if (reaction.emoji.name === Emojis.CLIPBOARD_EMOJI && msg.author.bot)
        await ModmailManager.respondToThreadModmail(modmailThread, member, guildDoc, channel);
}

/**
 * Handles the general modmail case.
 * @param {GuildMember} member The member that reacted to one of the four controls.
 * @param {MessageReaction} reaction The emoji that was reacted to.
 * @param {IGuildInfo} guildDoc The guild document.
 */
async function handleGeneralModmail(member: GuildMember, reaction: MessageReaction,
                                    guildDoc: IGuildInfo): Promise<void> {
    const msg = await GuildFgrUtilities.fetchMessage(reaction.message.channel, reaction.message.id);
    if (!msg) return;

    // If the person is currently responding to modmail, then don't let them respond to a new one.
    if (ModmailManager.CurrentlyRespondingToModMail.has(member.id)) return;
    // If there is no embed, then this isn't a valid modmail message.
    if (msg.embeds.length === 0) return;
    // Check if the footer is valid.
    const footer = msg.embeds[0].footer;
    if (!footer || !footer.text) return;
    if (!footer.text.endsWith("• Modmail Message")) return;
    // Handle possible cases.
    if (reaction.emoji.name === Emojis.CLIPBOARD_EMOJI)
        await ModmailManager.respondToGeneralModmail(msg, member);
    else if (reaction.emoji.name === Emojis.WASTEBIN_EMOJI)
        await ModmailManager.askDeleteModmailMessage(msg, member);
    else if (reaction.emoji.name === Emojis.DENIED_EMOJI)
        await ModmailManager.blacklistFromModmail(msg, member, guildDoc);
    else if (reaction.emoji.name === Emojis.REDIRECT_EMOJI)
        await ModmailManager.convertToThread(msg, member);
}
