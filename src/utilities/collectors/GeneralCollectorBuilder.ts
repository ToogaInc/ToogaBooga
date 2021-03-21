import {GeneralCollector} from "./GeneralCollector";
import {Collection, EmojiResolvable, Message, MessageReaction, Snowflake, User} from "discord.js";

type ReactionCollectorFilter = (r: MessageReaction, u: User) => boolean | Promise<boolean>;
type MessageCollectorFilter = (m: Message) => boolean | Promise<boolean>;
type MessageOnCollectFunc = (m: Message, instance: GeneralCollector) => void | Promise<void>;
type ReactionFunction = (u: User, instance: GeneralCollector) => void | Promise<void>;
type OnEndFunction = (r?: string) => void | Promise<void>;

export class GeneralCollectorBuilder {
    private _reactCollFilter: ReactionCollectorFilter | null;
    private _reactionMapping: Collection<EmojiResolvable, ReactionFunction>;

    private _msgCollFilter: MessageCollectorFilter | null;
    private _msgOnCollectFunc: MessageOnCollectFunc | null;

    private _onEndFunction: OnEndFunction | null;

    private _time: number;
    private _msg: Message | null;

    /**
     * Creates a new `GeneralCollectorBuilder` that is used to construct a `GeneralCollector`. This collector class
     * should be used when you want to deal with more flexibility with either the message or reaction collectors
     * without having to needlessly create tons of redundant instantiations throughout your code.
     */
    public constructor() {
        this._reactCollFilter = null;
        this._msgCollFilter = null;
        this._msgOnCollectFunc = null;
        this._onEndFunction = null;
        this._time = 5 * 60 * 1000;
        this._msg = null;
        this._reactionMapping = new Collection<EmojiResolvable, ReactionFunction>();
    }

    /**
     * Sets the message that should be used for this collector.
     * @param {Message} msg The message.
     * @return {this} This object.
     */
    public setMessage(msg: Message): this {
        this._msg = msg;
        return this;
    }

    /**
     * Adds a reaction handler. In other words, add an emoji and its associated function to be executed when someone
     * reacts with the said emoji.
     * @param {EmojiResolvable} emoji The emoji.
     * @param {ReactionFunction} func The resulting function.
     * @return {this} This object.
     */
    public addReactionHandler(emoji: EmojiResolvable, func: ReactionFunction): this {
        this._reactionMapping.set(emoji, func);
        return this;
    }

    /**
     * Sets the time that both collectors should use.
     * @param {number} ms The time, in milliseconds.
     * @return {this} This object.
     */
    public setTime(ms: number): this {
        this._time = ms;
        return this;
    }

    /**
     * The reaction collector filter.
     * @param {ReactionCollectorFilter} func The filter.
     * @return {this} This object.
     */
    public setReactionFilter(func: ReactionCollectorFilter): this {
        this._reactCollFilter = func;
        return this;
    }

    /**
     * The message collector filter.
     * @param {MessageCollectorFilter} func The filter.
     * @return {this} This object.
     */
    public setMessageFilter(func: MessageCollectorFilter): this {
        this._msgCollFilter = func;
        return this;
    }


    /**
     * The function to be used for the `collect` event of the MessageCollector.
     * @param {MessageOnCollectFunc} func The function for the `collect` event.
     * @return {this} This object.
     */
    public setMessageCollectorOnCollectFunc(func: MessageOnCollectFunc): this {
        this._msgOnCollectFunc = func;
        return this;
    }

    /**
     * Sets the function that will handle the `end` event for both collectors.
     * @return {this} This object.
     */
    public setEndOfCollectorFunc(func: OnEndFunction): this {
        this._onEndFunction = func;
        return this;
    }

    /**
     * Builds the GeneralCollector.
     * @return {GeneralCollector} The collector.
     * @throws {Error} If you didn't fully define functions for at least one collector.
     */
    public build(): GeneralCollector {
        if (!this._msg)
            throw new Error("Message not defined.");
        const reactCollDefined = this._reactionMapping.size > 0 && this._reactCollFilter !== null;
        const msgCollDefined = this._msgCollFilter !== null && this._msgOnCollectFunc !== null;
        if (!reactCollDefined && !msgCollDefined)
            throw new Error("Collectors not defined. Must define at least one.");
        return new GeneralCollector(this);
    }


    /**
     * Gets the time that the collectors should last. Default is 5 minutes.
     * @return {number} The time for the collectors.
     */
    public get time(): number {
        return this._time;
    }

    /**
     * Gets the message that will be used for this collector.
     * @return {Message | null} The message, if defined.
     */
    public get message(): Message | null {
        return this._msg;
    }

    /**
     * Gets the reaction collector filter function.
     * @return {ReactionCollectorFilter | null} The function, if defined.
     */
    public get reactionCollectorFilter(): ReactionCollectorFilter | null {
        return this._reactCollFilter;
    }

    /**
     * Gets the reaction mapping.
     * @return {Collection<EmojiResolvable, ReactionFunction>} The mapping.
     */
    public get reactionMapping(): Collection<EmojiResolvable, ReactionFunction> {
        return this._reactionMapping;
    }

    /**
     * Gets the message collector filter function.
     * @return {MessageCollectorFilter | null} The function, if defined.
     */
    public get messageCollectorFilter(): MessageCollectorFilter | null {
        return this._msgCollFilter;
    }

    /**
     * The `collect` event function for the message collector.
     * @return {MessageOnCollectFunc | null} The message collector `collect` event function.
     */
    public get messageOnCollectFunc(): MessageOnCollectFunc | null {
        return this._msgOnCollectFunc;
    }

    /**
     * The `end` event function.
     * @return {OnEndFunction | null} The `end` event function, if defined.
     */
    public get onEndFunc(): OnEndFunction | null {
        return this._onEndFunction;
    }
}