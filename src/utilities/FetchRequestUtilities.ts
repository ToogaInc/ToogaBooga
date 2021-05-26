import {
    DMChannel,
    Guild,
    GuildMember,
    Message, MessageOptions, NewsChannel, PartialTextBasedChannelFields, Role,
    TextChannel,
    User, UserResolvable
} from "discord.js";
import {OneRealmBot} from "../OneRealmBot";

export namespace FetchRequestUtilities {
    /**
     * A simple function that fetches a guild member. This will handle any exceptions that may occur.
     * @param {Guild} guild The guild.
     * @param {UserResolvable} targetId The target member.
     * @return {Promise<GuildMember | null>} The guild member, if found. Otherwise, null.
     */
    export async function fetchGuildMember(guild: Guild, targetId: UserResolvable): Promise<GuildMember | null> {
        try {
            return await guild.members.fetch(targetId);
        } catch (e) {
            return null;
        }
    }

    /**
     * A simple function that fetches a user. This will handle any exceptions that may occur.
     * @param {string} targetId The target user ID.
     * @return {Promise<GuildMember | null>} The user, if found. Otherwise, null.
     */
    export async function fetchUser(targetId: string): Promise<User | null> {
        try {
            return await OneRealmBot.BotInstance.client.users.fetch(targetId);
        } catch (e) {
            return null;
        }
    }


    /**
     * A simple function that fetches a message. This will handle any exceptions that may occur.
     * @param {TextChannel | DMChannel | NewsChannel} channel The channel.
     * @param {string} msgId The message to fetch.
     * @returns {Promise<Message | null>} The message object, if found. Null otherwise.
     */
    export async function fetchMessage(channel: TextChannel | DMChannel | NewsChannel,
                                       msgId: string): Promise<Message | null> {
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
            return await channel.send(msgOptions.content, {
                embed: msgOptions.embed,
                files: msgOptions.files,
                allowedMentions: msgOptions.allowedMentions,
                disableMentions: msgOptions.disableMentions
            });
        } catch (e) {
            return null;
        }
    }

    /**
     * A simple function that attempts to fetch a guild. This will handle any exceptions that may occur.
     * @param {string} guildId The ID corresponding to the guild that you want to fetch.
     * @returns {Promise<Guild | null>} The guild object, if one exists. Null otherwise.
     */
    export async function fetchGuild(guildId: string): Promise<Guild | null> {
        try {
            return await OneRealmBot.BotInstance.client.guilds.fetch(guildId);
        } catch (e) {
            return null;
        }
    }

    /**
     * A simple function that attempts to fetch a role. This will handle any exceptions that may occur.
     * @param {Guild} guild THe guild.
     * @param {string} roleId The role to fetch.
     * @return {Promise<Role | null>} The role, if found. Null otherwise.
     */
    export async function fetchRole(guild: Guild, roleId: string): Promise<Role | null> {
        try {
            return await guild.roles.fetch(roleId);
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