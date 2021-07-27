import {ColorResolvable} from "discord.js";
import {IPermAllowDeny, IPropertyKeyValuePair} from "./MiscInterfaces";

/**
 * An interface representing a dungeon that can be used for AFK checks and headcounts.
 *
 * Guilds are able to create their own "dungeons" for their own purposes.
 */
export interface IDungeonInfo {
    /**
     * The code name. This is essentially the dungeon identifier name and should never change (even if anything else
     * relating to this dungeon changes).
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
     * Whether this dungeon permits the use of early location reactions. These include, but are not limited to,
     * Nitro Boosters, Patreons, and others (depending on your use case). This is optional; if this is not
     * explicitly stated, this defaults to `true`.
     *
     * This can be overridden by the guild.
     *
     * @type {boolean}
     */
    includeEarlyLoc?: boolean;

    /**
     * The link to the image of the dungeon's portal. This image will be displayed on the AFK check.
     *
     * @type {string}
     */
    portalLink: string;

    /**
     * An array of images of the dungeon's bosses, monsters, or others. A random image will be displayed on the AFK
     * check.
     *
     * @type {string[]}
     */
    bossLinks: string[];

    /**
     * The colors that best reflect the dungeon's overall color scheme. A random color will be used for the AFK
     * check embed's color.
     *
     * @type {ColorResolvable[]}
     */
    dungeonColors: ColorResolvable[];

    /**
     * The category that this dungeon best fits in. An empty string signifies an uncategorized dungeon.
     *
     * @type {string}
     */
    dungeonCategory: ""
        | "Basic Dungeons"
        | "Godland Dungeons"
        | "Endgame Dungeons"
        | "Event Dungeons"
        | "Mini Dungeons"
        | "Heroic Dungeons"
        | "Epic Dungeons";

    /**
     * Whether this dungeon is either a base (i.e. constant) dungeon or derived from a base dungeon. We define a
     * base dungeon as one that is defined in `DungeonData.ts`.
     *
     * We define a derived base dungeon as a dungeon object whose base comes from one that is defined in
     * `DungeonData.ts`. In other words, if a user "copied" a base dungeon and then made changes to it (this will
     * retain the original dungeon code), then this is a derived base dungeon.
     *
     * In particular, if this is `true` (i.e. this is a base dungeon or a derived base dungeon), then the user is
     * able to edit `keyReactions` and `otherReactions` in the `dungeonOverrides`. If this is `false` (i.e. this is 100% a
     * custom dungeon), then the user is NOT able to edit `keyReactions` and `otherReactions` since they can already edit it
     * elsewhere.
     *
     * @type {boolean}
     */
    isBaseOrDerived: boolean;
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

/**
 * An interface that represents a reaction.
 */
export interface IReactionInfo {
    /**
     * The emoji type.
     * @type {string}
     */
    type: "KEY" | "STATUS_EFFECT" | "CLASS" | "ITEM" | "SPECIAL" | "UTILITY";

    /**
     * The emoji ID. This is needed for getting the emoji object.
     * @type {string}
     */
    emojiId: string;

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
     * @type {IAfkCheckProperty<number>}
     */
    vcLimit: IAfkCheckProperty<number>;

    /**
     * The default number of people that can get early location.
     *
     * This does not apply to priority reactions (key, class, etc.).
     *
     * This can be overridden by the guild on a per-section basis.
     *
     * @type {IAfkCheckProperty<number>}
     */
    nitroEarlyLocationLimit: IAfkCheckProperty<number>;

    /**
     * Any information to display on all AFK checks. This is different from the custom message raid leaders can
     * specify when creating an AFK check.
     *
     * For example, you might link the rules channel.
     *
     * @type {string}
     */
    additionalAfkCheckInfo: string;

    /**
     * The AFK check timeout, in minutes. You must specify a timeout. The maximum timeout is 2 hours.
     *
     * @type {number}
     */
    afkCheckTimeout: number;

    /**
     * Lets you specify who can bypass a full VC. For example, you can set it so priority reactions and key reacts
     * can join a full VC, or you can specify that no one can join a full VC.
     *
     * @type {BypassFullVcOption}
     */
    bypassFullVcOption: BypassFullVcOption;

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
}

interface IAfkCheckProperty<T> {
    value: T;
    allowEdit: boolean;
}

export enum BypassFullVcOption {
    NotAllowed = (1 << 0),
    KeysOnly = (1 << 1),
    KeysAndPriority = (1 << 2)
}

export interface IRaidChannels {
    afkCheckChannelId: string;
    controlPanelChannelId: string;
    rateLeaderChannel: string;
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