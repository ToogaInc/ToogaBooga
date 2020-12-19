import {MessageReaction, PartialUser, User} from "discord.js";

export async function onMessageReactionAdd(reaction: MessageReaction,
                                           user: User | PartialUser): Promise<void> {
    if (reaction.message.guild === null)
        return;

    const guild = reaction.message.guild.fetch();
    const message = reaction.message.fetch();
    const resolvedUser = await user.fetch();
    const peopleThatReacted = await reaction.users.fetch();
}