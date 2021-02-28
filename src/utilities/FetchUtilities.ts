import {
    DMChannel,
    Guild,
    GuildMember,
    Message,
    TextChannel,
    User
} from "discord.js";
import {OneRealmBot} from "../OneRealmBot";

export namespace FetchUtilities {
    /**
     * A simple function that fetches a guild member. This will handle any exceptions that may occur.
     * @param {Guild} guild The guild.
     * @param {string} targetId The target member ID.
     * @return {Promise<GuildMember | null>} The guild member, if found. Otherwise, null.
     */
    export async function fetchGuildMember(guild: Guild, targetId: string): Promise<GuildMember | null> {
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
     * @param {TextChannel | DMChannel} channel The channel.
     * @param {string} msgId The message to fetch.
     * @returns {Promise<Message | null>} The messgae object, if found. Null otherwise.
     */
    export async function fetchMessage(channel: TextChannel | DMChannel, msgId: string): Promise<Message | null> {
        try {
            return await channel.messages.fetch(msgId);
        } catch (e) {
            return null;
        }
    }
}