import {
    ButtonInteraction,
    DMChannel,
    EmojiResolvable,
    Guild,
    GuildMember,
    Message, MessageActionRow, MessageButton,
    MessageCollector, MessageComponentInteraction,
    MessageOptions,
    PartialTextBasedChannelFields,
    PermissionResolvable,
    Role,
    TextChannel,
    User
} from "discord.js";
import {MessageUtilities} from "../MessageUtilities";
import {StringBuilder} from "../StringBuilder";
import {FetchGetRequestUtilities} from "../FetchGetRequestUtilities";
import {MiscUtilities} from "../MiscUtilities";
import {Emojis} from "../../constants/Emojis";

/**
 * A series of helpful collector functions.
 */
export namespace AdvancedCollector {
    interface ICollectorBaseArgument {
        readonly targetChannel: TextChannel | DMChannel;
        readonly targetAuthor: User | GuildMember;
        readonly duration: number;

        /**
         * The message options. If defined, this will send a message. If not defined, you must have `oldMsg` set to a
         * message.
         */
        msgOptions?: MessageOptions & { split?: false | undefined };

        /**
         * If defined, uses an old message instead of sending a new one.
         */
        oldMsg?: Message;

        /**
         * Deletes the message after the collector expires.
         */
        deleteBaseMsgAfterComplete: boolean;
    }

    interface IMessageCollectorArgument extends ICollectorBaseArgument {
        /**
         * The cancel flag. Any message with the cancel flag as its content will force the method to return "CANCEL_CMD"
         */
        cancelFlag: string;

        /**
         * Whether to delete any messages the author sends (for the collector) after it has been sent or not.
         */
        deleteResponseMessage: boolean;
    }

    interface IButtonCollectorArgument extends ICollectorBaseArgument {
        /**
         * All buttons. This is optional; if you do not specify a button, then you are expected to have provide the
         * button some other way (either by already having it included in the Message object or via the `msgOptions`
         * object.
         */
        buttons?: MessageButton[];

        /**
         * Whether to clear the buttons after the collector expires.
         */
        clearButtonsAfterComplete: boolean;

        /**
         * Whether to acknowledge the button immediately after someone clicks it. This will call `deferUpdate` right
         * after the button is pressed, so the loading state will disappear almost immediately after pressing.
         */
        acknowledgeImmediately: boolean;
    }

    interface IBoolFollowUp {
        /**
         * The content to send to the user. This is the "question" where the user will have to respond with Y/N.
         * Only `content` and `embeds` will be used.
         */
        contentToSend: MessageOptions;

        /**
         * The channel where this has occurred.
         */
        channel: TextChannel | DMChannel;

        /**
         * Time, in MS, for the person to respond.
         */
        time: number;

        /**
         * The interaction that led to this.
         */
        interaction: MessageComponentInteraction;

        /**
         * The message to edit the confirmation message with if time runs out. Only `content` and `embeds` will be
         * used.
         */
        onTimeoutResponse: MessageOptions;
    }

    /**
     * Starts a message collector. This will wait for one message to be sent that fits the criteria specified by the
     * function parameter and then returns a value based on that message.
     * @param {IMessageCollectorArgument} options The message options.
     * @param {Function} func The function used to filter the message.
     * @returns {Promise<T | null>} The parsed content specified by your filter, or null if the collector was
     * stopped due to time or via the "cancel" command.
     * @template T
     */
    export async function startNormalCollector<T>(
        options: IMessageCollectorArgument,
        func: (collectedMsg: Message, ...otherArgs: any[]) => Promise<T | void>
    ): Promise<T | null> {
        return new Promise(async (resolve) => {
            const cancelFlag = options.cancelFlag ?? "cancel";
            const botMsg = await initSendCollectorMessage(options);

            const msgCollector = new MessageCollector(options.targetChannel,
                (m: Message) => m.author.id === options.targetAuthor.id,
                {time: options.duration, max: 1});

            msgCollector.on("collect", async (c: Message) => {
                if (options.deleteResponseMessage)
                    await c.delete().catch();

                if (cancelFlag.toLowerCase() === c.content.toLowerCase())
                    return resolve(null);

                const info: T | null = await new Promise(async res => {
                    const attempt = await func(c);
                    return res(attempt ? attempt : null);
                });

                if (!info) return;
                resolve(info);
            });

            msgCollector.on("end", (c, r) => {
                if (options.deleteBaseMsgAfterComplete && botMsg && botMsg.deletable)
                    botMsg.delete().catch();
                if (r === "time") return resolve(null);
            });
        });
    }

    /**
     * Starts a button collector. This will wait for the user to click on one button and then returns the
     * corresponding button.
     * @param {IButtonCollectorArgument} options The button collector options.
     * @return {Promise<ButtonInteraction | null>} The button, if available. `null` otherwise.
     */
    export async function startButtonCollector(options: IButtonCollectorArgument): Promise<ButtonInteraction | null> {
        const botMsg = await initSendCollectorMessage(options);
        if (!botMsg) return null;

        let returnButton: ButtonInteraction | null = null;
        try {
            const clickedButton = await botMsg.awaitMessageComponentInteraction(
                i => i.user.id === options.targetAuthor.id,
                {time: options.duration}
            );

            if (clickedButton.isButton()) {
                if (options.acknowledgeImmediately)
                    await clickedButton.deferUpdate();

                returnButton = clickedButton;
            }
        } catch (e) {
            // Ignore the error; this is because the collector timed out.
        } finally {
            if (options.deleteBaseMsgAfterComplete)
                await botMsg.delete().catch();
            else if (options.clearButtonsAfterComplete && botMsg.editable)
                await botMsg.edit(MiscUtilities.getMessageOptionsFromMessage(botMsg, [])).catch();
        }

        return returnButton;
    }

    /**
     * Starts a button and message collector. The first collector to receive something will end both collectors.
     * @param {IButtonCollectorArgument & IMessageCollectorArgument} options The collector options.
     * @param {Function} func The function used to filter the message.
     * @return {Promise<ButtonInteraction | T | null>} A `ButtonInteraction` if a button is pressed. `T` if the
     * `MessageCollector` is fired. `null` otherwise.
     */
    export async function startDoubleCollector<T>(
        options: IButtonCollectorArgument & IMessageCollectorArgument,
        func: (collectedMsg: Message, ...otherArgs: any[]) => Promise<T | void>
    ): Promise<T | ButtonInteraction | null> {
        const cancelFlag = options.cancelFlag ?? "cancel";
        const botMsg = await initSendCollectorMessage(options);
        if (!botMsg) return null;

        return new Promise(async (resolve) => {
            const msgCollector = new MessageCollector(options.targetChannel,
                (m: Message) => m.author.id === options.targetAuthor.id,
                {time: options.duration, max: 1}
            );
            const buttonCollector = botMsg.createMessageComponentInteractionCollector(
                i => i.user.id === options.targetAuthor.id,
                {max: 1, time: options.duration}
            );

            msgCollector.on("collect", async (c: Message) => {
                if (options.deleteResponseMessage)
                    await FetchGetRequestUtilities.tryExecuteAsync(() => c.delete());

                if (cancelFlag.toLowerCase() === c.content.toLowerCase()) {
                    buttonCollector.stop();
                    return resolve(null);
                }

                const info: T | null = await new Promise(async res => {
                    const attempt = await func(c);
                    return res(attempt ? attempt : null);
                });

                if (!info) return;
                buttonCollector.stop();
                resolve(info);
            });

            buttonCollector.on("collect", async i => {
                if (!i.isButton()) return;
                if (options.acknowledgeImmediately)
                    await i.deferUpdate();
                resolve(i);
                msgCollector.stop();
            });

            msgCollector.on("end", (c, r) => {
                acknowledgeDeletion(r);
            });

            buttonCollector.on("end", (c, r) => {
                acknowledgeDeletion(r);
            });

            // The end function
            let hasCalled = false;
            function acknowledgeDeletion(r: string): void {
                if (hasCalled) return;
                hasCalled = true;
                if (options.deleteBaseMsgAfterComplete && botMsg?.deletable)
                    botMsg?.delete().catch();
                else if (options.clearButtonsAfterComplete && botMsg?.editable)
                    botMsg?.edit(MiscUtilities.getMessageOptionsFromMessage(botMsg, [])).catch();
                if (r === "time") return resolve(null);
            }
        });
    }

    /**
     * Asks a boolean true/false question via an interaction followup.
     * @param {IBoolFollowUp} opt The options.
     * @return {Promise<[(MessageComponentInteraction | null), boolean]>} A tuple containing the new interaction, if
     * any, and the result of the question. If the interaction timed-out (i.e. the person didn't respond), then this
     * will return `[null, false]`.
     */
    export async function askBoolFollowUp(opt: IBoolFollowUp): Promise<[MessageComponentInteraction | null, boolean]> {
        const i = opt.interaction;
        if (!i.channel || !i.channel.isText()) return [null, false];
        const channel = i.channel;

        // Generate a random ID so we can associate this collector.
        const id = MiscUtilities.generateUniqueId(30);

        const yesButton = new MessageButton()
            .setCustomID(id + "yes")
            .setLabel("Yes")
            .setStyle("SUCCESS")
            .setEmoji(Emojis.GREEN_CHECK_EMOJI);
        const noButton = new MessageButton()
            .setCustomID(id + "no")
            .setLabel("No")
            .setStyle("DANGER")
            .setEmoji(Emojis.X_EMOJI);
        const actionRow = new MessageActionRow()
            .addComponents(yesButton, noButton);

        const user = i.user;
        await i.reply({
            components: [actionRow],
            ephemeral: true,
            content: opt.contentToSend.content,
            embeds: opt.contentToSend.embeds
        });
        return new Promise(async (resolve) => {
            const resp = await channel.createMessageComponentInteractionCollector(
                k => k.user.id === user.id && k.customID.startsWith(id),
                {time: opt.time, max: 1}
            );

            resp.on("collect", interaction => {
                resp.stop("done");
                return resolve([interaction, interaction.customID.endsWith("yes")]);
            });

            resp.on("end", async (collected, reason) => {
                if (reason === "done" || collected.size > 0) return;

                await i.editReply({
                    components: [],
                    content: opt.onTimeoutResponse.content,
                    embeds: opt.onTimeoutResponse.embeds
                }).catch();
                return resolve([null, false]);
            });
        });
    }

    /**
     * Reacts to a message at a faster than normal speed.
     * @param {Message} msg The message to react to.
     * @param {EmojiResolvable[]} reactions The reactions that you want to react with.
     * @param {number} intervalTime The delay between reactions.
     */
    export function reactFaster(msg: Message, reactions: EmojiResolvable[], intervalTime: number = 550): void {
        intervalTime = Math.max(550, intervalTime);
        let i: number = 0;
        const interval = setInterval(() => {
            if (i < reactions.length) {
                if (msg.deleted) {
                    clearInterval(interval);
                    return;
                }

                msg.react(reactions[i]).catch();
            }
            else
                clearInterval(interval);
            i++;
        }, intervalTime);
    }

    // ============================================ //
    //      EXAMPLE METHODS FOR FUNCTION BELOW      //
    // ============================================ //

    /**
     * A built-in function, to be used as a parameter for the `send` method, that will wait for someone to respond with
     * `yes` or `no` and return a boolean value associated with that choice.
     * @param {PartialTextBasedChannelFields} pChan The channel where any messages from this method should be sent to.
     * @returns {Function} A function that parses a message to a bool.
     */
    export function getYesNoPrompt(pChan: PartialTextBasedChannelFields): (m: Message) => Promise<boolean | void> {
        return async (m: Message): Promise<boolean | void> => {
            if (m.content === null) {
                const noContentEmbed = MessageUtilities.generateBlankEmbed(m.author, "RED")
                    .setTitle("No Content Provided")
                    .setDescription("You did not provide any message content. Do not send any attachments.");
                MessageUtilities.sendThenDelete({embeds: [noContentEmbed]}, pChan);
                return;
            }

            if (["yes", "ye", "y"].includes(m.content.toLowerCase()))
                return true;
            if (["no", "n"].includes(m.content.toLowerCase()))
                return false;
            return;
        };
    }

    /**
     * A built-in function, to be used as a parameter for the `send` method, that will wait for someone to respond
     * with a message and then return that message.
     * @return {Function} A function that returns a message that someone responds with.
     */
    export function getPureMessage(): (m: Message) => Promise<Message | void> {
        return async (m: Message): Promise<Message | void> => m;
    }

    /**
     * A built-in function, to be used as a parameter for the `send` method, that will wait for someone to respond
     * with something and then return that response as a string.
     * @param {PartialTextBasedChannelFields} pChan The channel where any messages from this method should be sent to.
     * @param {{min?: number, max?: number}} options Any options for this prompt.
     * @return {Function} A function that returns the message content from a message that someone responds with.
     */
    export function getStringPrompt(pChan: PartialTextBasedChannelFields, options?: {
        min?: number,
        max?: number
    }): (m: Message) => Promise<string | void> {
        return async (m: Message): Promise<string | void> => {
            if (m.content === null) {
                const noContentEmbed = MessageUtilities.generateBlankEmbed(m.author, "RED")
                    .setTitle("No Content Provided")
                    .setDescription("You did not provide any message content. Do not send any attachments.");
                MessageUtilities.sendThenDelete({embeds: [noContentEmbed]}, pChan);
                return;
            }

            if (options) {
                if (options.min && m.content.length < options.min) {
                    const tooShortDesc = new StringBuilder().append(`Your message is too short. It needs to be at `)
                        .append(`least ${options.min} characters long.`);
                    const tooShortEmbed = MessageUtilities.generateBlankEmbed(m.author, "RED")
                        .setTitle("Message Too Short")
                        .setDescription(tooShortDesc.toString());
                    MessageUtilities.sendThenDelete({embeds: [tooShortEmbed]}, pChan);
                    return;
                }

                if (options.max && options.max < m.content.length) {
                    const tooLongDesc = new StringBuilder().append(`Your message is too long. It needs to be at `)
                        .append(`most ${options.max} characters long.`);
                    const tooLongEmbed = MessageUtilities.generateBlankEmbed(m.author, "RED")
                        .setTitle("Message Too Long")
                        .setDescription(tooLongDesc.toString());
                    MessageUtilities.sendThenDelete({embeds: [tooLongEmbed]}, pChan);
                    return;
                }
            }

            return m.content;
        };
    }

    /**
     * A built-in function, to be used as a parameter for the `send` method, that will wait for someone to respond
     * with a role and return it. This function must be used in a guild.
     * @param {Message} msg The message that triggered the use of this class. This is generally the message that
     * results in the execution of this command.
     * @param {PartialTextBasedChannelFields} pChan The channel to send messages to.
     * @return {Function} A function that takes in a message and returns a Role, if any.
     */
    export function getRolePrompt(msg: Message, pChan: PartialTextBasedChannelFields): (m: Message)
        => Promise<Role | void> {
        return async (m: Message): Promise<void | Role> => {
            const origRole = m.mentions.roles.first();
            const guild = msg.guild!;
            let resolvedRole: Role;
            if (origRole) resolvedRole = origRole;
            else {
                const resolveById = await FetchGetRequestUtilities.fetchRole(guild, m.content) ?? null;
                if (!resolveById) {
                    const noRoleFound = MessageUtilities.generateBlankEmbed(m.author, "RED")
                        .setTitle("No Role Found")
                        .setDescription("You didn't specify a role. Either mention the role or type its ID.");
                    MessageUtilities.sendThenDelete({embeds: [noRoleFound]}, pChan);
                    return;
                }

                resolvedRole = resolveById;
            }

            return resolvedRole;
        };
    }

    /**
     * A built-in function, to be used as a parameter for the `send` method, that will wait for someone to respond
     * with a number and returns that number.
     * @param {PartialTextBasedChannelFields} channel The channel where any messages should be sent to.
     * @param {{min?: number, max?: number}} options Any options. The min value is inclusive and the max value is
     * exclusive.
     * @return {Function} A function that takes in a message and returns a number, if any.
     */
    export function getNumberPrompt(channel: PartialTextBasedChannelFields,
                                    options?: { min?: number, max?: number }): (m: Message) => Promise<number | void> {
        return async (m: Message): Promise<number | void> => {
            const num = Number.parseInt(m.content, 10);
            if (Number.isNaN(num)) {
                const notNumberEmbed = MessageUtilities.generateBlankEmbed(m.author, "RED")
                    .setTitle("Invalid Number Specified")
                    .setDescription("You did not provide a valid number. Please try again.");
                MessageUtilities.sendThenDelete({embeds: [notNumberEmbed]}, channel);
                return;
            }

            if (options) {
                if (typeof options.min !== "undefined" && options.min > num) {
                    const lowerThanMinEmbed = MessageUtilities.generateBlankEmbed(m.author, "RED")
                        .setTitle("Number Too Low")
                        .setDescription(`The number that you provided is lower than ${options.min}.`);
                    MessageUtilities.sendThenDelete({embeds: [lowerThanMinEmbed]}, channel);
                    return;
                }

                if (typeof options.max !== "undefined" && num >= options.max) {
                    const higherThanMaxEmbed = MessageUtilities.generateBlankEmbed(m.author, "RED")
                        .setTitle("Number Too High")
                        .setDescription(`The number that you provided is higher than or equal to ${options.max}.`);
                    MessageUtilities.sendThenDelete({embeds: [higherThanMaxEmbed]}, channel);
                    return;
                }
            }

            return num;
        };
    }

    /**
     * A built-in function, to be used as a parameter for the `send` method, that will wait for someone to respond
     * with a text channel and returns it. This function must be used in a guild.
     * @param {PartialTextBasedChannelFields} channel The channel where any messages should be sent to.
     * @param {PermissionResolvable[]} [permissionsForBot = []] Any permissions that the text channel must have in
     * order to be valid.
     * @return {(m: Message) => Promise<TextChannel | void>}
     */
    export function getTextChannelPrompt(channel: PartialTextBasedChannelFields,
                                         permissionsForBot: PermissionResolvable[] = []): (m: Message)
        => Promise<TextChannel | void> {
        return async (m: Message): Promise<TextChannel | void> => {
            const guild = m.guild as Guild;
            const origChannel = m.mentions.channels.first();
            let resolvedChannel: TextChannel;

            if (origChannel && origChannel instanceof TextChannel)
                resolvedChannel = origChannel;
            else {
                const resolvedChanById = FetchGetRequestUtilities.getCachedChannel(guild, m.content);
                if (!(resolvedChanById instanceof TextChannel)) {
                    const notTextChannelDesc = new StringBuilder()
                        .append("You did not specify a valid text channel. Note that a text channel is __not__ a news")
                        .append(" channel.");
                    const notTextChannelEmbed = MessageUtilities.generateBlankEmbed(m.author, "RED")
                        .setTitle("Invalid Text Channel Specified")
                        .setDescription(notTextChannelDesc.toString());
                    MessageUtilities.sendThenDelete({embeds: [notTextChannelEmbed]}, channel);
                    return;
                }

                resolvedChannel = resolvedChanById;
            }

            const theBot = guild.me;
            if (theBot) {
                const theBotPermsInChan = resolvedChannel.permissionsFor(theBot);
                if (theBotPermsInChan) {
                    for (const p of permissionsForBot) {
                        if (!theBotPermsInChan.has(p)) {
                            const noPermDesc = new StringBuilder()
                                .append(`I do not have the \`${p}\` permission in the ${resolvedChannel} channel. `)
                                .append("Please make sure I have the permission and then try again.");
                            const noPermsEmbed = MessageUtilities.generateBlankEmbed(m.author, "RED")
                                .setTitle("No Permissions!")
                                .setDescription(noPermDesc.toString());
                            MessageUtilities.sendThenDelete({embeds: [noPermsEmbed]}, channel);
                            return;
                        }
                    }
                } // end inner if
            } // end outer if

            return resolvedChannel;
        };
    }

    /**
     * Sends the initial collector message.
     * @param {IButtonCollectorArgument} options The options. If you have a `IMessageCollectorArgument` object,
     * you can still pass it in (you may need to cast it).
     * @return {Promise<Message | null>} The message, or `null`.
     * @private
     */
    async function initSendCollectorMessage(
        options: IButtonCollectorArgument | IMessageCollectorArgument
    ): Promise<Message | null> {
        let botMsg: Message | null = null;
        if (options.msgOptions) {
            if ("buttons" in options && options.buttons)
                options.msgOptions.components = MiscUtilities.getActionRowsFromButtons(options.buttons);

            botMsg = await options.targetChannel.send(options.msgOptions);
        }
        else if (options.oldMsg) {
            botMsg = options.oldMsg;
            if ("buttons" in options && options.buttons && botMsg.editable) {
                await botMsg.edit(MiscUtilities.getMessageOptionsFromMessage(
                    botMsg,
                    MiscUtilities.getActionRowsFromButtons(options.buttons))
                );
            }
        }

        return botMsg;
    }
}