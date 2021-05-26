import {PrivateApiDefinitions} from "../../../private-api/PrivateApiDefinitions";

export interface IManualVerificationEntry {
    userId: string;
    ign: string;
    nameHistory: PrivateApiDefinitions.INameHistory;
    manualVerifyMsgId: string;
    manualVerifyChannelId: string;
    currentHandler: string;
}