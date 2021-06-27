import {GeneralCollector} from "./GeneralCollector";
import {
    AwaitMessageComponentInteractionOptions,
    Collection, CollectorFilter,
    EmojiResolvable,
    Interaction,
    Message, MessageButton, MessageComponentInteraction,
    MessageReaction,
    User
} from "discord.js";

type MessageOnCollectFunc = (m: Message, instance: GeneralCollector) => void | Promise<void>;
type InteractionFunction = (i: Interaction, instance: GeneralCollector) => void | Promise<void>;
type OnEndFunction = (r?: string, ...args: string[]) => void | Promise<void>;
type UserReasonHelperFunction = (u: User, c?: string) => void | Promise<void>;

export class GeneralCollectorBuilder {
    private _buttonCollFilter: CollectorFilter<[MessageComponentInteraction]> | null;
    // K = string = the custom ID
    private readonly _buttonMapping: Collection<string, InteractionFunction>;

    private _msgCollFilter: CollectorFilter<[Message]> | null;
    private _msgOnCollectFunc: MessageOnCollectFunc | null;

    private _onEndFunction: OnEndFunction | null;
    private _helperFunction: UserReasonHelperFunction | null;

    private _time: number;
    private _msg: Message | null;

    /**
     * Creates a new `GeneralCollectorBuilder` that is used to construct a `GeneralCollector`. This collector class
     * should be used when you want to deal with more flexibility with either the message or reaction collectors
     * without having to needlessly create tons of redundant instantiations throughout your code.
     */
    public constructor() {
        this._buttonCollFilter = null;
        this._msgCollFilter = null;
        this._msgOnCollectFunc = null;
        this._onEndFunction = null;
        this._helperFunction = null;
        this._time = 5 * 60 * 1000;
        this._msg = null;
        this._buttonMapping = new Collection<string, InteractionFunction>();
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
     * Adds a button handler. In other words, add a button and its associated function to be executed when someone
     * clicks on said button.
     * @param {MessageButton | string} buttonOrId The button or custom ID associated with a button..
     * @param {InteractionFunction} func The resulting function.
     * @return {this} This object.
     * @throws {TypeError} If the button doesn't have a custom ID.
     */
    public addReactionHandler(buttonOrId: MessageButton | string, func: InteractionFunction): this {
        let customId: string;
        if (typeof buttonOrId === "string") customId = buttonOrId;
        else {
            if (buttonOrId.customID) customId = buttonOrId.customID;
            else throw new TypeError("Button doesn't have a defined customId.");
        }

        this._buttonMapping.set(customId, func);
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
     * The button collector filter.
     * @param {CollectorFilter<[Message]>} func The filter.
     * @return {this} This object.
     */
    public setButtonFilter(func: CollectorFilter<[MessageComponentInteraction]>): this {
        this._buttonCollFilter = func;
        return this;
    }

    /**
     * The message collector filter.
     * @param {CollectorFilter<[Message]>} func The filter.
     * @return {this} This object.
     */
    public setMessageFilter(func: CollectorFilter<[Message]>): this {
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
     * Sets the function that can be called in the regular function collectors.
     * @param {UserReasonHelperFunction} func The helper function.
     * @return {this} This object.
     */
    public setHelperFunction(func: UserReasonHelperFunction): this {
        this._helperFunction = func;
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
        const reactCollDefined = this._buttonMapping.size > 0 && this._buttonCollFilter !== null;
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
     * Gets the button collector filter function.
     * @return {CollectorFilter<[MessageComponentInteraction]> | null} The function, if defined.
     */
    public get reactionCollectorFilter(): CollectorFilter<[MessageComponentInteraction]> | null {
        return this._buttonCollFilter;
    }

    /**
     * Gets the reaction mapping.
     * @return {Collection<string, InteractionFunction>} The mapping.
     */
    public get buttonMapping(): Collection<string, InteractionFunction> {
        return this._buttonMapping;
    }

    /**
     * Gets the message collector filter function.
     * @return {CollectorFilter<[Message]> | null} The function, if defined.
     */
    public get messageCollectorFilter(): CollectorFilter<[Message]> | null {
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

    /**
     * The helper function.
     * @return {UserReasonHelperFunction | null} The helper function, if defined.
     */
    public get helperFunc(): UserReasonHelperFunction | null {
        return this._helperFunction;
    }
}