// Suppress unused methods for this file.
// noinspection JSUnusedGlobalSymbols,AssignmentToFunctionParameterJS
import { Logger } from "../utilities/Logger";
import { AdvancedCollector } from "../utilities/collectors/AdvancedCollector";
import {
    ButtonInteraction,
    Collection,
    EmojiIdentifierResolvable,
    Guild,
    GuildMember,
    Interaction,
    InteractionCollector,
    Message,
    MessageActionRow,
    MessageAttachment,
    MessageButton,
    MessageComponentInteraction,
    MessageEmbed,
    MessageOptions,
    MessageSelectMenu,
    Modal,
    ModalSubmitInteraction,
    OverwriteResolvable,
    Role,
    Snowflake,
    TextChannel,
    TextInputComponent,
    ThreadChannel,
    User,
    VoiceChannel,
    VoiceState,
} from "discord.js";
import { StringBuilder } from "../utilities/StringBuilder";
import { ArrayUtilities } from "../utilities/ArrayUtilities";
import { MAPPED_AFK_CHECK_REACTIONS } from "../constants/dungeons/MappedAfkCheckReactions";
import { MessageUtilities } from "../utilities/MessageUtilities";
import { DUNGEON_DATA } from "../constants/dungeons/DungeonData";
import { GuildFgrUtilities } from "../utilities/fetch-get-request/GuildFgrUtilities";
import { MongoManager } from "../managers/MongoManager";
import { GlobalFgrUtilities } from "../utilities/fetch-get-request/GlobalFgrUtilities";
import { GeneralConstants } from "../constants/GeneralConstants";
import { RealmSharperWrapper } from "../private-api/RealmSharperWrapper";
import { Bot } from "../Bot";
import { EmojiConstants } from "../constants/EmojiConstants";
import { MiscUtilities } from "../utilities/MiscUtilities";
import { UserManager } from "../managers/UserManager";
import {
    ICustomDungeonInfo,
    IDungeonInfo,
    IDungeonModifier,
    IGuildInfo,
    IRaidInfo,
    IRaidOptions,
    ISectionInfo,
} from "../definitions";
import { TimeUtilities, TimestampType } from "../utilities/TimeUtilities";
import { LoggerManager } from "../managers/LoggerManager";
import { QuotaManager } from "../managers/QuotaManager";
import { DEFAULT_MODIFIERS, DUNGEON_MODIFIERS } from "../constants/dungeons/DungeonModifiers";
import {
    confirmReaction,
    controlPanelCollectorFilter,
    delay,
    getItemDisplay,
    getReactions,
    ReactionInfoMore,
    sendTemporaryAlert,
} from "./Common";
import { ButtonConstants } from "../constants/ButtonConstants";
import { PermsConstants } from "../constants/PermsConstants";
import { StringUtil } from "../utilities/StringUtilities";
import { v4 as uuidv4 } from "uuid";
import { DjsToProjUtilities } from "../utilities/DJsToProjUtilities";
import RunResult = LoggerManager.RunResult;
import { InteractionTypes } from "discord.js/typings/enums";

const FOOTER_INFO_MSG: string =
    "If you don't want to log this run, press the \"Cancel Logging\" button. Note that" +
    " all runs should be logged for accuracy. This collector will automatically expire after 5 minutes of no" +
    " interaction.";

const LOGGER: Logger = new Logger(__filename, false);

/**
 * This class represents a raid.
 */
export class RaidInstance {
    /**
     * A collection of active AFK checks and raids. The key is the AFK check message ID and the value is the raid
     * manager object.
     *
     * @type {Collection<string, RaidInstance>}
     */
    public static ActiveRaids: Collection<string, RaidInstance> = new Collection<string, RaidInstance>();

    private static readonly START_AFK_CHECK_ID: string = "start_afk";
    private static readonly START_RAID_ID: string = "start_raid";
    private static readonly ABORT_AFK_ID: string = "abort_afk";
    private static readonly SET_LOCATION_ID: string = "set_location";
    private static readonly END_RAID_ID: string = "end_raid";
    private static readonly CHAIN_LOG_ID: string = "chain_log";
    private static readonly LOCK_RAID_ID: string = "lock_raid";
    private static readonly UNLOCK_RAID_ID: string = "unlock_raid";
    private static readonly RESTART_RAID: string = "restart_raid";

    // 1 hour in milliseconds
    private static readonly DEFAULT_RAID_DURATION: number = 60 * 60 * 1000;
    // default to white
    private static readonly DEFAULT_EMBED_COLOR: number = 16777215;

    private static readonly CP_PRE_AFK_BUTTONS: MessageActionRow[] = AdvancedCollector.getActionRowsFromComponents([
        new MessageButton()
            .setLabel("Start AFK Check")
            .setEmoji(EmojiConstants.LONG_RIGHT_TRIANGLE_EMOJI)
            .setCustomId(RaidInstance.START_AFK_CHECK_ID)
            .setStyle("PRIMARY"),
        new MessageButton()
            .setLabel("Abort AFK Check")
            .setEmoji(EmojiConstants.WASTEBIN_EMOJI)
            .setCustomId(RaidInstance.ABORT_AFK_ID)
            .setStyle("DANGER"),
        new MessageButton()
            .setLabel("Set Location")
            .setEmoji(EmojiConstants.MAP_EMOJI)
            .setCustomId(RaidInstance.SET_LOCATION_ID)
            .setStyle("PRIMARY"),
    ]);

    private static readonly CP_AFK_BUTTONS: MessageActionRow[] = AdvancedCollector.getActionRowsFromComponents([
        new MessageButton()
            .setLabel("Start Raid")
            .setEmoji(EmojiConstants.LONG_RIGHT_TRIANGLE_EMOJI)
            .setCustomId(RaidInstance.START_RAID_ID)
            .setStyle("PRIMARY"),
        new MessageButton()
            .setLabel("Abort AFK Check")
            .setEmoji(EmojiConstants.WASTEBIN_EMOJI)
            .setCustomId(RaidInstance.ABORT_AFK_ID)
            .setStyle("DANGER"),
        new MessageButton()
            .setLabel("Set Location")
            .setEmoji(EmojiConstants.MAP_EMOJI)
            .setCustomId(RaidInstance.SET_LOCATION_ID)
            .setStyle("PRIMARY"),
    ]);

    private static readonly CP_RAID_BUTTONS: MessageActionRow[] = AdvancedCollector.getActionRowsFromComponents([
        new MessageButton()
            .setLabel("End Raid")
            .setEmoji(EmojiConstants.RED_SQUARE_EMOJI)
            .setCustomId(RaidInstance.END_RAID_ID)
            .setStyle("DANGER"),
        new MessageButton()
            .setLabel("Set Location")
            .setEmoji(EmojiConstants.MAP_EMOJI)
            .setCustomId(RaidInstance.SET_LOCATION_ID)
            .setStyle("PRIMARY"),
        new MessageButton()
            .setLabel("Lock Raid VC")
            .setEmoji(EmojiConstants.LOCK_EMOJI)
            .setCustomId(RaidInstance.LOCK_RAID_ID)
            .setStyle("PRIMARY"),
        new MessageButton()
            .setLabel("Unlock Raid VC")
            .setEmoji(EmojiConstants.UNLOCK_EMOJI)
            .setCustomId(RaidInstance.UNLOCK_RAID_ID)
            .setStyle("PRIMARY"),
        new MessageButton()
            .setLabel("Chain Log")
            .setEmoji("⛓️")
            .setCustomId(RaidInstance.CHAIN_LOG_ID)
            .setStyle("SUCCESS"),
        new MessageButton()
            .setLabel("Start New AFK Check")
            .setEmoji(EmojiConstants.REDIRECT_EMOJI)
            .setCustomId(RaidInstance.RESTART_RAID)
            .setStyle("PRIMARY"),
    ]);

    // The guild that this AFK check is in.
    private readonly _guild: Guild;
    // The dungeon.
    private readonly _dungeon: IDungeonInfo;
    // The AFK check channel.
    private readonly _afkCheckChannel: TextChannel;
    // The control panel channel.
    private readonly _controlPanelChannel: TextChannel;
    // The elite location channel.
    private _eliteLocChannel: TextChannel | null;
    // The section.
    private readonly _raidSection: ISectionInfo;
    // Number of people that can get early location through Nitro.
    private readonly _numNitroEarlyLoc: number;

    // Nonessential reactions. These are reactions that don't give any perks. More can be added at any point.
    private readonly _nonEssentialReactions: EmojiIdentifierResolvable[];

    // Buttons to display on the AFK check. These should only contain essential buttons.
    private readonly _afkCheckButtons: MessageButton[];
    // Join Buttons to display on the AFK check for vcless raids.
    private readonly _joinButton: MessageButton;
    // Whether intervals are running.
    private _raidLocked: boolean = true;
    // All essential options (options that give early location). Equivalent to _afkCheckButtons but as raw data
    // instead of buttons. The key is the mapping key.
    private readonly _allEssentialOptions: Collection<string, ReactionInfoMore>;
    // A collection that contains the IAfkCheckReaction.mapKey as the key and the members with the corresponding
    // item as the value.
    private readonly _pplWithEarlyLoc: Collection<string, { member: GuildMember; modifiers: string[] }[]>;
    // A collection that deals with *general* (Nitro, Patreon, etc.) early location. The key is the mapKey and the
    // value is an object containing the roles needed.
    private readonly _earlyLocToRole: Collection<string, Role[]>;

    // The guild doc.
    private _guildDoc: IGuildInfo;
    // The location.
    private _location: string;
    // Current raid status.
    private _raidStatus: RaidStatus;

    //Raid id
    private _raidId: string;

    // The raid VC.
    private _raidVc: VoiceChannel | null;
    // The old VC perms.
    private _oldVcPerms: OverwriteResolvable[] | null;

    // Whether the raid is vc or vcless
    private _vcless: boolean = false;
    // The AFK check message.
    private _afkCheckMsg: Message | null;
    // The control panel message.
    private _controlPanelMsg: Message | null;
    // The roles to ping when the pre-AFK check starts
    private _mentionRoles: string | null;

    // Whether intervals are running.
    private _intervalsAreRunning: boolean = false;

    // The collector waiting for interactions from users.
    private _afkCheckButtonCollector: InteractionCollector<MessageComponentInteraction> | null;
    // The collector waiting for interactions from staff.
    private _controlPanelReactionCollector: InteractionCollector<MessageComponentInteraction> | null;

    // The VC limit.
    private readonly _raidLimit: number;
    // The member that initiated this.
    private readonly _memberInit: GuildMember;
    // The leader's name (as a string).
    private readonly _leaderName: string;
    // The cost, in points, for early location.
    private readonly _earlyLocPointCost: number;
    // Override info concerning whether you can start without location
    private readonly _locationToProgress: boolean;

    // The members that are joining this raid.
    private _membersThatJoined: GuildMember[] = [];
    private _membersThatLeftChannel: GuildMember[] = [];
    private readonly _raidLogs: string[] = [];

    // Base feedback channel; for initial use only (this channel's parent is where other feedback channels should be
    // created)
    private readonly _feedbackBaseChannel: TextChannel | null;
    private readonly _raidStorageChan: TextChannel | null;

    // Channels created specifically for this raid; these will be deleted once the raid is over
    private _thisFeedbackChan: TextChannel | null;
    private _logChan: ThreadChannel | null;

    // Whether this has already been added to the database
    private _addedToDb: boolean = false;

    // Anyone that is a priority react that may need to be dragged in.
    private _peopleToAddToVc: Set<string> = new Set();

    // Anyone that is currently confirming their reaction with the bot.
    // This is so we don't have double reactions
    private _pplConfirmingReaction: Set<string> = new Set();

    // All modifiers that we should be referring to.
    private readonly _modifiersToUse: readonly IDungeonModifier[];

    // The afk embed color.
    private _embedColor: number;

    // The raid instance start time and expiration time
    private _startTime: number;
    private _expTime: number;

    // Instance information for logging
    private readonly _instanceInfo: string;

    // Time between panel updates in ms
    private readonly _intervalDelay: number = 5000;

    // Temporary alert duration, 10 min
    private readonly _tempAlertDelay: number = 10 * 60 * 1000;
    // Whether this raid instance is valid.
    private _isValid: boolean;

    /**
     * Creates a new `RaidInstance` object.
     * @param {GuildMember} memberInit The member that initiated this raid.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section where this raid is occurring. Note that the verified role must exist.
     * @param {IDungeonInfo | ICustomDungeonInfo} dungeon The dungeon that is being raided.
     * @param {IRaidOptions} [raidOptions] The raid options, if any.
     */
    private constructor(
        memberInit: GuildMember,
        guildDoc: IGuildInfo,
        section: ISectionInfo,
        dungeon: IDungeonInfo | ICustomDungeonInfo,
        raidOptions?: IRaidOptions
    ) {
        this._memberInit = memberInit;
        this._guild = memberInit.guild;
        this._dungeon = dungeon;
        this._location = raidOptions?.location ?? "";
        this._raidStatus = RaidStatus.NOTHING;
        this._raidId = uuidv4();
        this._vcless = raidOptions?.vcless ?? false;
        this._mentionRoles = null;

        if (raidOptions?.existingVc) {
            this._raidVc = raidOptions.existingVc.vc;
            this._oldVcPerms = raidOptions.existingVc.oldPerms;
        } else {
            this._raidVc = null;
            this._oldVcPerms = null;
        }

        this._isValid = true;
        this._afkCheckMsg = null;
        this._controlPanelMsg = null;
        this._guildDoc = guildDoc;
        this._raidSection = section;
        this._membersThatJoined = [];
        this._modifiersToUse = DEFAULT_MODIFIERS;
        this._embedColor = RaidInstance.DEFAULT_EMBED_COLOR;
        this._startTime = Date.now();
        this._expTime =
            this._startTime +
            (section.otherMajorConfig.afkCheckProperties.afkCheckTimeout ?? RaidInstance.DEFAULT_RAID_DURATION);
        LOGGER.debug(
            "Timeout duration in milliseconds: " + section.otherMajorConfig.afkCheckProperties.afkCheckTimeout ??
            RaidInstance.DEFAULT_RAID_DURATION
        );

        this._logChan = null;
        this._thisFeedbackChan = null;

        this._afkCheckButtonCollector = null;
        this._controlPanelReactionCollector = null;

        const brokenUpName = UserManager.getAllNames(memberInit.displayName);
        this._leaderName = brokenUpName.length > 0 ? brokenUpName[0] : memberInit.displayName;

        this._afkCheckChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            memberInit.guild,
            section.channels.raids.afkCheckChannelId
        )!;

        this._controlPanelChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            memberInit.guild,
            section.channels.raids.controlPanelChannelId
        )!;

        this._eliteLocChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            memberInit.guild,
            section.channels.eliteLocChannelId
        )!;

        this._feedbackBaseChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            memberInit.guild,
            guildDoc.channels.raids.leaderFeedbackChannelId
        );

        this._raidStorageChan = GuildFgrUtilities.getCachedChannel<TextChannel>(
            memberInit.guild,
            guildDoc.channels.raids.raidHistChannelId
        );
        this._instanceInfo = `[${this._leaderName}, ${this._dungeon.dungeonName}]`;
        LOGGER.info(`${this._instanceInfo} Raid constructed`);
        LOGGER.debug(
            `${this._instanceInfo} Raid start time: ${TimeUtilities.getDateTime(
                this._startTime,
                "America/Los_Angeles"
            )}`
        );
        LOGGER.debug(
            `${this._instanceInfo} Raid expiration time: ${TimeUtilities.getDateTime(
                this._expTime,
                "America/Los_Angeles"
            )}`
        );

        // Which essential reacts are we going to use.
        const reactions = getReactions(dungeon, guildDoc);

        // This defines the number of people that gets early location via NITRO only.
        let numEarlyLoc: number = -2;
        // And this is the raid VC limit
        let raidLimit: number = -2;
        // And this is the point cost.
        let costForEarlyLoc: number = 0;
        // Override info concerning whether you can start without location
        let locationToProgress: boolean = false;
        // Process dungeon based on whether it is custom or not.
        if (dungeon.isBuiltIn) {
            const dgnOverride = guildDoc.properties.dungeonOverride.find((x) => x.codeName === dungeon.codeName);

            if (dgnOverride && dgnOverride.vcLimit !== -1) raidLimit = dgnOverride.vcLimit;

            if (dgnOverride && dgnOverride.nitroEarlyLocationLimit !== -1)
                numEarlyLoc = dgnOverride.nitroEarlyLocationLimit;
            else if (section.otherMajorConfig.afkCheckProperties.nitroEarlyLocationLimit !== -1)
                numEarlyLoc = section.otherMajorConfig.afkCheckProperties.nitroEarlyLocationLimit;

            if (dgnOverride && dgnOverride.pointCost) costForEarlyLoc = dgnOverride.pointCost;

            if (dgnOverride?.allowedModifiers) {
                this._modifiersToUse = dgnOverride.allowedModifiers
                    .map((x) => {
                        return DUNGEON_MODIFIERS.find((modifier) => modifier.modifierId === x);
                    })
                    .filter((x) => x) as IDungeonModifier[];
            }

            // If the dungeon has an override
            if (dgnOverride && dgnOverride.locationToProgress) locationToProgress = true;
            // In the case that there is no override, fallback to the information from constants/dungeons/DungeonData
            else if (!dgnOverride && dungeon.locationToProgress) locationToProgress = true;

            if (dgnOverride && dgnOverride.mentionRoles) {
                this._mentionRoles = dgnOverride.mentionRoles.map(mention => {
                    return `<@&${mention}>`;
                }).join(" ");
            }
        } else {
            // If this is not a base or derived dungeon (i.e. it's a custom dungeon), then it must specify the nitro
            // limit.
            numEarlyLoc = (dungeon as ICustomDungeonInfo).nitroEarlyLocationLimit;
            if (numEarlyLoc === -1) {
                numEarlyLoc = section.otherMajorConfig.afkCheckProperties.nitroEarlyLocationLimit;
            }

            costForEarlyLoc = (dungeon as ICustomDungeonInfo).pointCost;
            if ((dungeon as ICustomDungeonInfo).allowedModifiers) {
                this._modifiersToUse = (dungeon as ICustomDungeonInfo).allowedModifiers
                    .map((x) => {
                        return DUNGEON_MODIFIERS.find((modifier) => modifier.modifierId === x);
                    })
                    .filter((x) => x) as IDungeonModifier[];
            }

            if ((dungeon as ICustomDungeonInfo).mentionRoles) {
                this._mentionRoles = (dungeon as ICustomDungeonInfo).mentionRoles.map(mention => {
                    return `<@&${mention}>`;
                }).join(" ");
            }
        }

        this._earlyLocPointCost = costForEarlyLoc;
        this._locationToProgress = (this._vcless) ? true : locationToProgress;

        if (raidLimit === -2) {
            if (section.otherMajorConfig.afkCheckProperties.vcLimit !== -1)
                raidLimit = section.otherMajorConfig.afkCheckProperties.vcLimit;
            else raidLimit = 45;
        }

        // If numEarlyLoc is still -1 (or -2), then default to 10% of the VC cap. 
        if (numEarlyLoc < 0) {
            numEarlyLoc = Math.max(Math.floor(raidLimit * 0.1), 1);
        }

        this._raidLimit = raidLimit;
        this._numNitroEarlyLoc = numEarlyLoc;

        if (numEarlyLoc !== 0 && this._guild.roles.premiumSubscriberRole) {
            reactions.set("NITRO", {
                ...MAPPED_AFK_CHECK_REACTIONS.NITRO,
                earlyLocAmt: numEarlyLoc,
                isCustomReaction: false,
            });
        }

        if (this._earlyLocPointCost > 0 && section.otherMajorConfig.afkCheckProperties.pointUserLimit > 0) {
            reactions.set("EARLY_LOC_POINTS", {
                earlyLocAmt: section.otherMajorConfig.afkCheckProperties.pointUserLimit,
                isCustomReaction: false,
                emojiInfo: {
                    identifier: EmojiConstants.TICKET_EMOJI,
                    isCustom: false,
                },
                name: "Points",
                type: "EARLY_LOCATION",
                isExaltKey: false,
                builtInEmoji: EmojiConstants.TICKET_EMOJI,
            });
        }

        this._numNitroEarlyLoc = numEarlyLoc;

        // Go through all early location reactions and associate each reaction to a set of roles
        // If no roles can be associated, remove the reaction from the collection.
        this._earlyLocToRole = new Collection();
        Array.from(reactions.filter((x) => x.type === "EARLY_LOCATION").entries()).forEach((x) => {
            const [mapKey, info] = x;
            if (mapKey === "NITRO" && this._guild.roles.premiumSubscriberRole) {
                this._earlyLocToRole.set(mapKey, [this._guild.roles.premiumSubscriberRole]);
                return;
            }

            if (mapKey === "EARLY_LOC_POINTS") {
                return;
            }

            const rolesForEarlyLoc =
                this._guildDoc.properties.genEarlyLocReactions.find((kv) => kv.mappingKey === mapKey)?.roleId ?? "";
            const resolvedRole = GuildFgrUtilities.getCachedRole(this._guild, rolesForEarlyLoc);

            if (!resolvedRole || info.earlyLocAmt === 0) {
                reactions.delete(mapKey);
                return;
            }

            this._earlyLocToRole.set(mapKey, [resolvedRole]);
        });

        // Populate the collections
        this._allEssentialOptions = new Collection<string, ReactionInfoMore>();
        this._pplWithEarlyLoc = new Collection<string, { member: GuildMember; modifiers: string[] }[]>();
        this._nonEssentialReactions = [];
        this._afkCheckButtons = [];

        this._joinButton = new MessageButton().setLabel("Join")
            .setStyle("SUCCESS").setDisabled(true).setCustomId("join");
        if (this._vcless) this._afkCheckButtons.push(this._joinButton);
        for (const [key, reactionInfo] of reactions) {
            // Non-essential reaction.
            if (reactionInfo.earlyLocAmt <= 0) {
                // No emoji = we can't do anything, so skip this one.
                if (
                    reactionInfo.emojiInfo.isCustom &&
                    !GlobalFgrUtilities.hasCachedEmoji(reactionInfo.emojiInfo.identifier)
                )
                    continue;

                // If this is early loc, then there's no point in putting it as an unessential react.
                if (reactionInfo.type === "EARLY_LOCATION") continue;

                this._nonEssentialReactions.push(
                    reactionInfo.emojiInfo.isCustom
                        ? GlobalFgrUtilities.getCachedEmoji(reactionInfo.emojiInfo.identifier)!
                        : reactionInfo.emojiInfo.identifier
                );

                continue;
            }

            // Otherwise, we're dealing with essential reactions.
            this._pplWithEarlyLoc.set(key, []);
            this._allEssentialOptions.set(key, reactionInfo);

            // Create the button which will be put on AFK check.
            const button = new MessageButton().setLabel(reactionInfo.name).setStyle("PRIMARY").setCustomId(key);

            const emoji = reactionInfo.emojiInfo.isCustom
                ? GlobalFgrUtilities.getCachedEmoji(reactionInfo.emojiInfo.identifier)
                : reactionInfo.emojiInfo.identifier;
            if (emoji) button.setEmoji(emoji);

            this._afkCheckButtons.push(button);
        }
    }

    /**
     * Gets the raid voice channel, if any.
     * @returns {VoiceChannel | null} The raid voice channel.
     */
    public get raidVc(): VoiceChannel | null {
        return this._raidVc;
    }

    public get afkCheckMsg(): Message | null {
        return this._afkCheckMsg;
    }

    public get controlPanelMsg(): Message | null {
        return this._controlPanelMsg;
    }

    /**
     * Gets an array of members that was in VC/raid at the time the raid started.
     * @returns {GuildMember[]} The array of members.
     */
    public get membersThatJoinedRun(): GuildMember[] {
        return this._membersThatJoined;
    }

    /**
     * Creates a new `RaidInstance` object. Use this method to create a new instance instead of the constructor.
     * @param {GuildMember} memberInit The member that initiated this raid.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section where this raid is occurring. Note that the verified role must exist.
     * @param {IDungeonInfo} dungeon The dungeon that is being raided.
     * @param {IRaidOptions} [raidOptions] The raid options, if any.
     * @returns {RaidInstance | null} The `RaidInstance` object, or `null` if the AFK check channel or control panel
     * channel or the verified role is invalid or both channels don't have a category.
     */
    public static new(
        memberInit: GuildMember,
        guildDoc: IGuildInfo,
        section: ISectionInfo,
        dungeon: IDungeonInfo,
        raidOptions?: IRaidOptions
    ): RaidInstance | null {
        // Could put these all in one if-statement but too long.
        if (!memberInit.guild) return null;
        if (!GuildFgrUtilities.hasCachedRole(memberInit.guild, section.roles.verifiedRoleId)) return null;
        if (!GuildFgrUtilities.hasCachedChannel(memberInit.guild, section.channels.raids.afkCheckChannelId))
            return null;
        if (!GuildFgrUtilities.hasCachedChannel(memberInit.guild, section.channels.raids.controlPanelChannelId))
            return null;

        const afkChannel = GuildFgrUtilities.getCachedChannel(
            memberInit.guild,
            section.channels.raids.afkCheckChannelId
        )!;
        const controlPanel = GuildFgrUtilities.getCachedChannel(
            memberInit.guild,
            section.channels.raids.controlPanelChannelId
        )!;

        if (!afkChannel.parentId || !controlPanel.parentId || afkChannel.parentId !== controlPanel.parentId)
            return null;

        return new RaidInstance(memberInit, guildDoc, section, dungeon, raidOptions);
    }

    /**
     * Creates a new instance of `RaidInstance`. This method should be called when there is an active raid but no
     * corresponding `RaidInstance` object (e.g. when the bot restarted).
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {IRaidInfo} raidInfo The raid information.
     * @returns {Promise<RaidInstance | null>} The `RaidInstance` instance. `null` if an error occurred.
     */
    public static async createNewLivingInstance(
        guildDoc: IGuildInfo,
        raidInfo: IRaidInfo
    ): Promise<RaidInstance | null> {
        LOGGER.info("Creating new raid instance from active raid");

        const guild = GlobalFgrUtilities.getCachedGuild(guildDoc.guildId);
        if (!guild) return null;

        const memberInit = await GuildFgrUtilities.fetchGuildMember(guild, raidInfo.memberInit);
        if (!memberInit) return null;

        const section =
            raidInfo.sectionIdentifier === "MAIN"
                ? MongoManager.getMainSection(guildDoc)
                : guildDoc.guildSections.find((x) => x.uniqueIdentifier === raidInfo.sectionIdentifier);
        if (!section) return null;

        // Get base dungeons + custom dungeons
        const dungeon = DUNGEON_DATA.concat(guildDoc.properties.customDungeons).find(
            (x) => x.codeName === raidInfo.dungeonCodeName
        );
        if (!dungeon) return null;

        // Get various channels needed for this to work
        let raidVc: VoiceChannel | null = null;
        if (!raidInfo.vcless) {
            if (!raidInfo.vcId) return null;
            raidVc = GuildFgrUtilities.getCachedChannel<VoiceChannel>(guild, raidInfo.vcId);
            if (!raidVc) return null;
        }
        const afkCheckChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            guild,
            raidInfo.raidChannels.afkCheckChannelId
        );
        const controlPanelChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            guild,
            raidInfo.raidChannels.controlPanelChannelId
        );

        if (
            !afkCheckChannel ||
            !controlPanelChannel ||
            !afkCheckChannel.isText() ||
            !controlPanelChannel.isText()
        )
            return null;

        const controlPanelMsg = await GuildFgrUtilities.fetchMessage(
            controlPanelChannel as TextChannel,
            raidInfo.controlPanelMessageId
        );
        const afkCheckMsg = await GuildFgrUtilities.fetchMessage(
            afkCheckChannel as TextChannel,
            raidInfo.afkCheckMessageId
        );
        if (!afkCheckMsg || !controlPanelMsg) return null;

        // Create the raid manager instance.
        const rm = new RaidInstance(memberInit, guildDoc, section, dungeon, {
            vcless: raidInfo.vcless,
            location: raidInfo.location,
        });
        LOGGER.info(`${rm._instanceInfo} RaidInstance created`);

        rm._raidVc = raidVc;
        if (raidInfo.oldVcPerms) {
            rm._oldVcPerms = raidInfo.oldVcPerms.map((x) => {
                return {
                    allow: BigInt(x.allow),
                    deny: BigInt(x.deny),
                    id: x.id,
                    type: x.type,
                };
            });
        } else {
            rm._oldVcPerms = null;
        }

        rm._raidId = raidInfo.raidId;
        rm._afkCheckMsg = afkCheckMsg;
        rm._controlPanelMsg = controlPanelMsg;
        rm._raidStatus = raidInfo.status;
        rm._addedToDb = true;

        // If the raid has expired, abort the raid and return
        rm._startTime = raidInfo.startTime;
        rm._expTime = raidInfo.expirationTime;
        if (Date.now() > rm._expTime) {
            LOGGER.info(`${rm._instanceInfo} RaidInstance expired, cleaning.`);
            rm.cleanUpRaid(false).then();
            return null;
        }

        rm._thisFeedbackChan = GuildFgrUtilities.getCachedChannel<TextChannel>(
            guild,
            raidInfo.otherChannels.feedbackChannelId
        );
        rm._logChan = GuildFgrUtilities.getCachedChannel<ThreadChannel>(guild, raidInfo.otherChannels.logChannelId);
        rm._membersThatJoined = raidInfo.membersThatJoined
            .map((x) => GuildFgrUtilities.getCachedMember(guild, x))
            .filter((x) => x !== null) as GuildMember[];

        // Add early location entries.
        for await (const entry of raidInfo.earlyLocationReactions) {
            const member = await GuildFgrUtilities.fetchGuildMember(guild, entry.userId);
            if (!member) continue;
            await rm.addEarlyLocationReaction(member, entry.reactCodeName, entry.modifiers, false);
            rm._peopleToAddToVc.add(member.id);
        }

        rm._afkCheckButtons.forEach((btn) => {
            if (btn.customId === "join") {
                if (rm._raidStatus === RaidStatus.AFK_CHECK) {
                    btn.setDisabled(false);
                } else if (rm._raidStatus === RaidStatus.IN_RUN) {
                    btn.setDisabled(false);
                } else {
                    btn.setDisabled(true);
                }
                return;
            }
            if (!rm.stillNeedEssentialReact(btn.customId!)) {
                btn.setDisabled(true);
            }
        });

        if (rm._raidStatus === RaidStatus.PRE_AFK_CHECK || rm._raidStatus === RaidStatus.AFK_CHECK) {
            rm.startControlPanelCollector();
            rm.startIntervals();
            rm.startAfkCheckCollector();
        } else if (rm._raidStatus === RaidStatus.IN_RUN) {
            if (rm._vcless) {
                rm.startRaidRejoinCollector();
            }
            rm.startControlPanelCollector();
            rm.startIntervals();
        }

        RaidInstance.ActiveRaids.set(rm._afkCheckMsg.id, rm);
        return rm;
    }

    /**
     * Interprets the parse result, returning an embed with the relevant information.
     * @param {IParseResponse} parseSummary The parse summary.
     * @param {User} initiatedBy The user that initiated this.
     * @param {VoiceChannel} vc The voice channel.
     * @returns {Promise<MessageEmbed>} The embed.
     */
    public static async interpretParseRes(
        parseSummary: IParseResponse,
        initiatedBy: User,
        vc: VoiceChannel
    ): Promise<MessageEmbed> {
        const inVcNotInRaidFields = parseSummary.isValid ? parseSummary.inVcButNotInRaid : [];
        const inRaidNotInVcFields = parseSummary.isValid ? parseSummary.inRaidButNotInVC : [];

        const embed = MessageUtilities.generateBlankEmbed(initiatedBy, "RANDOM")
            .setTitle(`Parse Results for: **${vc?.name ?? "N/A"}**`)
            .setFooter({ text: "Completed Time:" })
            .setTimestamp();

        if (parseSummary.isValid) {
            embed.setDescription(
                new StringBuilder("Parse Successful.")
                    .appendLine()
                    .append(`- \`${parseSummary.inRaidButNotInVC.length}\` player(s) in /who screenshot, not in VC.`)
                    .appendLine()
                    .append(`- \`${parseSummary.inVcButNotInRaid.length}\` player(s) in VC, not in /who screenshot.`)
                    .appendLine(2)
                    .append(`__${parseSummary.whoRes.length} Names Parsed__`)
                    .appendLine()
                    .append(StringUtil.codifyString(parseSummary.whoRes.join(", ")))
                    .toString()
            );
        } else {
            embed.setDescription("An error occurred when trying to parse this screenshot. Please try again later.");
        }

        for (const field of ArrayUtilities.breakArrayIntoSubsets(inRaidNotInVcFields, 70)) {
            embed.addField("In /who, Not In Raid VC.", field.join(", "));
        }

        for (const field of ArrayUtilities.breakArrayIntoSubsets(inVcNotInRaidFields, 70)) {
            embed.addField("In Raid VC, Not In /who.", field.join(", "));
        }

        return embed;
    }

    /**
     * Parses a screenshot.
     * @param {string} url The url to the screenshot.
     * @param {VoiceChannel | null} vc The voice channel to check against.
     * @return {Promise<IParseResponse>} An object containing the parse results.
     */
    public static async parseScreenshot(url: string, vc: VoiceChannel | null): Promise<IParseResponse | null> {
        const toReturn: IParseResponse = { inRaidButNotInVC: [], inVcButNotInRaid: [], isValid: false, whoRes: [] };
        // No raid VC = no parse.
        if (!vc) return toReturn;
        // Make sure the image exists.
        try {
            // Make a request to see if this URL points to the right place.
            const result = await Bot.AxiosClient.head(url);
            if (result.status > 300) return toReturn;
        } catch (e) {
            LOGGER.error(e);
            return toReturn;
        }

        // Make the request.
        const data = await GlobalFgrUtilities.tryExecuteAsync(async () => {
            const res = await RealmSharperWrapper.parseWhoScreenshotOnly(url);
            return res ? res : null;
        });

        if (!data) return null;

        const parsedNames = data.names;
        toReturn.whoRes = parsedNames;
        if (parsedNames.length === 0) {
            return toReturn;
        }

        // Parse results means the picture must be valid.
        toReturn.isValid = true;
        // Begin parsing.
        // Get people in raid VC but not in the raid itself. Could be alts.
        vc.members.forEach((member) => {
            const igns = UserManager.getAllNames(member.displayName).map((x) => x.toLowerCase());
            //If vc member's name is not in parsed names, add them to InVcButNotInRaid
            if (!parsedNames.find((name) => igns.includes(name.toLowerCase()))) {
                toReturn.inVcButNotInRaid.push(member.displayName);
            }
            //Otherwise, they are in the VC and the raid.
        });

        // Get people in raid but not in the VC. Could be crashers.
        const allIgnsInVc = vc.members.map((x) => UserManager.getAllNames(x.displayName.toLowerCase())).flat();
        parsedNames.forEach((name) => {
            if (allIgnsInVc.includes(name.toLowerCase())) return;
            toReturn.inRaidButNotInVC.push(name);
        });

        return toReturn;
    }

    /**
     * Interprets the parse result, returning an embed with the relevant information.
     * @param {IParseResponse} parseSummary The parse summary.
     * @param {User} initiatedBy The user that initiated this.
     * @param {string} organizerName The user who initialized the raid.
     * @returns {Promise<MessageEmbed>} The embed.
     */
    public static async interpretVclessParseRes(
        parseSummary: IParseResponse,
        initiatedBy: User,
        organizerName: string,
    ): Promise<MessageEmbed> {
        const inVcNotInRaidFields = parseSummary.isValid ? parseSummary.inVcButNotInRaid : [];
        const inRaidNotInVcFields = parseSummary.isValid ? parseSummary.inRaidButNotInVC : [];

        const embed = MessageUtilities.generateBlankEmbed(initiatedBy, "RANDOM")
            .setTitle(`Parse Results for ${organizerName}'s Raid`)
            .setFooter({ text: "Completed Time:" })
            .setTimestamp();

        if (parseSummary.isValid) {
            embed.setDescription(
                new StringBuilder("Parse Successful.")
                    .appendLine()
                    .append(`- \`${parseSummary.inRaidButNotInVC.length}\` player(s) in /who screenshot, not in Raid.`)
                    .appendLine()
                    .append(`- \`${parseSummary.inVcButNotInRaid.length}\` player(s) in Raid, not in /who screenshot.`)
                    .appendLine(2)
                    .append(`__${parseSummary.whoRes.length} Names Parsed__`)
                    .appendLine()
                    .append(StringUtil.codifyString(parseSummary.whoRes.join(", ")))
                    .toString()
            );
        } else {
            embed.setDescription("An error occurred when trying to parse this screenshot. Please try again later.");
        }

        for (const field of ArrayUtilities.breakArrayIntoSubsets(inRaidNotInVcFields, 70)) {
            embed.addField("In /who, Not In Raid.", field.join(", "));
        }

        for (const field of ArrayUtilities.breakArrayIntoSubsets(inVcNotInRaidFields, 70)) {
            embed.addField("In Raid, Not In /who.", field.join(", "));
        }

        return embed;
    }

    /**
     * Parses a screenshot for a vcless raid.
     * @param {string} url The url to the screenshot.
     * @param {VoiceChannel | null} vc The voice channel to check against.
     * @return {Promise<IParseResponse>} An object containing the parse results.
     */
    public static async parseVclessRaid(url: string, raidId: string | null, guildDoc: IGuildInfo, guild: Guild): Promise<IParseResponse | null> {
        const toReturn: IParseResponse = { inRaidButNotInVC: [], inVcButNotInRaid: [], isValid: false, whoRes: [] };

        if (!raidId) return toReturn;
        const raidInfo = guildDoc.activeRaids.find(raidInfo => raidInfo.raidId === raidId);
        if (!raidInfo) return toReturn;

        const idsInRaid = raidInfo.membersThatJoined;
        const membersInRaid: GuildMember[] = [];
        for await (const id of idsInRaid) {
            const member = await UserManager.resolveMember(guild, id);
            if (!member) continue;
            membersInRaid.push(member.member);
        }

        // Make sure the image exists.
        try {
            // Make a request to see if this URL points to the right place.
            const result = await Bot.AxiosClient.head(url);
            if (result.status > 300) return toReturn;
        } catch (e) {
            LOGGER.error(e);
            return toReturn;
        }

        // Make the request.
        const data = await GlobalFgrUtilities.tryExecuteAsync(async () => {
            const res = await RealmSharperWrapper.parseWhoScreenshotOnly(url);
            return res ? res : null;
        });

        if (!data) return null;

        const parsedNames = data.names;
        toReturn.whoRes = parsedNames;
        if (parsedNames.length === 0) {
            return toReturn;
        }

        // Parse results means the picture must be valid.
        toReturn.isValid = true;
        // Begin parsing.
        // Get people in raid but not in the screenshot itself. Could be alts.
        membersInRaid.forEach((member) => {
            const igns = UserManager.getAllNames(member.displayName).map((x) => x.toLowerCase());
            //If raid member's name is not in parsed names, add them to InVcButNotInRaid
            if (!parsedNames.find((name) => igns.includes(name.toLowerCase()))) {
                toReturn.inVcButNotInRaid.push(member.displayName);
            }
            //Otherwise, they are in the raid and the screenshot.
        });

        // Get people in screenshot but not in the raid. Could be crashers.
        const allIgnsInVc = membersInRaid.map((x) => UserManager.getAllNames(x.displayName.toLowerCase())).flat();
        parsedNames.forEach((name) => {
            if (allIgnsInVc.includes(name.toLowerCase())) return;
            toReturn.inRaidButNotInVC.push(name);
        });

        return toReturn;
    }

    /**
     * Checks whether the raid has a vc, if it is not vcless.  Returns true if vcless.
     * @returns true if the raid is vcless or if the raid has a vc.  Returns false if the raid is not vcless and h
     */
    private vcExists(): boolean {
        if (this._vcless) return true;
        if (!this._raidVc) return false;
        return true;
    }


    /**
     * Starts a pre-AFK check for this raid instance. During the pre-AFK check, only priority reactions can join the VC.
     * @throws {ReferenceError} If the verified role for the section does not exist.
     */
    public async startPreAfkCheck(): Promise<void> {
        LOGGER.info(`${this._instanceInfo} Starting Pre-AFK Check`);
        const verifiedRole = await GuildFgrUtilities.fetchRole(this._guild, this._raidSection.roles.verifiedRoleId);
        if (!verifiedRole) throw new ReferenceError("Verified role not defined.");

        // Don't use setRaidStatus since we didn't save the afk check info yet
        this._raidStatus = RaidStatus.PRE_AFK_CHECK;

        // Obtain dungeon color for embeds
        if (this._dungeon.dungeonColors.length !== 0) {
            this._embedColor = ArrayUtilities.getRandomElement(this._dungeon.dungeonColors);
        }

        // Raid VC MUST be initialized first before we can use a majority of the helper methods.
        const vc = await new Promise<VoiceChannel | null>(async (resolve) => {
            if (this._raidVc) {
                await this._raidVc.edit({
                    userLimit: this._raidLimit,
                    permissionOverwrites: this.getPermissionsForRaidVc(false),
                });

                return resolve(this._raidVc);
            }
            if (this._vcless) return resolve(null);

            const v = await this._guild.channels.create(`${this._leaderName}'s Raid`, {
                type: "GUILD_VOICE",
                userLimit: this._raidLimit,
                permissionOverwrites: this.getPermissionsForRaidVc(false),
                parent: this._afkCheckChannel!.parent!,
            });

            return resolve(v as VoiceChannel);
        });

        if (!this._vcless) {
            if (!vc) return;

            if (!this._oldVcPerms) {
                vc.setPosition(this._raidSection.otherMajorConfig.afkCheckProperties.defaultPosition ?? 0).then();
            }

            this._raidVc = vc as VoiceChannel;
        }

        // Create our initial control panel message.
        this._controlPanelMsg = await (this._controlPanelChannel.send({
            embeds: [this.getControlPanelEmbed()!],
            components: RaidInstance.CP_PRE_AFK_BUTTONS,
        }).then(m => m.edit({ content: this._memberInit.toString() })));
        this.startControlPanelCollector();

        const logChannel = await new Promise<ThreadChannel | null>(async (resolve) => {
            if (!this._raidSection.otherMajorConfig.afkCheckProperties.createLogChannel) return resolve(null);

            const logChan = await this.controlPanelMsg?.startThread({
                name: `${this._leaderName}-raid-logs`,
                autoArchiveDuration: 1440
            }).catch(console.log);

            if (!logChan) return resolve(null);

            return resolve(logChan);
        });

        this._logChan = logChannel;


        // Create our initial AFK check message.
        this._afkCheckMsg = await this._afkCheckChannel.send({
            content: `@here ${this._mentionRoles}`,
            embeds: [this.getAfkCheckEmbed()!],
            components: AdvancedCollector.getActionRowsFromComponents(this._afkCheckButtons),
        });

        // Add this raid to the database so we can refer to it in the future.
        await this.addRaidToDatabase();
        // Start our intervals so we can continuously update the embeds.
        this.startIntervals();
        this.startAfkCheckCollector();
        RaidInstance.ActiveRaids.set(this._afkCheckMsg.id, this);
    }

    /**
     * Starts an AFK check for this raid instance.
     * @throws {ReferenceError} If the verified role for the section does not exist.
     */
    public async startAfkCheck(): Promise<void> {
        if (!this._afkCheckMsg || !this._controlPanelMsg || !this._afkCheckChannel) return;
        if (!this.vcExists()) return;

        LOGGER.info(`${this._instanceInfo} Starting AFK Check`);

        await this._controlPanelMsg.edit({
            content: this._memberInit.toString(),
            embeds: [this.getControlPanelEmbed()!],
            components: [],
        });

        this.logEvent("AFK check has been started.", true).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
        if (!this._vcless) {
            if (!this._raidVc) return;
            const tempMsg = await this._afkCheckChannel.send({
                content: `${this._raidVc.toString()} will be unlocked in 5 seconds. Prepare to join!`,
            });
            const tempMsgControl = await this._controlPanelChannel.send({
                content: `${this._raidVc.toString()} will be unlocked in 5 seconds.`,
            });
            await MiscUtilities.stopFor(5 * 1000);
            tempMsg.delete().catch();
            tempMsgControl.delete().catch();
            LOGGER.info(`${this._instanceInfo} Opening VC`);
            await this._raidVc.permissionOverwrites.set(this.getPermissionsForRaidVc(true));
        } else {
            const tempMsg = await this._afkCheckChannel.send({
                content: "Join button will be enabled in 5 seconds. Prepare to join!",
            });
            const tempMsgControl = await this._controlPanelChannel.send({
                content: "Join button will be enabled in 5 seconds.",
            });
            await MiscUtilities.stopFor(5 * 1000);
            tempMsg.delete().catch();
            tempMsgControl.delete().catch();
            LOGGER.info(`${this._instanceInfo} Enabling Raid Join`);
            this._joinButton.setDisabled(false);
        }


        // We are officially in AFK check mode.
        // We do NOT start the intervals OR collector since pre-AFK and AFK have the exact same collectors/intervals.
        await this.setRaidStatus(RaidStatus.AFK_CHECK);
        await this.sendLocToElite();
        await this.stopAllIntervalsAndCollectors();
        this.startIntervals();
        this.startControlPanelCollector();
        this.startAfkCheckCollector();

        // However, we forcefully edit the embeds.
        await Promise.all([
            this._afkCheckMsg.edit({
                content: "@here",
                embeds: [this.getAfkCheckEmbed()!],
                components: AdvancedCollector.getActionRowsFromComponents(this._afkCheckButtons),
            }),
            this._controlPanelMsg.edit({
                content: this._memberInit.toString(),
                embeds: [this.getControlPanelEmbed()!],
                components: RaidInstance.CP_AFK_BUTTONS,
            }),
        ]);
        AdvancedCollector.reactFaster(this._afkCheckMsg, this._nonEssentialReactions);
    }

    /**
     * Button collector to confirm whether or not someone wants to clear another person's headcount
     * @private
     */
    private async showWrongLeaderbuttons(i: ButtonInteraction) {
        const wrongLeaderButtons: MessageActionRow[] = AdvancedCollector.getActionRowsFromComponents([
            new MessageButton()
                .setCustomId("CONFIRM-RAID")
                .setStyle("SUCCESS")
                .setLabel("Yes"),
            new MessageButton()
                .setCustomId("ABORT-RAID")
                .setStyle("DANGER")
                .setLabel("No")
        ]);

        const confirmationMessage = await i.followUp({
            content: `**__This is not your AFK-Check__**.\nAre you sure you want to abort ${this._memberInit}'s AFK-Check?`,
            components: wrongLeaderButtons,
            ephemeral: true
        });

        const collector = i.channel!.createMessageComponentCollector({
            componentType: "BUTTON", // enum is outdated?
            time: 30_000,
            filter: (int) => int.user.id === i.user.id && int.message.id === confirmationMessage.id
        });

        collector.on("collect", (button: ButtonInteraction<"cached">) => {
            if (button.customId === "ABORT-RAID") {
                return button.update({ content: "Did not end afk check.", components: [] });
            } else if (button.customId === "CONFIRM-RAID") {
                LOGGER.info(`${button.member.nickname || button.user.username} ended ${this._memberInit.nickname}'s ${this._dungeon.dungeonName} afk check.`);
                this.endRaid(button.member).then();
                return button.update({ content: "Ended afk check.", components: [] });
            }
        });

        collector.on("end", (collected) => {
            if (collected.size === 0) i.editReply({ content: "Ran out of time.", components: [] });
        });
    }

    /**
     * Ends the AFK check. There will be no post-AFK check. This will create the feedback channel, if at all.
     * @param {GuildMember | null} memberEnded The member that ended the AFK check, or `null` if it was ended
     * automatically.
     */
    public async endAfkCheck(memberEnded: GuildMember | User | null): Promise<void> {
        // No raid VC means we haven't started AFK check.
        if (!this._afkCheckMsg || !this._controlPanelMsg || this._raidStatus !== RaidStatus.AFK_CHECK)
            return;
        if (!this.vcExists()) return;

        LOGGER.info(`${this._instanceInfo} Ending AFK Check`);
        // Resolve the member that ended the AFK check.
        let member: GuildMember | null;
        if (memberEnded instanceof User)
            member = await GuildFgrUtilities.fetchGuildMember(this._guild!, memberEnded.id);
        else member = memberEnded;

        this.logEvent(
            member
                ? `${member.displayName} (${member.id}) has ended the AFK check.`
                : "The AFK check has been ended automatically.",
            true
        ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));

        // Update the database so it is clear that we are in raid mode.
        await this.stopAllIntervalsAndCollectors();
        await this.setRaidStatus(RaidStatus.IN_RUN);
        this.startIntervals();
        this.startControlPanelCollector();
        this.startAfkCheckCollector();

        // Lock the VC as well.
        if (!this._vcless) {
            if (!this._raidVc) return;
            LOGGER.info(`${this._instanceInfo} Locking VC`);
            await Promise.all([
                this._raidVc.edit({
                    permissionOverwrites: this.getPermissionsForRaidVc(false),
                }),
                (async () => {
                    if (this._oldVcPerms) {
                        return;
                    }

                    await this._raidVc?.edit({
                        position:
                            this._raidVc?.parent?.children
                                .filter((x) => x.type === "GUILD_VOICE")
                                .map((x) => x.position)
                                .sort((a, b) => b - a)[0] ?? 0,
                    });
                })(),
            ]);

        } else {
            LOGGER.info(`${this._instanceInfo} Locking Raid`);
            this._raidLocked = true;
        }


        // Add all members that were in the VC at the time.
        await this.updateMembersArr();

        // End the collector since it's useless. We'll use it again though.
        this.stopAllIntervalsAndCollectors("AFK Check ended.").catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));

        // Remove reactions from AFK check.
        await this._afkCheckMsg.reactions.removeAll().catch();

        // Edit the control panel accordingly and re-react and start collector + intervals again.
        await this._controlPanelMsg
            .edit({
                content: this._memberInit.toString(),
                embeds: [this.getControlPanelEmbed()!],
                components: RaidInstance.CP_RAID_BUTTONS,
            })
            .catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));

        // Edit the afk check panel to include reconnect
        await this._afkCheckMsg
            .edit({
                content: "@here",
                embeds: [this.getAfkCheckEmbed()!],
                components: AdvancedCollector.getActionRowsFromComponents([
                    (!this._vcless) ?
                        new MessageButton()
                            .setCustomId(`reconnect_${this._afkCheckMsg.id}`)
                            .setEmoji(EmojiConstants.INBOX_EMOJI)
                            .setLabel("Reconnect")
                            .setStyle("SUCCESS")
                        : this._joinButton,
                ]),
            })
            .catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));

        if (this._vcless) this.startRaidRejoinCollector();
        this.startControlPanelCollector();
        this.startIntervals();

        let feedbackChannel: TextChannel | null = null;

        if (this._feedbackBaseChannel && this._feedbackBaseChannel.parent && this._raidStorageChan) {
            feedbackChannel = await GlobalFgrUtilities.tryExecuteAsync(async () => {
                return this._guild.channels.create(`${this._leaderName}-feedback`, {
                    parent: this._feedbackBaseChannel!.parent!,
                    type: "GUILD_TEXT",
                    rateLimitPerUser: 5 * 60,
                    permissionOverwrites: [
                        {
                            id: this._raidSection.roles.verifiedRoleId,
                            allow: ["VIEW_CHANNEL"],
                        },
                        {
                            id: this._guild.roles.everyone,
                            deny: [
                                "VIEW_CHANNEL",
                                "ADD_REACTIONS",
                                "ATTACH_FILES",
                                "EMBED_LINKS",
                                "CREATE_PUBLIC_THREADS",
                                "CREATE_PRIVATE_THREADS",
                                "USE_EXTERNAL_STICKERS",
                            ],
                        },
                        {
                            id: Bot.BotInstance.client.user!.id,
                            allow: ["ADD_REACTIONS", "VIEW_CHANNEL"],
                        },
                        {
                            id: this._guildDoc.roles.staffRoles.teamRoleId,
                            allow: ["VIEW_CHANNEL"],
                        },
                    ],
                    topic: `${this._raidId} - Do Not Edit This!`,
                });
            });
        }
        if (!feedbackChannel) return;
        this._thisFeedbackChan = feedbackChannel;

        const feedbackMsg = await feedbackChannel.send({
            embeds: [
                MessageUtilities.generateBlankEmbed(member ?? this._memberInit)
                    .setTitle(`Feedback Channel for **${member?.displayName ?? this._memberInit.displayName}**`)
                    .setDescription(
                        new StringBuilder()
                            .append(`__This is for the ${this._dungeon.dungeonName} raid organized by ${this._leaderName}.__`)
                            .appendLine()
                            .append(`You can leave feedback for ${member ?? this._memberInit} here by doing the`)
                            .append(" following:")
                            .appendLine()
                            .append(`- React to **this** message with either a ${EmojiConstants.LONG_UP_ARROW_EMOJI},`)
                            .append(
                                ` ${EmojiConstants.LONG_SIDEWAYS_ARROW_EMOJI}, or ${EmojiConstants.LONG_DOWN_ARROW_EMOJI} to`
                            )
                            .append(" indicate this leader's performance.")
                            .appendLine()
                            .append("- You can also send feedback messages in this channel directly. Keep in mind that")
                            .append(" all staff members can see this channel (including the raid leader). So, please")
                            .append(" be civil. Provide either constructive positive or negative feedback. If you")
                            .append(" want, you may also modmail your feedback by using the `modmail` command.")
                            .appendLine(2)
                            .append("**Keep in mind that there is a 5 minute slowmode in this channel.**")
                            .toString()
                    )
                    .setTimestamp(),
            ],
        });

        AdvancedCollector.reactFaster(feedbackMsg, [
            EmojiConstants.LONG_DOWN_ARROW_EMOJI,
            EmojiConstants.LONG_SIDEWAYS_ARROW_EMOJI,
            EmojiConstants.LONG_UP_ARROW_EMOJI,
        ]);

        await this.setThisFeedbackChannel(feedbackChannel);
        await feedbackMsg.pin().catch();
    }

    /**
     * Ends the raid.
     * @param {GuildMember | User | null} memberEnded The member that ended the raid or aborted the AFK check.
     * @param {boolean} keepVc Whether to keep the VC.
     */
    public async endRaid(memberEnded: GuildMember | User | null, keepVc: boolean = false): Promise<void> {
        // No raid VC means we haven't started AFK check.
        if (!this._afkCheckMsg || !this._controlPanelMsg) return;
        if (!this.vcExists()) return;
        LOGGER.info(`${this._instanceInfo} Ending Raid`);

        if (this._raidStatus === RaidStatus.PRE_AFK_CHECK || this._raidStatus === RaidStatus.AFK_CHECK) {
            this._raidStatus = RaidStatus.ABORTED;
        } else {
            this._raidStatus = RaidStatus.RUN_FINISHED;
        }

        if (!memberEnded) {
            memberEnded = this._memberInit;
        }

        const resolvedMember =
            memberEnded instanceof GuildMember
                ? memberEnded
                : GuildFgrUtilities.getCachedMember(this._guild, memberEnded.id);

        const memberThatEnded =
            memberEnded instanceof User
                ? GuildFgrUtilities.getCachedMember(this._guild, memberEnded.id) ?? this._memberInit
                : memberEnded;

        // Stop the collector.
        // We don't care about the result of this function, just that it should run.
        if (!this._vcless) {
            this._membersThatLeftChannel = this.membersThatJoinedRun.filter(member => ![...this._raidVc!.members.values()].includes(member));
        }
        this.cleanUpRaid(false, keepVc).then();

        // Give point refunds if applicable
        const earlyLocPts = this._pplWithEarlyLoc.get("EARLY_LOC_POINTS");
        if (this._raidStatus === RaidStatus.ABORTED && earlyLocPts) {
            await Promise.all(earlyLocPts.map((x) => LoggerManager.logPoints(x.member, this._earlyLocPointCost)));
        }

        // If this method was called during the AFK check, simply abort the AFK check.
        if (this._raidStatus === RaidStatus.ABORTED) {
            this.logEvent(
                resolvedMember
                    ? `${resolvedMember.displayName} (${resolvedMember.id}) has aborted the AFK check.`
                    : "The AFK check has been aborted automatically.",
                false
            ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));

            return;
        }

        this.logEvent(
            resolvedMember
                ? `${resolvedMember.displayName} (${resolvedMember.id}) has ended the raid.`
                : "The raid has been ended automatically.",
            false
        ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));

        if (this._raidStatus === RaidStatus.RUN_FINISHED) {
            this.logRun(memberThatEnded).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
        }

        // Check feedback channel
        if (!this._thisFeedbackChan) return;

        await this._thisFeedbackChan.send({
            content:
                "You have **five** minutes remaining to submit your feedback. If you can't submit your feedback" +
                " in time, you can still submit your feedback via modmail.",
        });

        setTimeout(async () => {
            if (!this._thisFeedbackChan) {
                if (!this._raidStorageChan) return;

                this.compileHistory(this._raidStorageChan).then();
                return;
            }

            if (!this._raidStorageChan) {
                await this._thisFeedbackChan.delete().catch();
                return;
            }

            const [pinnedMsgs, allMsgs] = await Promise.all([
                this._thisFeedbackChan.messages.fetchPinned(),
                // Assuming that a lot of people won't submit feedback
                this._thisFeedbackChan.messages.fetch({ limit: 100 }),
            ]);

            const sb = new StringBuilder()
                .append("================= LEADER FEEDBACK INFORMATION =================")
                .appendLine();

            const botMsg = pinnedMsgs.filter((x) => x.author.bot).first();
            if (botMsg) {
                const m = await botMsg.fetch();
                const [upvotes, noPref, downvotes] = await Promise.all([
                    m.reactions.cache.get(EmojiConstants.LONG_UP_ARROW_EMOJI)?.fetch(),
                    m.reactions.cache.get(EmojiConstants.LONG_SIDEWAYS_ARROW_EMOJI)?.fetch(),
                    m.reactions.cache.get(EmojiConstants.LONG_DOWN_ARROW_EMOJI)?.fetch(),
                ]);

                if (upvotes) sb.append(`- Upvotes      : ${upvotes.count - 1}`).appendLine();
                if (noPref) sb.append(`- No Preference: ${noPref.count - 1}`).appendLine();
                if (downvotes) sb.append(`- Downvotes    : ${downvotes.count - 1}`).appendLine();
            }

            const otherFeedbackMsgs = allMsgs.filter((x) => !x.author.bot);
            for (const [, feedbackMsg] of otherFeedbackMsgs) {
                sb.append(`Feedback by ${feedbackMsg.author.tag} (${feedbackMsg.author.id})`)
                    .appendLine()
                    .append("=== BEGIN ===")
                    .appendLine()
                    .append(feedbackMsg.content)
                    .appendLine()
                    .append("=== END ===")
                    .appendLine(2);
            }

            await Promise.all([
                this.compileHistory(this._raidStorageChan, sb.toString()),
                this._thisFeedbackChan.delete(),
            ]);
        }, 5 * 60 * 1000);
    }

    /**
     * A reusable function to show a modal to collect information about a key popper, completes and amount popped to log chains
     * @param {ButtonInteraction} i The button interaction initiating a modal 
     */
    private async provideChainLogModal(i: ButtonInteraction<"cached">): Promise<void> {
        let trackedUser: GuildMember | null = null;
        let trackedDungeonKey: string | null = null;

        // Pop a modal and show the user information
        const chainLogModal = new Modal()
            .setCustomId("chain_log_modal")
            .setTitle("Chain Logging - Same type as raid panel!");

        const nameInput = new TextInputComponent()
            .setCustomId("chain_log_name")
            .setLabel("In-game name of key-popper")
            .setStyle("SHORT")
            .setRequired(true);

        const allKeys = this._allEssentialOptions.filter((x) => x.type === "KEY" || x.type === "NM_KEY");
        if (allKeys.first()) {
            const probablePoppers = this._pplWithEarlyLoc.get(allKeys.firstKey()!);
            if (probablePoppers && probablePoppers.length > 0) {
                const probablePopper = probablePoppers[0];
                nameInput.setRequired(false)
                    .setPlaceholder(`Leave blank for ${probablePopper.member.displayName}`);

                trackedUser = probablePopper.member;
                trackedDungeonKey = allKeys.firstKey()!;
            }
        }


        const amountInput = new TextInputComponent()
            .setCustomId("chain_log_amount")
            .setLabel("Amount of popped dungeon")
            .setStyle("SHORT")
            .setPlaceholder("Leave blank for 1");

        const actionRows = [
            new MessageActionRow<TextInputComponent>().addComponents(nameInput),
            new MessageActionRow<TextInputComponent>().addComponents(amountInput)
        ];
        chainLogModal.addComponents(...actionRows);

        await i.showModal(chainLogModal);
        // Collect inputs

        // Sorry but I am NOT using the interactioncollector we have
        const collector = new InteractionCollector(Bot.BotInstance.client, {
            channel: i.channelId,
            interactionType: InteractionTypes.MODAL_SUBMIT,
            time: 30_000,
            max: 1,
            filter: (modalInteraction: ModalSubmitInteraction) => {
                const correctUser = i.user.id === modalInteraction.user.id;
                if (!correctUser) modalInteraction.reply({ content: "You are not the leader of this raid.", ephemeral: true });
                // should other raid leaders be able to chain log?
                return correctUser;
            }
        });

        collector.on("collect", async (modalInteraction: ModalSubmitInteraction) => {
            // Log chain pops for the key user here.
            const keyPopper = modalInteraction.fields.getTextInputValue("chain_log_name");
            let amountPopped = Number.parseInt(modalInteraction.fields.getTextInputValue("chain_log_amount"));
            if (Number.isNaN(amountPopped)) {
                amountPopped = 1;
            }

            if (!trackedUser) {
                const findResult = await UserManager.resolveMember(modalInteraction.guild!, keyPopper);
                if (!findResult || !findResult?.member) {
                    modalInteraction.reply({ content: "Couldn't find that user in this server.", ephemeral: true });
                    return;
                }
                trackedUser = findResult.member;
            }

            if (!trackedDungeonKey) {
                if (this._dungeon.keyReactions.length > 1) {
                    modalInteraction.reply({ content: "This dungeon is too complex for now.", ephemeral: true });
                    return;
                }

                trackedDungeonKey = this._dungeon.keyReactions[0].mapKey;
            }

            // this should probably be logged in a channel somewhere for admins to see
            LOGGER.info(`[${modalInteraction.guild?.name}] ${(modalInteraction.member as GuildMember).displayName}`
                + ` just logged ${amountPopped} ${trackedDungeonKey}s for ${trackedUser.displayName}`);
            LoggerManager.logKeyUse(trackedUser!, trackedDungeonKey!, amountPopped);

            // Try to get completes for members
            const membersAtEnd: GuildMember[] = [];
            const membersThatLeft: GuildMember[] = [];

            const chainLogButtons = new MessageActionRow();
            if (!this._vcless) {
                const voiceUsersButton = new MessageButton()
                    .setCustomId("chain_log_use_vc")
                    .setLabel("Users in VC")
                    .setEmoji(EmojiConstants.MICROPHONE_EMOJI)
                    .setStyle("PRIMARY");

                chainLogButtons.addComponents(voiceUsersButton);
            }
            const skipButton = new MessageButton()
                .setCustomId("chain_log_skip_completes")
                .setLabel("SKIP")
                .setEmoji(EmojiConstants.LONG_RIGHT_TRIANGLE_EMOJI)
                .setStyle("DANGER");

            chainLogButtons.addComponents(skipButton);

            const originalMessage = modalInteraction.reply({
                content: `Collected and logged key pop for ${trackedUser.displayName}. Please upload a screenshot`
                    + " of the members that completed the run or click the `SKIP` button.",
                components: [chainLogButtons],
                fetchReply: true,
            });

            let dungeonId = this._dungeon.codeName;
            if (!this._dungeon.isBuiltIn) {
                const otherId = (this._dungeon as ICustomDungeonInfo).logFor;
                if (otherId) {
                    dungeonId = otherId;
                }
            }

            let attachment: MessageAttachment | null = null;
            const resObj = await AdvancedCollector.startDoubleCollector<Message>(
                {
                    oldMsg: originalMessage as unknown as Message<true>, // it can't be apimessage because bot isn't http only
                    cancelFlag: "cancel",
                    targetChannel: this._controlPanelChannel,
                    targetAuthor: modalInteraction.user,
                    deleteBaseMsgAfterComplete: false,
                    deleteResponseMessage: false,
                    duration: 5 * 60 * 1000,
                    acknowledgeImmediately: true,
                    clearInteractionsAfterComplete: false,
                },
                (m: Message) => {
                    if (m.attachments.size === 0) return;

                    // Images have a height property, non-images don't.
                    const imgAttachment = m.attachments.find((x) => x.height !== null);
                    if (!imgAttachment) {
                        m.delete().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                        return;
                    }

                    attachment = imgAttachment;
                    return m;
                }
            );

            if (!resObj) {
                // can't simply cast to Message because type overlaps -> we know it CANT be APIMessage because we aren't HTTP only
                (originalMessage as unknown as Message<true>).delete().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return;
            }

            if (resObj instanceof Message && attachment) {
                const data = await GlobalFgrUtilities.tryExecuteAsync(async () => {
                    const res = await RealmSharperWrapper.parseWhoScreenshotOnly(attachment!.url);
                    return res ? res : null;
                });
                LOGGER.info(`${this._instanceInfo} Names found in completion: ${data?.names}`);
                resObj.delete().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                if (data && data.names.length > 0) {
                    for (const memberThatJoined of this._membersThatJoined) {
                        const names = UserManager.getAllNames(memberThatJoined.displayName, true);
                        // If we can find at least one name (in the person's display name) that is also in the
                        // /who, then give them credit
                        if (data.names.some((x) => names.includes(x.toLowerCase()))) {
                            membersAtEnd.push(memberThatJoined);
                        }
                        else if (memberThatJoined.id !== modalInteraction.user.id) membersThatLeft.push(memberThatJoined);
                    }

                    await Promise.all(membersThatLeft.map((x) => LoggerManager.logDungeonRun(x, dungeonId, false, amountPopped)));
                    await Promise.all(membersAtEnd.map((x) => LoggerManager.logDungeonRun(x, dungeonId, true, amountPopped)));
                }
            }

            // log quota for the leader
            await LoggerManager.logDungeonLead(
                modalInteraction.member as GuildMember,
                dungeonId,
                RunResult.Complete,
                amountPopped
            );

            const quotaToUse = QuotaManager.findBestQuotaToAdd(
                modalInteraction.member as GuildMember,
                this._guildDoc,
                "RunComplete",
                dungeonId
            );

            if (quotaToUse) {
                await QuotaManager.logQuota(
                    modalInteraction.member as GuildMember,
                    quotaToUse,
                    `RunComplete:${dungeonId}`,
                    amountPopped
                );
            }

            // Giving completes to those who were in VC instead of asking for a /who
            if (!(resObj instanceof Message) && resObj.customId) {
                if (resObj.customId === "chain_log_use_vc") { // Else, it is the "skip" button    
                    // Filter against those who originally joined VC to remove those who left.
                    const lastInVC = this._membersThatJoined.filter(member => !this._membersThatLeftChannel.includes(member) && modalInteraction.user.id !== member.id);

                    membersAtEnd.push(...lastInVC.values());
                    membersThatLeft.push(...this._membersThatLeftChannel);

                    await Promise.all(membersThatLeft.map((x) => LoggerManager.logDungeonRun(x, dungeonId, false, amountPopped)));
                    await Promise.all(membersAtEnd.map((x) => LoggerManager.logDungeonRun(x, dungeonId, true, amountPopped)));
                }
            }

            modalInteraction.editReply({
                content: `Logged chain. Key: \`${trackedUser.displayName}\`. Dungeon: \`${trackedDungeonKey}\`.`,
                components: []
            });
            return;
        });
    }

    /**
     * Gets the corresponding `IRaidInfo` object. Everything should be initialized before this is called or this
     * will return null.
     * @returns {IRaidInfo | null} The raid object, which can be saved to a database. `null` if this raid/AFK check
     * has not been started yet.
     */
    public getRaidInfoObject(): IRaidInfo | null {
        if (!this._afkCheckMsg || !this._controlPanelMsg) return null;
        if (!this.vcExists()) return null;

        const raidObj: IRaidInfo = {
            dungeonCodeName: this._dungeon.codeName,
            startTime: this._startTime,
            expirationTime: this._expTime,
            memberInit: this._memberInit.id,
            memberInitName: this._memberInit.displayName,
            raidChannels: this._raidSection.channels.raids,
            afkCheckMessageId: this._afkCheckMsg.id,
            controlPanelMessageId: this._controlPanelMsg.id,
            oldVcPerms: this._oldVcPerms ? DjsToProjUtilities.toBasicOverwriteDataArr(this._oldVcPerms) : null,
            status: this._raidStatus,
            vcId: this._raidVc?.id ?? null,
            raidId: this._raidId,
            vcless: this._vcless,
            location: this._location,
            sectionIdentifier: this._raidSection.uniqueIdentifier,
            earlyLocationReactions: [],
            otherChannels: {
                logChannelId: this._logChan?.id ?? "",
                feedbackChannelId: this._thisFeedbackChan?.id ?? "",
            },
            membersThatJoined: [],
            runStats: {
                completed: 0,
                failed: 0,
            },
        };

        for (const [key, val] of this._pplWithEarlyLoc) {
            val.forEach((obj) => {
                raidObj.earlyLocationReactions.push({
                    userId: obj.member.id,
                    reactCodeName: key,
                    modifiers: obj.modifiers,
                });
            });
        }

        return raidObj;
    }

    /**
     * Cleans the raid up. This will remove the raid voice channel, delete the control panel message, and remove
     * the raid from the database.
     *
     * @param {boolean} force Whether this should delete all channels related to this raid. Useful if one component
     * of the raid is deleted.
     * @param {boolean} keepVc Whether to keep the VC. Note that this will be ignored if `force` is `true`.
     */
    public async cleanUpRaid(force: boolean, keepVc: boolean = false): Promise<void> {
        this._isValid = false;
        LOGGER.info(`${this._instanceInfo} Cleaning up raid`);
        await this.stopAllIntervalsAndCollectors();
        // Step 1: Remove from ActiveRaids collection
        if (this._afkCheckMsg) {
            RaidInstance.ActiveRaids.delete(this._afkCheckMsg.id);
        }

        await Promise.all([
            // Step 2: Remove the raid object. We don't need it anymore.
            // Also stop all collectors.
            this.removeRaidFromDatabase(),
            // Step 3: Remove the control panel message.
            GlobalFgrUtilities.tryExecuteAsync(async () => {
                if (!this._controlPanelMsg) return;
                if (!force) {
                    await this._controlPanelMsg
                        .edit({
                            content: this._memberInit.toString(),
                            embeds: [this.getControlPanelEmbed()!],
                            components: [],
                        })
                        .catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                    return;
                }
                await MessageUtilities.tryDelete(this._controlPanelMsg);
                return;
            }),

            // Step 4: Remove the AFK check message.
            GlobalFgrUtilities.tryExecuteAsync(async () => {
                if (!this._afkCheckMsg) return;
                if (!force) {
                    await this._afkCheckMsg
                        .edit({
                            embeds: [this.getAfkCheckEmbed()!],
                            components: [],
                        })
                        .catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                    await this._afkCheckMsg.reactions.removeAll().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                    return;
                }
                await MessageUtilities.tryDelete(this.afkCheckMsg);
                return;
            }),
            // Step 5: Delete the raid VC
            GlobalFgrUtilities.tryExecuteAsync(async () => {
                if (this._vcless) return;

                if (keepVc && !force) {
                    return;
                }

                if (this._oldVcPerms) {
                    await this._raidVc?.permissionOverwrites.set(this._oldVcPerms);
                    return;
                }

                await this._raidVc?.delete();
                this._raidVc = null;
            }),
            // Step 6: Delete the logging channel
            GlobalFgrUtilities.tryExecuteAsync(async () => {
                await this._logChan?.send("Logging has ended. No further messages will be sent.");
                await this._logChan?.setArchived(true, "Raid ended");
                this._logChan = null;
            }),
        ]);

        if (force) {
            await GlobalFgrUtilities.tryExecuteAsync(async () => {
                await this._thisFeedbackChan?.delete();
            });
        }
    }

    /**
     * Gets the relevant permissions for this AFK check.
     * @param {boolean} isNormalAfk Whether the permissions are for a regular AFK check. Use false if using for
     * post/pre-AFK check.
     * @return {OverwriteResolvable[]} The permissions.
     */
    public getPermissionsForRaidVc(isNormalAfk: boolean): OverwriteResolvable[] {
        const permsToEvaluate = isNormalAfk
            ? this._raidSection.otherMajorConfig.afkCheckProperties.afkCheckPermissions
            : this._raidSection.otherMajorConfig.afkCheckProperties.prePostAfkCheckPermissions;
        // Declare all permissions which are declared as a necessary role (all bot-defined roles)
        const permsToReturn: OverwriteResolvable[] = [
            {
                id: this._guild!.roles.everyone.id,
                allow: permsToEvaluate.find((x) => x.key === PermsConstants.EVERYONE_ROLE)?.value.allow,
                deny: permsToEvaluate.find((x) => x.key === PermsConstants.EVERYONE_ROLE)?.value.deny,
            },
            {
                id: this._raidSection.roles.verifiedRoleId as Snowflake,
                allow: permsToEvaluate.find((x) => x.key === PermsConstants.MEMBER_ROLE)?.value.allow,
                deny: permsToEvaluate.find((x) => x.key === PermsConstants.MEMBER_ROLE)?.value.deny,
            },
            {
                id: this._guildDoc.roles.staffRoles.moderation.helperRoleId as Snowflake,
                allow: permsToEvaluate.find((x) => x.key === PermsConstants.HELPER_ROLE)?.value.allow,
                deny: permsToEvaluate.find((x) => x.key === PermsConstants.HELPER_ROLE)?.value.deny,
            },
            {
                id: this._guildDoc.roles.staffRoles.moderation.securityRoleId as Snowflake,
                allow: permsToEvaluate.find((x) => x.key === PermsConstants.SECURITY_ROLE)?.value.allow,
                deny: permsToEvaluate.find((x) => x.key === PermsConstants.SECURITY_ROLE)?.value.deny,
            },
            {
                id: this._guildDoc.roles.staffRoles.moderation.officerRoleId as Snowflake,
                allow: permsToEvaluate.find((x) => x.key === PermsConstants.OFFICER_ROLE)?.value.allow,
                deny: permsToEvaluate.find((x) => x.key === PermsConstants.OFFICER_ROLE)?.value.deny,
            },
            {
                id: this._guildDoc.roles.staffRoles.moderation.moderatorRoleId as Snowflake,
                allow: permsToEvaluate.find((x) => x.key === PermsConstants.MODERATOR_ROLE)?.value.allow,
                deny: permsToEvaluate.find((x) => x.key === PermsConstants.MODERATOR_ROLE)?.value.deny,
            },
            // Universal leader roles start here.
            {
                id: this._guildDoc.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find((x) => x.key === PermsConstants.ALMOST_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find((x) => x.key === PermsConstants.ALMOST_LEADER_ROLE)?.value.deny,
            },
            {
                id: this._guildDoc.roles.staffRoles.universalLeaderRoleIds.leaderRoleId as Snowflake,
                allow: permsToEvaluate.find((x) => x.key === PermsConstants.LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find((x) => x.key === PermsConstants.LEADER_ROLE)?.value.deny,
            },
            {
                id: this._guildDoc.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find((x) => x.key === PermsConstants.HEAD_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find((x) => x.key === PermsConstants.HEAD_LEADER_ROLE)?.value.deny,
            },
            {
                id: this._guildDoc.roles.staffRoles.universalLeaderRoleIds.vetLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find((x) => x.key === PermsConstants.VETERAN_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find((x) => x.key === PermsConstants.VETERAN_LEADER_ROLE)?.value.deny,
            },
            // Section leader roles start here
            {
                id: this._raidSection.roles.leaders.sectionAlmostLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find((x) => x.key === PermsConstants.ALMOST_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find((x) => x.key === PermsConstants.ALMOST_LEADER_ROLE)?.value.deny,
            },
            {
                id: this._raidSection.roles.leaders.sectionLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find((x) => x.key === PermsConstants.LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find((x) => x.key === PermsConstants.LEADER_ROLE)?.value.deny,
            },
            {
                id: this._raidSection.roles.leaders.sectionVetLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find((x) => x.key === PermsConstants.VETERAN_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find((x) => x.key === PermsConstants.VETERAN_LEADER_ROLE)?.value.deny,
            },
        ].filter(
            (y) =>
                GuildFgrUtilities.hasCachedRole(this._guild, y.id) &&
                ((y.allow && y.allow.length !== 0) || (y.deny && y.deny.length !== 0))
        );
        // And then define any additional roles.
        // We only want role IDs here.
        permsToEvaluate
            .filter((x) => MiscUtilities.isSnowflake(x.key))
            .filter((x) => x.value.allow.length !== 0 || x.value.deny.length !== 0)
            .forEach((perm) =>
                permsToReturn.push({
                    id: perm.key as Snowflake,
                    allow: perm.value.allow,
                    deny: perm.value.deny,
                })
            );

        return permsToReturn;
    }

    /**
     * Asks the user for a new location.
     * @param {User} requestedAuthor The user that wants to change the location.
     * @returns {Promise<boolean>} True if the bot was able to ask for a new location (regardless of the response).
     */
    public async getNewLocation(requestedAuthor: User): Promise<boolean> {
        LOGGER.info(`${this._instanceInfo} Requesting new location`);
        if (!this._isValid) return false;
        if (!this.vcExists()) return false;
        const descSb = new StringBuilder()
            .append(`Please type the **new location** for the raid organized by : ${this._leaderName}. `)
            .append("The location will be sent to every person that has reacted with an early location reaction. ")
            .append(`To cancel this process, simply react to the ${EmojiConstants.X_EMOJI} emoji.`)
            .appendLine()
            .appendLine()
            .append("You have one minute to perform this action. After one minute has passed, this process will ")
            .append("automatically be canceled.");
        const askLocEmbed: MessageEmbed = MessageUtilities.generateBlankEmbed(this._memberInit, "GREEN")
            .setTitle(`Setting New Location: ${this._leaderName}'s Raid`)
            .setDescription(descSb.toString())
            .setFooter({ text: `${this._guild.name} - AFK Check` })
            .setTimestamp();

        const res = await AdvancedCollector.startDoubleCollector<string>(
            {
                cancelFlag: "-cancel",
                clearInteractionsAfterComplete: false,
                targetAuthor: requestedAuthor,
                targetChannel: this._controlPanelChannel,
                duration: 60 * 1000,
                msgOptions: {
                    embeds: [askLocEmbed],
                    components: AdvancedCollector.getActionRowsFromComponents([ButtonConstants.CANCEL_BUTTON]),
                },
                deleteBaseMsgAfterComplete: true,
                deleteResponseMessage: true,
                acknowledgeImmediately: true,
            },
            AdvancedCollector.getStringPrompt(this._controlPanelChannel, {
                min: 1,
                max: 500,
            })
        );

        // No response or emoji = canceled.
        // Return true since the process still completed.
        if (!res || res instanceof MessageComponentInteraction) return true;
        // Otherwise, update location.
        await this.updateLocation(res);
        this.sendMsgToEarlyLocationPeople({
            content: new StringBuilder(`Your raid leader for the ${this._dungeon.dungeonName} raid has changed `)
                .append(`the raid location. Your new location is: **${this._location}**.`)
                .toString(),
        });
        await this.sendLocToElite();
        LOGGER.info(`${this._instanceInfo} Location change successful`);
        return true;
    }

    /**
     * Creates an AFK check embed. This is only for AFK check; this will not work for during a raid.
     * @return {MessageEmbed | null} The new AFK check embed if the raid VC is initialized. Null otherwise.
     * @private
     */
    public getAfkCheckEmbed(): MessageEmbed | null {
        LOGGER.debug(`${this._instanceInfo} Getting raid AFK check embed`);
        if (!this.vcExists()) return null;
        if (this._raidStatus === RaidStatus.NOTHING) return null;

        const afkCheckEmbed = new MessageEmbed().setTimestamp().setColor(this._embedColor);

        if (this._afkCheckMsg && this._afkCheckMsg.embeds[0].thumbnail)
            afkCheckEmbed.setThumbnail(this._afkCheckMsg.embeds[0].thumbnail.url);
        else if (this._dungeon.bossLinks.length > 0)
            afkCheckEmbed.setThumbnail(ArrayUtilities.getRandomElement(this._dungeon.bossLinks).url);

        const descSb = new StringBuilder();
        const rejoinRaidSb = new StringBuilder()
            .append("If you disconnected from this raid voice channel, you are able to reconnect by pressing the ")
            .append("**Reconnect** button.")
            .appendLine()
            .appendLine()
            .append("If you did not make it into the raid voice channel before the AFK check is over, then pressing ")
            .append("the button will not do anything.");
        switch (this._raidStatus) {
            case RaidStatus.PRE_AFK_CHECK:
                afkCheckEmbed.setAuthor({
                    name: `${this._leaderName} has started a ${this._dungeon.dungeonName} ${(this._vcless) ? "VC-less " : ""}Pre-AFK check.`,
                    iconURL: this._memberInit.user.displayAvatarURL(),
                });
                if (this._vcless) {
                    descSb
                        .append("Only priority reactions can join the raid at this time.")
                        .append(" You will be able to join the raid once all players with priority reactions have been")
                        .append(" confirmed.");
                } else {
                    descSb
                        .append(`Only priority reactions can join the raid VC, ${this._raidVc}, at this time.`)
                        .append(" You will be able to join the raid once all players with priority reactions have been")
                        .append(" confirmed.");
                }

                break;
            case RaidStatus.AFK_CHECK:
                afkCheckEmbed.setAuthor({
                    name: `${this._leaderName} has started a ${this._dungeon.dungeonName} AFK check.`,
                    iconURL: this._memberInit.user.displayAvatarURL(),
                });
                if (this._vcless) {
                    descSb.append("To participate in this raid, press the Join button.");
                } else {
                    descSb.append(`To participate in this raid, join ${this._raidVc} channel.`);
                }
                break;
            case RaidStatus.IN_RUN:
                afkCheckEmbed.setAuthor({
                    name: `${this._leaderName}'s ${this._dungeon.dungeonName} AFK check is now over.`,
                    iconURL: this._memberInit.user.displayAvatarURL(),
                });
                descSb.append("This AFK check has been ended, and the raid is currently ongoing.");
                if (this._vcless) afkCheckEmbed.addField(`Raiders: (${this._membersThatJoined.length}/${this._raidLimit})`, " ");
                if (this._raidSection.otherMajorConfig.afkCheckProperties.customMsg.postAfkCheckInfo) {
                    afkCheckEmbed.addField(
                        "Post-AFK Info",
                        this._raidSection.otherMajorConfig.afkCheckProperties.customMsg.postAfkCheckInfo
                    );
                }

                if (this._thisFeedbackChan) {
                    afkCheckEmbed.addField(
                        "Feedback Channel",
                        `You can give ${this._leaderName} feedback by going to the` +
                        ` ${this._thisFeedbackChan} channel.`
                    );
                }

                if (this._vcless) {
                    afkCheckEmbed.addField(`Raid is ${(this._raidLocked) ? "Locked :lock:" : "Unlocked :unlock:"}`,
                        "Even if the run is locked, raiders who already joined can press the Join button to get loc again!");
                } else {
                    afkCheckEmbed.addField("Rejoin Raid", rejoinRaidSb.toString());
                }

                afkCheckEmbed.setDescription(descSb.toString());
                return afkCheckEmbed;
            case RaidStatus.RUN_FINISHED:
                afkCheckEmbed.setAuthor({
                    name: `${this._leaderName}'s ${this._dungeon.dungeonName} raid is finished.`,
                    iconURL: this._memberInit.user.displayAvatarURL(),
                });
                descSb.append("Thanks for participating! Keep an eye out for new headcounts.");
                afkCheckEmbed.setDescription(descSb.toString());
                return afkCheckEmbed;
            default: //Aborted
                afkCheckEmbed.setAuthor({
                    name: `${this._leaderName}'s ${this._dungeon.dungeonName} raid has been aborted.`,
                    iconURL: this._memberInit.user.displayAvatarURL(),
                });
                descSb.append("We apologize for the inconvenience. Keep an eye out for new headcounts.");
                afkCheckEmbed.setDescription(descSb.toString());
                return afkCheckEmbed;
        }

        afkCheckEmbed.setDescription(descSb.toString());

        if (this._vcless) {
            afkCheckEmbed.addField(`Raiders: (${this._membersThatJoined.length}/${this._raidLimit})`, " ");
        }

        const prioritySb = new StringBuilder();
        // Account for the general early location roles.
        if (this._earlyLocToRole.size > 0) {
            prioritySb.append("If you have one of the listed role(s), press the corresponding button.").appendLine(1);
            for (const [mapKey, roles] of this._earlyLocToRole) {
                const reactionInfo = this._allEssentialOptions.get(mapKey)!;

                if (roles.length === 1) {
                    prioritySb.append(`⇨ ${roles[0]}: **${reactionInfo.name}** `).appendLine();
                    continue;
                }

                prioritySb.append(`⇨ ${roles.join(", ")}: **${reactionInfo.name}**`).appendLine();
            }
        }

        if (this._allEssentialOptions.size - this._earlyLocToRole.size > 0) {
            prioritySb
                .append("Any __buttons__ containing gear or character preferences is a priority react. If ")
                .append("you are bringing one of the gear/character choices, press the corresponding button.");
        }

        const earlyLocInfo = this._allEssentialOptions.get("EARLY_LOC_POINTS");
        if (earlyLocInfo) {
            prioritySb
                .appendLine(2)
                .append(`If you have **\`${this._earlyLocPointCost}\`** points that you would like to redeem for`)
                .append("  priority, press the **Points** button.");
        }

        if (prioritySb.length() > 0) {
            if (this._vcless) {
                afkCheckEmbed.addField("Priority Reactions", prioritySb.toString());
            } else {
                afkCheckEmbed.addField("Priority Reactions (**Join** VC First)", prioritySb.toString());
            }
        }

        if (this._raidStatus === RaidStatus.AFK_CHECK && this._nonEssentialReactions.length > 0) {
            afkCheckEmbed.addField(
                "Other Reactions",
                "To indicate your non-priority gear and/or class preference, please click on the corresponding" +
                " reactions."
            );
        }

        // Display percent of items needed.
        const earlyReactInfo: string[] = [];
        for (const [codeName, peopleThatReacted] of this._pplWithEarlyLoc) {
            if (!this.stillNeedEssentialReact(codeName)) continue;

            const mappedAfkCheckOption = this._allEssentialOptions.get(codeName);
            if (!mappedAfkCheckOption) continue;

            const emoji = mappedAfkCheckOption.emojiInfo.isCustom
                ? GlobalFgrUtilities.getCachedEmoji(mappedAfkCheckOption.emojiInfo.identifier)
                : mappedAfkCheckOption.emojiInfo.identifier;
            if (!emoji) continue;

            const maximum = this._allEssentialOptions.get(codeName)!.earlyLocAmt;
            earlyReactInfo.push(`${emoji} ${peopleThatReacted.length} / ${maximum}`);
        }

        if (this._raidSection.otherMajorConfig.afkCheckProperties.customMsg.additionalAfkCheckInfo) {
            afkCheckEmbed.addField(
                "Section Raid Info",
                this._raidSection.otherMajorConfig.afkCheckProperties.customMsg.additionalAfkCheckInfo
            );
        }

        if (earlyReactInfo.length > 0) {
            afkCheckEmbed.addField("Reactions Needed", earlyReactInfo.join(" | "));
        }
        return afkCheckEmbed;
    }

    /**
     * Creates a control panel embed.
     * @returns {MessageEmbed | null} The message embed if the raid VC is initialized. Null otherwise.
     * @private
     */
    public getControlPanelEmbed(): MessageEmbed | null {
        LOGGER.debug(`${this._instanceInfo} Getting raid control panel embed for status ${this._raidStatus}`);
        if (!this.vcExists()) return null;
        if (this._raidStatus === RaidStatus.NOTHING) return null;

        const descSb = new StringBuilder();

        const controlPanelEmbed = new MessageEmbed()
            .setAuthor({
                name: `${this._leaderName}'s Control Panel - ${this._leaderName}'s Raid`,
                iconURL: this._memberInit.user.displayAvatarURL(),
            })
            .setTitle(`**${this._dungeon.dungeonName}** ${(this._vcless) ? "VC-less " : ""}Raid.`)
            .setFooter({
                text:
                    `${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName} Control Panel.  Expires in ` +
                    `${TimeUtilities.formatDuration(this._expTime - Date.now(), false, false)}.`,
            })
            .setTimestamp()
            .setColor(this._embedColor);

        if (this._raidStatus !== RaidStatus.RUN_FINISHED && this._raidStatus !== RaidStatus.ABORTED) {
            let status: string;
            if (this._raidStatus === RaidStatus.PRE_AFK_CHECK) {
                status = "Pre-AFK";
            }
            else if (this._raidStatus === RaidStatus.AFK_CHECK) {
                status = "AFK";
            }
            else if (this._raidStatus === RaidStatus.IN_RUN) {
                status = "Raid";
            }
            else {
                // fallback to whatever value this is in case we add a new enum member
                status = this._raidStatus;
            }

            const generalStatus = new StringBuilder()
                .append(`⇨ AFK Check Started At: ${TimeUtilities.getDiscordTime({ time: this._startTime, style: TimestampType.FullDateNoDay })}`)
                .appendLine()
                .append(`⇨ Elite Location Channel: ${this._eliteLocChannel ? this._eliteLocChannel : "**`Not Set.`**"}`)
                .appendLine();
            if (this._vcless) {
                generalStatus
                    .append(`⇨ Raid Capacity: ${this._raidLimit}`)
                    .appendLine();
            } else {
                generalStatus
                    .append(`⇨ Voice Channel: ${this._raidVc}`)
                    .appendLine()
                    .append(`⇨ VC Capacity: ${this._raidVc?.members.size} / ${this._raidVc?.userLimit === 0 ? "Unlimited" : this._raidVc?.userLimit}`)
                    .appendLine();
            }

            generalStatus.append(`⇨ Location: **\`${this._location ? this._location : "Not Set."}\`**`)
                .appendLine()
                .append(`⇨ Status: **\`${status}\`**`);
            controlPanelEmbed.addField("General Status", generalStatus.toString());
        }

        if (this._controlPanelMsg && this._controlPanelMsg.embeds[0].thumbnail)
            controlPanelEmbed.setThumbnail(this._controlPanelMsg.embeds[0].thumbnail.url);
        else if (this._dungeon.bossLinks.length > 0)
            controlPanelEmbed.setThumbnail(ArrayUtilities.getRandomElement(this._dungeon.bossLinks).url);

        switch (this._raidStatus) {
            case RaidStatus.PRE_AFK_CHECK:
                descSb
                    .append(
                        "This instance is currently in **PRE-AFK CHECK** mode. Only priority reactions can join the "
                    )
                    .append("raid VC. Use this opportunity to verify all priority reactions.")
                    .appendLine(2);
                if (!this._vcless) {
                    descSb
                        .append(`To use __this__ control panel, you **must** be in the ${this._raidVc} voice `)
                        .append("channel.")
                        .appendLine(2);
                }
                descSb
                    .append("⇨ **Press** the **`Start AFK Check`** button if you want to start the AFK check. This ")
                    .append(
                        "will allow any raiders to join your raid VC. __Make sure__ all priority reactions have been "
                    )
                    .append("verified before you do this.")
                    .appendLine()
                    .append(
                        "⇨ **Press** the **`Abort AFK Check`** button if you want to end the AFK check __without__ "
                    )
                    .append("starting a raid. Use this option if you don't have enough raiders or reactions.")
                    .appendLine()
                    .append("⇨ **Press** the **`Set Location`** button if you want to change this raid's location. ")
                    .append("This will message everyone that is participating in this raid that has early location.");
                break;
            case RaidStatus.AFK_CHECK:
                descSb
                    .append("This instance is currently in **AFK CHECK** mode. Any raiders can join this VC.")
                    .appendLine(2);
                if (!this._vcless) {
                    descSb
                        .append(`To use __this__ control panel, you **must** be in the ${this._raidVc} voice `)
                        .append("channel.")
                        .appendLine(2);
                }
                descSb
                    .append("⇨ **Press** the **`Start Raid`** button if you want to end the AFK check and start the ")
                    .append("raid.")
                    .appendLine()
                    .append(
                        "⇨ **Press** the **`Abort AFK Check`** button if you want to end the AFK check __without__ "
                    )
                    .append("starting a raid. Use this option if you don't have enough raiders or reactions.")
                    .appendLine()
                    .append("⇨ **Press** the **`Set Location`** button if you want to change this raid's location. ")
                    .append("This will message everyone that is participating in this raid that has early location.");
                break;
            case RaidStatus.IN_RUN:
                descSb
                    .append(
                        "This instance is currently in **RAID** mode. Under normal circumstances, raiders __cannot__ "
                    )
                    .append("join the raid VC.")
                    .appendLine(2);
                if (!this._vcless) {
                    descSb
                        .append(`To use __this__ control panel, you **must** be in the ${this._raidVc} voice `)
                        .append("channel.")
                        .appendLine(2);
                }
                descSb
                    .append("⇨ **Press** the **`End Raid`** button if you want to end this raid.")
                    .appendLine()
                    .append("⇨ **Press** the **`Set Location`** button if you want to change this raid's location.")
                    .appendLine()
                    .append("⇨ **Press** the **`Lock Raid VC`** button if you want to lock the raid voice channel.")
                    .appendLine()
                    .append("⇨ **Press** the **`Unlock Raid VC`** button if you want to unlock the raid voice channel.")
                    .appendLine()
                    .append(
                        "⇨ **Press** the **`Restart Raid`** button if you want to create a new AFK check in the same"
                    )
                    .append(" raid VC. This will reset all priorities and clear the log channel, but the VC and its")
                    .append(" members will remain.")
                    .appendLine()
                    .append("⇨ **Press** the **`Chain Log`** button if you want to log a chain. This will show a modal")
                    .append(" where the leader for that dungeon will provide the key-popper name and amount of keys.")
                    .append(" Completes and quota are automatically logged with respect of how many keys are popped.");
                break;
            case RaidStatus.RUN_FINISHED:
                descSb.append("This instance is **FINISHED**.").appendLine().append("This panel will remain behind.");
                break;
            default: //Aborted
                descSb
                    .append("This instance has been **ABORTED**.")
                    .appendLine()
                    .append("This panel will remain behind.");
                break;
        }

        controlPanelEmbed.setDescription(descSb.toString());

        // Display reactions properly
        const cpFields: string[] = [];
        for (const [codeName, peopleThatReacted] of this._pplWithEarlyLoc) {
            const mappedAfkCheckOption = this._allEssentialOptions.get(codeName);
            if (!mappedAfkCheckOption) continue;

            const emoji = GlobalFgrUtilities.getNormalOrCustomEmoji(mappedAfkCheckOption);

            // Must have emoji
            if (!emoji) continue;

            const maximum = this._allEssentialOptions.get(codeName)!.earlyLocAmt;
            if (peopleThatReacted.length === 0) {
                cpFields.push(
                    new StringBuilder()
                        .append(`⇨ ${emoji} ${mappedAfkCheckOption.name}: \`0 / ${maximum}\``)
                        .appendLine()
                        .toString()
                );
                continue;
            }
            const earlyReacts = peopleThatReacted.map((user) => {
                const ret = new StringBuilder().append(`${user.member}`);
                if (user.modifiers.length > 0) ret.append(`: \`[${user.modifiers.join(", ")}]\``);
                return ret.toString();
            });
            cpFields.push(
                new StringBuilder()
                    .append(`⇨ ${emoji} ${mappedAfkCheckOption.name}: \`${peopleThatReacted.length} / ${maximum}\``)
                    .appendLine()
                    .append(earlyReacts.join("\n"))
                    .appendLine()
                    .toString()
            );
        }

        const nModReactInfoFields = ArrayUtilities.arrayToStringFields(cpFields, (_, elem) => elem);

        if (this._vcless) {
            controlPanelEmbed.addField(`Raiders: (${this._membersThatJoined.length}/${this._raidLimit})`, " ");
        }
        let title = "Priority Reaction Information";
        for (const field of nModReactInfoFields) {
            controlPanelEmbed.addField(title, field);
            title = GeneralConstants.ZERO_WIDTH_SPACE;
        }
        return controlPanelEmbed;
    }

    /**
     * Event handler that deals with voice state changes.
     * @param {VoiceState} oldState The old voice state.
     * @param {VoiceState} newState The new voice state.
     * @private
     */
    public async voiceStateUpdateEventFunction(oldState: VoiceState, newState: VoiceState): Promise<void> {
        if (!this._raidVc) return;

        // Event must be regarding this raid VC.
        if (oldState.channelId !== this._raidVc.id && newState.channelId !== this._raidVc.id) return;

        const member = oldState.member ?? newState.member;
        if (!member) return;

        if (
            member.voice.channelId &&
            member.voice.channelId !== this._raidVc.id &&
            this._peopleToAddToVc.has(member.id)
        ) {
            member.voice.setChannel(this._raidVc).catch();
            this.logEvent(
                `${EmojiConstants.NITRO_EMOJI} ${member.displayName} (${member.id}) has been added to the VC for being a priority react.`,
                true
            ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            return;
        }

        if (oldState.channelId !== newState.channelId) {
            if (oldState.channelId && !newState.channelId) {
                // person left the VC
                this.logEvent(
                    `${EmojiConstants.EYES_EMOJI} ${member.displayName} (${member.id}) has left the raid VC.`,
                    true
                ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return;
            }

            if (!oldState.channelId && newState.channelId) {
                // person joined the VC
                this.logEvent(
                    `${EmojiConstants.GREEN_CHECK_EMOJI} ${member.displayName} (${member.id}) has joined the raid VC.`,
                    true
                ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return;
            }

            // otherwise, changed VC
            this.logEvent(
                `${EmojiConstants.REDIRECT_EMOJI} ${member.displayName} (${member.id}) has switched voice channels.\n` +
                `\tFrom: ${oldState.channel!.name} (${oldState.channelId})\n` +
                `\tTo: ${newState.channel!.name} (${newState.channelId})`,
                true
            ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            return;
        }

        // Don't care about local mute, only server
        if (oldState.serverMute && !newState.serverMute) {
            // person no longer server muted
            this.logEvent(
                `${EmojiConstants.MIC_EMOJI} ${member.displayName} (${member.id}) is no longer server muted.`,
                true
            ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            return;
        }

        if (!oldState.serverMute && newState.serverMute) {
            // person server/local muted
            this.logEvent(
                `${EmojiConstants.MIC_EMOJI} ${member.displayName} (${member.id}) is now server muted.`,
                true
            ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            return;
        }

        if (oldState.deaf && !newState.deaf) {
            // person no longer server/local deaf
            this.logEvent(
                `${EmojiConstants.HEADPHONE_EMOJI} ${member.displayName} (${member.id}) is no longer deafened.`,
                true
            ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            return;
        }

        if (!oldState.deaf && newState.deaf) {
            // person server/local deaf
            this.logEvent(
                `${EmojiConstants.HEADPHONE_EMOJI} ${member.displayName} (${member.id}) is now deafened.`,
                true
            ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            return;
        }

        if (oldState.selfVideo && !newState.selfVideo) {
            // person video off
            this.logEvent(
                `${EmojiConstants.CAM_EMOJI} ${member.displayName} (${member.id}) has turned off video.`,
                true
            ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            return;
        }

        if (!oldState.selfVideo && newState.selfVideo) {
            // person video on
            this.logEvent(
                `${EmojiConstants.CAM_EMOJI} ${member.displayName} (${member.id}) has turned on video.`,
                true
            ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            return;
        }

        if (oldState.streaming && !newState.streaming) {
            // person stream off
            this.logEvent(
                `${EmojiConstants.TV_EMOJI} ${member.displayName} (${member.id}) has stopped streaming.`,
                true
            ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            return;
        }

        if (!oldState.streaming && newState.streaming) {
            // person stream on
            this.logEvent(
                `${EmojiConstants.TV_EMOJI} ${member.displayName} (${member.id}) has started streaming.`,
                true
            ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            return;
        }
    }

    /**
     * Event handler that deals with interactions.
     * @param {Interaction} interaction The interaction.
     * @private
     */
    public async interactionEventFunction(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() || !this._afkCheckMsg || this._raidStatus !== RaidStatus.IN_RUN) return;

        if (interaction.customId !== `reconnect_${this._afkCheckMsg.id}`) return;

        if (this.membersThatJoinedRun.every((x) => x.id !== interaction.user.id)) {
            await interaction.reply({
                ephemeral: true,
                content: "You didn't join this raid, so you can't be moved in at this time.",
            });

            return;
        }

        const member = await GuildFgrUtilities.fetchGuildMember(this._guild, interaction.user.id);
        if (!member) return;

        if (!member.voice.channel) {
            await interaction.reply({
                ephemeral: true,
                content: "Please join a voice channel first.",
            });
            return;
        }

        interaction.deferUpdate().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));

        if (member.voice.channel.id === this._raidVc?.id) return;

        await GlobalFgrUtilities.tryExecuteAsync(async () => {
            await member.voice.setChannel(this._raidVc);
        });
        this.logEvent(
            `${EmojiConstants.GREEN_CHECK_EMOJI} ${member.displayName} (${member.id}) has reconnected to the raid VC.`,
            true
        ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
        return;
    }

    /**
     * Logs an event. This will store the event in an array containing all events and optionally send the event to
     * the logging channel.
     * @param {string} event The event.
     * @param {boolean} logToChannel Whether to log this event to the logging channel.
     */
    public async logEvent(event: string, logToChannel: boolean): Promise<void> {
        const time = TimeUtilities.getFormattedTime();

        if (logToChannel && this._logChan && this._isValid) {
            await GlobalFgrUtilities.sendMsg(this._logChan, {
                content: `**\`[${time}]\`** ${event}`,
            });
        }

        this._raidLogs.push(`[${time}] ${event}`);
    }

    /**
     * Compiles this raid's history.
     * @param {TextChannel} storageChannel The storage channel.
     * @param {string[]} otherInfo Any other inforamtion to include.
     * @private
     */
    private async compileHistory(storageChannel: TextChannel, ...otherInfo: string[]): Promise<void> {
        const sb = new StringBuilder()
            .append("RAID INFORMATION")
            .appendLine()
            .append(`- Section: ${this._raidSection.sectionName} (${this._raidSection.uniqueIdentifier})`)
            .appendLine()
            .append(`- Dungeon: ${this._dungeon.dungeonName} (${this._dungeon.codeName})`)
            .appendLine()
            .append(`- Raid Leader: ${this._leaderName} (${this._memberInit.id})`)
            .appendLine(3);

        sb.append("================= LOG INFORMATION =================").appendLine();
        for (const log of this._raidLogs) {
            sb.append(log).appendLine();
        }

        sb.appendLine(3).append("================= PRIORITY REACTIONS =================").appendLine();
        for (const [reaction, members] of this._pplWithEarlyLoc) {
            const reactionInfo = this._allEssentialOptions.get(reaction);
            if (!reactionInfo) continue;
            sb.append(`- ${reactionInfo.name} (${reactionInfo.type})`).appendLine();
            for (const { member, modifiers } of members) {
                sb.append(`\t> ${member.displayName} (${member.user.tag}, ${member.id})`).appendLine();
                if (modifiers.length > 0) {
                    sb.append(`\t\t> Modifiers: [${modifiers.join(", ")}]`).appendLine();
                }
            }
        }

        sb.appendLine(3);
        for (const info of otherInfo) {
            sb.append(info).appendLine(3);
        }

        await storageChannel.send({
            files: [
                new MessageAttachment(Buffer.from(sb.toString(), "utf8"), `raidHistory_${this._memberInit.id}.txt`),
            ],
            content: `__**Report Generated: ${TimeUtilities.getDiscordTime({ style: TimestampType.FullDateNoDay })}**__`,
        });
    }

    /**
     * Removes any unused feedback channels that were not deleted during last session.
     * Feedback is compiled and sent to storage channel, if one is configured.
     * The channel is then deleted.
     * @param feedbackChannel The channel to collect feedback from and delete
     * @param storageChannel The channel to send the collected feedback to
     */
    public static async compileDeadFeedbackHistory(feedbackChannel: TextChannel, storageChannel: TextChannel): Promise<void> {
        const [pinnedMsgs, allMsgs] = await Promise.all([
            feedbackChannel.messages.fetchPinned(),
            // Assuming that a lot of people won't submit feedback
            feedbackChannel.messages.fetch({ limit: 100 }),
        ]);

        const sb = new StringBuilder()
            .append("================= LEADER FEEDBACK INFORMATION =================")
            .appendLine();

        const botMsg = pinnedMsgs.filter((x) => x.author.bot).first();
        if (botMsg) {
            const m = await botMsg.fetch();
            const [upvotes, noPref, downvotes] = await Promise.all([
                m.reactions.cache.get(EmojiConstants.LONG_UP_ARROW_EMOJI)?.fetch(),
                m.reactions.cache.get(EmojiConstants.LONG_SIDEWAYS_ARROW_EMOJI)?.fetch(),
                m.reactions.cache.get(EmojiConstants.LONG_DOWN_ARROW_EMOJI)?.fetch(),
            ]);

            if (upvotes) sb.append(`- Upvotes      : ${upvotes.count - 1}`).appendLine();
            if (noPref) sb.append(`- No Preference: ${noPref.count - 1}`).appendLine();
            if (downvotes) sb.append(`- Downvotes    : ${downvotes.count - 1}`).appendLine();
        }

        const otherFeedbackMsgs = allMsgs.filter((x) => !x.author.bot);
        for (const [, feedbackMsg] of otherFeedbackMsgs) {
            sb.append(`Feedback by ${feedbackMsg.author.tag} (${feedbackMsg.author.id})`)
                .appendLine()
                .append("=== BEGIN ===")
                .appendLine()
                .append(feedbackMsg.content)
                .appendLine()
                .append("=== END ===")
                .appendLine(2);
        }

        const probablyMemberInit = feedbackChannel.name.split(" ")[0];

        await storageChannel.send({
            files: [
                new MessageAttachment(Buffer.from(sb.toString(), "utf8"), `deadFeedback_${probablyMemberInit}.txt`),
            ],
            content: `__**Dead feedback cleared: ${TimeUtilities.getDiscordTime({ style: TimestampType.FullDateNoDay })}**__`
        });

        await feedbackChannel.delete();
    }

    /**
     * Checks whether a particular essential reaction is needed.
     * @param {string} reactCodeName The map key.
     * @return {boolean} Whether it is still needed.
     * @private
     */
    private stillNeedEssentialReact(reactCodeName: string): boolean {
        const reactInfo = this._allEssentialOptions.get(reactCodeName);
        if (!reactInfo) return false;
        // If allEssentialOptions has the key, so should this.
        return this._pplWithEarlyLoc.get(reactCodeName)!.length < reactInfo.earlyLocAmt;
    }

    /**
     * Sets the leader's feedback channel and updates it in the database.
     * @param {TextChannel} channel The channel.
     * @returns {Promise<boolean>} Whether this was added.
     * @private
     */
    private async setThisFeedbackChannel(channel: TextChannel): Promise<boolean> {
        if (!this._addedToDb || !this._isValid) return false;
        if (!this.vcExists()) return false;

        this._thisFeedbackChan = channel;
        const res = await MongoManager.updateAndFetchGuildDoc(
            {
                guildId: this._guild.id,
                "activeRaids.raidId": this._raidId,
            },
            {
                $set: {
                    "activeRaids.$.otherChannels.feedbackChannelId": channel.id,
                },
            }
        );
        if (!res) return false;
        this._guildDoc = res;
        return true;
    }

    /**
     * Adds an early location entry to the early location map, optionally also saving it to the database.
     * @param {GuildMember} member The guild member that is getting early location.
     * @param {string} reactionCodeName The reaction code name corresponding to the reaction that the person chose.
     * @param {string[]} modifiers The modifiers for this reaction, if any.
     * @param {boolean} [addToDb = false] Whether to add to the database.
     * @returns {Promise<boolean>} True if added to the map, false otherwise.
     * @private
     */
    private async addEarlyLocationReaction(
        member: GuildMember,
        reactionCodeName: string,
        modifiers: string[],
        addToDb: boolean = false
    ): Promise<boolean> {
        LOGGER.info(`${this._instanceInfo} Adding early location for ${member.displayName} with a ${reactionCodeName}`);
        if (!this._pplWithEarlyLoc.has(reactionCodeName)) return false;
        const reactInfo = this._allEssentialOptions.get(reactionCodeName);
        if (!reactInfo) return false;

        const prop = this._pplWithEarlyLoc.get(reactionCodeName);
        if (!prop || !this.stillNeedEssentialReact(reactionCodeName)) return false;
        prop.push({ member: member, modifiers: modifiers });

        if (!addToDb || !this._addedToDb || !this._isValid) return true;
        if (!this.vcExists()) return true;

        const res = await MongoManager.updateAndFetchGuildDoc(
            {
                guildId: this._guild.id,
                "activeRaids.raidId": this._raidId,
            },
            {
                $push: {
                    "activeRaids.$.earlyLocationReactions": {
                        userId: member.id,
                        reactCodeName: reactionCodeName,
                        modifiers: modifiers,
                    },
                },
            }
        );
        if (!res) return false;
        this._guildDoc = res;
        return true;
    }

    /**
     * Updates the location to the specified location.
     * @param {string} newLoc The specified location.
     * @returns {Promise<boolean>} Whether this was successful.
     * @private
     */
    private async updateLocation(newLoc: string): Promise<boolean> {
        LOGGER.info(`${this._instanceInfo} Updating location of raid to ${newLoc}}`);
        if (!this._addedToDb || !this._isValid) return false;
        if (!this.vcExists()) return false;

        this._location = newLoc;
        this.logEvent(`${EmojiConstants.MAP_EMOJI} Location changed to: ${newLoc}`, true).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));

        // Update the location in the database.
        const res = await MongoManager.updateAndFetchGuildDoc(
            {
                guildId: this._guild.id,
                "activeRaids.raidId": this._raidId,
            },
            {
                $set: {
                    "activeRaids.$.location": newLoc,
                },
            }
        );

        if (!res) return false;
        this._guildDoc = res;
        return true;
    }

    /**
     * Sends location to elite location channel, if exists for section
     * Only sends loc during AFK/IN_RAID phases
     * @returns {Promise<boolean>} Whether a message was sent.
     * @private
     */
    private async sendLocToElite(): Promise<boolean> {
        if (!this._eliteLocChannel) {
            return false;
        }
        if (this._raidStatus === RaidStatus.NOTHING || this._raidStatus === RaidStatus.PRE_AFK_CHECK) {
            return false;
        }

        await this._eliteLocChannel.send({
            content: `Current location for ${this._leaderName}'s ${this._dungeon.dungeonName} is \`${this._location ? this._location : "Not Set"}\``,
        });
        sendTemporaryAlert(this._controlPanelChannel, `Location sent to ${this._eliteLocChannel.name}`, 5 * 1000);
        return true;
    }

    /**
     * Updates the members that were in the raid VC at the time the raid VC closed (i.e. when AFK check ended).
     * @returns {Promise<boolean>} Whether this was successful.
     * @private
     */
    private async updateMembersArr(): Promise<boolean> {
        if (!this._addedToDb || !this._isValid) return false;
        if (!this.vcExists()) return false;

        if (!this._vcless && this._raidVc) this._membersThatJoined = Array.from(this._raidVc.members.values());

        // Update the location in the database.
        const res = await MongoManager.updateAndFetchGuildDoc(
            {
                guildId: this._guild.id,
                "activeRaids.raidId": this._raidId,
            },
            {
                $set: {
                    "activeRaids.$.membersThatJoined": this._membersThatJoined.map((x) => x.id),
                },
            }
        );

        if (!res) return false;
        this._guildDoc = res;
        return true;
    }

    /**
     * Adds a raid object to the database. This should only be called once the AFK check has started.
     * @returns {Promise<boolean>} Whether this was successful.
     * @private
     */
    private async addRaidToDatabase(): Promise<boolean> {
        if (this._addedToDb) return false;

        const obj = this.getRaidInfoObject();
        if (!obj) return false;
        const res = await MongoManager.updateAndFetchGuildDoc(
            { guildId: this._guild.id },
            {
                $push: {
                    activeRaids: obj,
                },
            }
        );

        if (!res) return false;
        this._guildDoc = res;
        this._addedToDb = true;
        return true;
    }

    /**
     * Removes a raid object from the database. This should only be called once per raid.
     * @returns {Promise<boolean>} Whether this was successful.
     * @private
     */
    private async removeRaidFromDatabase(): Promise<boolean> {
        if (!this._addedToDb) return false;
        if (!this.vcExists()) return false;

        const res = await MongoManager.updateAndFetchGuildDoc(
            { guildId: this._guild.id },
            {
                $pull: {
                    activeRaids: {
                        raidId: this._raidId,
                    },
                },
            }
        );
        if (!res) return false;
        this._guildDoc = res;
        return true;
    }

    /**
     * Sets the raid status to an ongoing raid. This should only be called once per raid.
     * @param {RaidStatus} status The status to set this raid to.
     * @returns {Promise<boolean>} Whether this was successful.
     * @private
     */
    private async setRaidStatus(status: RaidStatus): Promise<boolean> {
        if (!this._addedToDb || !this._isValid) return false;
        if (!this.vcExists()) return false;

        this._raidStatus = status;
        // Update the location in the database.
        const res = await MongoManager.updateAndFetchGuildDoc(
            {
                guildId: this._guild.id,
                "activeRaids.raidId": this._raidId,
            },
            {
                $set: {
                    "activeRaids.$.status": status,
                },
            }
        );
        if (!res) return false;
        this._guildDoc = res;
        return true;
    }

    /**
     * Sends a message to all early location people.
     * @param {MessageOptions} msgOpt The message content to send.
     * @private
     */
    private sendMsgToEarlyLocationPeople(msgOpt: MessageOptions): void {
        LOGGER.info(`${this._instanceInfo} Sending message to early location receivers: ${msgOpt.content}`);
        const sentMsgTo: string[] = [];
        for (const [, members] of this._pplWithEarlyLoc) {
            members.forEach(async (obj) => {
                if (sentMsgTo.includes(obj.member.id)) return;
                sentMsgTo.push(obj.member.id);
                await GlobalFgrUtilities.tryExecuteAsync(async () => {
                    await obj.member.send(msgOpt);
                });
            });
        }
    }

    /**
     * Stops all intervals and collectors that is being used and set the intervals and collectors instance variables
     * to null.
     * @param {string} [reason] The reason.
     * @private
     */
    private async stopAllIntervalsAndCollectors(reason?: string) {
        LOGGER.info(`${this._instanceInfo} Stopping all intervals and collectors for reason: ${reason ?? null}`);
        this._intervalsAreRunning = false;

        this._controlPanelReactionCollector?.stop();
        this._controlPanelReactionCollector = null;

        this._afkCheckButtonCollector?.stop();
        this._afkCheckButtonCollector = null;
        return;
    }

    /**
     * Starts the intervals, which periodically updates the headcount message and the control panel message.
     * @return {boolean} Whether the intervals started.
     * @private
     */
    private startIntervals(): boolean {
        if (!this._afkCheckMsg || !this._controlPanelMsg) return false;
        if (this._intervalsAreRunning || this._raidStatus === RaidStatus.NOTHING) return false;
        LOGGER.info(`${this._instanceInfo} Starting all intervals`);
        this._intervalsAreRunning = true;

        this.updateControlPanel().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
        this.updateRaidPanel().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));

        return true;
    }

    /**
     * Interval for control panel
     */
    private async updateControlPanel() {
        LOGGER.debug(`${this._instanceInfo} Control Panel Interval`);
        if (!this.vcExists()) {
            await this.stopAllIntervalsAndCollectors("Raid vc does not exist");
            return;
        }

        // If control panel does not exist,
        // Stop intervals and return
        if (!this._controlPanelMsg || !this._isValid) {
            await this.stopAllIntervalsAndCollectors("Control panel does not exist");
            return;
        }
        // If intervals have stopped,
        // Return
        if (!this._intervalsAreRunning) {
            return;
        }

        // If headcount times out.
        // stop intervals and return
        if (Date.now() > this._expTime) {
            LOGGER.info(`${this._instanceInfo} Raid expired, aborting`);
            this.cleanUpRaid(true).then();
            return true;
        }

        const editMessage = this._controlPanelMsg.edit({
            content: this._memberInit.toString(),
            embeds: [this.getControlPanelEmbed()!],
        });

        const delayUpdate = delay(this._intervalDelay);

        await Promise.all([editMessage, delayUpdate]).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
        this.updateControlPanel().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
    }

    /**
     * Interval for headcount panel
     */
    private async updateRaidPanel() {
        LOGGER.debug(`${this._instanceInfo} Raid Panel Interval`);
        /**
         * If headcount panel does not exist,
         * Stop intervals and return*/
        if (!this._afkCheckMsg) {
            await this.stopAllIntervalsAndCollectors("Raid msg does not exist");
            return;
        }
        /**If intervals have stopped,
         * return
         */
        if (!this._intervalsAreRunning) {
            return;
        }

        /**
         * Vcless runs maintain join button control during IN_RUN
         */
        if (this._raidStatus === RaidStatus.IN_RUN && this._vcless) {
            const editMessage = this._afkCheckMsg.edit({
                embeds: [this.getAfkCheckEmbed()!],
                components: AdvancedCollector.getActionRowsFromComponents([this._joinButton]),
            });

            const delayUpdate = delay(this._intervalDelay);
            await Promise.all([editMessage, delayUpdate]).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            this.updateRaidPanel().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
        }
        else if (this._raidStatus === RaidStatus.AFK_CHECK || this._raidStatus === RaidStatus.PRE_AFK_CHECK) {
            const editMessage = this._afkCheckMsg.edit({
                embeds: [this.getAfkCheckEmbed()!],
                components: AdvancedCollector.getActionRowsFromComponents(this._afkCheckButtons),
            });

            const delayUpdate = delay(this._intervalDelay);
            await Promise.all([editMessage, delayUpdate]).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            this.updateRaidPanel().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
        } else {
            return;
        }
    }
    /**
     * Starts an Raid Rejoin collector. Only works during a raid in progress for vcless runs.
     * @returns {boolean} Whether the collector started successfully.
     * @private
     */
    private startRaidRejoinCollector(): boolean {
        if (!this._afkCheckMsg) return false;
        if (this._afkCheckButtonCollector) return false;
        if (this._raidStatus !== RaidStatus.IN_RUN) return false;

        LOGGER.info(`${this._instanceInfo} Starting raid rejoin collector`);
        this._afkCheckButtonCollector = this._afkCheckMsg.createMessageComponentCollector({
            filter: (i) => !i.user.bot && i.customId === "join",
            time: this._raidSection.otherMajorConfig.afkCheckProperties.afkCheckTimeout,
        });

        this._afkCheckButtonCollector.on("collect", async (i) => {
            if (i.customId === "join") {
                this.handleJoinInteraction(i);
                return;
            }
        });

        return true;
    }

    /**
     * Private method to specifically handle the join button being pressed by a guildmember for vcless runs
     * @param i The interaction
     * @returns 
     */
    private async handleJoinInteraction(i: MessageComponentInteraction) {
        const memberThatResponded = await GuildFgrUtilities.fetchGuildMember(this._guild, i.user.id);
        if (!memberThatResponded) {
            i.reply({
                content: "An unknown error occurred: member not found.",
                ephemeral: true,
            }).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            return;
        }

        if (this._membersThatJoined.includes(memberThatResponded)) {
            i.reply({
                content: `You have already joined the raid.  The location is **${this._location}**`,
                ephemeral: true,
            }).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            return;
        }

        if (this._raidStatus === RaidStatus.IN_RUN && this._raidLocked) {
            i.reply({
                content: "The run has already started and is not accepting additional raiders.",
                ephemeral: true,
            }).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            return;
        }

        const raidSize = this._membersThatJoined.length;
        if (raidSize >= this._raidLimit) {
            i.reply({
                content: "The raid is currently full.  Keep an eye out for the next raid!",
                ephemeral: true,
            }).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            return;
        }

        i.reply({
            content: `You have joined the raid.  The location is **${this._location}**`,
            ephemeral: true,
        }).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));

        this.logEvent(
            `${EmojiConstants.GREEN_CHECK_EMOJI} ${memberThatResponded.displayName} (${memberThatResponded.id}) has joined the raid.`,
            true
        ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));

        LOGGER.info(`Member ${memberThatResponded.displayName} has joined the raid.`);
        this._membersThatJoined.push(memberThatResponded);

        return;
    }

    /**
     * Starts an AFK check collector. Only works during an AFK check.
     * @returns {boolean} Whether the collector started successfully.
     * @private
     */
    private startAfkCheckCollector(): boolean {
        if (!this._afkCheckMsg) return false;
        if (this._afkCheckButtonCollector) return false;
        if (this._raidStatus !== RaidStatus.AFK_CHECK && this._raidStatus !== RaidStatus.PRE_AFK_CHECK) return false;

        LOGGER.info(`${this._instanceInfo} Starting raid AFK Check collector`);

        this._afkCheckButtonCollector = this._afkCheckMsg.createMessageComponentCollector({
            filter: (i) => !i.user.bot &&
                (this._allEssentialOptions.has(i.customId) || i.customId === "join"),
            time: this._raidSection.otherMajorConfig.afkCheckProperties.afkCheckTimeout,
        });

        // Remember that interactions are all going to be in _allEssentialOptions
        this._afkCheckButtonCollector.on("collect", async (i) => {
            if (i.customId === "join") {
                this.handleJoinInteraction(i);
                return;
            }
            if (this._pplConfirmingReaction.has(i.user.id)) {
                i.reply({
                    content:
                        "You are in the process of confirming a reaction. If you accidentally dismissed the" +
                        " confirmation message, you may need to wait 15 seconds before you can try again.",
                    ephemeral: true,
                }).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return;
            }

            const memberThatResponded = await GuildFgrUtilities.fetchGuildMember(this._guild, i.user.id);
            if (!memberThatResponded) {
                i.reply({
                    content: "An unknown error occurred.",
                    ephemeral: true,
                }).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return;
            }

            if (!this._vcless) {
                // Does the VC even exist?
                if (!this._raidVc || !this._isValid || !GuildFgrUtilities.hasCachedChannel(this._guild, this._raidVc.id)) {
                    await this.cleanUpRaid(true);
                    return;
                }

                // Is the person in a VC?
                if (!memberThatResponded.voice.channel) {
                    i.reply({
                        content: "In order to indicate your class/gear preference, you need to be in a voice channel.",
                        ephemeral: true,
                    }).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                    return;
                }
            }

            const mapKey = i.customId;
            const reactInfo = this._allEssentialOptions.get(mapKey)!;
            const members = this._pplWithEarlyLoc.get(mapKey)!;

            LOGGER.info(`${this._instanceInfo} Collected reaction from ${memberThatResponded.displayName}`);
            // If the member already got this, then don't let them get this again.
            if (members.some((x) => x.member.id === i.user.id)) {
                LOGGER.info(`${this._instanceInfo} Reaction was already accounted for`);
                i.reply({
                    content: "You have already selected this!",
                    ephemeral: true,
                }).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return;
            }

            // Item display for future use
            const itemDis = getItemDisplay(reactInfo);
            // If we no longer need this anymore, then notify them
            if (!this.stillNeedEssentialReact(mapKey)) {
                LOGGER.info(`${this._instanceInfo} Reaction no longer essential, person not moved`);
                i.reply({
                    content: `Sorry, but the maximum number of ${itemDis} has been reached.`,
                    ephemeral: true,
                }).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return;
            }

            this._pplConfirmingReaction.add(i.user.id);
            const res = await confirmReaction(
                i,
                this._allEssentialOptions,
                this._modifiersToUse,
                this._earlyLocToRole,
                this._earlyLocPointCost
            );

            if (!this.vcExists() || !this._isValid) {
                LOGGER.info(`${this._instanceInfo} Raid closed during reaction`);
                if (res.success || res.errorReply.alreadyReplied) {
                    await i.editReply({
                        content: "The raid you are attempting to react to has been closed or aborted.",
                        components: [],
                    });
                    return;
                }

                await i.reply({
                    content: "The raid you are attempting to react to has been closed or aborted.",
                    components: [],
                });
                return;
            }

            this._pplConfirmingReaction.delete(i.user.id);
            if (!res.success) {
                if (res.errorReply.alreadyReplied) {
                    await i.editReply({
                        content: res.errorReply.errorMsg,
                        components: [],
                    });
                } else {
                    await i.reply({
                        content: res.errorReply.errorMsg,
                        ephemeral: true,
                        components: [],
                    });
                }
                return;
            }

            // Make sure we can actually give early location. It might have changed.
            if (!this.stillNeedEssentialReact(mapKey)) {
                LOGGER.info(`${this._instanceInfo} Reaction no longer essential, person not moved`);
                await i.editReply({
                    content:
                        reactInfo.type === "EARLY_LOCATION"
                            ? "Although you reacted with this button, you are not able to receive early location" +
                            " because someone else beat you to the last slot."
                            : `Although you have a ${itemDis}, we do not need this anymore.`,
                    components: [],
                });
                return;
            }

            // Add to database
            await this.addEarlyLocationReaction(memberThatResponded, mapKey, res.react!.modifiers, true);
            if (res.react?.successFunc) {
                await res.react.successFunc(memberThatResponded);
            }
            if (this._vcless && !this._membersThatJoined.includes(memberThatResponded)) {
                LOGGER.info(`Member ${memberThatResponded.displayName} has joined the raid as an early loc reaction.`);
                this._membersThatJoined.push(memberThatResponded);
            }
            // If we no longer need this, then edit the button so no one else can click on it.
            if (!this.stillNeedEssentialReact(mapKey)) {
                LOGGER.info(`${this._instanceInfo} Reaction no longer essential, disabling button`);
                const idxOfButton = this._afkCheckButtons.findIndex((x) => x.customId === mapKey);
                this._afkCheckButtons[idxOfButton].setDisabled(true);
            }
            LOGGER.info(`${this._instanceInfo} Reaction confirmed`);
            const confirmationContent = new StringBuilder()
                .append("Thank you for confirming your choice of: ")
                .append(itemDis)
                .appendLine(2)
                .append(
                    this._location
                        ? `The raid location is: **${this._location}**.`
                        : "The raid location will be set shortly."
                )
                .appendLine(2);

            if (this._raidSection.otherMajorConfig.afkCheckProperties.customMsg.earlyLocConfirmMsg) {
                confirmationContent.append(
                    this._raidSection.otherMajorConfig.afkCheckProperties.customMsg.earlyLocConfirmMsg
                );
            }

            confirmationContent
                .appendLine(2)
                .append("**Make sure** the bot can send you direct messages. If the raid leader changes the ")
                .append("location, the new location will be sent to you via direct messages.");

            await i.editReply({
                content: confirmationContent.toString(),
                components: [],
            });

            this.logEvent(
                `${EmojiConstants.KEY_EMOJI} ${memberThatResponded.displayName} (${memberThatResponded.id}) confirmed` +
                " that they have" +
                ` ${reactInfo.name} (${reactInfo.type}). Modifiers: \`[${res.react!.modifiers.join(", ")}]\``,
                true
            ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));

            if (!this._vcless && memberThatResponded.voice.channel) {
                if (this._raidVc && memberThatResponded.voice.channelId === this._raidVc.id) return;
                LOGGER.info(`${this._instanceInfo} Moving ${memberThatResponded.displayName} into raid VC`);
                memberThatResponded.voice.setChannel(this._raidVc).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return;
            }

            this._peopleToAddToVc.add(memberThatResponded.id);
        });

        // If time expires, then end AFK check immediately.
        this._afkCheckButtonCollector.on("end", (reason: string) => {
            if (reason !== "time") return;
            switch (this._raidStatus) {
                case RaidStatus.PRE_AFK_CHECK: {
                    this.startAfkCheck().then();
                    break;
                }
                case RaidStatus.AFK_CHECK: {
                    this.endAfkCheck(null).then();
                    break;
                }
            }
        });

        return true;
    }

    /**
     * Starts a control panel collector.
     * @returns {boolean} Whether the collector started successfully.
     * @private
     */
    private startControlPanelCollector(): boolean {
        if (!this._controlPanelMsg) return false;
        if (this._controlPanelReactionCollector) return false;
        if (this._raidStatus === RaidStatus.NOTHING) return false;
        LOGGER.info(`${this._instanceInfo} Starting raid control panel collector`);
        this._controlPanelReactionCollector = this._controlPanelMsg.createMessageComponentCollector({
            filter: controlPanelCollectorFilter(this._guildDoc, this._raidSection, this._guild),
            // TODO let this be customizable?
            time: this._raidStatus === RaidStatus.IN_RUN ? 4 * 60 * 60 * 1000 : undefined,
        });

        const validateInVc = async (i: MessageComponentInteraction): Promise<boolean> => {
            // Should have already been fetched from the collector filter function
            // So this should be cached
            if (this._vcless) return true;
            const member = await GuildFgrUtilities.fetchGuildMember(this._guild, i.user.id);
            if (!member) {
                i.reply({
                    content: "An unknown error occurred. Please try again later.",
                    ephemeral: true,
                }).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return false;
            }

            if (member.voice.channel?.id !== this._raidVc?.id) {
                i.reply({
                    content: "You need to be in the correct raiding VC to interact with these controls.",
                    ephemeral: true,
                }).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return false;
            }

            return true;
        };

        if (this._raidStatus === RaidStatus.PRE_AFK_CHECK) {
            this._controlPanelReactionCollector.on("collect", async (i: ButtonInteraction<"cached">) => {
                if (!(await validateInVc(i))) {
                    return;
                }

                await i.deferUpdate();
                if (i.customId === RaidInstance.START_AFK_CHECK_ID) {
                    LOGGER.info(`${this._instanceInfo} Leader chose to start ${(this._vcless) ? "VC-less " : ""} AFK Check`);
                    if (this._locationToProgress && !this._location)
                        i.followUp({ content: "Please set a location prior to progressing the raid.", ephemeral: true });
                    else
                        this.startAfkCheck().then();
                    return;
                }

                if (i.customId === RaidInstance.ABORT_AFK_ID) {
                    if (i.user.id !== this._memberInit.id) {
                        return this.showWrongLeaderbuttons(i);
                    } else {
                        LOGGER.info(`${this._instanceInfo} Leader chose to abort Pre-AFK Check`);
                        return this.endRaid(i.user).then();
                    }
                }

                if (i.customId === RaidInstance.SET_LOCATION_ID) {
                    LOGGER.info(`${this._instanceInfo} Leader chose to set a new location`);
                    this.getNewLocation(i.user).then();
                    return;
                }
            });
            return true;
        }

        if (this._raidStatus === RaidStatus.AFK_CHECK) {
            this._controlPanelReactionCollector.on("collect", async (i: ButtonInteraction<"cached">) => {
                if (!(await validateInVc(i))) {
                    return;
                }
                const member = await GuildFgrUtilities.fetchGuildMember(this._guild, i.user.id);
                await i.deferUpdate();
                if (i.customId === RaidInstance.START_RAID_ID) {
                    LOGGER.info(`${this._instanceInfo} ${member?.displayName} chose to end AFK Check and start raid`);
                    this.endAfkCheck(i.user).then();
                    return;
                }

                if (i.customId === RaidInstance.ABORT_AFK_ID) {
                    if (i.user.id !== this._memberInit.id) {
                        return this.showWrongLeaderbuttons(i);
                    } else {
                        LOGGER.info(`${this._instanceInfo} ${member?.displayName} chose to abort AFK Check`);
                        return this.endRaid(i.user).then();
                    }
                }

                if (i.customId === RaidInstance.SET_LOCATION_ID) {
                    LOGGER.info(`${this._instanceInfo} ${member?.displayName} chose to set a new location`);
                    this.getNewLocation(i.user).then();
                    return;
                }
            });

            return true;
        }

        // Is in raid
        this._controlPanelReactionCollector.on("collect", async (i) => {
            if (!(await validateInVc(i))) {
                return;
            }
            const member = await GuildFgrUtilities.fetchGuildMember(this._guild, i.user.id);

            if (i.customId === RaidInstance.END_RAID_ID) {
                LOGGER.info(`${this._instanceInfo} ${member?.displayName} chose to end raid`);
                this.endRaid(i.user).then();
                return;
            }

            if (i.customId === RaidInstance.CHAIN_LOG_ID) {
                this.provideChainLogModal(i as ButtonInteraction<"cached">);
                return;
            }

            if (i.customId === RaidInstance.RESTART_RAID) {
                LOGGER.info(`${this._instanceInfo} ${member?.displayName} chose to restart AFK check.`);
                await this.endRaid(i.user, true);
                const rm = new RaidInstance(
                    member!,
                    await MongoManager.getOrCreateGuildDoc(this._guild.id, true),
                    this._raidSection,
                    this._dungeon,
                    {
                        vcless: this._vcless,
                        existingVc: {
                            vc: this._raidVc!,
                            oldPerms: this._oldVcPerms,
                        },
                    }
                );
                rm.startPreAfkCheck().then();
                return;
            }

            if (i.customId === RaidInstance.SET_LOCATION_ID) {
                await i.deferUpdate();
                LOGGER.info(`${this._instanceInfo} ${member?.displayName} chose to set a new location`);
                this.getNewLocation(i.user).then();
                return;
            }

            if (i.customId === RaidInstance.LOCK_RAID_ID) {
                LOGGER.info(`${this._instanceInfo} ${member?.displayName} chose to lock the raid`);
                this._raidLocked = true;
                await Promise.all([
                    this._raidVc?.permissionOverwrites.edit(this._guild.roles.everyone.id, {
                        CONNECT: false,
                    }),
                    i.reply({
                        content: "Locked Raid.",
                        ephemeral: true,
                    }),
                    this.logEvent("Raid locked.", true),
                ]);
                sendTemporaryAlert(
                    this._afkCheckChannel,
                    `${this._leaderName}'s Raid has been locked.`,
                    this._tempAlertDelay
                ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return;
            }

            if (i.customId === RaidInstance.UNLOCK_RAID_ID) {
                LOGGER.info(`${this._instanceInfo} ${member?.displayName} chose to unlock the raid`);
                this._raidLocked = false;
                await Promise.all([
                    this._raidVc?.permissionOverwrites.edit(this._guild.roles.everyone.id, {
                        CONNECT: null,
                    }),
                    i.reply({
                        content: "Unlocked Raid.",
                        ephemeral: true,
                    }),
                    this.logEvent("Raid unlocked.", true).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`)),
                ]);
                sendTemporaryAlert(
                    this._afkCheckChannel,
                    `${this._leaderName}'s Raid has been unlocked.`,
                    this._tempAlertDelay
                ).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return;
            }
        });

        this._controlPanelReactionCollector.on("end", async (_, r) => {
            if (r !== "time") return;
            this.endRaid(null).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
        });

        return true;
    }

    /**
     * Logs a run. This will begin an interactive process where the member that ended the run:
     * - Selects the main leader.
     * - Selects any key poppers.
     * - Selects success/failure of raid.
     * - Sends a screenshot of all the players that completed the raid (/who).
     *
     * This will also log quotas, stats, and add points accordingly.
     *
     * @param {GuildMember} memberThatEnded The member that ended this run.
     * @private
     */
    private async logRun(memberThatEnded: GuildMember): Promise<void> {
        LOGGER.info(`${this._instanceInfo} Logging the run`);
        const membersKeyPoppers: PriorityLogInfo[] = [];
        const membersAtEnd: GuildMember[] = [];
        const membersThatLeft: GuildMember[] = [];

        // 1) Validate number of completions
        const botMsg = await GlobalFgrUtilities.sendMsg(this._controlPanelChannel, {
            embeds: [
                MessageUtilities.generateBlankEmbed(memberThatEnded, "RED")
                    .setTitle(`Logging Run: ${this._dungeon.dungeonName}`)
                    .setDescription(
                        "What was the run status of the __last__ dungeon that was completed? If you did a chain, you" +
                        " will need to manually log the other runs."
                    )
                    .setFooter({ text: FOOTER_INFO_MSG }),
            ],
            components: AdvancedCollector.getActionRowsFromComponents([
                new MessageButton()
                    .setLabel("Success")
                    .setCustomId("success")
                    .setEmoji(EmojiConstants.GREEN_CHECK_EMOJI)
                    .setStyle("SUCCESS"),
                new MessageButton()
                    .setLabel("Failed")
                    .setCustomId("failed")
                    .setEmoji(EmojiConstants.X_EMOJI)
                    .setStyle("DANGER"),
                ButtonConstants.CANCEL_LOGGING_BUTTON,
            ]),
        });

        // No bot message = don't do logging
        if (!botMsg) {
            return;
        }

        const runStatusRes = await AdvancedCollector.startInteractionCollector({
            acknowledgeImmediately: true,
            clearInteractionsAfterComplete: false,
            deleteBaseMsgAfterComplete: false,
            duration: 5 * 60 * 1000,
            oldMsg: botMsg,
            targetAuthor: memberThatEnded,
            targetChannel: this._controlPanelChannel,
        });

        if (!runStatusRes || runStatusRes.customId === ButtonConstants.CANCEL_LOGGING_ID) {
            // TODO validate this better
            botMsg.delete().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
            return;
        }

        const isSuccess = runStatusRes.customId === "success";

        const skipButton = new MessageButton()
            .setLabel("Skip")
            .setEmoji(EmojiConstants.LONG_RIGHT_TRIANGLE_EMOJI)
            .setStyle("DANGER")
            .setCustomId("skip");

        const buttonsForSelectingMembers = AdvancedCollector.getActionRowsFromComponents([
            new MessageButton()
                .setLabel("Confirm")
                .setEmoji(EmojiConstants.GREEN_CHECK_EMOJI)
                .setStyle("SUCCESS")
                .setCustomId("confirm"),
            skipButton,
            ButtonConstants.CANCEL_BUTTON,
        ]);

        // 2) Get main leader.
        LOGGER.info(`${this._instanceInfo} Determining main leader`);
        let mainLeader: GuildMember | null = memberThatEnded;
        while (true) {
            await botMsg.edit({
                embeds: [
                    MessageUtilities.generateBlankEmbed(memberThatEnded, "RED")
                        .setTitle(`Leader that Led: ${this._dungeon.dungeonName}`)
                        .setDescription(
                            "Who was the main leader in the __last__ run? Usually, the main leader is the" +
                            " leader that led a majority of the run."
                        )
                        .addField("Selected Main Leader", `${mainLeader} - \`${mainLeader.displayName}\``)
                        .addField(
                            "Instructions",
                            "The selected main leader is shown above. To select a main leader, either type an in-game" +
                            " name, Discord ID, or mention a person. Once you are satisfied with your choice," +
                            " press the **Confirm** button. If you don't want to log this run with *any* main" +
                            " leader, select the **Skip** button."
                        )
                        .setFooter({ text: FOOTER_INFO_MSG }),
                ],
                components: buttonsForSelectingMembers,
            });

            const memberToPick = await AdvancedCollector.startDoubleCollector<GuildMember | -1>(
                {
                    cancelFlag: "-cancel",
                    deleteResponseMessage: true,
                    acknowledgeImmediately: true,
                    clearInteractionsAfterComplete: false,
                    deleteBaseMsgAfterComplete: false,
                    duration: 5 * 60 * 1000,
                    oldMsg: botMsg,
                    targetAuthor: memberThatEnded,
                    targetChannel: this._controlPanelChannel,
                },
                async (m) => (await UserManager.resolveMember(this._guild, m.content ?? "", true))?.member ?? -1
            );

            if (!memberToPick) {
                botMsg.delete().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return;
            }

            if (typeof memberToPick === "number") {
                await botMsg.edit({
                    embeds: [
                        MessageUtilities.generateBlankEmbed(this._guild, "RED")
                            .setTitle("Invalid Member Given")
                            .setDescription("Please specify a valid member. This can either be a mention, ID, or IGN.")
                            .setFooter({ text: "After 5 seconds, this message will ask again." }),
                    ],
                    components: [],
                });

                await MiscUtilities.stopFor(5 * 1000);
                continue;
            }

            if (memberToPick instanceof MessageComponentInteraction) {
                if (memberToPick.customId === "confirm") {
                    break;
                }

                if (memberToPick.customId === "skip") {
                    mainLeader = null;
                    break;
                }

                if (memberToPick.customId === ButtonConstants.CANCEL_LOGGING_ID) {
                    botMsg.delete().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                    return;
                }

                continue;
            }

            mainLeader = memberToPick;
        }

        // 3) Get key poppers
        LOGGER.info(`${this._instanceInfo} Determining key poppers`);
        const allKeys = this._allEssentialOptions.filter((x) => x.type === "KEY" || x.type === "NM_KEY");
        for await (const [key, reactionInfo] of allKeys) {
            const possiblePoppers = this._pplWithEarlyLoc.get(key)!;
            const selectMenus: MessageSelectMenu[] = [];
            ArrayUtilities.breakArrayIntoSubsets(possiblePoppers, 25).forEach((subset, index) => {
                selectMenus.push(
                    new MessageSelectMenu()
                        .setCustomId(`${key}-${index}`)
                        .setMinValues(1)
                        .setMaxValues(1)
                        .setOptions(
                            subset.map((x) => {
                                return {
                                    label: x.member.displayName,
                                    value: x.member.id,
                                    description: `Modifiers: [${x.modifiers.join(", ")}]`,
                                };
                            })
                        )
                );
            });

            const components = buttonsForSelectingMembers.concat(
                AdvancedCollector.getActionRowsFromComponents(selectMenus)
            );

            let selectedMember: GuildMember | null = null;
            while (true) {
                await botMsg.edit({
                    embeds: [
                        MessageUtilities.generateBlankEmbed(memberThatEnded, "RED")
                            .setTitle(`Logging Key Poppers: ${this._dungeon.dungeonName}`)
                            .setDescription(
                                `You are now logging the ${getItemDisplay(reactionInfo)} popper for the __last` +
                                " dungeon__ that was either completed or failed. If you need to log more than one" +
                                " key, please manually do it by command."
                            )
                            .addField(
                                "Selected Popper",
                                selectedMember
                                    ? `${selectedMember} - \`${selectedMember.displayName}\``
                                    : "Not Selected."
                            )
                            .addField(
                                "Instructions",
                                "The popper for this key is shown above. To log the person that used this key for" +
                                " the last dungeon in this run, either send their in-game name, Discord ID, or" +
                                " mention them. You may alternatively select their IGN from the select menu below." +
                                " If no one used this key for the last dungeon in this run (excluding Bis keys)," +
                                " press the `Skip` button. Once you selected the correct member, press the" +
                                " `Confirm` button."
                            )
                            .setFooter({ text: FOOTER_INFO_MSG }),
                    ],
                    components: components,
                });

                const memberToPick = await AdvancedCollector.startDoubleCollector<GuildMember | -1>(
                    {
                        cancelFlag: "-cancel",
                        deleteResponseMessage: true,
                        acknowledgeImmediately: true,
                        clearInteractionsAfterComplete: false,
                        deleteBaseMsgAfterComplete: false,
                        duration: 5 * 60 * 1000,
                        oldMsg: botMsg,
                        targetAuthor: memberThatEnded,
                        targetChannel: this._controlPanelChannel,
                    },
                    async (m) => (await UserManager.resolveMember(this._guild, m.content ?? "", true))?.member ?? -1
                );

                if (!memberToPick) {
                    botMsg.delete().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                    return;
                }

                if (typeof memberToPick === "number") {
                    await botMsg.edit({
                        embeds: [
                            MessageUtilities.generateBlankEmbed(this._guild, "RED")
                                .setTitle("Invalid Member Given")
                                .setDescription(
                                    "Please specify a valid member. This can either be a mention, ID, or IGN."
                                )
                                .setFooter({ text: "After 5 seconds, this message will ask again." }),
                        ],
                        components: [],
                    });

                    await MiscUtilities.stopFor(5 * 1000);
                    continue;
                }

                if (memberToPick instanceof MessageComponentInteraction) {
                    if (memberToPick.isSelectMenu()) {
                        selectedMember = possiblePoppers.find((x) => x.member.id === memberToPick.values[0])!.member;
                        continue;
                    }

                    if (memberToPick.customId === "confirm") {
                        break;
                    }

                    if (memberToPick.customId === "skip") {
                        selectedMember = null;
                        break;
                    }

                    if (memberToPick.customId === ButtonConstants.CANCEL_LOGGING_ID) {
                        botMsg.delete().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                        return;
                    }

                    continue;
                }

                selectedMember = memberToPick;
            }

            if (selectedMember) {
                membersKeyPoppers.push({
                    id: key,
                    member: selectedMember,
                    name: reactionInfo.name,
                });
            }
        }

        // 4) Get /who if success
        // Otherwise, give everyone in the VC a fail
        LOGGER.info(`${this._instanceInfo} Parsing /who for completions`);
        if (isSuccess) {

            const buttonArr: MessageButton[] = [];
            if (!this._vcless) {
                buttonArr.push(
                    new MessageButton()
                        .setLabel("Users in VC")
                        .setEmoji("🎙️")
                        .setStyle("PRIMARY")
                        .setCustomId("parse-vc")
                );
            }
            buttonArr.push(skipButton);

            await botMsg.edit({
                embeds: [
                    MessageUtilities.generateBlankEmbed(memberThatEnded, "RED")
                        .setTitle(`Logging Run: ${this._dungeon.dungeonName}`)
                        .setDescription(
                            "Please send a screenshot containing the `/who` results from the completion of the"
                            + " dungeon. If you don't have a `/who` screenshot, press the `Skip` button or the"
                            + " `Users in VC` button (for raids using VC) to log for everyone who was still in the voice channel."
                            + " Your screenshot should be an image, not a link to one."
                        )
                        .addField(
                            "Warning",
                            "The person that ended the run should be the same person that took this /who screenshot."
                        )
                        .setFooter({ text: FOOTER_INFO_MSG }),
                ],
                components: AdvancedCollector.getActionRowsFromComponents([
                    ...buttonArr,
                ])
            });

            let attachment: MessageAttachment | null = null;
            const resObj = await AdvancedCollector.startDoubleCollector<Message>(
                {
                    oldMsg: botMsg,
                    cancelFlag: "cancel",
                    targetChannel: this._controlPanelChannel,
                    targetAuthor: memberThatEnded,
                    deleteBaseMsgAfterComplete: false,
                    deleteResponseMessage: false,
                    duration: 5 * 60 * 1000,
                    acknowledgeImmediately: true,
                    clearInteractionsAfterComplete: false,
                },
                (m: Message) => {
                    if (m.attachments.size === 0) return;

                    // Images have a height property, non-images don't.
                    const imgAttachment = m.attachments.find((x) => x.height !== null);
                    if (!imgAttachment) {
                        m.delete().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                        return;
                    }

                    attachment = imgAttachment;
                    return m;
                }
            );

            if (!resObj) {
                botMsg.delete().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return;
            }

            if (resObj instanceof Message && attachment) {
                const data = await GlobalFgrUtilities.tryExecuteAsync(async () => {
                    const res = await RealmSharperWrapper.parseWhoScreenshotOnly(attachment!.url);
                    return res ? res : null;
                });
                LOGGER.info(`${this._instanceInfo} Names found in completion: ${data?.names}`);
                resObj.delete().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                if (data && data.names.length > 0) {
                    for (const memberThatJoined of this._membersThatJoined) {
                        const names = UserManager.getAllNames(memberThatJoined.displayName, true);
                        // If we can find at least one name (in the person's display name) that is also in the
                        // /who, then give them credit
                        if (data.names.some((x) => names.includes(x.toLowerCase()))) {
                            membersAtEnd.push(memberThatJoined);
                        }
                        else if (memberThatJoined.id !== mainLeader?.id) membersThatLeft.push(memberThatJoined);
                    }
                } else {
                    await botMsg.edit({
                        embeds: [
                            MessageUtilities.generateBlankEmbed(memberThatEnded, "RED")
                                .setTitle(`Logging Run: ${this._dungeon.dungeonName}`)
                                .setDescription(
                                    "It appears that the parsing API isn't up, or the screenshot that you provided" +
                                    " is not valid. In either case, this step has been skipped."
                                )
                                .setFooter({ text: "This will move to the next step in 5 seconds." }),
                        ],
                    });

                    await MiscUtilities.stopFor(5 * 1000);
                }
            }

            // Giving completes to those who were in VC instead of asking for a /who
            if (!(resObj instanceof Message) && resObj.customId) {
                if (resObj.customId === "parse-vc") { // Else, it is the "skip" button    
                    // Filter against those who originally joined VC to remove those who left.
                    const lastInVC = this._membersThatJoined.filter(member => !this._membersThatLeftChannel.includes(member) && mainLeader?.id !== member.id);

                    membersAtEnd.push(...lastInVC.values());
                    membersThatLeft.push(...this._membersThatLeftChannel);
                }
            }
        }
        else {
            membersThatLeft.push(...this._membersThatJoined);
        }

        // 5) Log everything
        LOGGER.info(`${this._instanceInfo} Logging for quotas`);
        let dungeonId = this._dungeon.codeName;
        if (!this._dungeon.isBuiltIn) {
            const otherId = (this._dungeon as ICustomDungeonInfo).logFor;
            if (otherId) {
                dungeonId = otherId;
            }
        }

        if (mainLeader) {
            membersAtEnd.push(mainLeader); // Allows the leader to receive a completion

            await LoggerManager.logDungeonLead(
                mainLeader,
                dungeonId,
                isSuccess ? RunResult.Complete : RunResult.Failed,
                1
            );

            const quotaToUse = QuotaManager.findBestQuotaToAdd(
                mainLeader,
                this._guildDoc,
                isSuccess ? "RunComplete" : "RunFailed",
                dungeonId
            );

            if (quotaToUse) {
                await QuotaManager.logQuota(
                    mainLeader,
                    quotaToUse,
                    isSuccess ? `RunComplete:${dungeonId}` : `RunFailed:${dungeonId}`,
                    1
                );
            }
        }
        await Promise.all(membersKeyPoppers.map((x) => LoggerManager.logKeyUse(x.member, x.id, 1)));
        await Promise.all(membersThatLeft.map((x) => LoggerManager.logDungeonRun(x, dungeonId, false, 1)));
        await Promise.all(membersAtEnd.map((x) => LoggerManager.logDungeonRun(x, dungeonId, true, 1)));

        await botMsg.edit({
            components: [],
            embeds: [
                MessageUtilities.generateBlankEmbed(this._guild, "RED")
                    .setTitle("Logging Successful")
                    .setDescription(`Your \`${this._dungeon.dungeonName}\` run was successfully logged.`)
                    .addField(
                        "Logging Summary",
                        new StringBuilder()
                            .append(`- Main Leader: ${mainLeader ?? "N/A"}`)
                            .appendLine()
                            .append(membersKeyPoppers.map((x) => `- ${x.name}: ${x.member}`).join("\n"))
                            .appendLine()
                            .append(`- Completed: ${membersAtEnd.length}`)
                            .appendLine()
                            .append(`- Failed: ${membersThatLeft.length}`)
                            .toString()
                    )
                    .addField(
                        "Next Step(s)",
                        "If you did more dungeons in this raid (i.e. this was a chain), you will need to manually" +
                        " log the *other* runs that were led. Note that you also need to log assisting raid leaders" +
                        " for all runs that were completed in this raid (including this one).\n\nAlso, be sure to" +
                        " log any keys that were popped along with any priority reactions so those that brought" +
                        " the key and/or priority reactions can be rewarded, if applicable."
                    ),
            ],
        });
    }
}

type PriorityLogInfo = {
    member: GuildMember;
    id: string;
    name: string;
};

enum RaidStatus {
    NOTHING,
    PRE_AFK_CHECK,
    AFK_CHECK,
    IN_RUN,
    RUN_FINISHED,
    ABORTED,
}

interface IParseResponse {
    inVcButNotInRaid: string[];
    inRaidButNotInVC: string[];
    isValid: boolean;
    whoRes: string[];
}
