import {GuildMember} from "discord.js";

export namespace LoggerManager {
    enum RunResult {
        Complete,
        Failed,
        Assist
    }

    export async function logKeyUse(member: GuildMember, keyId: string | null, amt: number): Promise<void> {
        // Format:      GUILD_ID-KEY_ID-USE
        //              GUILD_ID-USE
    }

    export async function logKeyStore(member: GuildMember, keyId: string, amt: number): Promise<void> {
        // Format:      GUILD_ID-KEY_ID-STORE
    }

    export async function logDungeonRun(member: GuildMember, dungeonId: string, completed: boolean): Promise<void> {
        // Format:      GUILD_ID-DUNGEON_ID-COMPLETED(1/0)
    }

    export async function logDungeonLead(member: GuildMember, dungeonId: string, result: RunResult): Promise<void> {
        // Format:      GUILD_ID-DUNGEON_ID-RESULT
    }
}