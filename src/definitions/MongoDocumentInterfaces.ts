import {
    IAfkCheckProperties, IAfkCheckReaction,
    ICustomDungeonInfo,
    IDungeonOverrideInfo,
    IHeadcountInfo,
    ImageInfo,
    IRaidChannels,
    IRaidInfo,
    IReactionInfo
} from "./DungeonRaidInterfaces";
import {IManualVerificationEntry, IVerificationChannels, IVerificationProperties} from "./VerificationInterfaces";
import {IModmailThread} from "./ModmailInterfaces";
import {
    IBasePunishment,
    IBlacklistedModmailUser,
    IBlacklistedUser,
    IMutedUser,
    ISuspendedUser
} from "./PunishmentInterfaces";
import {ICmdPermOverwrite, IPropertyKeyValuePair} from "./MiscInterfaces";
import {MainLogType, MainOnlyModLogType, QuotaLogType, SectionLogType, SectionModLogType} from "./Types";

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
 * An interface that represents a guild document that is stored in MongoDB.
 */
export interface IGuildInfo {
    /**
     * The guild ID.
     *
     * @type {string}
     */
    guildId: string;

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

        /**
         * A list of all muted users.
         *
         * @type {IMutedUser[]}
         */
        mutedUsers: IMutedUser[];
    };

    /**
     * Other properties.
     *
     * @type {object}
     */
    properties: {

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
         * @type {ICustomDungeonInfo[]}
         */
        customDungeons: ICustomDungeonInfo[];

        /**
         * Early location reactions which will apply to **all** dungeons. This can be overridden on a per-dungeon
         * basis by selecting the reaction and setting the early location count to `0`.
         *
         * @type {IAfkCheckReaction[]}
         */
        universalEarlyLocReactions: IAfkCheckReaction[];

        /**
         * Any dungeon overrides. This will be made available to all sections. Guilds can use this to edit existing
         * dungeons only.
         *
         * @type {IDungeonOverrideInfo[]}
         */
        dungeonOverride: IDungeonOverrideInfo[];

        /**
         * All custom reactions. The key is the map key (the reaction code name) and the value is the reaction
         * information.
         *
         * This is very similar to how `MappedAfkCheckReactions` works in the sense that you have:
         * ```
         * IMappedAfkCheckReactions[mapKey] -> result
         * ```
         * Where `mapKey` is the key in this case and the `result` is the `IReactionInfo` that you get.
         *
         * The key will be a string of 30 random characters (since the user should never see the key). The value is
         * defined by the user.
         *
         * @type {IPropertyKeyValuePair<string, IReactionInfo>[]}
         */
        customReactions: IPropertyKeyValuePair<string, IReactionInfo>[];

        /**
         * Any approved images. This will be an array of image URLs. The image will be stored on a private server.
         *
         * @type {string[]}
         */
        approvedCustomImages: ImageInfo[];

        /**
         * Any reactions which can give early location and priority queuing upon having the appropriate role.
         *
         * Here, the `roleId` is the role ID and the `mappingKey` is the ID corresponding to the emoji in which you
         * can react to get early location.
         *
         * In terms of how this works:
         * - For each dungeon, the user can specify whether this reaction will show up.
         * - If so, then the user can specify how many times this reaction can be used (i.e. number of priorities).
         *
         * Nitro is automatically included.
         *
         * Admittedly, this property is poorly named.
         *
         * @type {IPropertyKeyValuePair<string, string>[]}
         */
        genEarlyLocReactions: {roleId: string; mappingKey: string;}[];

        /**
         * An array that represents the number of points you can get for reacting to certain things. This is
         * validated when the raid leader logs the reactions, not when the person actually reacts.
         *
         * @type {IPropertyKeyValuePair<string, number>[]}
         */
        reactionPoints: IPropertyKeyValuePair<string, number>[];
    };

    /**
     * An object that represents quota configuration and current quotas.
     *
     * @type {object}
     */
    quotas: {
        /**
         * Quota configuration information + logged info.
         *
         * @type {object}
         */
        quotaInfo: IQuotaInfo[];

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
    };

    /**
     * All other sections within the guild. For example, you can create a Veteran section, Events section, and more.
     *
     * @type {ISectionInfo[]}
     */
    guildSections: ISectionInfo[];

    /**
     * All active raids and AFK checks. This includes AFK checks from other sections.
     *
     * @type {IRaidInfo[]}
     */
    activeRaids: IRaidInfo[];

    /**
     * All active headcounts. This includes headcounts from other sections.
     *
     * @type {IHeadcountInfo[]}
     */
    activeHeadcounts: IHeadcountInfo[];

    /**
     * All active manual verification requests for the main section.
     *
     * @type {IManualVerificationEntry[]}
     */
    manualVerificationEntries: IManualVerificationEntry[];
}

/**
 * An interface that represents a quota.
 */
export interface IQuotaInfo {
    /**
     * The role ID for this quota.
     *
     * @type {string}
     */
    roleId: string;

    /**
     * When this quota was last reset.
     *
     * @type {number}
     */
    lastReset: number;

    /**
     * A log of all quotas for this period. This array will be reset upon the reset of quotas.
     *
     * @type {object[]}
     */
    quotaLog: {
        /**
         * The user responsible for this.
         *
         * @type {string}
         */
        userId: string;

        /**
         * The log type. This value should be defined as a key in `pointValues`.
         *
         * @type {string}
         */
        logType: string;

        /**
         * The amount being logged.
         *
         * @type {number}
         */
        amount: number;

        /**
         * The time that this was issued.
         *
         * @type {number}
         */
        timeIssued: number;
    }[];

    /**
     * The channel where this should be logged to.
     *
     * @type {string}
     */
    channel: string;

    /**
     * The message ID corresponding to this quota's leaderboard.
     *
     * @type {string}
     */
    messageId: string;

    /**
     * The number of points needed to complete this quota.
     *
     * @type {number}
     */
    pointsNeeded: number;

    /**
     * The points system. Each quota entry can be associated to a certain number of points (for example,
     * you can set `RunComplete` to 1 point). This is used in the calculation of `currentQuotas`. This
     * is only specific to this role.
     *
     * Possible keys include:
     * - `RunComplete:DUNGEON_ID`
     * - `RunFailed:DUNGEON_ID`
     * - `RunAssist:DUNGEON_ID`
     * - `Parse`
     * - `ManualVerify`
     * - `PunishmentIssued`
     *
     * @type {IPropertyKeyValuePair<string, number>[]}
     */
    pointValues: IPropertyKeyValuePair<QuotaLogType, number>[];
}

/**
 * An interface that represents punishment history, specifically, blacklists. We use this in the case that there is
 * a person that we're trying to blacklist that hasn't verified with the bot. When said person verifies with the
 * bot, we can remove the entry from this document and put the entry into the person's punishment history.
 */
export interface IUnclaimedBlacklistInfo extends IPunishmentHistoryEntry {
}

/**
 * An interface that represents a linked Discord ID to a series of linked IGNs. Any person that verifies through the
 * bot will have this entry, which will then be put in the associated Mongo collection.
 */
export interface IIdNameInfo {
    /**
     * The discord ID.
     *
     * @type {string}
     */
    currentDiscordId: string;

    /**
     * The RotMG name(s) associated with this ID.
     *
     * @type {IRealmIgn[]}
     */
    rotmgNames: IRealmIgn[];

    /**
     * Any past Discord IDs associated with the linked RotMG name(s).
     *
     * Essentially, any IDs taken out of `currentDiscordId`, for any reason, should be put right here.
     *
     * @type {({oldId: string;} & IPastEntry)[]}
     */
    pastDiscordIds: ({ oldId: string; } & IPastEntry)[];

    /**
     * Any past RotMG names associated with the linked IDs. This should primarily contain:
     * - Names from name history (if the person changed his/her RotMG name).
     * - Other names (in case the person got banned from said account or something and wants it removed).
     *
     * In any case, any names taken out of `rotmgNames`, for any reason, should be put right here.
     *
     * @type {(IRealmIgn & IPastEntry)[]}
     */
    pastRealmNames: (IRealmIgn & IPastEntry)[];
}

/**
 * An interface that represents a past entry. This only contains a date where the original entry was removed, and
 * should be used in conjunction with the old entry.
 */
interface IPastEntry {
    /**
     * The date which the entry was removed.
     */
    toDate: number;
}

/**
 * An interface that represents a guild section.
 */
export interface ISectionInfo {
    /**
     * An unique identifier for this section. This identifier should never change, even if any other properties of
     * this section does change.
     *
     * @type {string}
     */
    uniqueIdentifier: string;

    /**
     * The section name.
     *
     * @type {string}
     */
    sectionName: string;

    /**
     * Whether this section is the main section.
     *
     * @type {boolean}
     */
    isMainSection: boolean;

    /**
     * The section channels.
     *
     * @type {object}
     */
    channels: {
        /**
         * The verification channels.
         *
         * @type {IVerificationChannels}
         */
        verification: IVerificationChannels;

        /**
         * The raid channels.
         *
         * @type {IRaidChannels}
         */
        raids: Omit<IRaidChannels, "leaderFeedbackChannelId" | "raidHistChannelId">;

        /**
         * The elite location channel ID.  Locations will be sent here if not null for the section
         *
         * @type {string}
         */
        eliteLocChannelId: string;

        /**
         * Any applicable logging channels. The key is the logging type (for example, suspensions, blacklists, mutes,
         * and more) and the value is the channel ID.
         *
         * @type {IPropertyKeyValuePair<SectionLogType, string>[]}
         */
        loggingChannels: IPropertyKeyValuePair<SectionLogType, string>[];
    };

    /**
     * The section roles.
     *
     * @type {object}
     */
    roles: {
        /**
         * The section leader roles. Members with these roles will be able to lead dungeon raids in this section only.
         *
         * @type {ISectionLeaderRoles}
         */
        leaders: ISectionLeaderRoles;

        /**
         * The section member role. This role is needed to access this section (including the AFK checks and whatnot).
         *
         * @type {string}
         */
        verifiedRoleId: string;
    };

    /**
     * Other major things to configure; in particular, AFK check properties and verification properties.
     *
     * @type {IOtherMajorConfig}
     */
    otherMajorConfig: IOtherMajorConfig;

    /**
     * Where data about section suspended users will be stored.
     *
     * I purposely put this here to make this consistent with the main section.
     *
     * @type {object}
     */
    moderation: {
        /**
         * Members that are suspended from this section.
         *
         * @type {ISuspendedUser[]}
         */
        sectionSuspended: ISuspendedUser[];
    };

    /**
     * Other properties.
     *
     * @type {object}
     */
    properties: {
        /**
         * Whether to give the section member role after unsuspension.
         *
         * @type {boolean}
         */
        giveVerifiedRoleUponUnsuspend: boolean;
    };
}

/**
 * An interface that represents the storage of a person's data. Unlike `IIdNameInfo`, this is only created when any
 * user data needs to be stored. In particular, this will store data like number of keys popped, number of vials
 * stored, and more.
 */
export interface IUserInfo {
    /**
     * The Discord ID of the user. Data stored in this object will be associated to the user. The Discord ID may
     * also be found in `IIdNameInfo`.
     *
     * @type {string}
     */
    discordId: string;

    /**
     * Any logged information. The key is the logged information type and the value is the amount logged. For
     * example, this **might** look like the following (where the numbers at the end represents a guild ID):
     * ```
     *  [
     *      {
     *          key: "Shatters_RunCompleted_123138123",
     *          value: 2
     *      },
     *      {
     *          key: "Shatters_LedAssisted_21313123",
     *          value: 1
     *      },
     *      {
     *          key: "Run_Parsed_21366",
     *          value: 5
     *      },
     *      {
     *          key: "Shatters_KeyPopped_12314",
     *          value: 2
     *      },
     *      {
     *          key: "Sword_RunePopped_555",
     *          value: 1
     *      }
     *  ]
     * ```
     *
     * @type {IPropertyKeyValuePair<string, number>[]}
     */
    loggedInfo: IPropertyKeyValuePair<string, number>[];

    /**
     * Any additional details for the user.
     *
     * @type {object}
     */
    details: {
        /**
         * Any moderation history associated with this user.
         *
         * @type {object}
         */
        moderationHistory: IPunishmentHistoryEntry[];

        /**
         * Any notes for this user. This is on a per-guild basis. The key is the guild ID and the value is the note.
         *
         * @type {IPropertyKeyValuePair<string, string>[]}
         */
        guildNotes: IPropertyKeyValuePair<string, string>[];

        /**
         * Any notes set for this user by the developer.
         *
         * @type {string}
         */
        universalNotes: string;
    };
}

/**
 * An interface that represents a punishment (or removal of punishment) entry, to be stored in the user's punishment
 * history.
 */
export interface IPunishmentHistoryEntry extends IBasePunishment {
    /**
     * The guild ID.
     *
     * @type {string}
     */
    guildId: string;

    /**
     * The moderation type.
     *
     * @type {string}
     */
    moderationType: MainOnlyModLogType | SectionModLogType;

    /**
     * The duration of this moderation type, if any, in milliseconds. If there is no time, then this will be `-1`.
     *
     * This is REQUIRED for a punishment. This is NOT REQUIRED for a resolution.
     *
     * @type {number}
     */
    duration?: number;

    /**
     * The date/time when this punishment will expire.
     *
     * This is REQUIRED for a punishment. This is NOT REQUIRED for a resolution.
     *
     * @type {number}
     */
    expiresAt?: number;

    /**
     * Whether the punishment was resolved. If this property doesn't exist, then this implies that the punishment is
     * still ongoing (i.e. still active).
     *
     * @type {object}
     */
    resolved?: Omit<IPunishmentHistoryEntry, "resolved" | "expiresAt" | "duration">;
}

/**
 * An interface that represents a RotMG IGN and the lowercase format.
 */
export interface IRealmIgn {
    /**
     * The IGN, formatted normally. For example, `ExAmple`.
     *
     * @type {string}
     */
    ign: string;

    /**
     * The IGN, all lowercase. For example, `example`. This is used for finding a user in the collection.
     *
     * @type {string}
     */
    lowercaseIgn: string;
}

/**
 * An interface that represents other major configuration things.
 */
export interface IOtherMajorConfig {
    /**
     * Verification requirements and other properties.
     *
     * @type {IVerificationProperties}
     */
    verificationProperties: IVerificationProperties;

    /**
     * AFK check properties. This is where section-wide VC limits, notes, and other things can be configured.
     *
     * @type {IAfkCheckProperties}
     */
    afkCheckProperties: IAfkCheckProperties;
}

/**
 * An interface that has all section leader roles.
 */
export interface ISectionLeaderRoles {
    /**
     * The section almost leader role.
     *
     * @type {string}
     */
    sectionAlmostLeaderRoleId: string;

    /**
     * The section leader role.
     *
     * @type {string}
     */
    sectionLeaderRoleId: string;

    /**
     * The section veteran leader role. Equivalent to the section leader role.
     *
     * @type {string}
     */
    sectionVetLeaderRoleId: string;
}