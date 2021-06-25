import {ISectionInfo} from "../definitions/db/ISectionInfo";
import {IGuildInfo} from "../definitions/db/IGuildInfo";
import {GuildMember, User} from "discord.js";

export async function getSection(guildDb: IGuildInfo, user: User, member: GuildMember,
                                 title: string, desc: string): Promise<ISectionInfo | null> {
    return null;
}