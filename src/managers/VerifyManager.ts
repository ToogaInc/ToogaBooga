import {GuildMember} from "discord.js";
import {IGuildInfo} from "../definitions/major/IGuildInfo";
import {ISectionInfo} from "../definitions/major/ISectionInfo";

export namespace VerifyManager {

    export async function verify(member: GuildMember, guildDoc: IGuildInfo, section?: ISectionInfo): Promise<void> {
    }
}