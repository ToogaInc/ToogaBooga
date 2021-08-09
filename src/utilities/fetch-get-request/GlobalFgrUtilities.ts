import {
    DMChannel,
    Guild,
    GuildEmoji,
    Message,
    MessageOptions,
    PartialTextBasedChannelFields,
    User
} from "discord.js";
import {MiscUtilities} from "../MiscUtilities";
import {OneLifeBot} from "../../OneLifeBot";

/**
 * A set of functions that essentially "abstract" away the client methods. This was created so that if discord.js
 * changes anything significant in future releases, I can pinpoint most issues to these files rather than looking
 * through the entire codebase.
 */
export namespace GlobalFgrUtilities {

    /**
     * Attempts to open a DMChannel with the specified user.
     * @param {User} targetUser The target user.
     * @return {Promise<DMChannel | null>} The DMChannel, or null if this could not be done.
     */
    export async function openDirectMessage(targetUser: User): Promise<DMChannel | null> {
        try {
            return await targetUser.createDM();
        } catch (e) {
            return null;
        }
    }

    /**
     * Attempts to get a cached emoji from any server.
     * @param {string} emojiId The emoji ID.
     * @return {GuildEmoji | null} The emoji, if any.
     */
    export function getCachedEmoji(emojiId: string): GuildEmoji | null {
        if (!MiscUtilities.isSnowflake(emojiId)) return null;
        return OneLifeBot.BotInstance.client.emojis.cache.get(emojiId) ?? null;
    }

    /**
     * Checks if a cached emoji exists in any server.
     * @param {string} emojiId The emoji ID.
     * @return {boolean} If the emoji exists.
     */
    export function hasCachedEmoji(emojiId: string): boolean {
        if (!MiscUtilities.isSnowflake(emojiId)) return false;
        return OneLifeBot.BotInstance.client.emojis.cache.has(emojiId);
    }


    /**
     * Gets a cached user.
     * @param {string} userId The user ID. This assumes a valid ID. If an invalid ID is given, `null` will be returned.
     * @return {User | null} The user, if at all. Otherwise, `null`.
     */
    export function getCachedUser(userId: string): User | null {
        if (!MiscUtilities.isSnowflake(userId)) return null;
        return OneLifeBot.BotInstance.client.users.cache.get(userId) ?? null;
    }

    /**
     * A simple function that fetches a user. This will handle any exceptions that may occur.
     * @param {string} targetId The target user ID. This assumes a valid user ID. If an invalid ID is given, `null`
     * will be returned.
     * @return {Promise<User | null>} The user, if found. Otherwise, null.
     */
    export async function fetchUser(targetId: string): Promise<User | null> {
        if (!MiscUtilities.isSnowflake(targetId)) return null;
        try {
            return await OneLifeBot.BotInstance.client.users.fetch(targetId);
        } catch (e) {
            return null;
        }
    }

    /**
     * A simple function that attempts to send a message to the target channel. This will handle any exceptions that
     * may occur.
     * @param {PartialTextBasedChannelFields} channel The target channel.
     * @param {MessageOptions} msgOptions The message.
     * @returns {Promise<Message | null>} The message object, if there were no problems sending the message. If an
     * error occurred when trying to send the message (for example, no permissions or DMs disabled), then null will
     * be returned.
     */
    export async function sendMsg(channel: PartialTextBasedChannelFields,
                                  msgOptions: MessageOptions): Promise<Message | null> {
        try {
            return await channel.send({
                content: msgOptions.content,
                embeds: msgOptions.embeds,
                files: msgOptions.files,
                allowedMentions: msgOptions.allowedMentions
            });
        } catch (e) {
            return null;
        }
    }

    /**
     * A simple function that attempts to fetch a guild. This will handle any exceptions that may occur.
     * @param {string} guildId The ID corresponding to the guild that you want to fetch. This assumes a valid ID; if
     * the ID is invalid, then this will return `null`.
     * @returns {Promise<Guild | null>} The guild object, if one exists. Null otherwise.
     */
    export async function fetchGuild(guildId: string): Promise<Guild | null> {
        if (!MiscUtilities.isSnowflake(guildId)) return null;
        try {
            return await OneLifeBot.BotInstance.client.guilds.fetch(guildId);
        } catch (e) {
            return null;
        }
    }

    /**
     * A simple function that attempts to execute a given synchronous function. This will handle any exceptions that
     * may occur.
     * @param {() => void} func The function to run.
     * @return {T | null} The result, if any. Null otherwise.
     */
    export function tryExecute<T = void>(func: () => T | null): T | null {
        try {
            return func();
        } catch (e) {
            return null;
        }
    }

    /**
     * A simple function that attempts to execute a given asynchronous function. This will handle any exceptions that
     * may occur.
     * @param {() => void} func The function to run.
     * @return {Promise<T | null>} The result, if any. Null otherwise.
     */
    export async function tryExecuteAsync<T = void>(func: () => Promise<T | null>): Promise<T | null> {
        try {
            return await func();
        } catch (e) {
            return null;
        }
    }
}