import {IReactionProps} from "./IReactionProps";

export interface IAfkCheckProperties {
    vcLimit: number;
    // this does NOT apply to key early location.
    // one can override that in the dungeonReactionOverride property.
    nitroEarlyLocationLimit: number;
    // message that will be shown to everyone
    // during the afk check
    additionalAfkCheckInfo: string;
    // whether to remove key reacts during afk check
    removeKeyReactsDuringAfk: boolean;
    // whether to remove all reactions after the afk check
    removeAllReactionsAfterAfk: boolean;
    // afk check timeout, in minutes.
    afkCheckTimeout: number;
    // allowed dungeons (use codeName)
    allowedDungeons: Array<string>;
    // any reaction overrides
    dungeonReactionOverride: Array<{
        dungeonCodeName: string;
        reactions: Array<IReactionProps>;
    }>;
    // default dungeons -- use codeName
    defaultDungeon: string;
    // whether post afk should be allowed or not
    allowPostAfk: boolean;
}