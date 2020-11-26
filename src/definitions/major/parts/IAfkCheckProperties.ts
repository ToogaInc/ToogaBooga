export interface IAfkCheckProperties {
    vcLimit: number;
    earlyLocationLimit: number;
    keyLimit: number;
    // message that will be shown to everyone
    // during the afk check
    additionalAfkCheckInfo: string;
    // message that will be shown to everyone
    // after the afk check
    additionalAfterAfkInfo: string;
    // whether to remove key reacts during afk check
    removeKeyReactsDuringAfk: boolean;
    // whether to remove all reactions after the afk check
    removeAllReactionsAfterAfk: boolean;
    // afk check timeout, in minutes.
    afkCheckTimeout: number;
}