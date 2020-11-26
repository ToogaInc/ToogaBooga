import {IRaidChannels} from "./parts/IRaidChannels";
import {OverwriteResolvable} from "discord.js";

export interface IRaidInfo {
    // relevant channels
    channels: IRaidChannels;
    // should be in afk check channel
    afkCheckMessageId: string;
    // should be in control panel channel
    controlPanelMessageId: string;
    // custom message by raid leader
    raidMessage: string;
    // raid status
    // 1 = afk check
    // 2 = in run
    status: number;

    // vc info
    voice: {
        vcId: string;
        isOld: boolean;
        oldPerms: Array<OverwriteResolvable>;
    };
    // location info
    location: string;
}