export type QuotaLogType = "RunComplete"
    | "RunFailed"
    | "RunAssist"
    | "Parse"
    | "ManualVerify"
    | "PunishmentIssued";

/**
 * The different role permissions.
 */
export type RolePermissions = "Everyone"
    | "Suspended"
    | "Raider"
    | "Team"
    | "Security"
    | "AlmostRaidLeader"
    | "RaidLeader"
    | "VeteranRaidLeader"
    | "Officer"
    | "HeadRaidLeader"
    | "Moderator";

/**
 * All modmail log types.
 */
export type ModmailLogType = "ModmailReceived"
    | "ModmailThreadCreated"
    | "ModmailThreadRemoved"
    | "ModmailSent";

/**
 * The verification log types.
 */
export type VerificationLogType = "VerifySuccess"
    | "VerifyFail"
    | "VerifyStart"
    | "VerifyStep"
    | "SectionSuspend"
    | "ManualVerifyRequest"
    | "ManualVerifyAccepted"
    | "ManualVerifyDenied";

/**
 * Punishments that can be issued on a section-basis.
 */
export type SectionModLogType = "SectionSuspend";

/**
 * Reversal of punishments that can be issued on a section-basis.
 */
export type SectionModRevLogType = "SectionUnsuspend";

/**
 * All main-only punishments that can be issued.
 */
export type MainOnlyModLogType = "Suspend"
    | "Mute"
    | "Blacklist"
    | "ModmailBlacklist"
    | "Warn";

/**
 * All main-only punishment reversals that can be issued.
 */
export type MainOnlyModRevLogType = "Unsuspend"
    | "Unmute"
    | "Unblacklist"
    | "ModmailUnblacklist"
    | "Unwarn";

export type AllModLogType = MainOnlyModLogType | MainOnlyModRevLogType | SectionModLogType | SectionModRevLogType;
export type MainLogType = MainOnlyModLogType | VerificationLogType | ModmailLogType;
export type SectionLogType = SectionModLogType | VerificationLogType;