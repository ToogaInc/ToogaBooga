import {ISectionInfo} from "../definitions/major/ISectionInfo";
import {IGuildInfo} from "../definitions/major/IGuildInfo";
import {GuildMember, User} from "discord.js";

export async function getSection(guildDb: IGuildInfo, user: User, member: GuildMember,
                                 title: string, desc: string): Promise<ISectionInfo | null> {
    return null;
}