import {
    ButtonInteraction,
    Collection,
    Guild,
    GuildMember,
    Message, MessageActionRow, MessageAttachment, MessageButton,
    MessageEmbed, Snowflake,
    TextChannel,
    User
} from "discord.js";
import {MongoManager} from "./MongoManager";
import {AdvancedCollector} from "../utilities/collectors/AdvancedCollector";
import {ArrayUtilities} from "../utilities/ArrayUtilities";
import {InteractionManager} from "./InteractionManager";
import {MessageUtilities} from "../utilities/MessageUtilities";
import {Emojis} from "../constants/Emojis";
import {IGuildInfo} from "../definitions/db/IGuildInfo";
import {StringBuilder} from "../utilities/StringBuilder";
import {StringUtil} from "../utilities/StringUtilities";
import {MiscUtilities} from "../utilities/MiscUtilities";
import {IModmailThread, IModmailThreadMessage} from "../definitions/IModmailThread";
import {FetchGetRequestUtilities} from "../utilities/FetchGetRequestUtilities";
import {GeneralConstants} from "../constants/GeneralConstants";

export namespace ModmailManager {
    // Key: person responding to modmail.
    // Value: the person that is being responded to.
    export const CurrentlyRespondingToModMail: Collection<string, string> = new Collection<string, string>();

    const ReplyActionRow: MessageActionRow = new MessageActionRow()
        .addComponents(new MessageButton()
            .setLabel("Reply")
            .setEmoji(Emojis.CLIPBOARD_EMOJI)
            .setStyle(MessageButtonStyles.PRIMARY)
            .setCustomID("modmail_reply"));

    const ModmailGeneralActionRows: MessageActionRow[] = MiscUtilities.getActionRowsFromButtons([
        new MessageButton()
            .setLabel("Reply")
            .setEmoji(Emojis.CLIPBOARD_EMOJI)
            .setStyle(MessageButtonStyles.PRIMARY)
            .setCustomID("modmail_reply"),
        new MessageButton()
            .setLabel("Delete")
            .setEmoji(Emojis.WASTEBIN_EMOJI)
            .setStyle(MessageButtonStyles.DANGER)
            .setCustomID("modmail_delete"),
        new MessageButton()
            .setLabel("Blacklist")
            .setEmoji(Emojis.DENIED_EMOJI)
            .setStyle(MessageButtonStyles.DANGER)
            .setCustomID("modmail_blacklist"),
        new MessageButton()
            .setLabel("Convert to Thread")
            .setEmoji(Emojis.REDIRECT_EMOJI)
            .setStyle(MessageButtonStyles.PRIMARY)
            .setCustomID("modmail_create_thread")
    ]);

    const ModmailThreadActionRows: MessageActionRow[] = MiscUtilities.getActionRowsFromButtons([
        new MessageButton()
            .setLabel("Reply")
            .setEmoji(Emojis.CLIPBOARD_EMOJI)
            .setStyle(MessageButtonStyles.PRIMARY)
            .setCustomID("modmail_reply"),
        new MessageButton()
            .setLabel("Delete")
            .setEmoji(Emojis.WASTEBIN_EMOJI)
            .setStyle(MessageButtonStyles.DANGER)
            .setCustomID("modmail_delete"),
        new MessageButton()
            .setLabel("Blacklist")
            .setEmoji(Emojis.DENIED_EMOJI)
            .setStyle(MessageButtonStyles.DANGER)
            .setCustomID("modmail_blacklist")
    ]);

    const ModmailResponseEmbedActionRows: MessageActionRow[] = MiscUtilities.getActionRowsFromButtons([
        new MessageButton()
            .setLabel("Send")
            .setEmoji(Emojis.CLIPBOARD_EMOJI)
            .setStyle(MessageButtonStyles.PRIMARY)
            .setCustomID("send"),
        new MessageButton()
            .setLabel("Cancel")
            .setEmoji(Emojis.X_EMOJI)
            .setStyle(MessageButtonStyles.DANGER)
            .setCustomID("cancel"),
        new MessageButton()
            .setLabel("Set Anonymity")
            .setEmoji(Emojis.EYES_EMOJI)
            .setStyle(MessageButtonStyles.PRIMARY)
            .setCustomID("anon")
    ]);

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
        // Make sure we can open DM channel.
        const dmChannel = await FetchGetRequestUtilities.openDirectMessage(author);
        if (!dmChannel)
            return;

        // Validate that they are not in an interaction menu.
        if (InteractionManager.InteractiveMenu.has(author.id)) return;
        // Validate that the message length is more than 15 characters long.
        if (msg.content.length <= 15 && msg.attachments.size === 0) {
            const baseMessage = await dmChannel.send({
                embeds: [
                    MessageUtilities.generateBlankEmbed(author, "RANDOM")
                        .setTitle("Confirm Send Modmail Message")
                        .setDescription("Just now, you tried sending the above message to modmail. Are you sure you want to "
                            + "send this message?")
                        .setFooter("Modmail Confirmation")
                ],
                components: MiscUtilities.getActionRowsFromButtons(GeneralConstants.YesNoButtons)
            });

            const confirmSend = await AdvancedCollector.startButtonCollector({
                targetChannel: dmChannel,
                targetAuthor: msg.author,
                oldMsg: baseMessage,
                duration: 60 * 1000,
                clearButtonsAfterComplete: false,
                acknowledgeImmediately: true,
                deleteBaseMsgAfterComplete: true
            });

            if (!confirmSend || confirmSend.customID === "no") return;
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
            MessageUtilities.sendThenDelete({embeds: [noGuildsEmbed]}, author);
            return;
        }

        // The user canceled.
        if (uncheckedGuild === "CANCEL") return;

        // Otherwise, we have a guild.
        const [guild, guildDoc] = uncheckedGuild;
        // We have a modmail channel because that was one condition of the chooseGuild function
        const modmailChannel = FetchGetRequestUtilities.getCachedChannel<TextChannel>(
            guild,
            guildDoc.channels.modmailChannels.modmailChannelId
        )!;
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
            const threadChannel = FetchGetRequestUtilities.getCachedChannel<TextChannel>(
                guild,
                threadEntry.channel
            );
            // If the thread channel exists, then send to that channel.
            if (threadChannel) {
                modMailEmbed.setTitle(`${author.tag} ⇒ Modmail Thread`)
                    .setFooter(`${author.id} • Modmail Thread`);
                // Append attachments.
                if (attachments.length() !== 0)
                    modMailEmbed.addField("Attachments", attachments.toString());
                // Send the message + add buttons.
                await threadChannel.send({
                    embeds: [modMailEmbed],
                    components: [ReplyActionRow]
                });
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
            modMailEmbed.addField("Attachments", attachments.toString());

        const senderInfoStr = new StringBuilder()
            .append(`⇒ Mention: ${author}`)
            .appendLine()
            .append(`⇒ Tag: ${author.tag}`)
            .appendLine()
            .append(`⇒ ID: ${author.id}`);
        modMailEmbed.addField("Sender Information", senderInfoStr.toString())
            // responses -- any mods that have responded
            .addField("Last Response By", "None.");
        await modmailChannel.send({
            embeds: [modMailEmbed],
            components: ModmailGeneralActionRows
        });
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
        const modmailChannel = FetchGetRequestUtilities.getCachedChannel<TextChannel>(
            targetMember.guild,
            guildDoc.channels.modmailChannels.modmailChannelId
        );
        if (!modmailChannel) {
            const mmChannelNoExistEmbed = MessageUtilities.generateBlankEmbed(initiatedBy, "RED")
                .setTitle("Modmail Channel Doesn't Exist")
                .setDescription("The modmail channel doesn't exist. Please configure one and then try again.")
                .setFooter("Modmail");
            MessageUtilities.sendThenDelete({embeds: [mmChannelNoExistEmbed]}, initiatedBy, 20 * 1000);
            return;
        }

        const modmailCategory = modmailChannel.parent;
        if (!modmailCategory) {
            const categoryNoExistEmbed = MessageUtilities.generateBlankEmbed(initiatedBy, "RED")
                .setTitle("No Modmail Category")
                .setDescription("Your modmail channel doesn't have a category. Please put your modmail channel in a "
                    + "dedicated modmail category.")
                .setFooter("Modmail");
            MessageUtilities.sendThenDelete({embeds: [categoryNoExistEmbed]}, initiatedBy, 20 * 1000);
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
            MessageUtilities.sendThenDelete({embeds: [blModmailEmbed]}, initiatedBy, 30 * 1000);
            return;
        }

        // Step 2: Does the person already have a modmail thread channel?
        const modmailInfo = guildDoc.properties.modmailThreads.find(x => x.initiatorId === targetMember.id);
        if (modmailInfo) {
            const channel = FetchGetRequestUtilities.getCachedChannel<TextChannel>(
                targetMember.guild,
                modmailInfo.channel
            );
            // If the channel exists:
            if (channel) {
                const channelExistsEmbed = MessageUtilities.generateBlankEmbed(targetMember, "RED")
                    .setTitle("Modmail Thread Exists")
                    .setDescription(`A modmail thread for ${targetMember} already exists. You can find the channel`
                        + `here: ${channel}.`)
                    .setFooter("Modmail Thread Already Exists.");
                MessageUtilities.sendThenDelete({embeds: [channelExistsEmbed]}, initiatedBy, 30 * 1000);
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
                .append(`Created Time: ${MiscUtilities.getTime(createdTime)}`).toString()
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
        const baseMessage: Message = await threadChannel.send({
            embeds: [baseMsgEmbed],
            components: ModmailThreadActionRows
        });
        await baseMessage.pin().catch();

        // Don't inline in case we need to change any properties of this object.
        const modmailObj: IModmailThread = {
            initiatorId: targetMember.id,
            initiatedById: initiatedBy.id,
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
        const msgResult = await FetchGetRequestUtilities.sendMsg(targetMember, {embeds: [replyEmbed]});
        const replyRecordsEmbed = MessageUtilities.generateBlankEmbed(initiatedBy.user, msgResult ? "GREEN" : "YELLOW")
            .setTitle(`${initiatedBy.displayName} ⇒ ${targetMember.user.tag}`)
            .setDescription(content)
            .setFooter("Sent Anonymously")
            .setTimestamp();

        if (!msgResult)
            replyRecordsEmbed.addField(`${Emojis.WARNING_EMOJI} Error`, "Something went wrong when trying to send" +
                " this modmail message. The recipient has either blocked the bot or prevented server members from" +
                " DMing him/her.");

        await threadChannel.send({embeds: [replyRecordsEmbed]}).catch();
    }

    /**
     * Converts a modmail message to a thread. Should be called when reacting to 🔀.
     * @param originalMmMsg The original modmail message. This must be a valid modmail message.
     * @param convertedToThreadBy The person that converted the modmail message to a thread.
     */
    export async function convertToThread(originalMmMsg: Message, convertedToThreadBy: GuildMember): Promise<void> {
        if (!convertedToThreadBy.guild.me || !convertedToThreadBy.guild.me.permissions.has("MANAGE_CHANNELS"))
            return;
        const oldEmbed = originalMmMsg.embeds[0];
        const authorOfModmailId = oldEmbed.footer!.text!.split("•")[0].trim();
        const guild = originalMmMsg.guild as Guild;
        const guildDoc = await MongoManager.getOrCreateGuildDb(guild.id);

        // Is the person still in the guild?
        const authorOfModmail = await FetchGetRequestUtilities.fetchGuildMember(guild, authorOfModmailId);
        if (!authorOfModmail) {
            const notInGuildEmbed = MessageUtilities.generateBlankEmbed(convertedToThreadBy, "RED")
                .setTitle("Target Member Unavailable.")
                .setDescription(`The person with ID \`${authorOfModmailId}\` is not in the server anymore. This `
                    + "modmail message will be deleted in 10 seconds.")
                .setFooter("Unable to Convert Modmail Message.");
            await originalMmMsg.edit({embeds: [notInGuildEmbed]})
                .then(x => MiscUtilities.stopFor(10 * 1000).then(() => x.delete()))
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
            await originalMmMsg.edit({embeds: [noUserFoundEmbed]})
                .then(x => MiscUtilities.stopFor(5 * 1000).then(() => x.delete()))
                .catch();
            return;
        }

        // Does this person have a thread already?
        const modmailInfo = guildDoc.properties.modmailThreads.find(x => x.initiatorId === authorOfModmail.id);
        if (modmailInfo) {
            const channel = FetchGetRequestUtilities.getCachedChannel<TextChannel>(
                guild,
                modmailInfo.channel
            );
            // If the channel exists, ping them.
            if (channel) {
                await MessageUtilities.sendThenDelete({content: convertedToThreadBy.toString()}, channel);
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
        const modmailChannel = FetchGetRequestUtilities.getCachedChannel<TextChannel>(
            guild,
            guildDoc.channels.modmailChannels.modmailChannelId
        );
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

        const baseMessage = await threadChannel.send({embeds: [baseMsgEmbed], components: ModmailThreadActionRows});
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
        const firstMsg = await threadChannel.send({embeds: [firstMsgEmbed]});
        await firstMsg.react(Emojis.CLIPBOARD_EMOJI).catch();

        const threadInfo: IModmailThread = {
            initiatorId: authorOfModmail.id,
            initiatedById: convertedToThreadBy.id,
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
                "properties.modmailThreads": threadInfo
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
        await originalMmMsg.edit({embeds: [oldEmbed]}).catch();
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
            : oldEmbed.footer!.text!.split("•")[0].trim();
        await origMmMessage.reactions.removeAll().catch();

        // Start by asking if we want to blacklist.
        const confirmBlacklistEmbed = MessageUtilities.generateBlankEmbed(mod.user, "RED")
            .setTitle("Blacklist From Modmail")
            .setDescription("Are you sure you want to blacklist the user (with ID " + authorOfModmailId + ") from "
                + "using modmail? He or she will not be notified and this blacklist is indefinite.")
            .setFooter("Confirmation");
        await origMmMessage.edit({
            embeds: [confirmBlacklistEmbed],
            components: GeneralConstants.YesNoButtons
        }).catch();
        const result = await AdvancedCollector.startButtonCollector({
            targetChannel: origMmMessage.channel as TextChannel,
            targetAuthor: mod,
            duration: 2 * 60 * 1000,
            oldMsg: origMmMessage,
            clearButtonsAfterComplete: true,
            acknowledgeImmediately: true,
            deleteBaseMsgAfterComplete: false
        });

        if (!result || result.customID === "no") {
            await origMmMessage.edit({
                embeds: [oldEmbed],
                components: threadInfo ? ModmailThreadActionRows : ModmailGeneralActionRows
            }).catch();
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
        await origMmMessage.edit({embeds: [embedToReplaceOld]})
            .then(x => MiscUtilities.stopFor(5 * 1000).then(() => x.delete()))
            .catch();

        // Log this to moderation logs.
        const blacklistLogsChannel = FetchGetRequestUtilities.getCachedChannel<TextChannel>(
            mod.guild,
            guildDoc.channels.logging.blacklistLoggingChannelId
        );
        if (!blacklistLogsChannel) return;

        const modLogEmbed = MessageUtilities.generateBlankEmbed(mod.user, "RED")
            .setTitle("Modmail Blacklisted.")
            .setDescription(`⇒ **Blacklisted ID:** ${authorOfModmailId}\n⇒ **Moderator:** ${mod} (${mod.id})`)
            .addField("⇒ Reason", "AUTOMATIC: Blacklisted from Modmail Control Panel.")
            .setFooter("Blacklisted from Modmail.")
            .setTimestamp();
        await blacklistLogsChannel.send({embeds: [modLogEmbed]}).catch();
    }

    /**
     * Asks the user if the modmail message should be deleted.
     * @param {Message} message The modmail message.
     * @param {GuildMember} member The member to ask.
     */
    export async function askDeleteModmailMessage(message: Message, member: GuildMember): Promise<void> {
        if (message.embeds.length === 0) return;
        // Remove all reactions because, well, you know, you don't need them.
        message.reactions.removeAll().catch();
        const oldEmbed = message.embeds[0];
        const askDeleteEmbed = MessageUtilities.generateBlankEmbed(member)
            .setTitle("Confirm Delete Modmail Message.")
            .setDescription("Are you sure you want to delete this modmail message?");
        await message.edit({embeds: [askDeleteEmbed], components: GeneralConstants.YesNoButtons}).catch();
        const deleteResp = await AdvancedCollector.startButtonCollector({
            targetChannel: message.channel as TextChannel,
            targetAuthor: message.author,
            duration: 60 * 1000,
            oldMsg: message,
            deleteBaseMsgAfterComplete: false,
            clearButtonsAfterComplete: true,
            acknowledgeImmediately: true
        });

        if (!deleteResp || deleteResp.customID === "no") {
            await message.edit({embeds: [oldEmbed], components: ModmailGeneralActionRows}).catch();
            return;
        }

        await message.delete().catch();
    }

    /**
     * Responds to a thread modmail message.
     * @param {IModmailThread} modmailThread The modmail thread object.
     * @param {GuildMember} memberThatWillRespond The member that will respond to this modmail thread.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {TextChannel} threadChannel The thread channel.
     */
    export async function respondToThreadModmail(modmailThread: IModmailThread, memberThatWillRespond: GuildMember,
                                                 guildDoc: IGuildInfo, threadChannel: TextChannel): Promise<void> {
        // make sure member exists
        const memberToRespondTo = await FetchGetRequestUtilities.fetchGuildMember(
            memberThatWillRespond.guild,
            modmailThread.originalModmailMessageId
        );

        if (!memberToRespondTo) {
            await closeModmailThread(threadChannel, modmailThread, guildDoc, memberThatWillRespond);
            const noUserFoundEmbed = MessageUtilities.generateBlankEmbed(memberThatWillRespond.user)
                .setTitle("User Not Found")
                .setDescription("The person you were trying to contact couldn't be found; maybe he or she left the "
                    + "server? The modmail thread has been deleted as a result.")
                .setFooter("Modmail");
            await memberThatWillRespond.send({embeds: [noUserFoundEmbed]}).catch();
            return;
        }

        CurrentlyRespondingToModMail.set(memberThatWillRespond.id, modmailThread.initiatorId);

        const response = await getResponseMessage(memberThatWillRespond, threadChannel);
        if (!response) return;
        const [responseToMail, anonymous] = response;

        const replyEmbed = MessageUtilities.generateBlankEmbed(anonymous
            ? memberThatWillRespond.guild
            : memberThatWillRespond.user)
            .setTitle(`${memberThatWillRespond.guild} ⇒ You`)
            .setDescription(responseToMail)
            .setFooter("Modmail Response");

        const sentMsg = await FetchGetRequestUtilities.sendMsg(memberToRespondTo, {embeds: [replyEmbed]});
        const replyRecordsEmbed = MessageUtilities.generateBlankEmbed(memberThatWillRespond.user, sentMsg
            ? "GREEN"
            : "YELLOW")
            .setTitle(`${memberThatWillRespond.displayName} ⇒ ${memberToRespondTo.user.tag}`)
            .setDescription(responseToMail)
            .setFooter(`Sent ${anonymous ? "Anonymously" : "Publicly"}`)
            .setTimestamp();

        if (!sentMsg) {
            replyRecordsEmbed.addField(`${Emojis.WARNING_EMOJI} Error.`, "Something went wrong when trying to send" +
                " this modmail message. The recipient has either blocked the bot or prevented server members from" +
                " DMing him/her.");
        }

        if (sentMsg) {
            const loggedMsg: IModmailThreadMessage = {
                authorId: memberThatWillRespond.id,
                tag: memberThatWillRespond.user.tag,
                timeSent: new Date().getTime(),
                content: responseToMail,
                attachments: []
            };

            await MongoManager.getGuildCollection().updateOne({
                guildID: memberThatWillRespond.guild.id,
                "properties.modmailThreads.initiatorId": modmailThread.initiatorId
            }, {
                $push: {
                    "properties.modmailThreads.$.messages": loggedMsg
                }
            });
        }

        await threadChannel.send({embeds: [replyRecordsEmbed]}).catch();
        CurrentlyRespondingToModMail.delete(memberThatWillRespond.id);
    }

    /**
     * Closes a modmail thread. This will archive the conversation history, if possible, and delete the channel,
     * restoring the original modmail message (in the modmail channel) to its original state.
     * @param {TextChannel} threadChannel The thread channel.
     * @param {IModmailThread} threadInfo The thread info.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {GuildMember} closedBy The person that closed this thread.
     */
    export async function closeModmailThread(threadChannel: TextChannel, threadInfo: IModmailThread,
                                             guildDoc: IGuildInfo, closedBy: GuildMember): Promise<void> {
        const modMailChannel = FetchGetRequestUtilities.getCachedChannel<TextChannel>(
            threadChannel.guild,
            threadInfo.channel
        );
        if (threadInfo.originalModmailMessageId !== "" && modMailChannel) {
            // Get the corresponding message from the modmail channel
            const oldModmailMessage = await FetchGetRequestUtilities
                .fetchMessage(modMailChannel, threadInfo.originalModmailMessageId);
            // If the originaly modmail message exists, then let's edit it.
            if (oldModmailMessage) {
                const modmailEmbed = oldModmailMessage.embeds[0];

                // Remove modmail thread info field since we're closing the thread.
                const modmailInfoIdx = modmailEmbed.fields.findIndex(x => x.name === "Modmail Thread Information");
                if (modmailInfoIdx !== -1) modmailEmbed.spliceFields(modmailInfoIdx, 1);

                // find last response by field so we can update it.
                let lastRespLastIdx = -1;
                for (let i = modmailEmbed.fields.length - 1; i >= 0; --i) {
                    if (modmailEmbed.fields[i].value === "Last Response By") {
                        lastRespLastIdx = i;
                        break;
                    }
                }

                // If one exists (and this should always be the case), then update it to include thread info
                if (lastRespLastIdx !== -1) {
                    const modmailStorage = FetchGetRequestUtilities.getCachedChannel<TextChannel>(
                        closedBy.guild,
                        guildDoc.channels.modmailChannels.modmailStorageChannelId
                    );

                    let additionalRespInfo = "";
                    if (modmailStorage) {
                        const msgHistory = new StringBuilder()
                            .append("======== Modmail Thread Summary ========")
                            .appendLine()
                            .append(`⇒ Modmail Initiator Author ID: ${threadInfo.initiatorId}`)
                            .appendLine()
                            .append(`⇒ Thread Creation Time: ${MiscUtilities.getTime(threadInfo.startedOn)}`)
                            .appendLine()
                            .append(`⇒ Converted To Thread By (ID): ${threadInfo.initiatedById}`)
                            .appendLine()
                            .append(`⇒ Closed By: ${closedBy.id} (${closedBy.displayName})`)
                            .appendLine()
                            .appendLine()
                            .append("========================================")
                            .appendLine();
                        for (const mmMessage of threadInfo.messages) {
                            msgHistory.append(`[${MiscUtilities.getTime(mmMessage.timeSent)}] ${mmMessage.tag} `)
                                .append(`(${mmMessage.authorId})`)
                                .appendLine()
                                .appendLine()
                                .append(mmMessage.content)
                                .appendLine()
                                .appendLine()
                                .append(`Attachments: [${mmMessage.attachments.join(", ")}]`)
                                .appendLine()
                                .append("========================================")
                                .appendLine();
                        }

                        const storageMsg = await FetchGetRequestUtilities.sendMsg(
                            modmailStorage,
                            {
                                files: [
                                    new MessageAttachment(Buffer.from(msgHistory.toString(), "utf8"),
                                        `${closedBy.id}_${threadInfo.initiatorId}_modmail.txt`)
                                ]
                            }
                        ).catch();

                        if (storageMsg && storageMsg.attachments.size > 0) {
                            const urlToAttachment = storageMsg.attachments.first()!.url;
                            const linkedStr = `[[Thread Messages](${urlToAttachment})]`;
                            additionalRespInfo += `${closedBy} (${MiscUtilities.getTime()}) ${linkedStr}\n`;
                        }
                        else additionalRespInfo += `${closedBy} (${MiscUtilities.getTime()}) \`[Thread Closed]\`\n`;
                    }
                    else additionalRespInfo += `${closedBy} (${MiscUtilities.getTime()}) \`[Thread Closed]\`\n`;

                    if (modmailEmbed.fields[lastRespLastIdx].value === "None.")
                        modmailEmbed.fields[lastRespLastIdx].value = additionalRespInfo;
                    else {
                        if (modmailEmbed.fields[lastRespLastIdx].value.length + additionalRespInfo.length > 1000)
                            modmailEmbed.addField("Last Response By", additionalRespInfo);
                        else
                            modmailEmbed.fields[lastRespLastIdx].value += `\n${additionalRespInfo}`;
                    }
                }

                modmailEmbed.setTitle(`${Emojis.GREEN_CHECK_EMOJI} Modmail Entry`)
                    .setColor("GREEN")
                    .setFooter(`${threadInfo.originalModmailMessageId} • Modmail Message`);
                await oldModmailMessage.edit({embeds: [modmailEmbed], components: ModmailGeneralActionRows}).catch();
            }
        }

        // Remove from database + delete channel.
        await MongoManager.getGuildCollection().updateOne({guildID: threadChannel.guild.id}, {
            $pull: {
                "properties.modmailThreads": {
                    channel: threadChannel.id
                }
            }
        });
        await threadChannel.delete().catch();
    }

    /**
     * Allows a person to respond to a modmail message.
     * @param {Message} originalMmMsg The message from the modmail channel that the person will respond to.
     * @param {GuildMember} responder The person that will respond to this modmail message.
     */
    export async function respondToGeneralModmail(originalMmMsg: Message,
                                                  responder: GuildMember): Promise<void> {
        if (!responder.guild.me || !responder.guild.me.permissions.has("MANAGE_CHANNELS"))
            return;
        const oldEmbed = originalMmMsg.embeds[0];
        const authorOfModmailId = oldEmbed.footer!.text!.split("•")[0].trim();
        const guild = originalMmMsg.guild as Guild;

        const origDescription = oldEmbed.description ? oldEmbed.description : "";
        const authorOfModmail = await FetchGetRequestUtilities.fetchGuildMember(guild, authorOfModmailId);
        if (!authorOfModmail) {
            const notInGuildEmbed = MessageUtilities.generateBlankEmbed(responder, "RED")
                .setTitle("Target Member Unavailable.")
                .setDescription(`The person with ID \`${authorOfModmailId}\` is no longer in the server, so you cannot `
                    + "respond to this person. This modmail entry will be deleted in 5 seconds.")
                .setFooter("Failed to Respond.");
            await originalMmMsg.edit({embeds: [notInGuildEmbed]})
                .then(x => MiscUtilities.stopFor(5 * 1000).then(() => x.delete()))
                .catch();
            return;
        }

        await originalMmMsg.reactions.removeAll().catch();

        // If the modmail message was responded to already, then ask if we want to still respond.
        const lastResponseField = oldEmbed.fields.find(x => x.name === "Last Response By");
        // If the field doesn't exist, then this modmail is currently being responded to.
        if (!lastResponseField) return;
        // Otherwise, we check if the modmail message has already been responded to.
        if (lastResponseField.value !== "None.") {
            const confirmWantToRespond = MessageUtilities.generateBlankEmbed(responder.user, "YELLOW")
                .setTitle("Respond to Already-Responded Modmail")
                .setDescription("This modmail entry has already been answered. Do you still want to answer this?")
                .setFooter("Confirmation.");
            await originalMmMsg.edit({embeds: [confirmWantToRespond]}).catch();
            const result = await AdvancedCollector.startButtonCollector({
                targetChannel: originalMmMsg.channel as TextChannel,
                targetAuthor: originalMmMsg.author,
                oldMsg: originalMmMsg,
                duration: 60 * 1000,
                deleteBaseMsgAfterComplete: false,
                clearButtonsAfterComplete: true,
                acknowledgeImmediately: true
            });

            if (!result || result.customID === "no") {
                await originalMmMsg.edit({embeds: [oldEmbed], components: ModmailGeneralActionRows}).catch();
                return;
            }
        }
        CurrentlyRespondingToModMail.set(responder.id, authorOfModmailId);

        // Update the old embed to indicate that someone is responding to the modmail.
        const attachments = oldEmbed.fields.find(x => x.name === "Attachments");
        const senderInfo = oldEmbed.fields.find(x => x.name === "Sender Information")!.value;
        const respInProgressEmbed = MessageUtilities.generateBlankEmbed(responder.user)
            .setTitle("📝 Response In Progress")
            .setDescription(origDescription)
            .setFooter("Modmail In Progress!");
        if (attachments)
            respInProgressEmbed.addField(attachments.name, attachments.value);
        respInProgressEmbed.addField("Sender Info", senderInfo)
            .addField("Current Responder", `${responder}: \`${MiscUtilities.getTime()}\``);

        await originalMmMsg.edit({embeds: [respInProgressEmbed]}).catch();

        // Create a new channel where the person can write a message.
        const channelName = `respond-${authorOfModmail.user.username}`;
        const responseChannel: TextChannel = await responder.guild.channels.create(channelName, {
            type: "text",
            permissionOverwrites: [
                {
                    id: responder.guild.roles.everyone,
                    deny: ["VIEW_CHANNEL"]
                },
                {
                    id: responder,
                    allow: ["VIEW_CHANNEL"]
                },
                {
                    // when is this null
                    id: responder.guild.me!,
                    allow: ["VIEW_CHANNEL"]
                }
            ]
        });

        const introEmbed = MessageUtilities.generateBlankEmbed(responder.user)
            .setTimestamp()
            .setTitle("Responding to Modmail.")
            .setFooter("Modmail Response System")
            .setDescription(origDescription);
        if (attachments) introEmbed.addField("Attachments", attachments.value);
        introEmbed.addField("Sender Information", senderInfo);

        const introMsg = await responseChannel.send({content: responder.toString(), embeds: [introEmbed]});
        await introMsg.pin().catch();
        const response = await getResponseMessage(responder, responseChannel);
        if (!response) {
            await originalMmMsg.edit({embeds: [oldEmbed], components: ModmailGeneralActionRows}).catch();
            return;
        }

        const [responseToMail, anonymous] = response;

        const replyEmbed = MessageUtilities.generateBlankEmbed(anonymous
            ? responder.guild : responder.user)
            .setTitle("Modmail Response")
            .setDescription(responseToMail)
            .addField("Original Message", origDescription.length === 0
                ? "N/A"
                : (origDescription.length > 1012 ? origDescription.substring(0, 1000) + "..." : origDescription))
            .setFooter("Modmail Response");

        // TODO is this right?
        const sentMsg = await FetchGetRequestUtilities.sendMsg(authorOfModmail, {
            embeds: [replyEmbed]
        });
        await responseChannel.delete().catch();
        CurrentlyRespondingToModMail.delete(responder.id);

        // save response
        const loggedRespStr: StringBuilder = new StringBuilder()
            .append("========== RESPONSE ==========")
            .appendLine()
            .append(responseToMail)
            .appendLine()
            .appendLine()
            .appendLine()
            .append("====== ORIGINAL MESSAGE ======")
            .appendLine()
            .append(origDescription)
            .appendLine()
            .appendLine()
            .appendLine()
            .append("======== GENERAL INFO ========")
            .appendLine()
            .append(`Author ID: ${authorOfModmail.id}`)
            .appendLine()
            .append(`Author Tag: ${authorOfModmail.user.tag}`)
            .appendLine()
            .append(`Responder ID: ${responder.id}`)
            .appendLine()
            .append(`Responder Tag: ${responder.user.tag}`)
            .appendLine()
            .append(`Time: ${MiscUtilities.getTime()} (UTC)`)
            .appendLine()
            .append(`Sent Status: ${sentMsg ? "Message Sent Successfully" : "Message Failed To Send"}`);

        const guildDoc = await MongoManager.getOrCreateGuildDb(guild.id);
        // see if we should store this string.
        const modMailStorage = FetchGetRequestUtilities.getCachedChannel<TextChannel>(
            responder.guild,
            guildDoc.channels.modmailChannels.modmailStorageChannelId
        );
        let addLogStr = "";
        if (modMailStorage) {
            const logMsg = await FetchGetRequestUtilities.sendMsg(
                modMailStorage,
                {
                    files: [
                        new MessageAttachment(
                            Buffer.from(loggedRespStr.toString(), "utf8"),
                            `${authorOfModmail.id}_modmail_${Date.now()}.txt`)
                    ]
                }
            );

            if (logMsg && logMsg.attachments.size > 0)
                addLogStr = `[[Response](${logMsg.attachments.first()!.url})]`;
        }

        // Get old responses and begin adding to it if needed.
        let lastRespLastIdx = -1;
        for (let i = oldEmbed.fields.length - 1; i >= 0; --i) {
            if (oldEmbed.fields[i].value === "Last Response By") {
                lastRespLastIdx = i;
                break;
            }
        }

        const timeStr = MiscUtilities.getTime();
        const tempLastResp = `${responder} (${timeStr}) ${addLogStr} ${sentMsg ? "" : Emojis.WARNING_EMOJI}`;
        if (oldEmbed.fields[lastRespLastIdx].value === "None.")
            oldEmbed.fields[lastRespLastIdx].value = tempLastResp;
        else {
            if (oldEmbed.fields[lastRespLastIdx].value.length + tempLastResp.length > 1000)
                oldEmbed.addField("Last Response By", tempLastResp);
            else
                oldEmbed.fields[lastRespLastIdx].value += `\n${tempLastResp}`;
        }

        await originalMmMsg.edit({
            embeds: [oldEmbed.setTitle(`${Emojis.GREEN_CHECK_EMOJI} Modmail Entry`).setColor("GREEN")],
            components: ModmailGeneralActionRows
        }).catch();
    }

    /**
     * Selects a guild where the modmail message should be sent to. This is invoked if and only if the member is
     * able to send a message to the bot (which implies that the bot is able to send a message to the user).
     * @param {User} user The user.
     * @return {Promise<[Guild, IGuildInfo] | "CANCEL" | null>} The guild and its corresponding guild doc, if any.
     * @private
     */
    async function chooseGuild(user: User): Promise<[Guild, IGuildInfo] | "CANCEL" | null> {
        const dmChannel = await FetchGetRequestUtilities.openDirectMessage(user);
        if (!dmChannel) return null;

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
                && guild.roles.cache.has(allGuilds[idx].roles.verifiedRoleId as Snowflake)
                && guild.channels.cache.has(allGuilds[idx].channels.modmailChannels.modmailChannelId as Snowflake))
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

        const selectedGuildIdx = await AdvancedCollector.startDoubleCollector({
            targetChannel: dmChannel,
            targetAuthor: user,
            duration: 60 * 1000,
            msgOptions: {embeds: [askForGuildEmbed]},
            deleteResponseMessage: true,
            deleteBaseMsgAfterComplete: true,
            cancelFlag: "cancel",
            buttons: [
                new MessageButton()
                    .setStyle(MessageButtonStyles.DANGER)
                    .setLabel("Cancel")
                    .setCustomID("cancel")
            ],
            clearButtonsAfterComplete: false,
            acknowledgeImmediately: true
        }, AdvancedCollector.getNumberPrompt(dmChannel, {
            min: 1,
            max: guildsToChoose.length
        }));

        if (selectedGuildIdx instanceof ButtonInteraction)
            return null;

        return selectedGuildIdx === null ? "CANCEL" : guildsToChoose[selectedGuildIdx - 1];
    }

    /**
     * Creates a response embed that is used to show the message that is being drafted.
     * @param {string} resp The response message.
     * @param {boolean} anony Whether the author will be anonymous.
     * @param {GuildMember} responder The responder.
     * @return {MessageEmbed} The embed.
     * @private
     */
    function getRespEmbed(resp: string, anony: boolean, responder: GuildMember): MessageEmbed {
        // Create instructions string for function.
        const instructionsStr = new StringBuilder()
            .append("Please respond to the above message by typing a message here. ")
            .append("When you are finished, simply send it here. You will have 10 minutes. You are not able to ")
            .append("send images or attachments directly.")
            .appendLine()
            .append(`⇒ React to ${Emojis.GREEN_CHECK_EMOJI} once you are satisfied with your response above.`)
            .appendLine()
            .append(`⇒ React to ${Emojis.X_EMOJI} to cancel this process.`)
            .appendLine()
            .append(`⇒ React to ${Emojis.EYES_EMOJI} to show or hide your identity.`);

        return MessageUtilities.generateBlankEmbed(responder.user)
            .setTitle(`${Emojis.CLIPBOARD_EMOJI} Your Response`)
            .setDescription(resp === "" ? "N/A" : resp)
            .setFooter("Modmail Response System")
            .addField("Instructions", instructionsStr.toString())
            .addField("Identity", anony
                ? "Your identity will be __hidden__. The recipient will not know who sent this message."
                : "Your identity will be __displayed__. The recipient will know who sent this message.");
    }

    /**
     * An infinite loop that waits for a valid response to a modmail message.
     * @param {GuildMember} responder The person that is sending this response.
     * @param {TextChannel} responseChannel The response channel.
     * @return {[string, boolean] | null} A tuple containing the response data, or null if no data is available.
     * @private
     */
    async function getResponseMessage(responder: GuildMember,
                                      responseChannel: TextChannel): Promise<[string, boolean] | null> {
        let responseMsg = "";
        let isAnonymous = true;
        let botMsg: Message | null = null;
        let hasReacted = false;
        while (true) {
            const responseEmbed = getRespEmbed(responseMsg, isAnonymous, responder);
            if (botMsg) {
                botMsg = await botMsg.edit({
                    embeds: [responseEmbed],
                    components: ModmailResponseEmbedActionRows
                });
            }
            else {
                botMsg = await responseChannel.send({
                    embeds: [responseEmbed],
                    components: ModmailResponseEmbedActionRows
                });
            }

            const response = await AdvancedCollector.startDoubleCollector({
                targetChannel: responseChannel,
                targetAuthor: responder,
                duration: 15 * 60 * 1000,
                oldMsg: botMsg,
                deleteResponseMessage: true,
                // TODO check this
                deleteBaseMsgAfterComplete: false,
                cancelFlag: "--cancel",
                clearButtonsAfterComplete: false,
                acknowledgeImmediately: true
            }, AdvancedCollector.getPureMessage());

            if (!response) {
                await botMsg.delete().catch();
                CurrentlyRespondingToModMail.delete(responder.id);
                return null;
            }

            if (hasReacted) hasReacted = !hasReacted;

            if (response instanceof ButtonInteraction) {
                if (response.customID === "cancel") {
                    await botMsg.delete().catch();
                    CurrentlyRespondingToModMail.delete(responder.id);
                    return null;
                }

                if (response.customID === "anon") {
                    isAnonymous = !isAnonymous;
                    continue;
                }

                if (responseMsg.length !== 0) break;
                continue;
            }

            if (response.content.length !== 0)
                responseMsg = response.content;
        }

        await botMsg.delete().catch(console.error);

        return [responseMsg, isAnonymous];
    }
}