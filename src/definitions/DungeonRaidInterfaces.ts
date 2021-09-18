import {IPermAllowDeny, IPropertyKeyValuePair} from "./MiscInterfaces";

export type DungeonType = "Uncategorized"
    | "Basic Dungeons"
    | "Godland Dungeons"
    | "Exaltation Dungeons"
    | "Event Dungeons"
    | "Mini Dungeons"
    | "Heroic Dungeons"
    | "Epic Dungeons";

export type ImageInfo = {
    url: string;
    name: string;
};

export interface IDungeonOverrideInfo {
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
    keyReactions: IAfkCheckReaction[];

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
    otherReactions: IAfkCheckReaction[];

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
     * Use `-1` to default to whatever the section default is.
     *
     * Use `100` for infinite.
     *
     * @type {number}
     */
    vcLimit: number;

    /**
     * The cost, in points, to get early location and get moved into this raid.
     *
     * @type {number}
     */
    pointCost: number;

    /**
     * Any role requirements for running this dungeon. The user only needs to have one of these roles to
     * complete this dungeon.
     *
     * @type {object}
     */
    roleRequirement: string[];
}

/**
 * An interface representing a dungeon that can be used for AFK checks and headcounts.
 */
export interface IDungeonInfo {
    /**
     * The code name. This is essentially the dungeon identifier name and should never change (even if anything else
     * relating to this dungeon changes).
     *
     * For custom dungeons, `codeName` should always start with `[[` and end with `]]`.
     *
     * @type {string}
     */
    codeName: string;

    /**
     * The name of the dungeon.
     *
     * @type {string}
     */
    dungeonName: string;

    /**
     * The emoji ID corresponding to the emoji that depicts the dungeon's portal.
     *
     * @type {string}
     */
    portalEmojiId: string;

    /**
     * The keys that are needed for this dungeon. For example, for Oryx 3, you would have the three runes and the
     * Wine Cellar Incantation.
     *
     * If `maxEarlyLocation` is greater than 0, this will be rendered as a button on the AFK check. Otherwise, this
     * will be rendered as a normal reaction.
     *
     * This can be overridden by the guild.
     *
     * @type {IAfkCheckReaction[]}
     */
    keyReactions: IAfkCheckReaction[];

    /**
     * Any other "reactions" needed for this dungeon. For example, for Oryx 3, you might have various class reacts
     * and other things.
     *
     * If `maxEarlyLocation` is greater than 0, this will be rendered as a button on the AFK check. Otherwise, this
     * will be rendered as a normal reaction.
     *
     * This can be overridden by the guild.
     *
     * @type {IAfkCheckReaction[]}
     */
    otherReactions: IAfkCheckReaction[];

    /**
     * The link to the image of the dungeon's portal. This image will be displayed on the AFK check.
     *
     * @type {ImageInfo}
     */
    portalLink: ImageInfo;

    /**
     * An array of images of the dungeon's bosses, monsters, or others. A random image will be displayed on the AFK
     * check.
     *
     * @type {ImageInfo[]}
     */
    bossLinks: ImageInfo[];

    /**
     * The colors that best reflect the dungeon's overall color scheme. A random color will be used for the AFK
     * check embed's color.
     *
     * @type {number[]}
     */
    dungeonColors: number[];

    /**
     * The category that this dungeon best fits in. An empty string signifies an uncategorized dungeon.
     *
     * @type {string}
     */
    dungeonCategory: DungeonType;

    /**
     * Whether this dungeon is either a base (i.e. constant) dungeon or derived from a base dungeon. We define a
     * base dungeon as one that is defined in `DungeonData.ts`.
     *
     * We define a derived base dungeon as a dungeon object whose base comes from one that is defined in
     * `DungeonData.ts`. In other words, if a user "copied" a base dungeon and then made changes to it (this will
     * retain the original dungeon code), then this is a derived base dungeon.
     *
     * In particular, if this is `true` (i.e. this is a base dungeon or a derived base dungeon), then the user is
     * able to edit `keyReactions` and `otherReactions` in the `dungeonOverrides`. If this is `false` (i.e. this is
     * 100% a custom dungeon), then the user is NOT able to edit `keyReactions` and `otherReactions` since they can
     * already edit it elsewhere.
     *
     * @type {boolean}
     */
    isBaseOrDerived: boolean;
}

/**
 * An interface representing a custom dungeon that can be used for AFK checks and headcounts.
 *
 * Guilds are able to create their own "dungeons" for their own purposes. These dungeons are represented by this
 * interface.
 */
export interface ICustomDungeonInfo extends IDungeonInfo {
    /**
     * The cost, in points, to get early location and get moved into this raid.
     *
     * @type {number}
     */
    pointCost: number;

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
     * Use `-1` to default to whatever the section default is.
     *
     * Use `100` for infinite.
     *
     * @type {number}
     */
    vcLimit: number;

    /**
     * Since this is a custom dungeon, this value must be `false`.
     *
     * @type {boolean}
     */
    isBaseOrDerived: false;

    /**
     * Any role requirements for running this dungeon. The user only needs to have one of these roles to
     * complete this dungeon.
     *
     * @type {object}
     */
    roleRequirement: string[];
}

/**
 * An interface that essentially linked a reaction to the maximum number of people that can get early location.
 */
export interface IAfkCheckReaction {
    /**
     * A key (string) that can be used in `IMappedAfkCheckReactions` to access a particular reaction's type, emoji
     * ID, and name.
     *
     * This is technically a `string`.
     *
     * @type {keyof IMappedAfkCheckReactions}
     */
    mapKey: keyof IMappedAfkCheckReactions;

    /**
     * The maximum number of players that can get early location.
     *
     * This can be overridden by the guild.
     *
     * @type {number}
     */
    maxEarlyLocation: number;
}

/**
 * An interface that represents a generic "reaction" -- either a button or reaction to be displayed on the AFK
 * check. This is used to map all of the available reactions to the reaction info.
 */
export interface IMappedAfkCheckReactions {
    [key: string]: IReactionInfo;
}

export type ReactionType = "KEY" | "NM_KEY" | "STATUS_EFFECT" | "CLASS" | "ITEM" | "EARLY_LOCATION" | "UTILITY";

/**
 * An interface that represents a reaction.
 */
export interface IReactionInfo {
    /**
     * The emoji type. The properties are as follows:
     * - `KEY`: A key that can be modified.
     * - `NM_KEY`: A key that cannot be modified.
     * - `STATUS_EFFECT`: A status effect reaction.
     * - `CLASS`: A class reaction.
     * - `ITEM`: An item reaction.
     * - `EARLY_LOCATION`: A reaction that gives early location.
     * - `UTILITY`: A utility reaction.
     * @type {string}
     */
    type: ReactionType;

    /**
     * Information about this emoji.
     * @type {object}
     */
    emojiInfo: {
        /**
         * The emoji ID or unicode representation. Whether this is a custom emoji (i.e. ID) or unicode emoji (i.e.
         * built-in) is specified by `isCustom`.
         * @type {string}
         */
        identifier: string;

        /**
         * Whether `identifier` represents a custom emoji. Note that if this is `true`, then `identifier`
         * will be an emoji ID.
         * @type {boolean}
         */
        isCustom: boolean;
    };

    /**
     * The name of the emoji.
     * @type {string}
     */
    name: string;
}

/**
 * An interface that represents the AFK check properties for a particular section. When creating an AFK check, the
 * bot will use this (or the default values) to create an AFK check.
 */
export interface IAfkCheckProperties {
    /**
     * The default VC limit for an AFK check.
     *
     * This can be overridden by the guild on a per-section basis.
     *
     * @type {number}
     */
    vcLimit: number;

    /**
     * The default number of people that can get early location by reacting to the Nitro button.
     *
     * Use `-1` to default to 8% of the VC limit.
     *
     * This does not apply to priority reactions (key, class, etc.).
     *
     * This can be overridden by the guild on a per-section basis. A value of `0` will result in the Nitro button
     * not showing up.
     *
     * @type {number}
     */
    nitroEarlyLocationLimit: number;

    /**
     * The number of people that can redeem points for early location. If you don't want the ticket emoji to appear
     * at all, set this to 0.
     *
     * @type {number}
     */
    pointUserLimit: number;

    /**
     * All custom messages to display to members, in various aspects.
     *
     * @type {object}
     */
    customMsg: {
        /**
         * Any information to display on all AFK checks. This is different from the custom message raid leaders can
         * specify when creating an AFK check. This is displayed during pre-AFK check and current AFK check.
         *
         * For example, you might link the rules channel or tell people to look at a channel regarding reactions.
         *
         * @type {string}
         */
        additionalAfkCheckInfo: string;

        /**
         * Any information to display on all raid embeds/post-raid embeds. This is displayed during post-AFK
         * check/raid mode and even when the raid is over.
         *
         * For example, you might tell raiders to lead.
         *
         * @type {string}
         */
        postAfkCheckInfo: string;

        /**
         * The message that will be displayed to the raider when he or she confirms that he or she is bringing an
         * essential reaction that gives early location. Generally speaking, this should contain information on things
         * like confirming reactions or some other information.
         *
         * @type {string}
         */
        earlyLocConfirmMsg: string;
    };

    /**
     * The AFK check timeout, in minutes. You must specify a timeout. The maximum timeout is 2 hours.
     *
     * @type {number}
     */
    afkCheckTimeout: number;

    /**
     * The permissions to set on the raid VC for the duration of the AFK check.
     *
     * @type {IPropertyKeyValuePair<string, IPermAllowDeny>[]}
     */
    afkCheckPermissions: IPropertyKeyValuePair<string, IPermAllowDeny>[];

    /**
     * The permissions to set on the raid VC for after the AFK check (i.e. during a raid).
     *
     * @type {IPropertyKeyValuePair<string, IPermAllowDeny>[]}
     */
    prePostAfkCheckPermissions: IPropertyKeyValuePair<string, IPermAllowDeny>[];

    /**
     * The dungeons that can be raided in this section. Use the dungeon's code name (not name).
     *
     * @type {string[]}
     */
    allowedDungeons: string[];

    /**
     * Whether to create a log channel with every AFK check.
     *
     * @type {boolean}
     */
    createLogChannel: boolean;
}

/**
 * An interface that represents the various AFK Check & Raid channels.
 */
export interface IRaidChannels {
    /**
     * The AFK check channel.
     *
     * @type {string}
     */
    afkCheckChannelId: string;

    /**
     * The control panel channel.
     *
     * @type {string}
     */
    controlPanelChannelId: string;

    /**
     * The leader rating channel.
     *
     * @type {string}
     */
    leaderFeedbackChannelId: string;

    /**
     * The raid history storage channel.
     *
     * @type {string}
     */
    raidHistChannelId: string;
}

/**
 * An interface that represents an AFK check or raid.
 */
export interface IRaidInfo {
    /**
     * The dungeon code/identifier.
     *
     * @type {string}
     */
    dungeonCodeName: string;

    /**
     * The member that started this AFK check.
     *
     * @type {string}
     */
    memberInit: string;

    /**
     * The raid channels. We use this in case the channels were changed.
     *
     * @type {IRaidChannels}
     */
    raidChannels: Omit<IRaidChannels, "leaderFeedbackChannelId" | "raidHistChannelId">;

    /**
     * Any other channels associated with this raid.
     *
     * @type {object}
     */
    otherChannels: {
        /**
         * The feedback channel ID.
         *
         * @type {string}
         */
        feedbackChannelId: string;

        /**
         * The logging channel ID.
         *
         * @type {string}
         */
        logChannelId: string;
    };

    /**
     * The AFK check message.
     *
     * @type {string}
     */
    afkCheckMessageId: string;

    /**
     * The control panel message.
     *
     * @type {string}
     */
    controlPanelMessageId: string;

    /**
     * The raid status. This is either `1` (AFK Check) or `2` (In Run).
     *
     * @type {number}
     */
    status: number;

    /**
     * The raiding voice channel ID.
     *
     * @type {string}
     */
    vcId: string;

    /**
     * The raid location.
     *
     * @type {string}
     */
    location: string;

    /**
     * The section where this AFK check or raid is being done.
     *
     * @type {string}
     */
    sectionIdentifier: string;

    /**
     * The early location reactions.
     *
     * @type {object}
     */
    earlyLocationReactions: {
        /**
         * The user ID.
         *
         * @type {string}
         */
        userId: string;

        /**
         * The reaction code.
         *
         * @type {string}
         */
        reactCodeName: string;

        /**
         * Modifiers, if any, for this reaction.
         *
         * @type {string[]}
         */
        modifiers: string[];
    }[];
}

/**
 * An interface that represents the additional options to be used for this raid.
 */
export interface IRaidOptions {
    /**
     * The location for this raid.
     *
     * @type {string}
     */
    location: string;
}