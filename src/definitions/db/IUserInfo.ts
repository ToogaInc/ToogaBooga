import {IPropertyKeyValuePair} from "../IPropertyKeyValuePair";
import {IBaseDocument} from "./IBaseDocument";
import {GeneralConstants} from "../../constants/GeneralConstants";
import MainLogType = GeneralConstants.MainLogType;

export interface IUserInfo extends IBaseDocument {
    discordId: string;
    loggedInfo: IPropertyKeyValuePair<string, number>[];
    details: {
        moderationHistory: {
            guildId: string;
            moderationType: MainLogType;
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