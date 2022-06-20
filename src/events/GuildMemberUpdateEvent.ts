import { GuildMember, PartialGuildMember } from "discord.js";
import { MongoManager } from "../managers/MongoManager";
import { GuildFgrUtilities } from "../utilities/fetch-get-request/GuildFgrUtilities";
import { UserManager } from "../managers/UserManager";

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

    UserManager.updateStaffRolesForMember(member, guildDoc);
}