import {GuildMember, PartialGuildMember} from "discord.js";
import {MongoManager} from "../managers/MongoManager";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {MuteManager, SuspensionManager} from "../managers/PunishmentManager";

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
    if (oldMember.roles.cache.has(guildDoc.roles.mutedRoleId)
        && !member.roles.cache.has(guildDoc.roles.mutedRoleId)) {
        await MuteManager.removeMute(member, null, {
            evidence: [],
            guildDoc: guildDoc,
            reason: "The Muted role was taken off by a staff member."
        });

        return;
    }

    if (oldMember.roles.cache.has(guildDoc.roles.suspendedRoleId)
        && !member.roles.cache.has(guildDoc.roles.suspendedRoleId)) {
        await SuspensionManager.removeSuspension(member, null, {
            evidence: [],
            guildDoc: guildDoc,
            reason: "The Suspended role was taken off by a staff member."
        });

        return;
    }
}