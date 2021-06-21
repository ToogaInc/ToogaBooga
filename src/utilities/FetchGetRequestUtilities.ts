import {
    DMChannel,
    Guild, GuildChannel,
    GuildMember,
    Message, MessageOptions, NewsChannel, PartialTextBasedChannelFields, Role, Snowflake,
    TextChannel,
    User
} from "discord.js";
import {MiscUtilities} from "./MiscUtilities";
import {OneLifeBot} from "../OneLifeBot";

export namespace FetchGetRequestUtilities {

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
     * Checks whether a member has a role.
     * @param {GuildMember} member The member.
     * @param {string} roleId The role ID. This assumes a valid ID.
     * @return {boolean} Whether this member has the role.
     */
    export function hasCachedRole(member: GuildMember, roleId: string): boolean {
        if (!MiscUtilities.isSnowflake(roleId)) return false;
        return member.roles.cache.has(roleId);
    }

    /**
     * Gets a cached channel.
     * @param {Guild} guild The guild.
     * @param {string} channelId The channel ID. This assumes a valid ID. If an invalid ID is given, `null` will be
     * returned.
     * @return {T | null} The channel, if at all. Otherwise, `null`.
     */
    export function getCachedChannel<T extends GuildChannel>(guild: Guild, channelId: string): T | null {
        if (!MiscUtilities.isSnowflake(channelId)) return null;
        const c = guild.channels.cache.get(channelId) ?? null;
        return c ? c as T : null;
    }

    /**
     * Gets a cached role.
     * @param {Guild} guild The guild.
     * @param {string} roleId The role ID. This assumes a valid ID. If an invalid ID is given, `null` will be returned.
     * @return {Role | null} The role, if at all. Otherwise, `null`.
     */
    export function getCachedRole(guild: Guild, roleId: string): Role | null {
        if (!MiscUtilities.isSnowflake(roleId)) return null;
        return guild.roles.cache.get(roleId) ?? null;
    }

    /**
     * Gets a cached member.
     * @param {Guild} guild The guild.
     * @param {string} userId The user ID. This assumes a valid ID. If an invalid ID is given, `null` will be returned.
     * @return {GuildMember | null} The member, if at all. Otherwise, `null`.
     */
    export function getCachedMember(guild: Guild, userId: string): GuildMember | null {
        if (!MiscUtilities.isSnowflake(userId)) return null;
        return guild.members.cache.get(userId) ?? null;
    }

    /**
     * A simple function that fetches a guild member. This will handle any exceptions that may occur.
     * @param {Guild} guild The guild.
     * @param {string} targetId The target member. This assumes a valid user ID. If an invalid ID is given, `null`
     * will be returned.
     * @return {Promise<GuildMember | null>} The guild member, if found. Otherwise, null.
     */
    export async function fetchGuildMember(guild: Guild, targetId: string): Promise<GuildMember | null> {
        if (!MiscUtilities.isSnowflake(targetId)) return null;
        try {
            return await guild.members.fetch(targetId);
        } catch (e) {
            return null;
        }
    }

    /**
     * A simple function that fetches a user. This will handle any exceptions that may occur.
     * @param {string} targetId The target user ID. This assumes a valid user ID. If an invalid ID is given, `null`
     * will be returned.
     * @return {Promise<GuildMember | null>} The user, if found. Otherwise, null.
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
     * A simple function that fetches a message. This will handle any exceptions that may occur.
     * @param {TextChannel | DMChannel | NewsChannel} channel The channel.
     * @param {string} msgId The message to fetch. This assumes a valid ID. If an invalid ID is given, `null` will
     * be returned.
     * @returns {Promise<Message | null>} The message object, if found. Null otherwise.
     */
    export async function fetchMessage(channel: TextChannel | DMChannel | NewsChannel,
                                       msgId: string): Promise<Message | null> {
        if (!MiscUtilities.isSnowflake(msgId)) return null;
        try {
            return await channel.messages.fetch(msgId);
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
     * A simple function that attempts to fetch a role. This will handle any exceptions that may occur.
     * @param {Guild} guild THe guild.
     * @param {string} roleId The role to fetch. This assumes a valid role ID. If an invalid ID is given, this will
     * return `null`.
     * @return {Promise<Role | null>} The role, if found. Null otherwise.
     */
    export async function fetchRole(guild: Guild, roleId: string): Promise<Role | null> {
        if (!MiscUtilities.isSnowflake(roleId)) return null;
        try {
            return await guild.roles.fetch(roleId as Snowflake);
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