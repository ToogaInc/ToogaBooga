import {IPropertyKeyValuePair} from "../IPropertyKeyValuePair";
import {IIdNameInfo} from "./IIdNameInfo";

export interface IUserInfo extends IIdNameInfo {
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
            endedAt: number;
        }[];
        settings: IPropertyKeyValuePair<string, boolean>[];
    };
}