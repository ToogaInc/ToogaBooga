import {MessageReaction, PartialUser, User} from "discord.js";

export async function onMessageReactionAdd(reaction: MessageReaction,
                                           user: User | PartialUser): Promise<void> {
    if (!reaction.message.guild)
        return;

    if (reaction.message.author.bot || user.bot)
        return;

    const guild = await reaction.message.guild.fetch();
    const message = await reaction.message.fetch();
    const resolvedUser = await user.fetch();
    const resolvedMember = await guild.members.fetch(user.id);
    const peopleThatReacted = await reaction.users.fetch();
}