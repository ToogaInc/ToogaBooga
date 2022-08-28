import { IAfkCheckProperties, IHeadcountInfo, IRaidChannels, IRaidInfo } from "./DungeonRaidInterfaces";
import { IPropertyKeyValuePair } from "./MiscInterfaces";
import { IQuotaInfo, ISectionLeaderRoles } from "./MongoDocumentInterfaces";
import { IActivePunishment } from "./PunishmentInterfaces";
import { MainLogType } from "./Types";
import { IManualVerificationEntry, IVerificationChannels, IVerificationProperties } from "./VerificationInterfaces";

/**
 * An interface that every other MongoDB-related interfaces for guilds must
 * contain.
 */
export interface IGuildDocBase {
    /**
     * The guild ID.
     * 
     * @type {string}
     */
    guildId: string;
}

/**
 * An interface that every other MongoDB-related interface for guild sections
 * must contain.
 */
export interface ISectionBase {
    /**
     * An unique identifier for this section. This identifier should never change, 
     * even if any other properties of this section does change.
     *
     * @type {string}
     */
    sectionId: string;
}

/**
 * An interface that represents a guild document that is stored in MongoDB.
 * 
 * This document will only contain channel and role inforamtion, and is
 * generally assumed to not change often.
 */
export interface IGuildDocGeneral extends IGuildDocBase {
    /**
     * Most of the roles.
     *
     * @type {object}
     */
    roles: {
        /**
         * The muted role ID.
         *
         * @type {string}
         */
        mutedRoleId: string;

        /**
         * The base/guild suspended role ID. When a user is suspended from the server, the bot will remove all of
         * the user's role and replace it with this role.
         *
         * @type {string}
         */
        suspendedRoleId: string;

        /**
         * The verified member role. This role is needed to access the base server (i.e. the main section).
         *
         * @type {string}
         */
        verifiedRoleId: string;

        /**
         * The guild staff roles.
         *
         * @type {object}
         */
        staffRoles: {
            /**
             * The team role. All staff members, except Trial Raid Leaders, will receive this role upon receiving
             * any other staff role.
             *
             * @type {string}
             */
            teamRoleId: string;

            /**
             * Any staff roles that aren't explicitly stated here. People with these roles will have access to some
             * staff commands and will receive the team role upon receiving any of the listed staff roles.
             *
             * @type {string[]}
             */
            otherStaffRoleIds: string[];

            /**
             * The universal leader roles. Members that have these role will be able to lead in any other sections,
             * and will receive the same permissions as their section counterparts when in the said section.
             *
             * @type {object}
             */
            universalLeaderRoleIds: {
                /**
                 * The almost raid leader role.
                 *
                 * @type {string}
                 */
                almostLeaderRoleId: string;

                /**
                 * The raid leader role.
                 *
                 * @type {string}
                 */
                leaderRoleId: string;

                /**
                 * The veteran raid leader role. This is equivalent to the raid leader role in terms of permissions.
                 *
                 * @type {string}
                 */
                vetLeaderRoleId: string;

                /**
                 * The head raid leader role.
                 *
                 * @type {string}
                 */
                headLeaderRoleId: string;
            };

            /**
             * The section leader roles. Unlike the universal leader roles, people with one of these roles (and
             * without the universal leader roles) will only be able to start AFK checks and headcounts in the
             * respective section.
             *
             * @type {object}
             */
            sectionLeaderRoleIds: ISectionLeaderRoles;

            /**
             * The moderation roles. Note that there are no section counterparts for these roles. In other words,
             * there is only one type of "Officer," "Moderator," and "Security" roles.
             *
             * @type {object}
             */
            moderation: {
                /**
                 * The helper role.
                 *
                 * @type {string}
                 */
                helperRoleId: string;

                /**
                 * The security role.
                 *
                 * @type {string}
                 */
                securityRoleId: string;

                /**
                 * The officer role.
                 *
                 * @type {string}
                 */
                officerRoleId: string;

                /**
                 * The moderator role.
                 *
                 * @type {string}
                 */
                moderatorRoleId: string;
            };
        };
    };

    /**
     * Most of the main channels.
     *
     * @type {object}
     */
    channels: {
        /**
         * The verification channels. This consists of the get verified channel, manual verification channel, and more.
         *
         * @type {IVerificationChannels}
         */
        verification: IVerificationChannels;

        /**
         * The raid channels. This consists of the AFK check channel, the control panel channel, and more.
         *
         * @type {IRaidChannels}
         */
        raids: IRaidChannels;

        /**
         * The elite location channel channel ID (main section).
         *
         * @type {object}
         */
        eliteLocChannelId: string;

        /**
         * The modmail channel ID.
         *
         * @type {object}
         */
        modmailChannelId: string;

        /**
         * Any applicable logging channels. The key is the logging type (for example, suspensions, blacklists, mutes,
         * and more) and the value is the channel ID.
         *
         * @type {IPropertyKeyValuePair<MainLogType, string>[]}
         */
        loggingChannels: IPropertyKeyValuePair<MainLogType, string>[];

        /**
         * The bot updates channel. This is where any changelogs and announcements will be sent.
         *
         * @type {string}
         */
        botUpdatesChannelId: string;

        /**
         * The storage channel. All files will be sent here.
         *
         * @type {string}
         */
        storageChannelId: string;
    };
}

/**
 * An interface that represents a guild document that is stored in MongoDB.
 * 
 * This document contains all active quotas, each pertaining to a role.
 */
export interface IGuildDocQuota extends IQuotaInfo, IGuildDocBase {
    /**
     * The time when quotas should be reset. Times are based on GMT.
     *
     * @type {object}
     */
    resetTime: {
        /**
         * The day of week to reset quotas. Uses `Date#getDay`; documentation for this can be be found
         * [here](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getDay).
         *
         * @type {number}
         */
        dayOfWeek: number;

        /**
         * The time to reset quotas. This will be represented in military time, by
         * `Date#getHours * 100 + Date#getMinutes`.
         * For example, to represent `1:15 PM GMT`, use `1315`.
         *
         * @type {number}
         */
        time: number;
    };
}

/**
 * An interface that represents a guild document that is stored in MongoDB.
 * 
 * This document contains all active raids.
 */
export interface IGuildDocActiveRaids
    extends IGuildDocBase, ISectionBase, IRaidInfo { }

/**
 * An interface that represents a guild document that is stored in MongoDB.
 * 
 * This document contains information pertaining to verification.
 */
export interface IGuildDocVerification
    extends IGuildDocBase, ISectionBase, IVerificationProperties { }

/**
 * An interface that represents a guild document that is stored in MongoDB.
 * 
 * This document contains information pertaining to AFK checks and headcounts.
 */
export interface IGuildDocAfkCheck
    extends IGuildDocBase, ISectionBase, IAfkCheckProperties { }

/**
 * An interface that represents a guild document that is stored in MongoDB.
 * 
 * This document contains all active headcounts.
 */
export interface IGuildDocHeadcounts
    extends IGuildDocBase, ISectionBase, IHeadcountInfo { }

/**
 * An interface that represents a guild document that is stored in MongoDB.
 * 
 * This document contains all manual verification requests.
 */
export interface IGuildDocManualVerify
    extends IGuildDocBase, ISectionBase, IManualVerificationEntry { }

/**
 * An interface that represents a guild document that is stored in MongoDB.
 * 
 * This document contains all active punishments.
 */
export interface IGuildDocPunishment
    extends IGuildDocBase, ISectionBase, IActivePunishment { }