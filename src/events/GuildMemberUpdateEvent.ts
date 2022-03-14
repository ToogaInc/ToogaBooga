import {GuildMember, PartialGuildMember} from "discord.js";
import {MongoManager} from "../managers/MongoManager";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {MuteManager, SuspensionManager} from "../managers/PunishmentManager";
import {UserManager} from "../managers/UserManager";

export async function onGuildMemberUpdate(
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember | PartialGuildMember
): Promise<void> {
    const [guildDoc, member] = await Promise.all([
        MongoManager.getOrCreateGuildDoc(newMember.guild.id, true),
        GuildFgrUtilities.fetchGuildMember(newMember.guild, newMember.id)
    ]);

    if (!guildDoc || !member) {
        return;
    }

    // Check if someone took off this person's muted role
    if (
        (oldMember.roles.cache.has(guildDoc.roles.mutedRoleId)
            // Need this in case oldMember is not cached
            || guildDoc.moderation.mutedUsers.some(x => x.affectedUser.id === member.id))
        && !member.roles.cache.has(guildDoc.roles.mutedRoleId)
    ) {
        await MuteManager.removeMute(member, null, {
            evidence: [],
            guildDoc: guildDoc,
            reason: "The Muted role was taken off by a staff member."
        });

        return;
    }

    if (
        (oldMember.roles.cache.has(guildDoc.roles.suspendedRoleId)
            // Need this in case oldMember is not cached
            || guildDoc.moderation.suspendedUsers.some(x => x.affectedUser.id === member.id))
        && !member.roles.cache.has(guildDoc.roles.suspendedRoleId)
    ) {
        await SuspensionManager.removeSuspension(member, null, {
            evidence: [],
            guildDoc: guildDoc,
            reason: "The Suspended role was taken off by a staff member."
        });

        return;
    }

    // Otherwise, update their roles to include or not include the team role
    UserManager.updateStaffRolesForMember(member, guildDoc);
}