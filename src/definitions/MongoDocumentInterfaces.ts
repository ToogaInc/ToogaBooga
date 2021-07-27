import {ObjectID} from "mongodb";
import {IAfkCheckProperties, IDungeonInfo, IRaidChannels} from "./DungeonRaidInterfaces";
import {IManualVerificationEntry, IVerificationChannels, IVerificationProperties} from "./VerificationInterfaces";
import {GeneralConstants} from "../constants/GeneralConstants";
import MainLogType = GeneralConstants.MainLogType;
import {IModmailThread} from "./ModmailInterfaces";
import {IBlacklistedModmailUser, IBlacklistedUser, ISuspendedUser} from "./PunishmentInterfaces";
import {ICmdPermOverwrite, IPropertyKeyValuePair, IQuotaLoggingInfo} from "./MiscInterfaces";

export interface IBaseDocument<T = ObjectID> {
    _id: T;
}

export interface IBotInfo {
    activeEvents: {
        issuedTime: number;
        issuedBy: string;
        subject: string;
        details: string;
    }[];

    clientId: string;
}

export interface IGuildInfo extends IBaseDocument {
    // the guild id suffices as an identifier
    guildId: string;
    // all possible roles
    roles: {
        mutedRoleId: string;
        suspendedRoleId: string;
        verifiedRoleId: string;
        staffRoles: {
            // given to any staff members EXCEPT trial leaders
            teamRoleId: string;
            // other staff roles. these will get the team role
            otherStaffRoleIds: string[];
            // leader roles -- will work in all
            // sections
            universalLeaderRoleIds: {
                almostLeaderRoleId: string;
                leaderRoleId: string;
                headLeaderRoleId: string;
                vetLeaderRoleId: string;
            };
            // section leader roles -- will only work
            // in the specific section (i.e. main)
            sectionLeaderRoleIds: ISectionLeaderRoles;
            // moderation
            moderation: {
                securityRoleId: string;
                officerRoleId: string;
                moderatorRoleId: string;
            };
        };
        // these people can get early location
        earlyLocationRoles: string[];
    };
    // all channels
    channels: {
        verification: IVerificationChannels;
        raids: IRaidChannels;
        modmail: {
            modmailChannelId: string;
            modmailStorageChannelId: string;
        };
        loggingChannels: IPropertyKeyValuePair<GeneralConstants.MainLogType, string>[];
        quotaLogsChannels: IPropertyKeyValuePair<string, string>[];
        botUpdatesChannelId: string;
    };
    otherMajorConfig: IOtherMajorConfig;
    moderation: {
        suspendedUsers: ISuspendedUser[];
        blacklistedUsers: IBlacklistedUser[];
        blacklistedModmailUsers: IBlacklistedModmailUser[];
    };
    properties: {
        // promote demote stuff
        promoteDemoteRules: IPropertyKeyValuePair<string, string[]>[];
        // quotas
        // TODO update this
        quotasAndLogging: {
            runsLed: {
                noRunsWeeklyMessageId: string;
                topRunsLedWeeklyMessageId: string;
                topRunsLedWeek: IQuotaLoggingInfo[];
            };
            logging: {
                topKeysWeeklyMessageId: string;
                topKeysWeek: IQuotaLoggingInfo[];
            };
            runsDone: {
                topRunsCompletedMessageId: string;
                topRunsCompletedWeek: IQuotaLoggingInfo[];
            };
        };
        // default prefix
        prefix: string;
        // any blocked commands
        // reference the cmdCode
        blockedCommands: string[];
        // modmail stuff
        modmailThreads: IModmailThread[];
        customCmdPermissions: IPropertyKeyValuePair<string, ICmdPermOverwrite>[];
        // Any custom dungeons
        customDungeons: IDungeonInfo[];
    };
    guildSections: ISectionInfo[];
    activeRaids: IRaidInfo[];
    manualVerificationEntries: IManualVerificationEntry[];
}

export interface IIdNameInfo extends IBaseDocument {
    currentDiscordId: string;
    rotmgNames: IRealmIgn[];

    pastDiscordIds: ({oldId: string;} & IPastEntry)[];
    pastRealmNames: (IRealmIgn & IPastEntry)[];
}

interface IPastEntry {
    // The date which this name or ID was removed.
    toDate: number;
}

export interface IRaidInfo {
    // The dungeon that is being done.
    dungeonCodeName: string;
    // Member that init raid.
    memberInit: string;
    // relevant channels
    channels: IRaidChannels;
    // should be in afk check channel
    afkCheckMessageId: string;
    // should be in control panel channel
    controlPanelMessageId: string;
    // custom message by raid leader
    raidMessage: string;
    // raid status
    // 1 = afk check
    // 2 = in run
    status: number;
    // vc info
    vcId: string;
    // location info
    location: string;
    // section id
    sectionIdentifier: string;
    // early location otherButtons
    earlyLocationReactions: { userId: string; reactCodeName: string; }[];
    // For set interval purposes
    controlPanelIntervalId: number | NodeJS.Timeout;
    afkCheckIntervalId: number | NodeJS.Timeout;
}

export interface ISectionInfo {
    // A random 30 character ID that can be used to identify this section.
    uniqueIdentifier: string;

    // The section name.
    sectionName: string;

    // Whether the section is the main section or not.
    isMainSection: boolean;

    // all channels
    channels: {
        verification: IVerificationChannels;
        raids: IRaidChannels;
    };

    // all roles
    roles: {
        leaders: ISectionLeaderRoles;
        verifiedRoleId: string;
    };

    // other major configuration items
    otherMajorConfig: IOtherMajorConfig;

    // general section properties
    properties: {
        // people that are banned from this section
        sectionSuspended: ISuspendedUser[];
        // manual verification entries.
        manualVerificationEntries: IManualVerificationEntry[];
    };
}

export interface IUserInfo extends IBaseDocument {
    discordId: string;
    loggedInfo: IPropertyKeyValuePair<string, number>[];
    details: {
        moderationHistory: {
            guildId: string;
            moderationType: MainLogType;
            // IGN
            moderator: string;
            reason: string;
            // In MS
            duration: number;
            // When this punishment was issued.
            issued: number;
            endedAt: number;
        }[];
        settings: IPropertyKeyValuePair<string, boolean>[];
    };
}

export interface IRealmIgn {
    ign: string;
    lowercaseIgn: string;
}

export interface IOtherMajorConfig {
    // verification requirements
    verificationProperties: IVerificationProperties;
    // afk check properties
    afkCheckProperties: IAfkCheckProperties;
}

export interface ISectionLeaderRoles {
    sectionAlmostRaidLeaderRoleId: string;
    sectionRaidLeaderRoleId: string;
    sectionHeadLeaderRoleId: string;
    sectionVetLeaderRoleId: string;
}