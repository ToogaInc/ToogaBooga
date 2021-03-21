import {GeneralCollectorBuilder} from "./GeneralCollectorBuilder";
import {Emoji, MessageCollector, ReactionCollector, TextChannel} from "discord.js";

export class GeneralCollector {
    private static END_EXPLICITLY_REASON: string = "END_EXPLICITLY_DUE_TO_INTERVENTION";

    private readonly _opt: GeneralCollectorBuilder;
    private _msgCollector: MessageCollector | null = null;
    private _reactionCollector: ReactionCollector | null = null;
    private _isRunning: boolean = false;

    /**
     * Creates a new instance of the `GeneralCollector`. This class is primarily designed to abstract away some of
     * the steps needed to create both a reaction and/or message collector.
     *
     * @param {GeneralCollectorBuilder} opt The builder.
     * @throws {Error} Whether the message is undefined.
     */
    public constructor(opt: GeneralCollectorBuilder) {
        if (!opt.message)
            throw new Error("Collector cannot be started since message is undefined.");

        this._opt = opt;
    }

    private instantiateCollectors(): void {
        const channel = this._opt.message!.channel as TextChannel;
        if (this._opt.messageCollectorFilter && this._opt.messageOnCollectFunc) {
            this._msgCollector = new MessageCollector(channel, this._opt.messageCollectorFilter, {
                time: this._opt.time
            });
            this._msgCollector.on("collect", this._opt.messageOnCollectFunc);
            this._msgCollector.on("end", (_, r: string) => {
                if (r !== GeneralCollector.END_EXPLICITLY_REASON) this.stop(r);
            });
        }

        if (this._opt.reactionMapping.size > 0 && this._opt.reactionCollectorFilter) {
            this._reactionCollector = this._opt.message!.createReactionCollector(this._opt.reactionCollectorFilter, {
                time: this._opt.time
            });
            this._reactionCollector.on("collect", async (thisReact, theUser) => {
                for (const [reaction, func] of this._opt.reactionMapping) {
                    // Check if custom emoji.
                    if (thisReact.emoji.id) {
                        // If so, check reaction.
                        if (reaction instanceof Emoji && reaction.id === thisReact.emoji.id) {
                            await func(theUser, this);
                            return;
                        }
                    }
                    // Not a custom emoji.
                    else {
                        if (reaction instanceof Emoji && reaction.name === thisReact.emoji.name) {
                            await func(theUser, this);
                            return;
                        }

                        if (typeof reaction === "string" && reaction === thisReact.emoji.name) {
                            await func(theUser, this);
                            return;
                        }
                    }
                }
            });
            this._reactionCollector.on("end", (_, r: string) => {
                if (r !== GeneralCollector.END_EXPLICITLY_REASON) this.stop(r);
            });
        }
    }

    /**
     * Starts the collectors.
     * @return {GeneralCollector} This object.
     */
    public start(): GeneralCollector {
        this._isRunning = true;
        this.instantiateCollectors();
        return this;
    }

    /**
     * Starts the collectors. This function will block execution of any further code until after the `stop` method
     * is called internally (either through time running out or the stopping of the collectors).
     * @return {GeneralCollector} This object.
     */
    public startBlocking(): GeneralCollector {
        this._isRunning = true;
        this.instantiateCollectors();
        while (true) if (!this._isRunning) break;
        return this;
    }

    public stop(reason?: string): void {
        this._isRunning = false;
        this._msgCollector?.stop(GeneralCollector.END_EXPLICITLY_REASON);
        this._reactionCollector?.stop(GeneralCollector.END_EXPLICITLY_REASON);
        if (this._opt.onEndFunc)
            this._opt.onEndFunc(reason);
    }
}