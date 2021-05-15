import {MessageReaction, NewsChannel, PartialUser, User} from "discord.js";
import {FetchRequestUtilities} from "../utilities/FetchRequestUtilities";

export async function onMessageReactionAdd(reaction: MessageReaction,
                                           user: User | PartialUser): Promise<void> {
    if (!reaction.message.guild)
        return;

    if (reaction.message.author.bot || user.bot)
        return;

    const guild = reaction.message.guild;
    const resolvedUser = await FetchRequestUtilities.fetchUser(user.id);
    const resolvedMember = await FetchRequestUtilities.fetchGuildMember(guild, user.id);
    if (!resolvedUser || !resolvedMember)
        return;
    const message = await FetchRequestUtilities.fetchMessage(reaction.message.channel, reaction.message.id);
    if (!message)
        return;

    const peopleThatReacted = await reaction.users.fetch();
}