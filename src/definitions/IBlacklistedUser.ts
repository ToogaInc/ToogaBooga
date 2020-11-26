export interface IBlacklistedUser {
    discordId: string;
    // this should be lowercase.
    rotmgName: string;
    // can be upper or lowercase
    moderatorName: string;
    reason: string;
    dateTime: string;
}