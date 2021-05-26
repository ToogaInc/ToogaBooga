import {ISectionInfo} from "./ISectionInfo";
import {ISectionLeaderRoles} from "./parts/ISectionLeaderRoles";
import {IVerificationChannels} from "./parts/IVerificationChannels";
import {IRaidChannels} from "./parts/IRaidChannels";
import {IBlacklistedUser} from "../IBlacklistedUser";
import {IRaidInfo} from "./IRaidInfo";
import {ISuspendedUser} from "../ISuspendedUser";
import {IQuotaLoggingInfo} from "../IQuotaLoggingInfo";
import {IOtherMajorConfig} from "./parts/IOtherMajorConfig";
import {IDungeonInfo} from "./parts/IDungeonInfo";
import {IPropertyKeyValuePair} from "../IPropertyKeyValuePair";
import {ICmdPermOverwrite} from "../ICmdPermOverwrite";
import {IManualVerificationEntry} from "./parts/IManualVerificationEntry";
import {IBaseDocument} from "./IBaseDocument";
import {IBlacklistedModmailUser} from "../IBlacklistedModmailUser";
import {IModmailThread} from "../IModmailThread";

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
        verificationChannels: IVerificationChannels;
        raidChannels: IRaidChannels;
        modmailChannels: {
            modmailChannelId: string;
            modmailStorageChannelId: string;
            modmailLoggingId: string;
        };
        logging: {
            suspensionLoggingChannelId: string;
            blacklistLoggingChannelId: string;
        };
        quotaLogsChannelId: string;
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
    };
    guildSections: ISectionInfo[];
    activeRaids: IRaidInfo[];
    manualVerificationEntries: IManualVerificationEntry[];
    customDungeons: IDungeonInfo[];
}