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
        minimum: {
            [m: string]: number;
            minOryxKills: number;
            minLostHalls: number;
            minVoids: number;
            minCults: number;
            minNests: number;
            minShatters: number;
            minFungal: number;
            minCrystal: number;
        };
    };
}