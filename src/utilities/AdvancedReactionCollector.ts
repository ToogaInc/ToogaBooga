import {Emoji, EmojiResolvable, GuildMember, Message, MessageReaction, User} from "discord.js";

export class AdvancedReactionCollector {

    public static reactFaster(msg: Message, reactions: Array<EmojiResolvable>,
                              intervalTime: number = 550): void {
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
                                               reactions: Array<EmojiResolvable>,
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