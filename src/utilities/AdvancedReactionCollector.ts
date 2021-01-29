import {Emoji, EmojiResolvable, GuildMember, Message, MessageReaction, User} from "discord.js";

export class AdvancedReactionCollector {
    private readonly _targetMsg: Message;
    private readonly _reactions: EmojiResolvable[];
    private readonly _targetAuthor: GuildMember | User;
    private readonly _duration: number;

    public constructor(targetMsg: Message, targetMember: GuildMember | User, reactions: EmojiResolvable[],
                       duration: number, timeUnit: "MS" | "S" | "M" = "M") {
        if (targetMsg.author.bot)
            throw new Error("Message must be from a bot.");

        this._targetMsg = targetMsg;
        this._reactions = reactions;
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

    public startReactionCollector(delay: number = 550, reactToMessage: boolean,
                                  clearReactsAfter: boolean = true): Promise<Emoji | null> {
        delay = Math.max(delay, 550);

        return new Promise((resolve) => {
            let stopReacting: () => void = () => null;
            if (reactToMessage) {
                let i: number = 0;
                const interval: NodeJS.Timeout = setInterval(() => {
                    // think of this as a for loop
                    // for (let i = 0; i < reactions.length; i++)
                    if (i < this._reactions.length) {
                        if (this._targetMsg.deleted) {
                            clearInterval(interval);
                            return;
                        }

                        this._targetMsg.react(this._reactions[i]).catch();
                    }
                    else
                        clearInterval(interval);
                    i++;
                }, delay);
                stopReacting = () => clearInterval(interval);
            }

            const filterFunc = (r: MessageReaction, u: User): boolean => (this._reactions.includes(r.emoji.name)
                || r.emoji.id !== null && this._reactions.includes(r.emoji.id))
                && u.id === this._targetAuthor.id;

            const reactionCollector = this._targetMsg.createReactionCollector(filterFunc, {
                max: 1,
                time: this._duration
            });

            reactionCollector.on("collect", r => resolve(r.emoji));
            reactionCollector.on("end", async (c, r) => {
               stopReacting();

               if (clearReactsAfter)
                   await this._targetMsg.reactions.removeAll().catch();

               if (r === "time")
                   return resolve(null);
            });
        });
    }

    public static reactFaster(msg: Message, reactions: EmojiResolvable[], intervalTime: number = 550): void {
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

    public static async getReactionFromMessage(botMsg: Message, targetAuthor: User | GuildMember,
                                               reactions: EmojiResolvable[],
                                               removeAllReacts: boolean,
                                               time: number = 2 * 60 * 1000): Promise<Emoji | null> {
        return new Promise(async (resolve, reject) => {
            const func = (r: MessageReaction, u: User) => reactions.includes(r.emoji.name) && u.id === targetAuthor.id;
            const reactionCollector = botMsg.createReactionCollector(func, {
                time: time,
                max: 1
            });

            reactionCollector.on("collect", r => {
                if (!removeAllReacts)
                    r.remove().catch();

                resolve(r.emoji);
            });

            reactionCollector.on("end", async (c, r) => {
                if (removeAllReacts)
                    await botMsg.reactions.removeAll().catch();

                if (r === "time")
                    return resolve(null);
            });
        });
    }
}