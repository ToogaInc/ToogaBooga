import {IRealmIgn} from "../IRealmIgn";

export interface IUserInfo {
    discordUserId: string;
    rotmgNames: Array<IRealmIgn>;
    loggedInfo: {
        dungeons: Array<{
            guildId: string;
            // string => The codeName found in DungeonData.
            dungeonsCompleted: Array<[string, number]>;
            dungeonsFailed: Array<[string, number]>;
        }>;

        leaderRuns: Array<{
            guildId: string;
            // string => The codeName found in DungeonData.
            dungeonsCompleted: Array<{ dungeonCode: string; completed: number; }>;
            dungeonsFailed: Array<{ dungeonCode: string; failed: number; }>;
            dungeonsAssisted: Array<{ dungeonCode: string; assisted: number; }>
        }>;

        keys: Array<{
            guildId: string;
            // string => key id.
            keysUsed: number;
            swordRune: number;
            shieldRune: number;
            helmRune: number;
            vial: number;
        }>;

        storage: Array<{
            guildId: string;
            swordRuneStored: number;
            shieldRuneStored: number;
            helmRuneStored: number;
            vialsStored: number;
        }>;
    };

    details: {
        moderationHistory: Array<{
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
        }>;
    };
}