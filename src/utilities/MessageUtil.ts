import {
    ColorResolvable,
    Guild,
    GuildMember,
    MessageEmbed,
    MessageOptions,
    PartialTextBasedChannelFields, User
} from "discord.js";

export namespace MessageUtil {
    /**
     * Sends a message to a channel, automatically taking care of deletion of this message.
     * @param {MessageOptions} info The message content to send.
     * @param {PartialTextBasedChannelFields} channel The channel to send this message.
     * @param {number} timeout The delay between sending and deleting this message.
     */
    export function sendThenDelete(info: MessageOptions, channel: PartialTextBasedChannelFields,
                                         timeout: number = 5000): void {
        channel.send(info.content, {
            embed: info.embed,
            files: info.files,
            disableMentions: info.disableMentions,
            allowedMentions: info.allowedMentions
        }).then(x => x.delete({timeout: timeout <= 1000 ? 1000 : timeout}));
    }

    /**
     * Creates a blank embed with the author and color set.
     * @param {User | GuildMember | Guild} obj The user, guild member, or guild to show in the author section of the
     * embed.
     * @param {ColorResolvable} color The color of this embed.
     * @returns {MessageEmbed} The new embed.
     */
    export function generateBlankEmbed(obj: User | GuildMember | Guild,
                                       color: ColorResolvable = "RANDOM"): MessageEmbed {
        const embed = new MessageEmbed().setTimestamp().setColor(color);
        if (obj instanceof User)
            embed.setAuthor(obj.tag, obj.displayAvatarURL());
        else if (obj instanceof GuildMember)
            embed.setAuthor(obj.displayName, obj.user.displayAvatarURL());
        else {
            const icon = obj.iconURL();
            if (icon) embed.setAuthor(obj.name, icon);
            else embed.setAuthor(obj.name);
        }

        return embed;
    }
}