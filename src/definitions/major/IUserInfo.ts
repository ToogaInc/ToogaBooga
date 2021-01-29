import {IRealmIgn} from "../IRealmIgn";

export interface IUserInfo {
    discordUserId: string;
    rotmgNames: IRealmIgn[];
    loggedInfo: {
        dungeons: {
            guildId: string;
            // string =[] The codeName found in DungeonData.
            dungeonsCompleted: [string, number][];
            dungeonsFailed: [string, number][];
        }[];

        leaderRuns: {
            guildId: string;
            // string =[] The codeName found in DungeonData.
            dungeonsCompleted: { dungeonCode: string; completed: number; }[];
            dungeonsFailed: { dungeonCode: string; failed: number; }[];
            dungeonsAssisted: { dungeonCode: string; assisted: number; }[]
        }[];

        keys: {
            guildId: string;
            // string =[] key id.
            keysUsed: number;
            swordRune: number;
            shieldRune: number;
            helmRune: number;
            vial: number;
        }[];

        storage: {
            guildId: string;
            swordRuneStored: number;
            shieldRuneStored: number;
            helmRuneStored: number;
            vialsStored: number;
        }[];
    };

    details: {
        moderationHistory: {
            guildId: string;
            moderationType: "SUSPEND"
                | "UNSUSPEND"
                | "BLACKLIST"
                | "UNBLACKLIST"
                | "MUTE"
                | "UNMUTE";
            // IGN
            moderator: string;
            reason: string;
            // In MS
            duration: number;
            // When this punishment was issued.
            issued: number;
        }[];
    };
}