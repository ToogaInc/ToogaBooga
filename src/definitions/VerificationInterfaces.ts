import {PrivateApiDefinitions} from "../private-api/PrivateApiDefinitions";
import {IPropertyKeyValuePair} from "./MiscInterfaces";

export interface IVerificationChannels {
    verificationChannelId: string;
    manualVerificationChannelId: string;
}

export interface IVerificationProperties {
    // will be shown on the verification embed
    additionalVerificationInfo: string;
    // success message to be sent when someone
    // verifies
    verificationSuccessMessage: string;
    // verification requirements
    verificationRequirements: IVerificationRequirements;
}


export interface IVerificationRequirements {
    // all alive fame
    aliveFame: {
        checkThis: boolean;
        minFame: number;
    };

    // guild info
    guild: {
        checkThis: boolean;
        guildName: {
            checkThis: boolean;
            // must be in this guild
            name: string;
        };
        guildRank: {
            checkThis: boolean;
            minRank: string;
        };
    };

    // last seen info
    lastSeen: {
        mustBeHidden: boolean;
    };

    // stars
    rank: {
        checkThis: boolean;
        minRank: number;
    };

    // characters
    characters: {
        checkThis: boolean;
        // [hp, mp, att, def, spd, vit, wis, dex]
        statsNeeded: [number, number, number, number, number, number, number, number, number];
        // if true
        // dead characters can fulfil the above reqs
        checkPastDeaths: boolean;
    };

    // exaltations needed
    exaltations: {
        checkThis: boolean;
        minimum: {
            [stat: string]: number;
            hp: number;
            mp: number;
            def: number;
            att: number;
            dex: number;
            spd: number;
            vit: number;
            wis: number;
        };
    };

    // graveyard summary info
    graveyardSummary: {
        checkThis: boolean;
        minimum: IPropertyKeyValuePair<string, number>[];
    };
}

export interface IManualVerificationEntry {
    userId: string;
    ign: string;
    nameHistory: PrivateApiDefinitions.INameHistory;
    manualVerifyMsgId: string;
    manualVerifyChannelId: string;
    currentHandler: string;
}