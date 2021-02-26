import {IRealmIgn} from "../IRealmIgn";
import {IPropertyKeyValuePair} from "../IPropertyKeyValuePair";

export interface IUserInfo {
    discordUserId: string;
    rotmgNames: IRealmIgn[];
    loggedInfo: IPropertyKeyValuePair<string, number>[];

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
        settings: IPropertyKeyValuePair<string, boolean>[];
    };
}