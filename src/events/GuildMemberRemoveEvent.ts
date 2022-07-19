import { GuildMember, PartialGuildMember } from "discord.js";
import { VerifyManager } from "../managers/VerifyManager";

export async function onGuildMemberRemove(member: GuildMember | PartialGuildMember): Promise<void> {
    VerifyManager.removeAllManualVerifAppsForUser(member.guild, member.id).then();
}