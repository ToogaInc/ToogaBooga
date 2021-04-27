import {DMChannel, Guild, Message, MessageEmbed, TextChannel, User} from "discord.js";
import {MongoManager} from "./MongoManager";
import {AdvancedCollector} from "../utilities/collectors/AdvancedCollector";
import {ArrayUtilities} from "../utilities/ArrayUtilities";
import {InteractionManager} from "./InteractionManager";
import {MessageUtilities} from "../utilities/MessageUtilities";
import {Emojis} from "../constants/Emojis";
import {IGuildInfo} from "../definitions/major/IGuildInfo";
import {StringBuilder} from "../utilities/StringBuilder";

export namespace ModmailManager {

    /**
     * This function should be called when someone DMs the bot. This will:
     * - Forward the message to the designated guild.
     * - Update the database to account for the new modmail message.
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
        await modMailMessage.react("📝").catch();
        // garbage reaction
        await modMailMessage.react("🗑️").catch();
        // blacklist
        await modMailMessage.react("🚫").catch();
        // redirect
        await modMailMessage.react("🔀").catch();
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