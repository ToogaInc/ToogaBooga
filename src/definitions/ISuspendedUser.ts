export interface ISuspendedUser {
    discordId: string;
    // this should be lowercase.
    rotmgName: string;
    // can be upper or lowercase
    moderatorName: string;
    reason: string;
    dateTime: string;
    // in milliseconds
    // -1 = indefinite
    duration: number;
}