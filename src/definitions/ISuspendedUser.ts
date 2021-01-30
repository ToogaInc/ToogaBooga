export interface ISuspendedUser {
    // the person's nickname.
    nickname: string;
    // discord id
    discordId: string;
    // this should be lowercase. used for search.
    rotmgName: string;
    // can be upper or lowercase
    moderatorName: string;
    reason: string;
    // when it was issued
    dateTimeIssued: string;
    // in milliseconds
    // -1 = indefinite
    dateTimeEnd: number;
    // old roles (only for non section suspension)
    oldRoles: string[];
}