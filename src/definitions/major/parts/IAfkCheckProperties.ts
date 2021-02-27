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
    // afk check timeout (how long until afk ends), in minutes.
    afkCheckTimeout: number;
    // allowed dungeons (use codeName)
    allowedDungeons: string[];
    // any reaction overrides
    dungeonReactionOverride: {
        dungeonCodeName: string;
        reactions: IReactionProps[];
    }[];
    // default dungeons -- use codeName
    defaultDungeon: string;
    // whether people that react w/ key emoji can bypass a full vc
    allowKeyReactsToBypassFullVc: boolean;
}