export interface IBlacklistedUser {
    nickname: string;
    discordId: string;
    // this should be lowercase.
    rotmgName: string;
    // can be upper or lowercase
    moderatorName: string;
    reason: string;
    dateTime: string;
}