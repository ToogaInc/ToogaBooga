import {IPropertyKeyValuePair} from "../IPropertyKeyValuePair";
import {IDocument} from "./IDocument";

export interface IUserInfo extends IDocument<string> {
    _id: string;
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