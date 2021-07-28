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
             * The default number of people that can get early location by reacting to the Nitro button.
             *
             * Use `-1` to default to whatever the section default is.
             *
             * This does not apply to priority reactions (key, class, etc.).
             *
             * @type {number}
             */
            nitroEarlyLocationLimit: number;

            /**
             * The VC limit. This will override the section-defined VC limit.
             *
             * @type {number}
             */
            vcLimit: number;
        }[];

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
         * Any approved custom emojis. This will simply be an array of emoji IDs.
         *
         * @type {string[]}
         */
        approvedCustomEmojiIds: string[];

        /**
         * Any approved images. This will be an array of image URLs. The image will be stored on a private server.
         *
         * @type {string[]}
         */
        approvedCustomImages: string[];

        /**
         * Any reactions that give early location.
         *
         * The key is the emoji mapping key and the value is the list of roles which qualify for early location from
         * that emoji.
         *
         * In terms of how this works:
         * - If `includeEarlyLoc` is true (for either the overridden dungeon or the base dungeon), then all reactions
         * here will be displayed.
         * - If the user wishes to override the early location reactions for a certain dungeon, he or she can do so
         * by overriding what shows up (note that every emoji has an associated `type` which denotes what it is used
         * for).
         *
         * Nitro is automatically included.
         *
         * @type {IPropertyKeyValuePair<string, string[]>[]}
         */
        genEarlyLocReactions: IPropertyKeyValuePair<string, string[]>[];
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
     * The prefix that can be used to call commands.
     *
     * @type {string}
     */
    prefix: string;

    /**
     * All active manual verification requests for the main section.
     *
     * @type {IManualVerificationEntry[]}
     */
    manualVerificationEntries: IManualVerificationEntry[];
}

/**
 * An interface that represents a linked Discord ID to a series of linked IGNs. Any person that verifies through the
 * bot will have this entry, which will then be put in the associated Mongo collection.
 */
export interface IIdNameInfo extends IBaseDocument {
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
        raids: IRaidChannels;
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
     * Any manual verification requests.
     *
     * @type {IManualVerificationEntry[]}
     */
    manualVerificationEntries: IManualVerificationEntry[];
}

/**
 * An interface that represents the storage of a person's data. Unlike `IIdNameInfo`, this is only created when any
 * user data needs to be stored. In particular, this will store data like number of keys popped, number of vials
 * stored, and more.
 */
export interface IUserInfo extends IBaseDocument {
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
        moderationHistory: {
            /**
             * The guild ID.
             *
             * @type {string}
             */
            guildId: string;

            /**
             * The moderator that was responsible for this moderation action.
             *
             * @type {object}
             */
            moderator: {
                /**
                 * The moderator ID.
                 *
                 * @type {string}
                 */
                moderatorId: string;

                /**
                 * The moderator tag (User#0000).
                 *
                 * @type {string}
                 */
                moderatorTag: string;
            }

            /**
             * The moderation type.
             *
             * @type {string}
             */
            moderationType: ModLogType;

            /**
             * The reason for this moderation type.
             *
             * @type {string}
             */
            reason: string;

            /**
             * The duration of this moderation type, if any, in minutes. If there is no time, then this will be `-1`.
             *
             * @type {number}
             */
            duration: number;

            /**
             * The issued date/time; i.e. when this moderation action was issued.
             *
             * @type {number}
             */
            issuedTime: number;

            /**
             * An ID consisting of 30 letters used to identify this moderation action.
             *
             * @type {string}
             */
            actionId: string;
        }[];

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

type ModLogType = "Suspend"
    | "Unsuspend"
    | "Mute"
    | "Unmute"
    | "Blacklist"
    | "Unblacklist"
    | "SectionSuspend"
    | "SectionUnsuspend"
    | "ModmailBlacklist"
    | "ModmailUnblacklist";

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

    /**
     * The section head leader role.
     *
     * @type {string}
     */
    sectionHeadLeaderRoleId: string;
}