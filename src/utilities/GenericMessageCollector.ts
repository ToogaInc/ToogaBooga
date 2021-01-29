import {
    DMChannel, Emoji,
    EmojiResolvable,
    GuildMember,
    Message,
    MessageCollector, MessageOptions, MessageReaction, ReactionCollector,
    TextChannel,
    User
} from "discord.js";
import {AdvancedReactionCollector} from "./AdvancedReactionCollector";

type IGenericMsgCollectorArguments = {
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
};

export class GenericMessageCollector<T> {
    private readonly _messageToSend: MessageOptions;
    private readonly _targetChannel: TextChannel | DMChannel;
    private readonly _targetAuthor: User | GuildMember;
    private readonly _duration: number;

    /**
     * Creates a new GenericMessageCollector.
     * @param {MessageOptions} messageOptions The message to send.
     * @param {TextChannel | DMChannel} targetChannel The target channel.
     * @param {GuildMember | User} targetMember The target member.
     * @param {number} duration The duration. Specify the unit in the next argument.
     * @param {"MS" | "S" | "M"} timeUnit The duration type.
     */
    public constructor(messageOptions: MessageOptions,
                       targetChannel: TextChannel | DMChannel,
                       targetMember: GuildMember | User,
                       duration: number,
                       timeUnit: "MS" | "S" | "M" = "M") {
        this._messageToSend = messageOptions;
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
     * @param {Function} func The function that will essentially "filter" and "parse" a message.
     * @param {IGenericMsgCollectorArguments | null} options Any options for this message collector.
     * @returns {Promise<T | null>} The parsed content specified by your filter, or null if the collector was
     * stopped due to time or via the "cancel" command.
     * @template T
     */
    public async startNormalCollector(
        func: (collectedMsg: Message, ...otherArgs: any[]) => Promise<T | void>,
        options: IGenericMsgCollectorArguments | null = null
    ): Promise<T | null> {
        return new Promise(async (resolve) => {
            const botMsg = options && options.oldMsg
                ? options.oldMsg
                // we need to specify each property because, otherwise, typescript will think this is
                // an Array<Message>
                : await this._targetChannel.send(this._messageToSend.content, {
                    embed: this._messageToSend.embed,
                    files: this._messageToSend.files,
                    allowedMentions: this._messageToSend.allowedMentions,
                    disableMentions: this._messageToSend.disableMentions
                });

            const msgCollector = new MessageCollector(this._targetChannel,
                (m: Message) => m.author.id === this._targetAuthor.id, {time: this._duration});

            msgCollector.on("collect", async (c: Message) => {
                if (options && options.deleteResponseMessage)
                    await c.delete().catch();

                if (options && options.cancelFlag && options.cancelFlag.toLowerCase() === c.content.toLowerCase()) {
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
                if (options && options.deleteBaseMsg && botMsg.deletable) botMsg.delete();
                if (r === "time") return resolve(null);
            });
        });
    }

    /**
     * Starts a message and reaction collector. This function will wait for one message or reaction and returns
     * either the parsed content from the message (specified by your filter) or the reaction (whichever one comes
     * first).
     * @param {Function} func The function that will essentially "filter" and "parse" a message.
     * @param {IGenericMsgCollectorArguments} options Any options for this collector. You will need to use this to
     * specify the reactions that will be used.
     * @returns {Promise<Emoji | T | null>} Either the parsed message content or an emoji, or null if the cancel
     * command was used or time ran out.
     * @template T
     */
    public async startDoubleCollector(
        func: (collectedMsg: Message, ...otherArgs: any[]) => Promise<T | void>,
        options?: IGenericMsgCollectorArguments
    ): Promise<T | Emoji | null> {
        const msgReactions: EmojiResolvable[] = [];
        let cancelFlag = "cancel";
        let deleteResponseMsg = true;
        let reactToMsg = false;
        let deleteBotMsgAfterComplete = true;
        let removeReactionsAfter = false;
        const botMsg = options && options.oldMsg
            ? options.oldMsg
            : await this._targetChannel.send(this._messageToSend.content, {
                embed: this._messageToSend.embed,
                files: this._messageToSend.files,
                allowedMentions: this._messageToSend.allowedMentions,
                disableMentions: this._messageToSend.disableMentions
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
                if (reactToMsg) AdvancedReactionCollector.reactFaster(botMsg, msgReactions);
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
}