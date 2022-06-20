import {
    Guild,
    GuildMember,
    Message,
    MessageEmbed,
    MessageSelectMenu,
    TextChannel,
    ThreadChannel,
    User
} from "discord.js";
import { IGuildInfo, IModmailThread } from "../definitions";
import { GlobalFgrUtilities } from "../utilities/fetch-get-request/GlobalFgrUtilities";
import { MongoManager } from "./MongoManager";
import { CommonRegex } from "../constants/CommonRegex";
import { GuildFgrUtilities } from "../utilities/fetch-get-request/GuildFgrUtilities";
import { MessageUtilities } from "../utilities/MessageUtilities";
import { ArrayUtilities } from "../utilities/ArrayUtilities";
import { EmojiConstants } from "../constants/EmojiConstants";
import { AdvancedCollector } from "../utilities/collectors/AdvancedCollector";
import { ButtonConstants } from "../constants/ButtonConstants";
import { StringUtil } from "../utilities/StringUtilities";
import {} from "../utilities/Logger";

export namespace ModmailManager {

    /**
     * Checks whether the original message satisfies the preconditions for a modmail message. The preconditions are:
     * - The original message's channel must be a `TextChannel`.
     * - The original message must be sent in a guild.
     * - The original message must be sent in the modmail channel.
     * - The original message must have an embed.
     * - The original message must be sent by the bot.
     * - The original message's embed must have a footer that contains only an ID.
     *
     * @param {Message} originalMessage The original message.
     * @param {IGuildInfo} guildDoc The guild document.
     * @returns {boolean} Whether the original message is a modmail message.
     * @private
     */
    function satisfiesPrecondition(originalMessage: Message, guildDoc: IGuildInfo): boolean {
        return originalMessage.channel instanceof TextChannel
            && !!originalMessage.guild
            && guildDoc.channels.modmailChannelId === originalMessage.channel.id
            && originalMessage.embeds.length > 0
            && !!originalMessage.embeds[0].footer?.text
            && CommonRegex.ONLY_NUMBERS.test(originalMessage.embeds[0].footer!.text)
            && originalMessage.author.id === originalMessage.client.user?.id;
    }

    /**
     * Finds an active modmail thread by user ID.
     * @param {string | User} user The user ID to look for, or the user object. This will look for an active modmail
     * thread where the person corresponding to this user ID is the recipient.
     * @param {Guild} guild The guild.
     * @param {IGuildInfo} guildDoc The guild document.
     * @returns {Promise<ThreadChannel | null>} The thread channel.
     */
    export async function findModmailThreadByUser(user: string | User, guild: Guild,
                                                  guildDoc: IGuildInfo): Promise<ThreadChannel | null> {
        const modmailChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            guild,
            guildDoc.channels.modmailChannelId
        );
        if (!modmailChannel) {
            return null;
        }

        const id = typeof user === "string" ? user : user.id;
        const threadSearchByUser = guildDoc.properties.modmailThreads.find(x => x.recipientId === id);
        if (!threadSearchByUser) {
            return null;
        }

        const message = await MessageUtilities.tryGetMessage(modmailChannel, threadSearchByUser.baseMsg);
        return message && message.hasThread ? message.thread! : null;
    }

    /**
     * Edits the base modmail message, if any.
     * @param {Message} mm The modmail message.
     * @param {ThreadChannel} t The thread channel.
     * @param {GuildMember} openedBy The guild member that opened this modmail.
     * @param {boolean} created Whether the thread was created.
     */
    export async function acknowledgeModmailThreadCreation(mm: Message, t: ThreadChannel,
                                                           openedBy: GuildMember,
                                                           created: boolean): Promise<void> {
        if (created) {
            mm.embeds[0].spliceFields(mm.embeds[0].fields.findIndex(x => x.name === "Directions"), 1);
            mm.embeds[0].addField("Directions", OPEN_MODMAIL_INSTRUCTIONS);
            await MessageUtilities.tryEdit(mm, { embeds: [mm.embeds[0]] });
        }
        else {
            await GlobalFgrUtilities.sendMsg(t, { content: openedBy.toString() });
        }
    }

    /**
     * Opens a modmail thread from a modmail message, or reopens one if it was already created but archived.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {Message} modmailMsg The original modmail message.
     * @param {GuildMember} [moderator] The moderator that opened this.
     * @returns {Promise<[ThreadChannel | null, boolean]>} A tuple, where the first element is the thread channel
     * and the second element is whether the channel was created (true) or if it already existed (false).
     */
    export async function openModmailThread(guildDoc: IGuildInfo,
                                            modmailMsg: Message,
                                            moderator?: GuildMember): Promise<[ThreadChannel | null, boolean]> {
        if (!satisfiesPrecondition(modmailMsg, guildDoc)) {
            return [null, false];
        }

        // Several cases to consider:
        // - The thread is already open.
        // - The thread is archived, but another thread for the same person is already open.
        // - A thread could have been created by someone that isn't the bot, or the thread was created by the bot
        // but is now archived.
        //      -> Unarchive it, if applicable.
        //      -> Add it to the database.
        //      -> Done
        // - No thread was created.
        //      -> Create thread.
        //      -> Add to database.
        //      -> Done

        // Is this particular thread active?
        // guildDoc.properties.modmailThreads should NOT have this modmail instance IF the thread is not active.
        if (modmailMsg.hasThread
            && !modmailMsg.thread!.archived
            && guildDoc.properties.modmailThreads.some(x => x.threadId === modmailMsg.thread!.id
                && x.baseMsg === modmailMsg.id)) {
            if (moderator) {
                await acknowledgeModmailThreadCreation(modmailMsg, modmailMsg.thread!, moderator, false);
            }
            return [modmailMsg.thread!, false];
        }

        // Now see if there is a thread that is already open for this person
        const t = guildDoc.properties.modmailThreads.find(x => x.recipientId === modmailMsg.embeds[0].footer!.text);
        if (t) {
            const m = await GuildFgrUtilities.fetchMessage(modmailMsg.channel, t.baseMsg);
            if (m && m.thread && !m.thread.archived) {
                if (moderator) {
                    await acknowledgeModmailThreadCreation(modmailMsg, m.thread!, moderator, false);
                }
                return [m.thread!, false];
            }

            await MongoManager.updateAndFetchGuildDoc({ guildId: modmailMsg.guild!.id }, {
                $pull: {
                    "properties.modmailThreads": {
                        recipientId: modmailMsg.embeds[0].footer!.text
                    }
                }
            });
        }

        const addThreadToDb = async (t: ThreadChannel): Promise<void> => {
            if (moderator) {
                await acknowledgeModmailThreadCreation(modmailMsg, t, moderator, true);
            }
            await MongoManager.updateAndFetchGuildDoc({ guildId: modmailMsg.guild!.id }, {
                $push: {
                    "properties.modmailThreads": {
                        baseMsg: modmailMsg.id,
                        threadId: t.id,
                        recipientId: modmailMsg.embeds[0].footer!.text
                    } as IModmailThread
                }
            });

            const baseMsg = await t.fetchStarterMessage();
            baseMsg.embeds[0].spliceFields(baseMsg.embeds[0].fields.findIndex(x => x.name === "Directions"), 1);
            baseMsg.embeds[0].addField("Directions", OPEN_MODMAIL_INSTRUCTIONS);
            await MessageUtilities.tryEdit(baseMsg, { embeds: [baseMsg.embeds[0]] });
        };

        if (modmailMsg.hasThread) {
            const thread = await modmailMsg.thread!.fetch();
            if (thread.unarchivable) {
                await thread.setArchived(false);
            }

            await addThreadToDb(thread);
            return [thread, true];
        }

        // It's possible that we don't have permission
        const newThread = await GlobalFgrUtilities.tryExecuteAsync(async () => {
            return await modmailMsg.startThread({
                autoArchiveDuration: "MAX",
                reason: "Started modmail.",
                name: "Modmail"
            });
        });

        if (!newThread) {
            return [null, false];
        }

        await addThreadToDb(newThread);
        return [newThread, true];
    }

    // Red
    const NOT_RESPONDED_TO_COLOR: number = 0xc90808;
    // Purple
    const GENERAL_THREAD_COLOR: number = 0xb31772;

    const NEW_MODMAIL_INSTRUCTIONS: string = "The modmail thread has either not been responded to or has been"
        + " archived. To (re)open this modmail thread, allowing you to reply to this modmail message, press the **Open"
        + " Thread** button. More instructions will be provided once the thread is opened. To delete this modmail"
        + " message, press the **Remove** button. To delete this message and blacklist the author, press the"
        + " **Blacklist** button.";

    const OPEN_MODMAIL_INSTRUCTIONS: string = "The modmail thread is currently opened. To send a message to the"
        + " author of this modmail, use the `/reply` command. To close (i.e. archive) the modmail thread, use the"
        + " `/archive` command or manually archive the thread yourself.";

    /**
     * Gets the embed that represents a modmail reply or response.
     * @param {User} author The author of this message.
     * @param {Message | string} msg The message.
     * @returns {MessageEmbed} The embed. This will give you a very simple embed that is missing a title and other
     * instructions.
     */
    export function getEmbedForModmail(author: User, msg: Message | string): MessageEmbed {
        const embed = new MessageEmbed()
            .setAuthor({ name: author.tag, iconURL: author.displayAvatarURL() })
            .setTimestamp()
            .setFooter({ text: author.id })
            .setDescription(
                typeof msg === "string"
                    ? msg
                    : msg.content.length === 0 ? "(No Content)" : msg.content
            );

        if (typeof msg === "string") {
            return embed;
        }

        const fields = ArrayUtilities.arrayToStringFields(
            Array.from(msg.attachments.values()),
            (i, attachment) => {
                const ext = attachment.url.split(".").at(-1)!.toUpperCase();
                return `**\`[${i + 1}]\`** [${attachment.name ?? "No Name"} (${ext} File)](${attachment.url})`;
            }
        );

        for (const field of fields) {
            embed.addField("Attachment(s)", field, true);
        }

        return embed;
    }

    /**
     * Closes the modmail thread.
     * @param {Message} origMsg The original message.
     * @param {IGuildInfo} guildDoc The guild document.
     * @returns {Promise<boolean>} Whether the thread was closed successfully.
     */
    export async function closeModmailThread(origMsg: Message, guildDoc: IGuildInfo): Promise<boolean> {
        if (!satisfiesPrecondition(origMsg, guildDoc)) {
            return false;
        }

        if (!origMsg.hasThread) {
            return false;
        }

        const thread = await origMsg.thread!.fetch();
        if (!guildDoc.properties.modmailThreads.some(x => x.threadId === thread.id
            && x.baseMsg === origMsg.id)) {
            return false;
        }

        origMsg.embeds[0].spliceFields(origMsg.embeds[0].fields.findIndex(x => x.name === "Directions"), 1);
        origMsg.embeds[0].addField("Directions", NEW_MODMAIL_INSTRUCTIONS);
        await Promise.all([
            thread.setArchived(true, "Closed modmail."),
            MongoManager.updateAndFetchGuildDoc({ guildId: origMsg.guild!.id }, {
                $pull: {
                    "properties.modmailThreads": {
                        baseMsg: origMsg.id
                    }
                }
            }),
            MessageUtilities.tryEdit(origMsg, { embeds: [origMsg.embeds[0]] })
        ]);

        return true;
    }

    /**
     * Asks the user to select a guild based on what servers have modmail set up.
     * @param {User} user The user.
     * @returns {Promise<Guild | null>} The guild selected, if any, or `null` if none is selected.
     */
    export async function selectGuild(user: User): Promise<Guild | null> {
        const guildsToChoose: Guild[] = [];
        const allGuilds = await MongoManager.getGuildCollection().find({}).toArray();
        for await (const [id, guild] of user.client.guilds.cache) {
            const gObj = allGuilds.find(x => x.guildId === id);
            if (!gObj) {
                continue;
            }

            const member = await GuildFgrUtilities.fetchGuildMember(guild, user.id);
            if (!member || !guild.roles.cache.has(gObj.roles.verifiedRoleId)
                || !guild.channels.cache.has(gObj.channels.modmailChannelId)) {
                continue;
            }

            if (gObj.moderation.blacklistedModmailUsers.some(x => x.affectedUser.id === user.id)) {
                continue;
            }

            guildsToChoose.push(guild);
        }

        if (guildsToChoose.length === 0) {
            return null;
        }

        const uniqueId = StringUtil.generateRandomString(20);
        let i = 0;
        const selectMenus: MessageSelectMenu[] = [];
        for (const subset of ArrayUtilities.breakArrayIntoSubsets(guildsToChoose, 25)) {
            selectMenus.push(
                new MessageSelectMenu()
                    .setCustomId(`${uniqueId}_${i++}`)
                    .setOptions(subset.map(x => {
                        return { value: x.id, label: x.name };
                    }))
                    .setMaxValues(1)
                    .setMinValues(1)
            );
        }

        const askMsg = await GlobalFgrUtilities.sendMsg(
            user,
            {
                embeds: [
                    MessageUtilities.generateBlankEmbed(user)
                        .setTitle("Select Server")
                        .setDescription("The message above will be sent to a designated server of your choice."
                            + " Please select the server by using the select menu below. If you don't want to select"
                            + " a server, press the **Cancel** button.")
                ],
                components: AdvancedCollector.getActionRowsFromComponents([
                    ...selectMenus,
                    ButtonConstants.CANCEL_BUTTON
                ])
            }
        );

        if (!askMsg) {
            return null;
        }

        const result = await AdvancedCollector.startInteractionCollector({
            targetChannel: askMsg.channel,
            acknowledgeImmediately: false,
            clearInteractionsAfterComplete: false,
            deleteBaseMsgAfterComplete: true,
            duration: 60 * 1000,
            oldMsg: askMsg,
            targetAuthor: user
        });

        if (!result || !result.isSelectMenu()) {
            return null;
        }

        return guildsToChoose.find(x => x.id === result.values[0])!;
    }

    /**
     * A function that should be called when a member sends a message through the bot to the guild's modmail system.
     * @param {Message} msg The message that the user sent through the bot's direct messages.
     * @param {Guild} toGuild The guild to send the message to.
     * @returns {Promise<boolean>} Whether the process succeeded.
     */
    export async function sendMessageToThread(msg: Message, toGuild: Guild): Promise<boolean> {
        const guildDoc = await MongoManager.getOrCreateGuildDoc(toGuild.id, true);
        const modmailChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            toGuild,
            guildDoc.channels.modmailChannelId
        );

        if (!modmailChannel) {
            return false;
        }

        const embed = getEmbedForModmail(msg.author, msg);
        const existingChan = await findModmailThreadByUser(msg.author, toGuild, guildDoc);
        if (existingChan) {
            embed.setTitle("Modmail Response")
                .setColor(GENERAL_THREAD_COLOR);

            const r = await GlobalFgrUtilities.sendMsg(existingChan, {
                embeds: [embed]
            });

            if (!r) {
                await MessageUtilities.tryReact(msg, EmojiConstants.WARNING_EMOJI);
                return false;
            }

            return true;
        }

        // otherwise, we need to create it
        embed.setTitle("Modmail Received.")
            .setColor(NOT_RESPONDED_TO_COLOR)
            .addField("Directions", NEW_MODMAIL_INSTRUCTIONS);

        const mm = await GlobalFgrUtilities.sendMsg(modmailChannel, {
            embeds: [embed],
            components: AdvancedCollector.getActionRowsFromComponents([
                ButtonConstants.OPEN_THREAD_BUTTON,
                ButtonConstants.REMOVE_BUTTON,
                // ButtonConstants.BLACKLIST_BUTTON
            ])
        });

        return !!mm;
    }

    /**
     * A function that should be called when a staff member responds to the user's modmail message.
     * @param {ThreadChannel} thread The thread channel where this response occurred.
     * @param {User} author The author of this message.
     * @param {Message | string} msg The message that will be used to respond back.
     * @param {boolean} anon Whether to be anonymous or not.
     * @returns {Promise<boolean>}
     */
    export async function sendMessageToUser(thread: ThreadChannel, author: User, msg: Message | string,
                                            anon: boolean): Promise<boolean> {
        const guild = thread.guild;
        const guildDoc = await MongoManager.getOrCreateGuildDoc(guild.id, true);
        const modmailChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            thread.guild,
            guildDoc.channels.modmailChannelId
        );

        if (!modmailChannel) {
            return false;
        }

        const t = guildDoc.properties.modmailThreads.find(x => x.threadId === thread.id);
        if (!t) {
            return false;
        }

        const member = await GuildFgrUtilities.fetchGuildMember(guild, t.recipientId);
        if (!member) {
            return false;
        }

        const embedToSave = getEmbedForModmail(author, msg).setColor(GENERAL_THREAD_COLOR);
        const embedToRecipient = getEmbedForModmail(author, msg).setColor(GENERAL_THREAD_COLOR);
        if (anon) {
            embedToRecipient.setAuthor({ name: `${guild.name} Staff`, iconURL: guild.iconURL() ?? undefined })
                .setFooter({ text: guild.id });
            embedToSave.setAuthor({ name: `${author.tag} (Anonymous)`, iconURL: author.displayAvatarURL() });
        }

        const m = await GlobalFgrUtilities.sendMsg(thread, { embeds: [embedToSave] });
        if (!m) {
            return false;
        }

        const r = await GlobalFgrUtilities.sendMsg(member, { embeds: [embedToRecipient] });
        if (!r) {
            m.embeds[0].addField("Warning", "This message could not be sent to the recipient; did they block the bot?");
            await MessageUtilities.tryEdit(m, { embeds: [m.embeds[0]] });
        }

        return !!r;
    }

    /**
     * Starts a modmail thread with the specified user.
     * @param {GuildMember} user The user.
     * @param {GuildMember} moderator The moderator.
     * @returns {Promise<boolean>} Whether this succeeded.
     */
    export async function startModmailWithUser(user: GuildMember,
                                               moderator: GuildMember): Promise<boolean> {
        const guild = user.guild;
        const guildDoc = await MongoManager.getOrCreateGuildDoc(guild.id, true);

        const modmailChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            guild,
            guildDoc.channels.modmailChannelId
        );

        if (!modmailChannel) {
            return false;
        }

        const thread = await findModmailThreadByUser(user.user, guild, guildDoc);
        if (thread) {
            await GlobalFgrUtilities.sendMsg(thread, { content: moderator.toString() });
            return true;
        }

        const mm = await GlobalFgrUtilities.sendMsg(modmailChannel, {
            embeds: [
                new MessageEmbed()
                    .setAuthor({ name: user.user.tag, iconURL: user.user.displayAvatarURL() })
                    .setTimestamp()
                    .setFooter({ text: user.user.id })
                    .setDescription("*Thread created by command.*")
            ],
            components: AdvancedCollector.getActionRowsFromComponents([
                ButtonConstants.OPEN_THREAD_BUTTON,
                ButtonConstants.REMOVE_BUTTON,
                // ButtonConstants.BLACKLIST_BUTTON
            ])
        });

        if (!mm) {
            return false;
        }

        const [t] = await openModmailThread(guildDoc, mm, moderator);
        return !!t;
    }
}