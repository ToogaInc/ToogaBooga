import {
    Channel,
    Guild, GuildChannel,
    GuildMember,
    Message, Role, Snowflake,
} from "discord.js";
import {MiscUtilities} from "../MiscUtilities";
import {DefinedRole} from "../../definitions/Types";
import {IGuildInfo} from "../../definitions";

/**
 * A set of functions that essentially "abstract" away the guild methods. This was created so that if discord.js
 * changes anything significant in future releases, I can pinpoint most issues to these files rather than looking
 * through the entire codebase.
 */
export namespace GuildFgrUtilities {
    /**
     * Checks whether a member has a role.
     * @param {Guild} guild The member or guild.
     * @param {string} roleId The role ID. This assumes a valid ID.
     * @return {boolean} Whether this member has the role.
     */
    export function hasCachedRole(guild: Guild, roleId: string): boolean {
        if (!MiscUtilities.isSnowflake(roleId)) return false;
        return guild.roles.cache.has(roleId);
    }

    /**
     * Gets a cached role.
     * @param {Guild | GuildMember} guildOrMember The guild.
     * @param {string} roleId The role ID. This assumes a valid ID. If an invalid ID is given, `null` will be returned.
     * @return {Role | null} The role, if at all. Otherwise, `null`.
     */
    export function getCachedRole(guildOrMember: Guild | GuildMember, roleId: string): Role | null {
        if (!MiscUtilities.isSnowflake(roleId)) return null;
        return guildOrMember.roles.cache.get(roleId) ?? null;
    }

    /**
     * Resolves a given role string (either a role ID or a string). This is suitable when you want to find, from
     * cache, either a role ID or a role defined by `DefinedRole`. This will only look in the main sections;
     * this will NOT consider section roles at all.
     *
     * @param {Guild} guild The guild.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {string | DefinedRole} roleIdOrStr The role ID. This can either be a role ID or one of
     * `DefinedRole` (for example, `Raider`).
     * @returns {Role[]} All roles. Most results should yield one role. Leader roles will possibly yield two.
     */
    export function resolveMainCachedGuildRoles(guild: Guild, guildDoc: IGuildInfo,
                                                roleIdOrStr: string | DefinedRole): Role | null {
        switch (roleIdOrStr) {
            case "Everyone": {
                return guild.roles.everyone;
            }
            case "Suspended": {
                return getCachedRole(guild, guildDoc.roles.suspendedRoleId);
            }
            case "Raider": {
                return getCachedRole(
                    guild,
                    guildDoc.roles.verifiedRoleId
                );
            }
            case "AlmostRaidLeader": {
                return getCachedRole(
                    guild,
                    guildDoc.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId
                );
            }
            case "RaidLeader": {
                return getCachedRole(
                    guild,
                    guildDoc.roles.staffRoles.universalLeaderRoleIds.leaderRoleId
                );
            }
            case "HeadRaidLeader": {
                return getCachedRole(
                    guild,
                    guildDoc.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId
                );
            }
            case "VeteranRaidLeader": {
                return getCachedRole(
                    guild,
                    guildDoc.roles.staffRoles.universalLeaderRoleIds.vetLeaderRoleId
                );
            }
            case "Security": {
                return getCachedRole(guild, guildDoc.roles.staffRoles.moderation.securityRoleId);
            }
            case "Officer": {
                return getCachedRole(guild, guildDoc.roles.staffRoles.moderation.officerRoleId);
            }
            case "Moderator": {
                return getCachedRole(guild, guildDoc.roles.staffRoles.moderation.moderatorRoleId);
            }
            case "Team": {
                return getCachedRole(guild, guildDoc.roles.staffRoles.teamRoleId);
            }
            default: {
                return getCachedRole(guild, roleIdOrStr);
            }
        }
    }


    /**
     * Fetches a given role string (either a role ID or a string). This is suitable when you want to find, from
     * cache, either a role ID or a role defined by `DefinedRole`. This will only look in the main sections;
     * this will NOT consider section roles at all.
     *
     * @param {Guild} guild The guild.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {string | DefinedRole} roleIdOrStr The role ID. This can either be a role ID or one of
     * `DefinedRole` (for example, `Raider`).
     * @returns {Role[]} All roles. Most results should yield one role. Leader roles will possibly yield two.
     */
    export async function fetchMainGuildRole(
        guild: Guild,
        guildDoc: IGuildInfo,
        roleIdOrStr: string | DefinedRole
    ): Promise<Role | null> {
        switch (roleIdOrStr) {
            case "Everyone": {
                return guild.roles.everyone;
            }
            case "Suspended": {
                return fetchRole(guild, guildDoc.roles.suspendedRoleId);
            }
            case "Raider": {
                return fetchRole(
                    guild,
                    guildDoc.roles.verifiedRoleId
                );
            }
            case "AlmostRaidLeader": {
                return fetchRole(
                    guild,
                    guildDoc.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId
                );
            }
            case "RaidLeader": {
                return fetchRole(
                    guild,
                    guildDoc.roles.staffRoles.universalLeaderRoleIds.leaderRoleId
                );
            }
            case "HeadRaidLeader": {
                return fetchRole(
                    guild,
                    guildDoc.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId
                );
            }
            case "VeteranRaidLeader": {
                return fetchRole(
                    guild,
                    guildDoc.roles.staffRoles.universalLeaderRoleIds.vetLeaderRoleId
                );
            }
            case "Security": {
                return fetchRole(guild, guildDoc.roles.staffRoles.moderation.securityRoleId);
            }
            case "Officer": {
                return fetchRole(guild, guildDoc.roles.staffRoles.moderation.officerRoleId);
            }
            case "Moderator": {
                return fetchRole(guild, guildDoc.roles.staffRoles.moderation.moderatorRoleId);
            }
            case "Team": {
                return fetchRole(guild, guildDoc.roles.staffRoles.teamRoleId);
            }
            default: {
                return fetchRole(guild, roleIdOrStr);
            }
        }
    }

    /**
     * Checks whether a guild has a channel.
     * @param {Guild} guild The guild.
     * @param {string} channelId The valid channel ID.
     * @return {boolean} Whether this guild has the channel.
     */
    export function hasCachedChannel(guild: Guild, channelId: string): boolean {
        if (!MiscUtilities.isSnowflake(channelId)) return false;
        return guild.roles.cache.has(channelId);
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
     * A simple function that fetches a message. This will handle any exceptions that may occur.
     * @param {Channel} channel The channel.
     * @param {string} msgId The message to fetch. This assumes a valid ID. If an invalid ID is given, `null` will
     * be returned.
     * @returns {Promise<Message | null>} The message object, if found. Null otherwise.
     */
    export async function fetchMessage(channel: Channel,
                                       msgId: string): Promise<Message | null> {
        if (!MiscUtilities.isSnowflake(msgId)) return null;
        if (!channel.isText()) return null;
        try {
            return await channel.messages.fetch(msgId);
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
}