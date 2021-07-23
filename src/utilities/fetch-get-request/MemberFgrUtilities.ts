import {GuildMember} from "discord.js";
import {MiscUtilities} from "../MiscUtilities";

export namespace MemberFgrUtilities {
    /**
     * Checks if a member has the specified role.
     * @param {GuildMember} member The member.
     * @param {string} roleId The role ID.
     * @return {boolean} Whether the member has the role.
     */
    export function hasCachedRole(member: GuildMember, roleId: string): boolean {
        if (!MiscUtilities.isSnowflake(roleId)) return false;
        return member.roles.cache.has(roleId);
    }
}