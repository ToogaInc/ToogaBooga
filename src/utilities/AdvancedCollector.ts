import {
    DMChannel,
    Emoji,
    EmojiResolvable,
    Guild,
    GuildMember,
    Message,
    MessageCollector,
    MessageOptions,
    MessageReaction,
    PartialTextBasedChannelFields,
    PermissionResolvable,
    ReactionCollector,
    Role,
    TextChannel,
    User
} from "discord.js";
import {MessageUtil} from "./MessageUtilities";
import {StringBuilder} from "./StringBuilder";

type ICollectorArguments = {
    /**
     * The cancel flag. Any message with the cancel flag as its content will force the method to return "CANCEL_CMD"
     */
    cancelFlag?: string;

    /**
     * Whether to delete any messages the author sends (for the collector) after it has been sent or not.
     */
    deleteResponseMessage?: boolean;

    /**
     * Reactions to use for the ReactionCollector. If no reactions are specified, the ReactionCollector will not be
     * used.
     */
    reactions?: EmojiResolvable[];

    /**
     * Whether to react to the message with the reactions defined in `<IGenericMsgCollectorArguments>.reactions`.
     */
    reactToMsg?: boolean;

    /**
     * If defined, uses an old message instead of sending a new one.
     */
    oldMsg?: Message;

    /**
     * Deletes the bot-sent message after the collector expires.
     */
    deleteBaseMsg?: boolean;

    /**
     * Whether to remove ALL reactions after the collector is done or not. If `deleteMsg` is `true`, `deleteMsg`
     * automatically overwrites whatever value is defined here. NOTE that if a user reacts to a message, the user's
     * reaction will automatically be removed.
     */
    removeAllReactionAfterReact?: boolean;

    /**
     * The time between each reaction.
     */
    reactDelay?: number;
};

export class AdvancedCollector {
    private readonly _targetChannel: TextChannel | DMChannel;
    private readonly _targetAuthor: User | GuildMember;
    private readonly _duration: number;

    /**
     * Creates a new AdvancedCollector.
     * @param {TextChannel | DMChannel} targetChannel The target channel.
     * @param {GuildMember | User} targetMember The target member.
     * @param {number} duration The duration. Specify the unit in the next argument.
     * @param {"MS" | "S" | "M"} timeUnit The duration type.
     */
    public constructor(targetChannel: TextChannel | DMChannel,
                       targetMember: GuildMember | User,
                       duration: number,
                       timeUnit: "MS" | "S" | "M" = "M") {
        this._targetChannel = targetChannel;
        this._targetAuthor = targetMember;
        this._duration = duration;

        switch (timeUnit) {
            case "MS":
                this._duration = duration;
                break;
            case "S":
                this._duration = duration * 1000;
                break;
            case "M":
                this._duration = duration * 60 * 1000;
                break;
        }
    }

    /**
     * Starts a message collector. This will wait for one message to be sent that fits the criteria specified by the
     * function parameter and then returns a value based on that message.
     * @param msgOptions {MessageOptions} The message options.
     * @param {Function} func The function that will essentially "filter" and "parse" a message.
     * @param {ICollectorArguments | null} otherOptions Any options for this message collector.
     * @returns {Promise<T | null>} The parsed content specified by your filter, or null if the collector was
     * stopped due to time or via the "cancel" command.
     * @template T
     */
    public async startNormalCollector<T>(
        msgOptions: MessageOptions,
        func: (collectedMsg: Message, ...otherArgs: any[]) => Promise<T | void>,
        otherOptions: ICollectorArguments | null = null
    ): Promise<T | null> {
        return new Promise(async (resolve) => {
            const botMsg = otherOptions && otherOptions.oldMsg
                ? otherOptions.oldMsg
                // we need to specify each property because, otherwise, typescript will think this is
                // an Array<Message>
                : await this._targetChannel.send(msgOptions.content, {
                    embed: msgOptions.embed,
                    files: msgOptions.files,
                    allowedMentions: msgOptions.allowedMentions,
                    disableMentions: msgOptions.disableMentions
                });

            const msgCollector = new MessageCollector(this._targetChannel,
                (m: Message) => m.author.id === this._targetAuthor.id, {time: this._duration});

            msgCollector.on("collect", async (c: Message) => {
                if (otherOptions && otherOptions.deleteResponseMessage)
                    await c.delete().catch();

                if (otherOptions && otherOptions.cancelFlag && otherOptions.cancelFlag.toLowerCase() === c.content.toLowerCase()) {
                    msgCollector.stop();
                    return resolve(null);
                }

                const info: T | null = await new Promise(async res => {
                    const attempt = await func(c);
                    return res(attempt ? attempt : null);
                });

                if (!info) return;
                msgCollector.stop();
                resolve(info);
            });

            msgCollector.on("end", (c, r) => {
                if (otherOptions && otherOptions.deleteBaseMsg && botMsg.deletable) botMsg.delete();
                if (r === "time") return resolve(null);
            });
        });
    }

    /**
     * Starts a message and reaction collector. This function will wait for one message or reaction and returns
     * either the parsed content from the message (specified by your filter) or the reaction (whichever one comes
     * first).
     * @param msgOptions {MessageOptions} The message options.
     * @param {Function} func The function that will essentially "filter" and "parse" a message.
     * @param {ICollectorArguments} options Any options for this collector. You will need to use this to
     * specify the reactions that will be used.
     * @returns {Promise<Emoji | T | null>} Either the parsed message content or an emoji, or null if the cancel
     * command was used or time ran out.
     * @template T
     */
    public async startDoubleCollector<T>(
        msgOptions: MessageOptions,
        func: (collectedMsg: Message, ...otherArgs: any[]) => Promise<T | void>,
        options?: ICollectorArguments
    ): Promise<T | Emoji | null> {
        const msgReactions: EmojiResolvable[] = [];
        let cancelFlag = "cancel";
        let deleteResponseMsg = true;
        let reactToMsg = false;
        let deleteBotMsgAfterComplete = true;
        let removeReactionsAfter = false;
        const botMsg = options && options.oldMsg
            ? options.oldMsg
            : await this._targetChannel.send(msgOptions.content, {
                embed: msgOptions.embed,
                files: msgOptions.files,
                allowedMentions: msgOptions.allowedMentions,
                disableMentions: msgOptions.disableMentions
            });

        if (options) {
            if (typeof options.cancelFlag !== "undefined")
                cancelFlag = options.cancelFlag;
            if (typeof options.deleteBaseMsg !== "undefined")
                deleteBotMsgAfterComplete = options.deleteBaseMsg;
            if (typeof options.reactToMsg !== "undefined")
                reactToMsg = options.reactToMsg;
            if (typeof options.removeAllReactionAfterReact !== "undefined")
                removeReactionsAfter = options.removeAllReactionAfterReact;
            if (typeof options.deleteResponseMessage !== "undefined")
                deleteResponseMsg = options.deleteResponseMessage;
            if (options.reactions)
                msgReactions.push(...options.reactions);
        }

        // Deleting the message means we won't need to deal with reactions
        if (deleteBotMsgAfterComplete) removeReactionsAfter = false;

        return new Promise(async (resolve) => {
            const msgCollector = new MessageCollector(this._targetChannel,
                (m: Message) => m.author.id === this._targetAuthor.id, {time: this._duration});
            let reactCollector: ReactionCollector | undefined;
            if (msgReactions.length !== 0) {
                if (reactToMsg) AdvancedCollector.reactFaster(botMsg, msgReactions, options?.reactDelay);
                reactCollector = new ReactionCollector(
                    botMsg,
                    (r: MessageReaction, u: User) => msgReactions.includes(r.emoji.name)
                        && u.id === this._targetAuthor.id,
                    {
                        time: this._duration,
                        max: 1
                    }
                );

                reactCollector.on("collect", async (reaction: MessageReaction, user: User) => {
                    if (!removeReactionsAfter)
                        await reaction.users.remove(user).catch();
                    msgCollector.stop();
                    return resolve(reaction.emoji);
                });
            }

            msgCollector.on("collect", async (c: Message) => {
                if (options && options.deleteResponseMessage)
                    await c.delete().catch();

                if (cancelFlag.toLowerCase() === c.content.toLowerCase()) {
                    msgCollector.stop();
                    return resolve(null);
                }

                const info: T | null = await new Promise(async res => {
                    const attempt = await func(c);
                    return res(attempt ? attempt : null);
                });

                if (!info)
                    return;

                if (reactCollector) reactCollector.stop();
                msgCollector.stop();
                resolve(info);
            });

            msgCollector.on("end", async (c, r) => {
                if (removeReactionsAfter) await botMsg.reactions.removeAll();
                if (deleteResponseMsg && botMsg.deletable) await botMsg.delete();
                if (r === "time") return resolve(null);
            });
        });
    }

    /**
     * Waits for a single reaction from the user.
     * @param {Message} baseMsg The message that should be tracked.
     * @param {ICollectorArguments} options The options. Any message-related options will be ignored.
     * @return {Promise<Emoji | null>} The emoji, if any; otherwise, null.
     */
    public async waitForSingleReaction(baseMsg: Message, options: ICollectorArguments): Promise<Emoji | null> {
        const msgReactions: EmojiResolvable[] = options.reactions
            ? options.reactions
            : [];
        const reactToMessage: boolean = typeof options.reactToMsg !== "undefined"
            ? options.reactToMsg
            : true;
        const removeReactionsAfter: boolean = typeof options.removeAllReactionAfterReact !== "undefined"
            ? options.removeAllReactionAfterReact
            : true;

        if (msgReactions.length === 0)
            return null;

        if (reactToMessage)
            AdvancedCollector.reactFaster(baseMsg, msgReactions, options.reactDelay);

        return new Promise(async (resolve) => {
            const reactCollector = new ReactionCollector(
                baseMsg,
                (r: MessageReaction, u: User) => msgReactions.includes(r.emoji.name)
                    && u.id === this._targetAuthor.id,
                {
                    time: this._duration,
                    max: 1
                }
            );

            reactCollector.on("collect", async (reaction: MessageReaction, user: User) => {
                if (removeReactionsAfter)
                    await baseMsg.reactions.removeAll().catch();
                else
                    await reaction.users.remove(user).catch();

                return resolve(reaction.emoji);
            });

            reactCollector.on("end", async (c, r) => {
                if (options.deleteResponseMessage)
                    await baseMsg.delete().catch();

                if (r === "time")
                    return resolve(null);
            });
        });
    }

    /**
     * Reacts to a message at a faster than normal speed.
     * @param {Message} msg The message to react to.
     * @param {EmojiResolvable[]} reactions The reactions that you want to react with.
     * @param {number} intervalTime The delay between reactions.
     */
    public static reactFaster(msg: Message, reactions: EmojiResolvable[], intervalTime: number = 550): void {
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
    public static getYesNoPrompt(pChan: PartialTextBasedChannelFields): (m: Message) => Promise<boolean | void> {
        return async (m: Message): Promise<boolean | void> => {
            if (m.content === null) {
                const noContentEmbed = MessageUtil.generateBlankEmbed(m.author, "RED")
                    .setTitle("No Content Provided")
                    .setDescription("You did not provide any message content. Do not send any attachments.");
                MessageUtil.sendThenDelete({embed: noContentEmbed}, pChan);
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
    public static getPureMessage(): (m: Message) => Promise<Message | void> {
        return async (m: Message): Promise<Message | void> => m;
    }

    /**
     * A built-in function, to be used as a parameter for the `send` method, that will wait for someone to respond
     * with something and then return that response as a string.
     * @param {PartialTextBasedChannelFields} pChan The channel where any messages from this method should be sent to.
     * @param {{min?: number, max?: number}} options Any options for this prompt.
     * @return {Function} A function that returns the message content from a message that someone responds with.
     */
    public static getStringPrompt(pChan: PartialTextBasedChannelFields, options?: {
        min?: number,
        max?: number
    }): (m: Message) => Promise<string | void> {
        return async (m: Message): Promise<string | void> => {
            if (m.content === null) {
                const noContentEmbed = MessageUtil.generateBlankEmbed(m.author, "RED")
                    .setTitle("No Content Provided")
                    .setDescription("You did not provide any message content. Do not send any attachments.");
                MessageUtil.sendThenDelete({embed: noContentEmbed}, pChan);
                return;
            }

            if (options) {
                if (options.min && m.content.length < options.min) {
                    const tooShortDesc = new StringBuilder().append(`Your message is too short. It needs to be at `)
                        .append(`least ${options.min} characters long.`);
                    const tooShortEmbed = MessageUtil.generateBlankEmbed(m.author, "RED")
                        .setTitle("Message Too Short")
                        .setDescription(tooShortDesc.toString());
                    MessageUtil.sendThenDelete({embed: tooShortEmbed}, pChan);
                    return;
                }

                if (options.max && options.max < m.content.length) {
                    const tooLongDesc = new StringBuilder().append(`Your message is too long. It needs to be at `)
                        .append(`most ${options.max} characters long.`);
                    const tooLongEmbed = MessageUtil.generateBlankEmbed(m.author, "RED")
                        .setTitle("Message Too Long")
                        .setDescription(tooLongDesc.toString());
                    MessageUtil.sendThenDelete({embed: tooLongEmbed}, pChan);
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
    public static getRolePrompt(msg: Message, pChan: PartialTextBasedChannelFields): (m: Message)
        => Promise<Role | void> {
        return async (m: Message): Promise<void | Role> => {
            const origRole = m.mentions.roles.first();
            let resolvedRole: Role;
            if (origRole) resolvedRole = origRole;
            else {
                const resolveById = await msg.guild?.roles.fetch(m.content) ?? null;
                if (!resolveById) {
                    const noRoleFound = MessageUtil.generateBlankEmbed(m.author, "RED")
                        .setTitle("No Role Found")
                        .setDescription("You didn't specify a role. Either mention the role or type its ID.");
                    MessageUtil.sendThenDelete({embed: noRoleFound}, pChan);
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
     * @param {{min?: number, max?: number}} options Any options.
     * @return {Function} A function that takes in a message and returns a number, if any.
     */
    public static getNumberPrompt(channel: PartialTextBasedChannelFields,
                                  options?: { min?: number, max?: number }): (m: Message) => Promise<number | void> {
        return async (m: Message): Promise<number | void> => {
            const num = Number.parseInt(m.content, 10);
            if (Number.isNaN(num)) {
                const notNumberEmbed = MessageUtil.generateBlankEmbed(m.author, "RED")
                    .setTitle("Invalid Number Specified")
                    .setDescription("You did not provide a valid number. Please try again.");
                MessageUtil.sendThenDelete({embed: notNumberEmbed}, channel);
                return;
            }

            if (options) {
                if (typeof options.min !== "undefined" && num < options.min) {
                    const lowerThanMinEmbed = MessageUtil.generateBlankEmbed(m.author, "RED")
                        .setTitle("Number Too Low")
                        .setDescription(`The number that you provided is lower than ${options.min}. Try again.`);
                    MessageUtil.sendThenDelete({embed: lowerThanMinEmbed}, channel);
                    return;
                }

                if (typeof options.max !== "undefined" && options.max < num) {
                    const higherThanMaxEmbed = MessageUtil.generateBlankEmbed(m.author, "RED")
                        .setTitle("Number Too High")
                        .setDescription(`The number that you provided is higher than ${options.max}. Try again.`);
                    MessageUtil.sendThenDelete({embed: higherThanMaxEmbed}, channel);
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
    public static getTextChannelPrompt(channel: PartialTextBasedChannelFields,
                                       permissionsForBot: PermissionResolvable[] = []): (m: Message)
        => Promise<TextChannel | void> {
        return async (m: Message): Promise<TextChannel | void> => {
            const guild = m.guild as Guild;
            const origChannel = m.mentions.channels.first();
            let resolvedChannel: TextChannel;

            if (origChannel)
                resolvedChannel = origChannel;
            else {
                const resolvedChanById = guild.channels.resolve(m.content);
                if (!(resolvedChanById instanceof TextChannel)) {
                    const notTextChannelDesc = new StringBuilder()
                        .append("You did not specify a valid text channel. Note that a text channel is __not__ a news")
                        .append(" channel.");
                    const notTextChannelEmbed = MessageUtil.generateBlankEmbed(m.author, "RED")
                        .setTitle("Invalid Text Channel Specified")
                        .setDescription(notTextChannelDesc.toString());
                    MessageUtil.sendThenDelete({embed: notTextChannelEmbed}, channel);
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
                            const noPermsEmbed = MessageUtil.generateBlankEmbed(m.author, "RED")
                                .setTitle("No Permissions!")
                                .setDescription(noPermDesc);
                            MessageUtil.sendThenDelete({embed: noPermsEmbed}, channel);
                            return;
                        }
                    }
                } // end inner if
            } // end outer if

            return resolvedChannel;
        };
    }
}