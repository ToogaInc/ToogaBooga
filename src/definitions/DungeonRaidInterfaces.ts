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
    type: "KEY" | "STATUS_EFFECT" | "CLASS" | "ITEM" | "EARLY_LOCATION" | "UTILITY";

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
}

interface IAfkCheckProperty<T> {
    value: T;
    allowEdit: boolean;
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
    rateLeaderChannel: string;
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
     * @type {string}
     */
    channels: IRaidChannels;

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
     * The raid message.
     *
     * @type {string}
     */
    raidMessage: string;

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
    }[];
}

/**
 * An interface that represents the additional options to be used for this raid.
 */
export interface IRaidOptions {
    /**
     * The VC limit for this raid.
     *
     * @type {number}
     */
    vcLimit: number;

    /**
     * The leader-set raid message.
     *
     * @type {string}
     */
    raidMessage: string;
}