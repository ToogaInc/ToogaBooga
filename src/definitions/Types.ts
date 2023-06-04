// =============================================== //
//          TYPINGS FOR BOT OPERATIONS             //
// =============================================== //

export enum TimedStatus {
    SUCCESS,
    CANCELED,
    TIMED_OUT
}

export type TimedResult<R> = {
    status: TimedStatus;
    value: R | null;
};

export type DungeonShortcuts = {
    name: string;
    value: string;
};

export type QuotaLogType = QuotaRunLogType
| "Parse"
| "ManualVerify"
| "PunishmentIssued"
| "NameAdjustment"
| "ModmailRespond";

export type QuotaRunLogType = "RunComplete"
| "RunFailed"
| "RunAssist"
| `RunComplete:${string}`
| `RunFailed:${string}`
| `RunAssist:${string}`;

/**
 * The different role permissions.
 */
export type DefinedRole = "Everyone"
| "Suspended"
| "Raider"
| "Team"
| "Helper"
| "Security"
| "AlmostRaidLeader"
| "RaidLeader"
| "VeteranRaidLeader"
| "Officer"
| "HeadRaidLeader"
| "Moderator";

/**
 * The verification log types.
 */
export type VerificationLogType = "VerifyStep"
| "SectionSuspend";

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
export type MainLogType = MainOnlyModLogType | VerificationLogType;
export type SectionLogType = SectionModLogType | VerificationLogType;