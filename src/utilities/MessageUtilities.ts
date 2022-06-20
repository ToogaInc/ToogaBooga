// noinspection JSUnusedGlobalSymbols

import {
    ColorResolvable,
    EmojiIdentifierResolvable,
    Guild,
    GuildMember,
    Message,
    MessageActionRow,
    MessageEmbed,
    MessageOptions,
    PartialTextBasedChannelFields,
    TextBasedChannel,
    User
} from "discord.js";
import {MiscUtilities} from "./MiscUtilities";
import {GlobalFgrUtilities} from "./fetch-get-request/GlobalFgrUtilities";

export namespace MessageUtilities {
    /**
     * Attempts to fetch a message.
     *
     * Note that using the general method when a message is deleted will result in the bot crashing due to an
     * `Unknown Message` error. This method prevents the crashing behavior.
     * @param {TextBasedChannel} channel The channel to search the message up from.
     * @param {string} mId The message ID.
     * @returns {Promise<Message | null>} The message, if any; `null` if no message was found.
     */
    export async function tryGetMessage(channel: TextBasedChannel, mId: string): Promise<Message | null> {
        if (!MiscUtilities.isSnowflake(mId)) {
            return null;
        }

        return await GlobalFgrUtilities.tryExecuteAsync(async () => {
            return channel.messages.fetch(mId);
        });
    }

    /**
     * Attempts to delete a message. This function should be used instead of the general `Message#delete()` method
     * when there is a possibility that a message (that is being edited/tracked constantly) may already be deleted,
     * e.g. due to an incompetent user.
     *
     * Note that using the general method when a message is deleted will result in the bot crashing due to an
     * `Unknown Message` error. This method prevents the crashing behavior.
     * @param {Message | null} m The message to delete.
     */
    export async function tryDelete(m: Message | null): Promise<void> {
        if (!m) return;
        await GlobalFgrUtilities.tryExecuteAsync(async () => {
            await m.delete();
        });
    }

    /**
     * Attempts to edit a message. This function should be used instead of the general `Message#edit()` method when
     * there is a possibility that a message (that is being edited/tracked constantly) may already be deleted, e.g.
     * due to an incompetent user.
     *
     * Note that using the general method when a message is deleted will result in the bot crashing due to an
     * `Unknown Message` error. This method prevents the crashing behavior.
     * @param {Message} m The message to edit.
     * @param {MessageOptions} w The contents to edit the message with.
     * @returns {Promise<boolean>} Whether the message editing was successful.
     */
    export async function tryEdit(m: Message, w: MessageOptions): Promise<boolean> {
        return await GlobalFgrUtilities.tryExecuteAsync<boolean>(async () => {
            await m.edit(w);
            return true;
        }) ?? false;
    }

    /**
     * Attempts to react to a message. This function should be used instead of the general `Message#react()` method
     * when there is a possibility that a message (that is being edited/tracked constantly) may already be deleted, e.g.
     * due to an incompetent user.
     *
     * Note that using the general method when a message is deleted will result in the bot crashing due to an
     * `Unknown Message` error. This method prevents the crashing behavior.
     * @param {Message} m The message to edit.
     * @param {EmojiIdentifierResolvable} e The emoji to react with.
     * @returns {Promise<boolean>} Whether the message editing was successful.
     */
    export async function tryReact(m: Message, e: EmojiIdentifierResolvable): Promise<boolean> {
        return await GlobalFgrUtilities.tryExecuteAsync<boolean>(async () => {
            await m.react(e);
            return true;
        }) ?? false;
    }

    /**
     * Sends a message to a channel, automatically taking care of deletion of this message.
     * @param {MessageOptions} info The message content to send.
     * @param {PartialTextBasedChannelFields} channel The channel to send this message.
     * @param {number} timeout The delay between sending and deleting this message.
     */
    export function sendThenDelete(info: MessageOptions & { split?: false | undefined },
                                   channel: PartialTextBasedChannelFields,
                                   timeout: number = 5000): void {
        channel.send(info).then(async x => {
            await MiscUtilities.stopFor(timeout);
            await x.delete().catch();
        });
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
            embed.setAuthor({name: obj.tag, iconURL: obj.displayAvatarURL()});
        else if (obj instanceof GuildMember)
            embed.setAuthor({name: obj.displayName, iconURL: obj.user.displayAvatarURL()});
        else {
            const icon = obj.iconURL();
            if (icon) embed.setAuthor({name: obj.name, iconURL: icon});
            else embed.setAuthor({name: obj.name});
        }

        return embed;
    }


    /**
     * Gets the `MessageOptions` object from a message.
     * @param {Message} msg The message.
     * @param {MessageActionRow[]} components The components, if any.
     * @return {MessageOptions} The new `MessageOptions`.
     */
    export function getMessageOptionsFromMessage(
        msg: Message,
        components?: MessageActionRow[]
    ): MessageOptions & { split?: false | undefined } {
        const obj: MessageOptions & { split?: false | undefined } = {
            components: []
        };
        if (msg.content)
            obj.content = msg.content;
        if (msg.embeds.length !== 0)
            obj.embeds = msg.embeds;
        if (msg.attachments.size !== 0)
            obj.files = Array.from(msg.attachments.values());
        if (msg.components.length === 0)
            obj.components = components;
        else
            obj.components = msg.components;

        return obj;
    }
}