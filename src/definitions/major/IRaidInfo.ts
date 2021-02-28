import {IRaidChannels} from "./parts/IRaidChannels";

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
    vcId: string;
    // location info
    location: string;
    // section id
    sectionIdentifier: string;
    // early location reactions
    earlyLocationReactions: { userId: string; reactCodeName: string; }[];
}