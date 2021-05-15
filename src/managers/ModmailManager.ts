import {
    DMChannel, Emoji,
    EmojiResolvable,
    Guild,
    GuildMember,
    Message,
    MessageEmbed,
    MessageEmbedFooter,
    TextChannel,
    User
} from "discord.js";
import {MongoManager} from "./MongoManager";
import {AdvancedCollector} from "../utilities/collectors/AdvancedCollector";
import {ArrayUtilities} from "../utilities/ArrayUtilities";
import {InteractionManager} from "./InteractionManager";
import {MessageUtilities} from "../utilities/MessageUtilities";
import {Emojis} from "../constants/Emojis";
import {IGuildInfo} from "../definitions/major/IGuildInfo";
import {StringBuilder} from "../utilities/StringBuilder";
import {StringUtil} from "../utilities/StringUtilities";
import {MiscUtilities} from "../utilities/MiscUtilities";
import {IModmailThread} from "../definitions/IModmailThread";
import {FetchRequestUtilities} from "../utilities/FetchRequestUtilities";

export namespace ModmailManager {

    /**
     * This function should be called when someone DMs the bot. This will:
     * - Forward the message to the designated guild.
     * - Update the database to account for the new modmail message.
     *
     * We assume that the DM channel is open (i.e. there is no need to validate that the author's DMs are open to
     * the public).
     *
     * @param {User} author The author of the modmail message.
     * @param {Message} msg The message.
     */
    export async function initiateModmailContact(author: User, msg: Message): Promise<void> {
        // Validate that they are not in an interaction menu.
        if (InteractionManager.InteractiveMenu.has(author.id)) return;
        // Validate that the message length is more than 15 characters long.
        if (msg.content.length <= 15 && msg.attachments.size === 0) {
            const baseMessage = await author.send(MessageUtilities.generateBlankEmbed(author, "RANDOM")
                .setTitle("Confirm Send Modmail Message")
                .setDescription("Just now, you tried sending the above message to modmail. Are you sure you want to "
                    + "send this message?")
                .setFooter("Modmail Confirmation"));
            const confirmSend = await new AdvancedCollector(author.dmChannel as DMChannel, author, 1, "M")
                .waitForSingleReaction(baseMessage, {
                    reactToMsg: true,
                    reactions: [Emojis.GREEN_CHECK_EMOJI, Emojis.X_EMOJI],
                    deleteBaseMsgAfterComplete: true
                });
            if (!confirmSend || confirmSend.name === Emojis.X_EMOJI) return;
        }

        // We begin by asking them what guild they want to send their message to.
        InteractionManager.InteractiveMenu.set(author.id, "PRE_MODMAIL");
        const uncheckedGuild = await chooseGuild(author);
        // Remove this entry after 1 second just in case.
        setTimeout(() => InteractionManager.InteractiveMenu.delete(author.id), 1000);

        // No guilds are available.
        if (!uncheckedGuild) {
            const noGuildsEmbed = MessageUtilities.generateBlankEmbed(author, "RED")
                .setTitle("No Valid Servers")
                .setDescription("The servers you are in have not configured their moderation mail module yet. " +
                    "As such, there is no one to message.")
                .setFooter("No Servers Found!");
            MessageUtilities.sendThenDelete({embed: noGuildsEmbed}, author);
            return;
        }

        // The user canceled.
        if (uncheckedGuild === "CANCEL") return;

        // Otherwise, we have a guild.
        const [guild, guildDoc] = uncheckedGuild;
        // We have a modmail channel because that was one condition of the chooseGuild function
        const modmailChannel = guild.channels.cache
            .get(guildDoc.channels.modmailChannels.modmailChannelId) as TextChannel;
        // Check if the person is blacklisted from using modmail.
        if (guildDoc.moderation.blacklistedModmailUsers.some(x => x.discordId === author.id)) {
            await msg.react(Emojis.DENIED_EMOJI).catch();
            return;
        }
        // And then tell the user that we sent it.
        await msg.react(Emojis.MAIL_EMOJI).catch();

        // Now let's deal with actually sending it.
        // First, process all attachments.
        const attachments = new StringBuilder();
        let indexAttachment = 0;
        for (const [, attachment] of msg.attachments) {
            if (indexAttachment > 6) {
                break;
            }
            // [attachment](url) (type of attachment)
            attachments.append(`[Attachment ${indexAttachment + 1}](${attachment.url}) `)
                .append(`(\`${attachment.url.split(".")[attachment.url.split(".").length - 1]}\`)`)
                .appendLine();
            ++indexAttachment;
        }

        // Base embed
        const modMailEmbed = MessageUtilities.generateBlankEmbed(author, "RED")
            // the content of the modmail msg
            .setDescription(msg.content)
            .setTimestamp();

        // Get the modmail thread entry
        const threadEntry = guildDoc.properties.modmailThreads.find(x => x.initiatorId === author.id);
        // Second, let's see where the modmail message will actually go to.
        // We begin first by checking if there is a modmail thread.
        if (threadEntry) {
            // Is there a valid channel?
            const threadChannel = guild.channels.cache.get(threadEntry.channel) as TextChannel | undefined;
            // If the thread channel exists, then send to that channel.
            if (threadChannel) {
                modMailEmbed.setTitle(`${author.tag} ⇒ Modmail Thread`)
                    .setFooter(`${author.id} • Modmail Thread`);
                // Append attachments.
                if (attachments.length() !== 0)
                    modMailEmbed.addField("Attachments", attachments.toString());
                // Send the message + add reactions.
                const modMailThreadMessage = await threadChannel.send(modMailEmbed);
                await modMailThreadMessage.react(Emojis.CLIPBOARD_EMOJI).catch();
                // And now update the database.
                await MongoManager.getGuildCollection().updateOne({
                    guildId: guild.id,
                    "properties.modmailThreads.channel": threadChannel.id
                }, {
                    $push: {
                        "properties.modmailThread.$.messages": {
                            authorId: author.id,
                            tag: author.tag,
                            timeSent: Date.now(),
                            content: msg.content,
                            attachments: msg.attachments.size === 0 ? [] : msg.attachments.array().map(x => x.url)
                        }
                    }
                });
                return;
            } // End of if

            // If no channel exists, we pull the entry out of the database and treat it like a normal modmail message.
            await MongoManager.getGuildCollection().updateOne({
                guildId: guild.id
            }, {
                $pull: {
                    "properties.modmailThreads": {
                        channel: threadEntry.channel
                    }
                }
            });
        }

        modMailEmbed
            .setFooter(`${author.id} • Modmail Message`)
            .setTitle(`${Emojis.X_EMOJI} Modmail Entry`);
        if (attachments.length() !== 0)
            modMailEmbed.addField("Attachments", attachments);

        const senderInfoStr = new StringBuilder()
            .append(`⇒ Mention: ${author}`)
            .appendLine()
            .append(`⇒ Tag: ${author.tag}`)
            .appendLine()
            .append(`⇒ ID: ${author.id}`);
        modMailEmbed.addField("Sender Information", senderInfoStr.toString())
            // responses -- any mods that have responded
            .addField("Last Response By", "None.");
        const modMailMessage = await modmailChannel.send(modMailEmbed);
        // respond reaction
        await modMailMessage.react(Emojis.CLIPBOARD_EMOJI).catch();
        // garbage reaction
        await modMailMessage.react(Emojis.WASTEBIN_EMOJI).catch();
        // blacklist
        await modMailMessage.react(Emojis.DENIED_EMOJI).catch();
        // redirect
        await modMailMessage.react(Emojis.REDIRECT_EMOJI).catch();
    }

    /**
     * A function that creates a modmail thread. This will:
     * - Create a new channel where all modmail messages sent to/from `targetMember` will be redirected to.
     *
     * This should be called if a staff member wants to start a modmail thread with a person.
     *
     * @param {GuildMember} targetMember The member to target.
     * @param {GuildMember} initiatedBy The person that started this thread.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {string} [content] The contents of the message, if any.
     */
    export async function startThreadedModmailWithMember(targetMember: GuildMember, initiatedBy: GuildMember,
                                                         guildDoc: IGuildInfo, content?: string): Promise<void> {
        // If the modmail channel doesn't exists, then return.
        const modmailChannel = initiatedBy.guild.channels.cache
            .get(guildDoc.channels.modmailChannels.modmailChannelId) as TextChannel | undefined;
        if (!modmailChannel) {
            const mmChannelNoExistEmbed = MessageUtilities.generateBlankEmbed(initiatedBy, "RED")
                .setTitle("Modmail Channel Doesn't Exist")
                .setDescription("The modmail channel doesn't exist. Please configure one and then try again.")
                .setFooter("Modmail");
            MessageUtilities.sendThenDelete({embed: mmChannelNoExistEmbed}, initiatedBy, 20 * 1000);
            return;
        }

        const modmailCategory = modmailChannel.parent;
        if (!modmailCategory) {
            const categoryNoExistEmbed = MessageUtilities.generateBlankEmbed(initiatedBy, "RED")
                .setTitle("No Modmail Category")
                .setDescription("Your modmail channel doesn't have a category. Please put your modmail channel in a "
                    + "dedicated modmail category.")
                .setFooter("Modmail");
            MessageUtilities.sendThenDelete({embed: categoryNoExistEmbed}, initiatedBy, 20 * 1000);
            return;
        }

        // Step 1: is the person blacklisted?
        const blacklistInfo = guildDoc.moderation.blacklistedModmailUsers
            .find(x => x.discordId === targetMember.id);
        if (blacklistInfo) {
            const blModmailEmbed = MessageUtilities.generateBlankEmbed(targetMember, "RED")
                .setTitle("User Blacklisted From Modmail")
                .setDescription(`${targetMember} is blacklisted from using modmail. You are not able to create a `
                    + "thread for this person.")
                .addField("Reason", StringUtil.codifyString(blacklistInfo.reason))
                .setFooter("Modmail");
            MessageUtilities.sendThenDelete({embed: blModmailEmbed}, initiatedBy, 30 * 1000);
            return;
        }

        // Step 2: Does the person already have a modmail thread channel?
        const modmailInfo = guildDoc.properties.modmailThreads.find(x => x.initiatorId === targetMember.id);
        if (modmailInfo) {
            const channel = targetMember.guild.channels.cache.get(modmailInfo.channel) as TextChannel | undefined;
            // If the channel exists:
            if (channel) {
                const channelExistsEmbed = MessageUtilities.generateBlankEmbed(targetMember, "RED")
                    .setTitle("Modmail Thread Exists")
                    .setDescription(`A modmail thread for ${targetMember} already exists. You can find the channel`
                        + `here: ${channel}.`)
                    .setFooter("Modmail Thread Already Exists.");
                MessageUtilities.sendThenDelete({embed: channelExistsEmbed}, initiatedBy, 30 * 1000);
                return;
            }

            // Otherwise, the channel doesn't exist.
            // So remove it.
            await MongoManager.getGuildCollection().updateOne({
                guildId: targetMember.guild.id
            }, {
                $pull: {
                    "properties.modmailThreads": {
                        channel: modmailInfo.channel
                    }
                }
            });
        }

        // Create a new channel. Put it in same category as the modmail channel.
        const createdTime = Date.now();
        const channelName = `${targetMember.user.username}-${targetMember.user.discriminator}`;
        const threadChannel = await initiatedBy.guild.channels.create(channelName, {
            type: "text",
            parent: modmailCategory,
            topic: new StringBuilder().append(`Modmail Thread For: ${targetMember}`).appendLine()
                .append(`Created By: ${initiatedBy}`).appendLine()
                .append(`Created Time: ${MiscUtilities.getTime(createdTime)}`)
                .toString()
        });
        await threadChannel.lockPermissions().catch();

        const descSb = new StringBuilder(`⇒ **Initiated By:** ${initiatedBy}`)
            .appendLine()
            .append(`⇒ **Recipient:** ${targetMember}`)
            .appendLine()
            .append(`⇒ **Thread Creation Time:** ${MiscUtilities.getTime(createdTime)}`);
        const reactionSb = new StringBuilder()
            .append(`⇒ React with ${Emojis.CLIPBOARD_EMOJI} to send a message. You may also use the \`;respond\` `)
            .append("command.")
            .appendLine()
            .append(`⇒ React with ${Emojis.RED_SQUARE_EMOJI} to close this thread.`)
            .appendLine()
            .append(`⇒ React with ${Emojis.DENIED_EMOJI} to modmail blacklist the author of this modmail.`);

        const baseMsgEmbed = MessageUtilities.generateBlankEmbed(targetMember.user)
            .setTitle(`Modmail Thread ⇒ ${targetMember.user.tag}`)
            .setDescription(descSb.toString())
            .addField("Reactions", reactionSb.toString())
            .setTimestamp()
            .setFooter("Modmail Thread • Created");
        const baseMessage: Message = await threadChannel.send(baseMsgEmbed);
        AdvancedCollector.reactFaster(baseMessage, [
            Emojis.CLIPBOARD_EMOJI,
            Emojis.RED_SQUARE_EMOJI,
            Emojis.DENIED_EMOJI
        ]);
        await baseMessage.pin().catch();

        // Don't inline in case we need to change any properties of this object.
        const modmailObj: IModmailThread = {
            initiatorId: targetMember.id,
            baseMsg: baseMessage.id,
            startedOn: createdTime,
            channel: threadChannel.id,
            originalModmailMessageId: baseMessage.id,
            messages: content ? [
                {
                    authorId: initiatedBy.id,
                    attachments: [],
                    tag: initiatedBy.user.tag,
                    content: content,
                    timeSent: new Date().getTime()
                }
            ] : []
        };
        await MongoManager.getGuildCollection().updateOne({
            guildId: targetMember.guild.id
        }, {
            $push: {
                "properties.modmailThreads": modmailObj
            }
        });

        // Ping the person that created this.
        MessageUtilities.sendThenDelete({content: initiatedBy.toString()}, threadChannel, 2000);

        // If no content, exit.
        if (!content) return;

        const replyEmbed: MessageEmbed = MessageUtilities.generateBlankEmbed(initiatedBy.guild)
            .setTitle(`${initiatedBy.guild.name} ⇒ You`)
            .setDescription(content)
            .setFooter("Modmail");

        // Validate that the message has been sent.
        const msgResult = await FetchRequestUtilities.sendMsg(targetMember, {embed: replyEmbed});
        const replyRecordsEmbed = MessageUtilities.generateBlankEmbed(initiatedBy.user, msgResult ? "GREEN" : "YELLOW")
            .setTitle(`${initiatedBy.displayName} ⇒ ${targetMember.user.tag}`)
            .setDescription(content)
            .setFooter("Sent Anonymously")
            .setTimestamp();

        if (!msgResult)
            replyRecordsEmbed.addField(`${Emojis.WARNING_EMOJI} Error`, "Something went wrong when trying to send" +
                " this modmail message. The recipient has either blocked the bot or prevented server members from" +
                " DMing him/her.");

        await threadChannel.send(replyRecordsEmbed).catch();
    }

    /**
     * Converts a modmail message to a thread. Should be called when reacting to 🔀.
     * @param originalMmMsg The original modmail message. This must be a valid modmail message.
     * @param convertedToThreadBy The person that converted the modmail message to a thread.
     */
    export async function convertToThread(originalMmMsg: Message, convertedToThreadBy: GuildMember): Promise<void> {
        if (!convertedToThreadBy.guild.me || !convertedToThreadBy.guild.me.hasPermission("MANAGE_CHANNELS"))
            return;
        const oldEmbed = originalMmMsg.embeds[0];
        const authorOfModmailId = ((oldEmbed.footer as MessageEmbedFooter).text as string).split("•")[0].trim();
        const guild = originalMmMsg.guild as Guild;
        const guildDoc = await MongoManager.getOrCreateGuildDb(guild.id);

        // Is the person still in the guild?
        const authorOfModmail = await FetchRequestUtilities.fetchGuildMember(guild, authorOfModmailId);
        if (!authorOfModmail) {
            const notInGuildEmbed = MessageUtilities.generateBlankEmbed(convertedToThreadBy, "RED")
                .setTitle("Target Member Unavailable.")
                .setDescription(`The person with ID \`${authorOfModmailId}\` is not in the server anymore. This `
                    + "modmail message will be deleted in 10 seconds.")
                .setFooter("Unable to Convert Modmail Message.");
            await originalMmMsg.edit(notInGuildEmbed)
                .then(x => x.delete({timeout: 10 * 1000}))
                .catch();
            return;
        }

        // Is the person blacklisted?
        const blacklistInfo = guildDoc.moderation.blacklistedModmailUsers
            .find(x => x.discordId === authorOfModmail.id);
        if (blacklistInfo) {
            const noUserFoundEmbed = MessageUtilities.generateBlankEmbed(convertedToThreadBy.user, "RED")
                .setTitle("User Blacklisted From Modmail")
                .setDescription(`${authorOfModmail} is currently blacklisted from using modmail. You are unable to `
                    + "create a thread for this person.")
                .addField("Reason", blacklistInfo.reason)
                .setFooter("Modmail");
            await originalMmMsg.edit(noUserFoundEmbed)
                .then(x => x.delete({timeout: 5 * 1000}))
                .catch();
            return;
        }

        // Does this person have a thread already?
        const modmailInfo = guildDoc.properties.modmailThreads.find(x => x.initiatorId === authorOfModmail.id);
        if (modmailInfo) {
            const channel = guild.channels.cache.get(modmailInfo.channel) as TextChannel | undefined;
            // If the channel exists:
            if (channel) {
                await MessageUtilities.sendThenDelete({content: convertedToThreadBy}, channel);
                return;
            }

            // Otherwise, the channel doesn't exist.
            // So remove it.
            await MongoManager.getGuildCollection().updateOne({guildId: guild.id}, {
                $pull: {
                    "properties.modmailThreads": {
                        channel: modmailInfo.channel
                    }
                }
            });
        }

        // Now we can begin.
        const modmailChannel = convertedToThreadBy.guild.channels.cache
            .get(guildDoc.channels.modmailChannels.modmailChannelId) as TextChannel | undefined;
        if (!modmailChannel) return;
        const modmailCategory = modmailChannel.parent;
        if (modmailCategory === null) return;

        // max size of category = 50
        if (modmailCategory.children.size + 1 > 50) return;

        // Create the channel.
        const createdTime = new Date().getTime();
        const channelName = `${authorOfModmail.user.username}-${authorOfModmail.user.discriminator}`;
        const description = new StringBuilder()
            .append(`⇒ **Modmail Thread for:** ${authorOfModmail}`)
            .appendLine()
            .append(`⇒ **Converted to Thread by:** ${convertedToThreadBy}`)
            .appendLine()
            .append(`⇒ **Created By:** ${MiscUtilities.getTime(createdTime)}`);
        const threadChannel = await convertedToThreadBy.guild.channels.create(channelName, {
            type: "text",
            parent: modmailCategory,
            topic: description.toString()
        });
        await threadChannel.lockPermissions().catch();

        // Create the base message.
        const reactionInfo = new StringBuilder()
            .append(`⇒ React to ${Emojis.CLIPBOARD_EMOJI} to send a message.`)
            .appendLine()
            .append(`⇒ React to ${Emojis.RED_SQUARE_EMOJI} to close this thread.`)
            .appendLine()
            .append(`⇒ React to ${Emojis.DENIED_EMOJI} to modmail blacklist the author of this modmail thread.`);
        const baseMsgEmbed = MessageUtilities.generateBlankEmbed(authorOfModmail.user)
            .setTitle(`Modmail Thread ⇒ ${authorOfModmail.user.tag}`)
            .setDescription(description.toString())
            .addField("Reaction Guide", reactionInfo.toString())
            .setTimestamp()
            .setFooter("Modmail Thread • Converted");

        const baseMessage = await threadChannel.send(baseMsgEmbed);
        AdvancedCollector.reactFaster(baseMessage, [
            Emojis.CLIPBOARD_EMOJI,
            Emojis.RED_SQUARE_EMOJI,
            Emojis.DENIED_EMOJI
        ]);
        await baseMessage.pin().catch();

        // Now, send the first message (copy the message from modmail channel).
        const firstMsgEmbed = MessageUtilities.generateBlankEmbed(authorOfModmail.user, "RED")
            .setTitle(`${authorOfModmail.user.tag} ⇒ Modmail Thread`)
            .setFooter(`${authorOfModmail.id} • Modmail Thread`)
            .setTimestamp();
        const attachmentsIndex = originalMmMsg.embeds[0].fields
            .findIndex(x => x.name === "Attachments");
        let desc = "";
        if (originalMmMsg.embeds[0].description !== null) {
            desc = originalMmMsg.embeds[0].description;
            firstMsgEmbed.setDescription(originalMmMsg.embeds[0].description);
        }

        if (attachmentsIndex !== -1)
            firstMsgEmbed.addField("Attachments", originalMmMsg.embeds[0].fields[attachmentsIndex].value);
        const firstMsg = await threadChannel.send(firstMsgEmbed);
        await firstMsg.react(Emojis.CLIPBOARD_EMOJI).catch();

        const threadInfo: IModmailThread = {
            initiatorId: authorOfModmail.id,
            baseMsg: baseMessage.id,
            startedOn: createdTime,
            channel: threadChannel.id,
            originalModmailMessageId: originalMmMsg.id,
            messages: [
                {
                    authorId: authorOfModmail.id,
                    tag: authorOfModmail.user.tag,
                    timeSent: new Date().getTime(),
                    content: desc,
                    attachments: []
                }
            ]
        };

        // Update database + update old modmail message.
        await MongoManager.getGuildCollection().updateOne({guildID: convertedToThreadBy.guild.id}, {
            $push: {
                "properties.modMail": threadInfo
            }
        });

        oldEmbed.setFooter("Converted to Modmail Thread.");
        oldEmbed.addField("Modmail Thread Information", new StringBuilder()
            .append("This modmail message was converted to a thread.")
            .appendLine()
            .append(`⇒ **Converted to Thread by:** ${convertedToThreadBy}`)
            .appendLine()
            .append(`⇒ **Created By:** ${MiscUtilities.getTime(createdTime)}`)
            .toString());
        await originalMmMsg.edit(oldEmbed).catch();
        await originalMmMsg.reactions.removeAll().catch();
    }

    /**
     * Blacklists the author of the modmail message from using modmail.
     * @param {Message} origMmMessage The original modmail message.
     * @param {GuildMember} mod The moderator that wants to blacklist the author of the modmail message.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {IModmailThread} threadInfo The thread info, if any.
     */
    export async function blacklistFromModmail(origMmMessage: Message, mod: GuildMember, guildDoc: IGuildInfo,
                                               threadInfo?: IModmailThread): Promise<void> {
        const oldEmbed = origMmMessage.embeds[0];
        const authorOfModmailId = threadInfo
            ? threadInfo.originalModmailMessageId
            : ((oldEmbed.footer as MessageEmbedFooter).text as string).split("•")[0].trim();
        await origMmMessage.reactions.removeAll().catch();

        // Start by asking if we want to blacklist.
        const confirmBlacklistEmbed = MessageUtilities.generateBlankEmbed(mod.user, "RED")
            .setTitle("Blacklist From Modmail")
            .setDescription("Are you sure you want to blacklist the user (with ID " + authorOfModmailId + ") from "
                + "using modmail? He or she will not be notified and this blacklist is indefinite.")
            .setFooter("Confirmation");
        await origMmMessage.edit(confirmBlacklistEmbed).catch();
        const reactions: EmojiResolvable[] = [Emojis.GREEN_CHECK_EMOJI, Emojis.X_EMOJI];
        const result: Emoji | null = await new AdvancedCollector(origMmMessage.channel as TextChannel, mod, 2, "M")
            .waitForSingleReaction(origMmMessage, {
                reactions: reactions,
                reactToMsg: true,
                removeAllReactionAfterReact: true
            });

        if (!result || result.name === Emojis.X_EMOJI) {
            await origMmMessage.edit(oldEmbed).catch();
            // Was thread
            if (threadInfo) {
                AdvancedCollector.reactFaster(origMmMessage, [
                    Emojis.CLIPBOARD_EMOJI,
                    Emojis.RED_SQUARE_EMOJI,
                    Emojis.DENIED_EMOJI
                ]);
                return;
            }
            // Was normal message.
            AdvancedCollector.reactFaster(origMmMessage, [
                Emojis.CLIPBOARD_EMOJI,
                Emojis.WASTEBIN_EMOJI,
                Emojis.DENIED_EMOJI,
                Emojis.REDIRECT_EMOJI
            ]);
            return;
        }

        const blacklistInfo = guildDoc.moderation.blacklistedModmailUsers.find(x => x.discordId === authorOfModmailId);

        // If this person was already blacklisted.
        if (blacklistInfo) {
            await origMmMessage.delete().catch();
            return;
        }

        // Update databases accordingly
        await MongoManager.getGuildCollection().updateOne({guildID: mod.guild.id}, {
            $push: {
                "moderation.blacklistedModmailUsers": {
                    discordId: authorOfModmailId,
                    moderatorName: mod.displayName,
                    dateTime: new Date().getTime(),
                    reason: "AUTO: Blacklisted from Modmail Control Panel."
                }
            }
        });

        if (threadInfo) {
            await MongoManager.getGuildCollection().updateOne({guildDoc: mod.guild.id}, {
                $pull: {
                    "properties.modmailThreads": {
                        channel: threadInfo.channel
                    }
                }
            });
        }

        const embedToReplaceOld = MessageUtilities.generateBlankEmbed(mod.user)
            .setTitle("Blacklisted From Modmail")
            .setDescription("This modmail message has been deleted because the author of this modmail message has"
                + " been blacklisted.")
            .setFooter("Blacklisted from Modmail.");
        await origMmMessage.edit(embedToReplaceOld)
            .then(x => x.delete({timeout: 5 * 1000}))
            .catch();

        // Log this to moderation logs.
        const blacklistLogsChannel = mod.guild.channels.cache
            .get(guildDoc.channels.logging.blacklistLoggingChannelId) as TextChannel | undefined;
        if (!blacklistLogsChannel) return;

        const modLogEmbed = MessageUtilities.generateBlankEmbed(mod.user, "RED")
            .setTitle("Modmail Blacklisted.")
            .setDescription(`⇒ **Blacklisted ID:** ${authorOfModmailId}\n⇒ **Moderator:** ${mod} (${mod.id})`)
            .addField("⇒ Reason", "AUTOMATIC: Blacklisted from Modmail Control Panel.")
            .setFooter("Blacklisted from Modmail.")
            .setTimestamp();
        await blacklistLogsChannel.send(modLogEmbed).catch();
    }

    /**
     * Selects a guild where the modmail message should be sent to. This is invoked if and only if the member is
     * able to send a message to the bot (which implies that the bot is able to send a message to the user).
     * @param {User} user The user.
     * @return {Promise<[Guild, IGuildInfo] | "CANCEL" | null>} The guild and its corresponding guild doc, if any.
     * @private
     */
    async function chooseGuild(user: User): Promise<[Guild, IGuildInfo] | "CANCEL" | null> {
        const guildsToChoose: [Guild, IGuildInfo][] = [];
        const allGuilds = await MongoManager.getGuildCollection()
            .find({}).toArray();
        for (const [id, guild] of user.client.guilds.cache) {
            const idx = allGuilds.findIndex(x => x.guildId === id);
            if (idx === -1) continue;
            // Guild must have the user.
            // Guild must have the verified role.
            // Guild must have the modmail channel.
            if (guild.members.cache.has(user.id)
                && guild.roles.cache.has(allGuilds[idx].roles.verifiedRoleId)
                && guild.channels.cache.has(allGuilds[idx].channels.modmailChannels.modmailChannelId))
                guildsToChoose.push([guild, allGuilds[idx]]);
        }

        if (guildsToChoose.length === 0) return null;
        if (guildsToChoose.length === 1) return guildsToChoose[0];

        const askForGuildEmbed = new MessageEmbed()
            .setAuthor(user.tag, user.displayAvatarURL())
            .setTitle("Select Server")
            .setDescription("The message sent above will be sent to a designated server of your choice. Please " +
                "select the server by typing the number corresponding to the server that you want to. To cancel, " +
                "please type `cancel`.")
            .setColor("RANDOM")
            .setFooter(`${guildsToChoose.length} Servers.`);
        const arrFieldsContent: string[] = ArrayUtilities.arrayToStringFields<[Guild, IGuildInfo]>(
            guildsToChoose,
            (i, elem) => `\`[${i + 1}]\` ${elem[0].name}\n`
        );
        for (const elem of arrFieldsContent) askForGuildEmbed.addField("Possible Guilds", elem);

        const selectedGuildIdx: number | null = await new AdvancedCollector(user.dmChannel as DMChannel, user, 1, "M")
            .startNormalCollector({
                embed: askForGuildEmbed
            }, AdvancedCollector.getNumberPrompt(user.dmChannel as DMChannel, {
                min: 1, max: guildsToChoose.length
            }), {
                cancelFlag: "cancel"
            });
        return selectedGuildIdx === null ? "CANCEL" : guildsToChoose[selectedGuildIdx - 1];
    }
}