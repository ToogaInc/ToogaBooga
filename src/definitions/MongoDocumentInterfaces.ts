import {ObjectID} from "mongodb";
import {
    IAfkCheckReaction,
    IAfkCheckProperties,
    IDungeonInfo,
    IRaidChannels,
    IRaidInfo, IReactionInfo
} from "./DungeonRaidInterfaces";
import {IManualVerificationEntry, IVerificationChannels, IVerificationProperties} from "./VerificationInterfaces";
import {GeneralConstants} from "../constants/GeneralConstants";
import MainLogType = GeneralConstants.MainLogType;
import {IModmailThread} from "./ModmailInterfaces";
import {IBlacklistedModmailUser, IBlacklistedUser, ISuspendedUser} from "./PunishmentInterfaces";
import {ICmdPermOverwrite, IPropertyKeyValuePair} from "./MiscInterfaces";

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

/**
 * An interface that represents a guild document that is stored in the MongoDB database.
 */
export interface IGuildInfo extends IBaseDocument {
    /**
     * The guild ID.
     *
     * @type {string}
     */
    guildId: string;

    /**
     * All possible roles.
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

        /**
         * Any roles that will grant early location.
         *
         * @type {string[]}
         */
        earlyLocationRoles: string[];
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
         * The modmail channels.
         *
         * @type {object}
         */
        modmail: {
            /**
             * The modmail channel.
             *
             * @type {string}
             */
            modmailChannelId: string;

            /**
             * The modmail storage channel.
             *
             * @type {string}
             */
            modmailStorageChannelId: string;
        };

        /**
         * Any applicable logging channels. The key is the logging type (for example, suspesions, blacklists, mutes,
         * and more) and the value is the channel ID.
         *
         * @type {IPropertyKeyValuePair<GeneralConstants.MainLogType, string>[]}
         */
        loggingChannels: IPropertyKeyValuePair<GeneralConstants.MainLogType, string>[];

        /**
         * The bot updates channel. This is where any changelogs and announcements will be sent.
         *
         * @type {string}
         */
        botUpdatesChannelId: string;
    };

    /**
     * Other major things to configure; in particular, AFK check properties and verification properties.
     *
     * @type {IOtherMajorConfig}
     */
    otherMajorConfig: IOtherMajorConfig;

    /**
     * Where data about suspended and blacklisted users will be stored.
     *
     * @type {object}
     */
    moderation: {
        /**
         * A list of all suspended users.
         *
         * @type {ISuspendedUser[]}
         */
        suspendedUsers: ISuspendedUser[];

        /**
         * A list of all blacklisted users.
         *
         * @type {IBlacklistedUser[]}
         */
        blacklistedUsers: IBlacklistedUser[];

        /**
         * A list of all modmail blacklisted users.
         *
         * @type {IBlacklistedModmailUser[]}
         */
        blacklistedModmailUsers: IBlacklistedModmailUser[];
    };

    /**
     * Other properties.
     *
     * @type {object}
     */
    properties: {
        // TODO add quotas 
        
        /**
         * The prefix that can be used to call commands. 
         * 
         * @type {string} 
         */
        prefix: string;

        /**
         * Any blocked commands. Use the command code/identifier. 
         * 
         * @type {string[]}
         */
        blockedCommands: string[];

        /**
         * All active modmail threads. 
         * 
         * @type {IModmailThread[]}
         */
        modmailThreads: IModmailThread[];

        /**
         * Custom permissions for most commands. The key is the command code/identifier and the value is the custom
         * permissions. 
         * 
         * @type {IPropertyKeyValuePair<string, ICmdPermOverwrite>[]}
         */
        customCmdPermissions: IPropertyKeyValuePair<string, ICmdPermOverwrite>[];

        /**
         * Any custom dungeons. This will be made available to all sections, and can be filtered out based on the
         * `allowedDungeons` property. This should NEVER contain base dungeons or derived based dungeons.
         * 
         * @type {IDungeonInfo[]}
         */
        customDungeons: IDungeonInfo[];

        /**
         * Any dungeon overrides. This will be made available to all sections. Guilds can use this to edit existing
         * dungeons or create new dungeons for their server.
         * 
         * @type {object}
         */
        dungeonOverride: {
            /**
             * The code name. This is essentially the dungeon identifier name and should never change (even if
             * anything else relating to this dungeon changes).
             * 
             * If this is a custom dungeon, then this will be a string of random numbers and letters. If this is a
             * derived base dungeon, then this will be the same as the base dungeon's `codeName`.
             *
             * @type {string}
             */
            codeName: string;

            /**
             * The keys that are needed for this dungeon. For example, for Oryx 3, you would have the three runes
             * and the Wine Cellar Incantation. 
             *
             * If `maxEarlyLocation` is greater than 0, this will be rendered as a button on the AFK check.
             * Otherwise, this will be rendered as a normal reaction.
             *
             * Whatever is defined here will completely override what was originally defined (if this is a derived
             * base dungeon). 
             *
             * @type {IAfkCheckReaction[]}
             */
            keyData: IAfkCheckReaction[];

            /**
             * Any other "reactions" needed for this dungeon. For example, for Oryx 3, you might have various class
             * reacts and other things.
             *
             * If `maxEarlyLocation` is greater than 0, this will be rendered as a button on the AFK check.
             * Otherwise, this will be rendered as a normal reaction.
             *
             * Whatever is defined here will completely override what was originally defined (if this is a derived
             * base dungeon).
             *
             * @type {IAfkCheckReaction[]}
             */
            otherData: IAfkCheckReaction[];

            /**
             * Whether this dungeon permits the use of early location reactions. These include, but are not limited to,
             * Nitro Boosters, Patreons, and others (depending on your use case). This is optional; if this is not
             * explicitly stated, this defaults to `true`.
             *
             * @type {boolean}
             */
            includeEarlyLoc?: boolean;

            /**
             * The VC limit. This will override the section-defined VC limit. 
             * 
             * @type {number}
             */
            vcLimit: number;
        }[];

        /**
         * All custom reactions. The key is the
         */
        customReactions: IPropertyKeyValuePair<string, IReactionInfo>[]
    };

    /**
     * All other sections within the guild. For example, you can create a Veteran section, Events section, and more. 
     * 
     * @type {ISectionInfo[]}
     */
    guildSections: ISectionInfo[];

    /**
     * All active raids and AFK checks. 
     * 
     * @type {IRaidInfo[]}
     */
    activeRaids: IRaidInfo[];

    /**
     * All active manual verification requests for the main section. 
     * 
     * @type {IManualVerificationEntry[]}
     */
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