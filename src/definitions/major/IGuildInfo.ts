import {ISectionInfo} from "./ISectionInfo";
import {ISectionLeaderRoles} from "./parts/ISectionLeaderRoles";
import {IVerificationChannels} from "./parts/IVerificationChannels";
import {IRaidChannels} from "./parts/IRaidChannels";
import {IBlacklistedUser} from "../IBlacklistedUser";
import {IRaidInfo} from "./IRaidInfo";
import {IVerificationRequirements} from "./parts/IVerificationRequirements";
import {IAfkCheckProperties} from "./parts/IAfkCheckProperties";
import {ISuspendedUser} from "../ISuspendedUser";

export interface IGuildInfo {
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
            // verifier roles
            verifierRoleId: string;
            // other staff roles. these will get the team role
            otherStaffRoleIds: Array<string>;
            // leader roles -- will work in all
            // sections
            universalLeaderRoleIds: {
                almostLeaderRoleId: string;
                leaderRoleId: string;
                headLeaderRoleId: string;
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
        // these people can talk during raids
        speakingRoles: Array<string>;
        // these people can get early location
        earlyLocationRoles: Array<string>;
        // these people can stream.
        streamingRoles: Array<string>;
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
        manualVerificationChannelId: string;
        quotaLogsChannels: {
            quotaChannelId: string;
            noRunsChannelId: string;
            topLeaderChannelId: string;

        };
    };
    moderation: {
        suspendedUsers: Array<ISuspendedUser>;
        blacklistedUsers: Array<IBlacklistedUser>;
    };
    properties: {
        blacklistedUsers: Array<IBlacklistedUser>;
        dungeons: number[];
        // verification requirements
        verificationProperties: IVerificationRequirements;
        // afk check properties
        afkCheckProperties: IAfkCheckProperties;
    };
    // sections
    guildSections: Array<ISectionInfo>;
    activeRaids: Array<IRaidInfo>;

}