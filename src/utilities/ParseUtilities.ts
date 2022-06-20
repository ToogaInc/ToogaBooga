import { GuildBasedChannel, Message, Role, User } from "discord.js";
import { MiscUtilities } from "./MiscUtilities";
import { GuildFgrUtilities } from "./fetch-get-request/GuildFgrUtilities";
import { GlobalFgrUtilities } from "./fetch-get-request/GlobalFgrUtilities";

export namespace ParseUtilities {
    /**
     * Parses a role from a message object.
     * @param {Message} msg The message.
     * @return {Role | null} The role object, if any; null otherwise.
     */
    export function parseRole(msg: Message): Role | null {
        if (!msg.guild) return null;
        if (MiscUtilities.isSnowflake(msg.content))
            return GuildFgrUtilities.getCachedRole(msg.guild, msg.content);

        return msg.mentions.roles.first() ?? null;
    }

    /**
     * Parses a channel from a message object.
     * @param {Message} msg The message.
     * @return {T | null} The channel object, if any; null otherwise.
     */
    export function parseChannel<T extends GuildBasedChannel>(msg: Message): T | null {
        if (!msg.guild) return null;
        if (MiscUtilities.isSnowflake(msg.content))
            return GuildFgrUtilities.getCachedChannel<T>(msg.guild, msg.content);

        return msg.mentions.channels.first() as T ?? null;
    }

    /**
     * Parses a user mention from the message object.
     * @param {Message} msg The message.
     * @returns {User | null} The user object, if any; null otherwise.
     */
    export function parseUser(msg: Message): User | null {
        if (MiscUtilities.isSnowflake(msg.content))
            return GlobalFgrUtilities.getCachedUser(msg.content);

        return msg.mentions.users.first() ?? null;
    }
}