import {Collection, GuildMember} from "discord.js";
import {MongoManager} from "../managers/MongoManager";
import {MuteManager, SuspensionManager} from "../managers/PunishmentManager";
import {GlobalFgrUtilities} from "../utilities/fetch-get-request/GlobalFgrUtilities";

export async function onGuildMemberAdd(member: GuildMember): Promise<void> {
    const guildDoc = await MongoManager.getOrCreateGuildDoc(member.guild.id, true);
    // Check muted
    const mutedUser = guildDoc.moderation.mutedUsers.find(x => x.affectedUser.id === member.id);
    if (mutedUser) {
        await GlobalFgrUtilities.tryExecuteAsync(async () => {
            await member.roles.add(guildDoc.roles.mutedRoleId);
        });

        if (mutedUser.timeEnd !== -1) {
            if (!MuteManager.MutedMembers.has(member.guild.id)) {
                MuteManager.MutedMembers.set(member.guild.id, []);
            }

            const guildMuteManager = MuteManager.MutedMembers.get(member.guild.id)!;
            if (!guildMuteManager.some(x => x.affectedUser.id === member.id)) {
                guildMuteManager.push({
                    actionId: mutedUser.actionId,
                    affectedUser: {...mutedUser.affectedUser},
                    evidence: mutedUser.evidence.slice(),
                    issuedAt: mutedUser.issuedAt,
                    moderator: {...mutedUser.moderator},
                    reason: mutedUser.reason,
                    timeEnd: mutedUser.timeEnd
                });
            }
        }
    }

    // Check suspended
    const suspendedUser = guildDoc.moderation.suspendedUsers.find(x => x.affectedUser.id === member.id);
    if (suspendedUser) {
        await GlobalFgrUtilities.tryExecuteAsync(async () => {
            await member.roles.add(guildDoc.roles.suspendedRoleId);
        });

        if (suspendedUser.timeEnd !== -1) {
            if (!SuspensionManager.SuspendedMembers.has(member.guild.id)) {
                SuspensionManager.SuspendedMembers.set(member.guild.id, new Collection());
            }

            if (!SuspensionManager.SuspendedMembers.get(member.guild.id)!.has(member.id)) {
                SuspensionManager.SuspendedMembers.get(member.guild.id)!.set(member.id, {
                    actionId: suspendedUser.actionId,
                    affectedUser: {...suspendedUser.affectedUser},
                    evidence: suspendedUser.evidence.slice(),
                    issuedAt: suspendedUser.issuedAt,
                    moderator: {...suspendedUser.moderator},
                    oldRoles: suspendedUser.oldRoles.slice(),
                    reason: suspendedUser.reason,
                    timeEnd: suspendedUser.timeEnd
                });
            }
        }
    } // End if

    // Now check section suspended
    for (const section of guildDoc.guildSections) {
        const secSuspendedUser = section.moderation.sectionSuspended.find(x => x.affectedUser.id === member.id);
        if (secSuspendedUser && secSuspendedUser.timeEnd !== -1) {
            if (!SuspensionManager.SectionSuspendedMembers.has(member.guild.id)) {
                SuspensionManager.SuspendedMembers.set(member.guild.id, new Collection());
            }

            if (!SuspensionManager.SectionSuspendedMembers.get(member.guild.id)!.has(section.uniqueIdentifier)) {
                SuspensionManager.SectionSuspendedMembers.get(member.guild.id)!.set(section.uniqueIdentifier, []);
            }

            const secSusArr = SuspensionManager.SectionSuspendedMembers.get(member.guild.id)!
                .get(section.uniqueIdentifier)!;

            if (!secSusArr.some(x => x.affectedUser.id === member.id)) {
                secSusArr.push({
                    actionId: secSuspendedUser.actionId,
                    affectedUser: {...secSuspendedUser.affectedUser},
                    evidence: secSuspendedUser.evidence.slice(),
                    issuedAt: secSuspendedUser.issuedAt,
                    moderator: {...secSuspendedUser.moderator},
                    oldRoles: secSuspendedUser.oldRoles.slice(),
                    reason: secSuspendedUser.reason,
                    timeEnd: secSuspendedUser.timeEnd
                });
            }
        } // End if
    } // End loop
}