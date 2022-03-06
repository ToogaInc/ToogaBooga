// Suppress unused methods for this file.
// noinspection JSUnusedGlobalSymbols,AssignmentToFunctionParameterJS
import {Logger} from "../utilities/Logger";
import {AdvancedCollector} from "../utilities/collectors/AdvancedCollector";
import {
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
    OverwriteResolvable,
    Role,
    Snowflake,
    TextChannel,
    User,
    VoiceChannel,
    VoiceState
} from "discord.js";
import {StringBuilder} from "../utilities/StringBuilder";
import {ArrayUtilities} from "../utilities/ArrayUtilities";
import {MAPPED_AFK_CHECK_REACTIONS} from "../constants/dungeons/MappedAfkCheckReactions";
import {MessageUtilities} from "../utilities/MessageUtilities";
import {DUNGEON_DATA} from "../constants/dungeons/DungeonData";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {MongoManager} from "../managers/MongoManager";
import {GlobalFgrUtilities} from "../utilities/fetch-get-request/GlobalFgrUtilities";
import {GeneralConstants} from "../constants/GeneralConstants";
import {RealmSharperWrapper} from "../private-api/RealmSharperWrapper";
import {Bot} from "../Bot";
import {EmojiConstants} from "../constants/EmojiConstants";
import {MiscUtilities} from "../utilities/MiscUtilities";
import {UserManager} from "../managers/UserManager";
import {
    ICustomDungeonInfo,
    IDungeonInfo,
    IDungeonModifier,
    IGuildInfo,
    IRaidInfo,
    IRaidOptions,
    ISectionInfo
} from "../definitions";
import {TimeUtilities} from "../utilities/TimeUtilities";
import {LoggerManager} from "../managers/LoggerManager";
import {QuotaManager} from "../managers/QuotaManager";
import {DEFAULT_MODIFIERS, DUNGEON_MODIFIERS} from "../constants/dungeons/DungeonModifiers";
import {
    confirmReaction,
    controlPanelCollectorFilter,
    delay,
    getItemDisplay,
    getReactions,
    ReactionInfoMore,
    sendTemporaryAlert,
} from "./Common";
import {ButtonConstants} from "../constants/ButtonConstants";
import {PermsConstants} from "../constants/PermsConstants";
import {StringUtil} from "../utilities/StringUtilities";
import getFormattedTime = TimeUtilities.getFormattedTime;
import RunResult = LoggerManager.RunResult;

const FOOTER_INFO_MSG: string = "If you don't want to log this run, press the \"Cancel Logging\" button. Note that"
    + " all runs should be logged for accuracy. This collector will automatically expire after 5 minutes of no"
    + " interaction.";


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
    private static readonly LOCK_VC_ID: string = "lock_vc";
    private static readonly UNLOCK_VC_ID: string = "unlock_vc";
    private static readonly PARSE_VC_ID: string = "parse_vc";

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
            .setStyle("PRIMARY")
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
            .setStyle("PRIMARY")
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
            .setCustomId(RaidInstance.LOCK_VC_ID)
            .setStyle("PRIMARY"),
        new MessageButton()
            .setLabel("Unlock Raid VC")
            .setEmoji(EmojiConstants.UNLOCK_EMOJI)
            .setCustomId(RaidInstance.UNLOCK_VC_ID)
            .setStyle("PRIMARY"),
        new MessageButton()
            .setLabel("Parse Raid VC")
            .setEmoji(EmojiConstants.PRINTER_EMOJI)
            .setCustomId(RaidInstance.PARSE_VC_ID)
            .setStyle("PRIMARY")
    ]);

    // The guild that this AFK check is in.
    private readonly _guild: Guild;
    // The dungeon.
    private readonly _dungeon: IDungeonInfo;
    // The AFK check channel.
    private readonly _afkCheckChannel: TextChannel;
    // The control panel channel.
    private readonly _controlPanelChannel: TextChannel;
    // The section.
    private readonly _raidSection: ISectionInfo;
    // Number of people that can get early location through Nitro.
    private readonly _numNitroEarlyLoc: number;

    // Nonessential reactions. These are reactions that don't give any perks. More can be added at any point.
    private readonly _nonEssentialReactions: EmojiIdentifierResolvable[];

    // Buttons to display on the AFK check. These should only contain essential buttons.
    private readonly _afkCheckButtons: MessageButton[];
    // All essential options (options that give early location). Equivalent to _afkCheckButtons but as raw data
    // instead of buttons. The key is the mapping key.
    private readonly _allEssentialOptions: Collection<string, ReactionInfoMore>;
    // A collection that contains the IAfkCheckReaction.mapKey as the key and the members with the corresponding
    // item as the value.
    private readonly _pplWithEarlyLoc: Collection<string, { member: GuildMember, modifiers: string[] }[]>;
    // A collection that deals with *general* (Nitro, Patreon, etc.) early location. The key is the mapKey and the
    // value is an object containing the roles needed.
    private readonly _earlyLocToRole: Collection<string, Role[]>;

    // The guild doc.
    private _guildDoc: IGuildInfo;
    // The location.
    private _location: string;
    // Current raid status.
    private _raidStatus: RaidStatus;

    // The raid VC.
    private _raidVc: VoiceChannel | null;
    // The AFK check message.
    private _afkCheckMsg: Message | null;
    // The control panel message.
    private _controlPanelMsg: Message | null;

    // Whether intervals are running.
    private _intervalsAreRunning: boolean = false;

    // The collector waiting for interactions from users.
    private _afkCheckButtonCollector: InteractionCollector<MessageComponentInteraction> | null;
    // The collector waiting for interactions from staff.
    private _controlPanelReactionCollector: InteractionCollector<MessageComponentInteraction> | null;

    // The VC limit.
    private readonly _vcLimit: number;
    // The member that initiated this.
    private readonly _memberInit: GuildMember;
    // The leader's name (as a string).
    private readonly _leaderName: string;
    // The cost, in points, for early location.
    private readonly _earlyLocPointCost: number;

    // The members that are joining this raid.
    private _membersThatJoined: GuildMember[] = [];
    private readonly _raidLogs: string[] = [];

    // Base feedback channel; for initial use only (this channel's parent is where other feedback channels should be
    // created)
    private readonly _feedbackBaseChannel: TextChannel | null;
    private readonly _raidStorageChan: TextChannel | null;

    // Channels created specifically for this raid; these will be deleted once the raid is over
    private _thisFeedbackChan: TextChannel | null;
    private _logChan: TextChannel | null;

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
    private static readonly DEFAULT_EMBED_COLOR: number = 16777215; //default to white
    private _embedColor: number;

    // The raid instance start time and expiration time
    private _startTime: number;
    private _expTime: number;
    private static readonly DEFAULT_RAID_DURATION: number = 60 * 60 * 1000; //1 hour in milliseconds

    // Instance information for logging
    private readonly _instanceInfo: string;

    // Time between panel updates in ms
    private readonly _intervalDelay: number = 5000;

    // Temporary Alert Duration
    private readonly _tempAlertDelay: number = 10 * 60 * 1000; //Ten minutes


    /**
     * Creates a new `RaidInstance` object.
     * @param {GuildMember} memberInit The member that initiated this raid.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section where this raid is occurring. Note that the verified role must exist.
     * @param {IDungeonInfo | ICustomDungeonInfo} dungeon The dungeon that is being raided.
     * @param {IRaidOptions} [raidOptions] The raid options, if any.
     */
    private constructor(memberInit: GuildMember, guildDoc: IGuildInfo, section: ISectionInfo,
                        dungeon: IDungeonInfo | ICustomDungeonInfo, raidOptions?: IRaidOptions) {

        this._memberInit = memberInit;
        this._guild = memberInit.guild;
        this._dungeon = dungeon;
        this._location = raidOptions?.location ?? "";
        this._raidStatus = RaidStatus.NOTHING;
        this._raidVc = null;
        this._afkCheckMsg = null;
        this._controlPanelMsg = null;
        this._guildDoc = guildDoc;
        this._raidSection = section;
        this._membersThatJoined = [];
        this._modifiersToUse = DEFAULT_MODIFIERS;
        this._embedColor = RaidInstance.DEFAULT_EMBED_COLOR;
        this._startTime = Date.now();
        //this._expTime = this._startTime + 1000*20; //Testing
        this._expTime = this._startTime + (section.otherMajorConfig.afkCheckProperties.afkCheckTimeout ?? RaidInstance.DEFAULT_RAID_DURATION);
        LOGGER.debug(`Timeout duration in milliseconds: ` + section.otherMajorConfig.afkCheckProperties.afkCheckTimeout ?? RaidInstance.DEFAULT_RAID_DURATION);

        this._logChan = null;
        this._thisFeedbackChan = null;

        this._afkCheckButtonCollector = null;
        this._controlPanelReactionCollector = null;

        const brokenUpName = UserManager.getAllNames(memberInit.displayName);
        this._leaderName = brokenUpName.length > 0
            ? brokenUpName[0]
            : memberInit.displayName;

        this._afkCheckChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            memberInit.guild,
            section.channels.raids.afkCheckChannelId
        )!;

        this._controlPanelChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            memberInit.guild,
            section.channels.raids.controlPanelChannelId
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
        LOGGER.debug(`${this._instanceInfo} Raid start time: ${TimeUtilities.getDateTime(this._startTime, "America/Los_Angeles")}`);
        LOGGER.debug(`${this._instanceInfo} Raid expiration time: ${TimeUtilities.getDateTime(this._expTime, "America/Los_Angeles")}`);

        // Which essential reacts are we going to use.
        const reactions = getReactions(dungeon, guildDoc);

        // This defines the number of people that gets early location via NITRO only.
        let numEarlyLoc: number = -2;
        // And this is the raid VC limit
        let vcLimit: number = -2;
        // And this is the point cost.
        let costForEarlyLoc: number = 0;
        // Process dungeon based on whether it is custom or not.
        if (dungeon.isBuiltIn) {
            const dgnOverride = guildDoc.properties.dungeonOverride
                .find(x => x.codeName === dungeon.codeName);

            if (dgnOverride && dgnOverride.vcLimit !== -1)
                vcLimit = dgnOverride.vcLimit;

            if (dgnOverride && dgnOverride.nitroEarlyLocationLimit !== -1)
                numEarlyLoc = dgnOverride.nitroEarlyLocationLimit;
            else if (section.otherMajorConfig.afkCheckProperties.nitroEarlyLocationLimit !== -1)
                numEarlyLoc = section.otherMajorConfig.afkCheckProperties.nitroEarlyLocationLimit;

            if (dgnOverride && dgnOverride.pointCost)
                costForEarlyLoc = dgnOverride.pointCost;

            if (dgnOverride?.allowedModifiers) {
                this._modifiersToUse = dgnOverride.allowedModifiers.map(x => {
                    return DUNGEON_MODIFIERS.find(modifier => modifier.modifierId === x);
                }).filter(x => x) as IDungeonModifier[];
            }
        }
        else {
            // If this is not a base or derived dungeon (i.e. it's a custom dungeon), then it must specify the nitro
            // limit.
            numEarlyLoc = (dungeon as ICustomDungeonInfo).nitroEarlyLocationLimit;
            costForEarlyLoc = (dungeon as ICustomDungeonInfo).pointCost;
            if ((dungeon as ICustomDungeonInfo).allowedModifiers) {
                this._modifiersToUse = (dungeon as ICustomDungeonInfo).allowedModifiers.map(x => {
                    return DUNGEON_MODIFIERS.find(modifier => modifier.modifierId === x);
                }).filter(x => x) as IDungeonModifier[];
            }
        }

        this._earlyLocPointCost = costForEarlyLoc;

        if (vcLimit === -2) {
            if (section.otherMajorConfig.afkCheckProperties.vcLimit !== -1)
                vcLimit = section.otherMajorConfig.afkCheckProperties.vcLimit;
            else
                vcLimit = 60;
        }

        if (numEarlyLoc === -2) {
            numEarlyLoc = Math.max(Math.floor(vcLimit * 0.1), 1);
        }

        this._vcLimit = vcLimit;
        this._numNitroEarlyLoc = numEarlyLoc;

        if (numEarlyLoc !== 0 && this._guild.roles.premiumSubscriberRole) {
            reactions.set("NITRO", {
                ...MAPPED_AFK_CHECK_REACTIONS.NITRO,
                earlyLocAmt: numEarlyLoc,
                isCustomReaction: false
            });
        }

        if (this._earlyLocPointCost > 0 && section.otherMajorConfig.afkCheckProperties.pointUserLimit > 0) {
            reactions.set("EARLY_LOC_POINTS", {
                earlyLocAmt: section.otherMajorConfig.afkCheckProperties.pointUserLimit,
                isCustomReaction: false,
                emojiInfo: {
                    identifier: EmojiConstants.TICKET_EMOJI,
                    isCustom: false
                },
                name: "Points",
                type: "EARLY_LOCATION",
                builtInEmoji: EmojiConstants.TICKET_EMOJI
            });
        }

        this._numNitroEarlyLoc = numEarlyLoc;

        // Go through all early location reactions and associate each reaction to a set of roles
        // If no roles can be associated, remove the reaction from the collection.
        this._earlyLocToRole = new Collection();
        Array.from(reactions.filter(x => x.type === "EARLY_LOCATION").entries()).forEach(x => {
            const [mapKey, info] = x;
            if (mapKey === "NITRO" && this._guild.roles.premiumSubscriberRole) {
                this._earlyLocToRole.set(mapKey, [this._guild.roles.premiumSubscriberRole]);
                return;
            }

            if (mapKey === "EARLY_LOC_POINTS") {
                return;
            }

            const rolesForEarlyLoc = (this._guildDoc.properties.genEarlyLocReactions
                .find(kv => kv.key === mapKey)?.value
                .filter(role => GuildFgrUtilities.hasCachedRole(this._guild, role))
                .map(role => GuildFgrUtilities.getCachedRole(this._guild, role)) ?? []) as Role[];

            if (rolesForEarlyLoc.length === 0 || info.earlyLocAmt === 0) {
                reactions.delete(mapKey);
                return;
            }

            this._earlyLocToRole.set(mapKey, rolesForEarlyLoc);
        });

        // Populate the collections
        this._allEssentialOptions = new Collection<string, ReactionInfoMore>();
        this._pplWithEarlyLoc = new Collection<string, { member: GuildMember, modifiers: string[] }[]>();
        this._nonEssentialReactions = [];
        this._afkCheckButtons = [];

        for (const [key, reactionInfo] of reactions) {
            // Non-essential reaction.
            if (reactionInfo.earlyLocAmt <= 0) {
                // No emoji = we can't do anything, so skip this one.
                if (reactionInfo.emojiInfo.isCustom
                    && !GlobalFgrUtilities.hasCachedEmoji(reactionInfo.emojiInfo.identifier))
                    continue;

                // If this is early loc, then there's no point in putting it as an unessential react.
                if (reactionInfo.type === "EARLY_LOCATION")
                    continue;

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
            const button = new MessageButton()
                .setLabel(reactionInfo.name)
                .setStyle("PRIMARY")
                .setCustomId(key);

            const emoji = reactionInfo.emojiInfo.isCustom
                ? GlobalFgrUtilities.getCachedEmoji(reactionInfo.emojiInfo.identifier)
                : reactionInfo.emojiInfo.identifier;
            if (emoji)
                button.setEmoji(emoji);

            this._afkCheckButtons.push(button);
        }
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
    public static new(memberInit: GuildMember, guildDoc: IGuildInfo, section: ISectionInfo, dungeon: IDungeonInfo,
                      raidOptions?: IRaidOptions): RaidInstance | null {
        // Could put these all in one if-statement but too long.
        if (!memberInit.guild)
            return null;
        if (!GuildFgrUtilities.hasCachedRole(memberInit.guild, section.roles.verifiedRoleId))
            return null;
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
    public static async createNewLivingInstance(guildDoc: IGuildInfo,
                                                raidInfo: IRaidInfo): Promise<RaidInstance | null> {
        LOGGER.info("Creating new raid instance from active raid");

        const guild = await GlobalFgrUtilities.fetchGuild(guildDoc.guildId);
        if (!guild) return null;

        const memberInit = await GuildFgrUtilities.fetchGuildMember(guild, raidInfo.memberInit);
        if (!memberInit) return null;

        const section = raidInfo.sectionIdentifier === "MAIN"
            ? MongoManager.getMainSection(guildDoc)
            : guildDoc.guildSections.find(x => x.uniqueIdentifier === raidInfo.sectionIdentifier);
        if (!section) return null;

        // Get base dungeons + custom dungeons
        const dungeon = DUNGEON_DATA
            .concat(guildDoc.properties.customDungeons)
            .find(x => x.codeName === raidInfo.dungeonCodeName);
        if (!dungeon) return null;

        // Get various channels needed for this to work
        const raidVc = GuildFgrUtilities.getCachedChannel<VoiceChannel>(guild, raidInfo.vcId);
        const afkCheckChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            guild,
            raidInfo.raidChannels.afkCheckChannelId
        );
        const controlPanelChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            guild,
            raidInfo.raidChannels.controlPanelChannelId
        );

        if (!afkCheckChannel
            || !controlPanelChannel
            || !afkCheckChannel.isText()
            || !controlPanelChannel.isText()
            || !raidVc)
            return null;

        const controlPanelMsg = await GuildFgrUtilities
            .fetchMessage(controlPanelChannel as TextChannel, raidInfo.controlPanelMessageId);
        const afkCheckMsg = await GuildFgrUtilities
            .fetchMessage(afkCheckChannel as TextChannel, raidInfo.afkCheckMessageId);
        if (!afkCheckMsg || !controlPanelMsg) return null;

        // Create the raid manager instance.
        const rm = new RaidInstance(memberInit, guildDoc, section, dungeon, {
            location: raidInfo.location
        });
        LOGGER.info(`${rm._instanceInfo} RaidInstance created`);

        rm._raidVc = raidVc;
        rm._afkCheckMsg = afkCheckMsg;
        rm._controlPanelMsg = controlPanelMsg;
        rm._raidStatus = raidInfo.status;
        rm._addedToDb = true;

        // If the raid has expired, abort the raid and return
        rm._startTime = raidInfo.startTime;
        rm._expTime = raidInfo.expirationTime;
        if (Date.now() > rm._expTime) {
            LOGGER.info(`${rm._instanceInfo} RaidInstance expired, cleaning.`);
            rm.cleanUpRaid(true).then();
            return null;
        }


        rm._thisFeedbackChan = GuildFgrUtilities.getCachedChannel<TextChannel>(
            guild,
            raidInfo.otherChannels.feedbackChannelId
        );
        rm._logChan = GuildFgrUtilities.getCachedChannel<TextChannel>(
            guild,
            raidInfo.otherChannels.logChannelId
        );
        rm._membersThatJoined = raidInfo.membersThatJoined.map(x => GuildFgrUtilities.getCachedMember(guild, x))
            .filter(x => x !== null) as GuildMember[];

        // Add early location entries.
        for await (const entry of raidInfo.earlyLocationReactions) {
            const member = await GuildFgrUtilities.fetchGuildMember(guild, entry.userId);
            if (!member) continue;
            await rm.addEarlyLocationReaction(member, entry.reactCodeName, entry.modifiers, false);
            rm._peopleToAddToVc.add(member.id);
        }

        rm._afkCheckButtons.forEach(btn => {
            if (!rm.stillNeedEssentialReact(btn.customId!)) {
                btn.setDisabled(true);
            }
        });

        if (rm._raidStatus === RaidStatus.PRE_AFK_CHECK || rm._raidStatus === RaidStatus.AFK_CHECK) {
            rm.startControlPanelCollector();
            rm.startIntervals();
            rm.startAfkCheckCollector();
        }
        else if (rm._raidStatus === RaidStatus.IN_RUN) {
            rm.startControlPanelCollector();
            rm.startIntervals();
        }

        RaidInstance.ActiveRaids.set(rm._afkCheckMsg.id, rm);
        return rm;
    }

    /**
     * Starts a pre-AFK check for this raid instance. During the pre-AFK check, only priority reactions can join the VC.
     * @throws {ReferenceError} If the verified role for the section does not exist.
     */
    public async startPreAfkCheck(): Promise<void> {
        LOGGER.info(`${this._instanceInfo} Starting Pre-AFK Check`);
        const verifiedRole = await GuildFgrUtilities.fetchRole(this._guild, this._raidSection.roles.verifiedRoleId);
        if (!verifiedRole)
            throw new ReferenceError("Verified role not defined.");

        // Don't use setRaidStatus since we didn't save the afk check info yet
        this._raidStatus = RaidStatus.PRE_AFK_CHECK;

        // Obtain dungeon color for embeds
        if (this._dungeon.dungeonColors.length !== 0) {
            this._embedColor = ArrayUtilities.getRandomElement(this._dungeon.dungeonColors);
        }

        // Raid VC MUST be initialized first before we can use a majority of the helper methods.
        const [vc, logChannel] = await Promise.all([
            this._guild.channels.create(`${EmojiConstants.LOCK_EMOJI} ${this._leaderName}'s Raid`, {
                type: "GUILD_VOICE",
                userLimit: this._vcLimit,
                permissionOverwrites: this.getPermissionsForRaidVc(false),
                parent: this._afkCheckChannel!.parent!
            }),
            new Promise<TextChannel | null>(async (resolve) => {
                if (!this._raidSection.otherMajorConfig.afkCheckProperties.createLogChannel)
                    return resolve(null);

                const logChan = await this._guild.channels.create(`${this._leaderName}-raid-logs`, {
                    type: "GUILD_TEXT",
                    parent: this._afkCheckChannel!.parent!,
                    permissionOverwrites: [
                        {
                            id: this._guild.roles.everyone,
                            deny: ["VIEW_CHANNEL"]
                        },
                        {
                            id: Bot.BotInstance.client.user!.id,
                            allow: ["ADD_REACTIONS", "VIEW_CHANNEL"]
                        },
                        {
                            id: this._guildDoc.roles.staffRoles.teamRoleId,
                            allow: ["VIEW_CHANNEL"]
                        }
                    ]
                });

                return resolve(logChan as TextChannel);
            })
        ]);

        if (!vc) return;
        vc.setPosition(0).then();
        this._raidVc = vc as VoiceChannel;
        this._logChan = logChannel;

        // Create our initial control panel message.
        this._controlPanelMsg = await this._controlPanelChannel.send({
            embeds: [this.getControlPanelEmbed()!],
            components: RaidInstance.CP_PRE_AFK_BUTTONS
        });
        this.startControlPanelCollector();

        // Create our initial AFK check message.
        this._afkCheckMsg = await this._afkCheckChannel.send({
            content: "@here A pre-AFK check is currently ongoing.",
            embeds: [this.getAfkCheckEmbed()!],
            components: AdvancedCollector.getActionRowsFromComponents(this._afkCheckButtons)
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
        if (!this._afkCheckMsg || !this._controlPanelMsg || !this._raidVc || !this._afkCheckChannel)
            return;
        LOGGER.info(`${this._instanceInfo} Starting AFK Check`);

        await this._controlPanelMsg.edit({
            embeds: [this.getControlPanelEmbed()!],
            components: []
        });

        this.logEvent("AFK check has been started.", true).catch();
        const tempMsg = await this._afkCheckChannel.send({
            content: `${this._raidVc.toString()} will be unlocked in 5 seconds. Prepare to join!`
        });
        const tempMsgControl = await this._controlPanelChannel.send({
            content: `${this._raidVc.toString()} will be unlocked in 5 seconds.`
        });
        await MiscUtilities.stopFor(5 * 1000);
        tempMsg.delete().catch();
        tempMsgControl.delete().catch();
        LOGGER.info(`${this._instanceInfo} Opening VC`);
        // We are officially in AFK check mode.
        // We do NOT start the intervals OR collector since pre-AFK and AFK have the exact same collectors/intervals.
        await this.setRaidStatus(RaidStatus.AFK_CHECK);
        // Only happens if someone deleted the raid vc
        if (!this.raidVc) {
            return;
        }
        await this._raidVc.permissionOverwrites.set(this.getPermissionsForRaidVc(true));

        await this.stopAllIntervalsAndCollectors();
        this.startIntervals();
        this.startControlPanelCollector();
        this.startAfkCheckCollector();

        // However, we forcefully edit the embeds.
        await Promise.all([
            this._raidVc.edit({
                name: `${EmojiConstants.GREEN_CHECK_EMOJI} ${this._leaderName}'s Raid`
            }),
            this._afkCheckMsg.edit({
                content: "@here An AFK Check is currently ongoing.",
                embeds: [this.getAfkCheckEmbed()!],
                components: AdvancedCollector.getActionRowsFromComponents(this._afkCheckButtons)
            }),
            this._controlPanelMsg.edit({
                embeds: [this.getControlPanelEmbed()!],
                components: RaidInstance.CP_AFK_BUTTONS
            })
        ]);
        AdvancedCollector.reactFaster(this._afkCheckMsg, this._nonEssentialReactions);
    }

    /**
     * Ends the AFK check. There will be no post-AFK check. This will create the feedback channel, if at all.
     * @param {GuildMember | null} memberEnded The member that ended the AFK check, or `null` if it was ended
     * automatically.
     */
    public async endAfkCheck(memberEnded: GuildMember | User | null): Promise<void> {
        // No raid VC means we haven't started AFK check.
        if (!this._raidVc || !this._afkCheckMsg || !this._controlPanelMsg || this._raidStatus !== RaidStatus.AFK_CHECK)
            return;

        LOGGER.info(`${this._instanceInfo} Ending AFK Check`);
        // Resolve the member that ended the AFK check.
        let member: GuildMember | null;
        if (memberEnded instanceof User)
            member = await GuildFgrUtilities.fetchGuildMember(this._guild!, memberEnded.id);
        else
            member = memberEnded;

        this.logEvent(
            member
                ? `${member.displayName} (${member.id}) has ended the AFK check.`
                : "The AFK check has been ended automatically.",
            true
        ).catch();

        // Update the database so it is clear that we are in raid mode.
        await this.stopAllIntervalsAndCollectors();
        await this.setRaidStatus(RaidStatus.IN_RUN);
        this.startIntervals();
        this.startControlPanelCollector();
        this.startAfkCheckCollector();

        // Lock the VC as well.
        LOGGER.info(`${this._instanceInfo} Locking VC`);
        await Promise.all([
            this._raidVc.permissionOverwrites.edit(this._guild.roles.everyone.id, {
                "CONNECT": false
            }).catch(),
            this._raidVc.edit({
                name: `${EmojiConstants.SWORD_EMOJI} ${this._leaderName}'s Raid`,
                position: this._raidVc.parent?.children.filter(x => x.type === "GUILD_VOICE")
                    .map(x => x.position).sort((a, b) => b - a)[0] ?? 0,
                permissionOverwrites: this.getPermissionsForRaidVc(false)
            })
        ]);

        // Add all members that were in the VC at the time.
        await this.updateMembersArr();

        // End the collector since it's useless. We'll use it again though.
        this.stopAllIntervalsAndCollectors("AFK Check ended.").catch();

        // Remove reactions from AFK check.
        await this._afkCheckMsg.reactions.removeAll().catch();

        // Edit the control panel accordingly and re-react and start collector + intervals again.
        await this._controlPanelMsg.edit({
            embeds: [this.getControlPanelEmbed()!],
            components: RaidInstance.CP_RAID_BUTTONS
        }).catch();
        this.startControlPanelCollector();
        this.startIntervals();

        const afkEndedEmbed = new MessageEmbed()
            .setColor(this._embedColor)
            .setAuthor({
                name: `${this._leaderName}'s ${this._dungeon.dungeonName} AFK check is now over.`,
                iconURL: this._memberInit.user.displayAvatarURL()
            })
            .setFooter({text: `${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName}: Raid`})
            .setTimestamp()
            .setDescription(
                member
                    ? `The AFK check has been ended by ${member} and the raid is currently ongoing.`
                    : `The AFK check has ended automatically. The raid is currently ongoing.`
            );

        if (this._raidSection.otherMajorConfig.afkCheckProperties.customMsg.postAfkCheckInfo) {
            afkEndedEmbed.addField(
                "Post-AFK Info",
                this._raidSection.otherMajorConfig.afkCheckProperties.customMsg.postAfkCheckInfo
            );
        }

        const rejoinRaidSb = new StringBuilder()
            .append("If you disconnected from this raid voice channel, you are able to reconnect by pressing the ")
            .append(`**Reconnect** button.`)
            .appendLine()
            .appendLine()
            .append("If you did not make it into the raid voice channel before the AFK check is over, then pressing ")
            .append("the button will not do anything.");
        afkEndedEmbed.addField("Rejoin Raid", rejoinRaidSb.toString());

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
                            allow: ["VIEW_CHANNEL"]
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
                                "USE_EXTERNAL_STICKERS"
                            ]
                        },
                        {
                            id: Bot.BotInstance.client.user!.id,
                            allow: ["ADD_REACTIONS", "VIEW_CHANNEL"]
                        },
                        {
                            id: this._guildDoc.roles.staffRoles.teamRoleId,
                            allow: ["VIEW_CHANNEL"]
                        }
                    ],
                    topic: `${this._raidVc!.id} - Do Not Edit This!`
                });
            });

            if (feedbackChannel) {
                afkEndedEmbed.addField(
                    "Feedback Channel",
                    `You can give ${member?.displayName ?? this._memberInit.displayName} feedback by going to the`
                    + ` ${feedbackChannel} channel.`
                );
            }
        }

        // And edit the AFK check message + start the collector.
        await this._afkCheckMsg.edit({
            embeds: [afkEndedEmbed],
            content: "The AFK check is now over.",
            components: AdvancedCollector.getActionRowsFromComponents([
                new MessageButton()
                    .setCustomId(`reconnect_${this._afkCheckMsg.id}`)
                    .setEmoji(EmojiConstants.INBOX_EMOJI)
                    .setLabel("Reconnect")
                    .setStyle("SUCCESS")
            ])
        }).catch();

        if (!feedbackChannel)
            return;

        const feedbackMsg = await feedbackChannel.send({
            embeds: [
                MessageUtilities.generateBlankEmbed(member ?? this._memberInit)
                    .setTitle(`Feedback Channel for **${member?.displayName ?? this._memberInit.displayName}**`)
                    .setDescription(
                        new StringBuilder()
                            .append(`__This is for the ${this.raidVc} raid.__`)
                            .appendLine()
                            .append(`You can leave feedback for ${member ?? this._memberInit} here by doing the`)
                            .append(" following:").appendLine()
                            .append(`- React to **this** message with either a ${EmojiConstants.LONG_UP_ARROW_EMOJI},`)
                            .append(` ${EmojiConstants.LONG_SIDEWAYS_ARROW_EMOJI}, or ${EmojiConstants.LONG_DOWN_ARROW_EMOJI} to`)
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
                    .setTimestamp()
            ]
        });

        AdvancedCollector.reactFaster(feedbackMsg, [
            EmojiConstants.LONG_DOWN_ARROW_EMOJI,
            EmojiConstants.LONG_SIDEWAYS_ARROW_EMOJI,
            EmojiConstants.LONG_UP_ARROW_EMOJI
        ]);

        await this.setThisFeedbackChannel(feedbackChannel);
        await feedbackMsg.pin().catch();
    }

    /**
     * Ends the raid.
     * @param {GuildMember | User | null} memberEnded The member that ended the raid or aborted the AFK check.
     */
    public async endRaid(memberEnded: GuildMember | User | null): Promise<void> {
        // No raid VC means we haven't started AFK check.
        if (!this._raidVc || !this._afkCheckMsg || !this._controlPanelMsg)
            return;
        LOGGER.info(`${this._instanceInfo} Ending Raid`);
        if (!memberEnded) {
            memberEnded = this._memberInit;
        }

        const resolvedMember = memberEnded instanceof GuildMember
            ? memberEnded
            : GuildFgrUtilities.getCachedMember(this._guild, memberEnded.id);

        const raidVcId = this._raidVc.id;

        const memberThatEnded = memberEnded instanceof User
            ? GuildFgrUtilities.getCachedMember(this._guild, memberEnded.id) ?? this._memberInit
            : memberEnded;

        // Get the name.
        const name = UserManager.getAllNames(memberThatEnded.displayName);
        const leaderName = name.length === 0 ? memberThatEnded.displayName : name[0];
        // Stop the collector.
        // We don't care about the result of this function, just that it should run.
        this.cleanUpRaid(false).then();

        // Give point refunds if applicable
        const earlyLocPts = this._pplWithEarlyLoc.get("EARLY_LOC_POINTS");
        if ((this._raidStatus === RaidStatus.AFK_CHECK || this._raidStatus === RaidStatus.PRE_AFK_CHECK)
            && earlyLocPts) {
            await Promise.all(earlyLocPts.map(x => LoggerManager.logPoints(x.member, this._earlyLocPointCost)));
        }

        // If this method was called during the AFK check, simply abort the AFK check.
        if (this._raidStatus === RaidStatus.AFK_CHECK) {
            this.logEvent(
                resolvedMember
                    ? `${resolvedMember.displayName} (${resolvedMember.id}) has aborted the AFK check.`
                    : "The AFK check has been aborted automatically.",
                false
            ).catch();

            return;
        }

        this.logEvent(
            resolvedMember
                ? `${resolvedMember.displayName} (${resolvedMember.id}) has ended the raid.`
                : "The raid has been ended automatically.",
            false
        ).catch();

        if (this._raidStatus === RaidStatus.IN_RUN) {
            this.logRun(memberThatEnded).catch();
        }

        // Check feedback channel
        if (!this._thisFeedbackChan)
            return;

        await this._thisFeedbackChan.send({
            content: "You have **one** minute remaining to submit your feedback. If you can't submit your feedback"
                + " in time, you can still submit your feedback via modmail."
        });

        setTimeout(async () => {
            if (!this._thisFeedbackChan) {
                if (!this._raidStorageChan)
                    return;

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
                this._thisFeedbackChan.messages.fetch({limit: 100})
            ]);

            const sb = new StringBuilder()
                .append("================= LEADER FEEDBACK INFORMATION =================")
                .appendLine();

            const botMsg = pinnedMsgs.filter(x => x.author.bot).first();
            if (botMsg) {
                const m = await botMsg.fetch();
                const [upvotes, noPref, downvotes] = await Promise.all([
                    m.reactions.cache.get(EmojiConstants.LONG_UP_ARROW_EMOJI)?.fetch(),
                    m.reactions.cache.get(EmojiConstants.LONG_SIDEWAYS_ARROW_EMOJI)?.fetch(),
                    m.reactions.cache.get(EmojiConstants.LONG_DOWN_ARROW_EMOJI)?.fetch()
                ]);

                if (upvotes) sb.append(`- Upvotes      : ${upvotes.count - 1}`).appendLine();
                if (noPref) sb.append(`- No Preference: ${noPref.count - 1}`).appendLine();
                if (downvotes) sb.append(`- Downvotes    : ${downvotes.count - 1}`).appendLine();
            }

            const otherFeedbackMsgs = allMsgs.filter(x => !x.author.bot);
            for (const [, feedbackMsg] of otherFeedbackMsgs) {
                sb.append(`Feedback by ${feedbackMsg.author.tag} (${feedbackMsg.author.id})`).appendLine()
                    .append("=== BEGIN ===").appendLine()
                    .append(feedbackMsg.content).appendLine()
                    .append("=== END ===").appendLine(2);
            }

            await Promise.all([
                this.compileHistory(this._raidStorageChan, sb.toString()),
                this._thisFeedbackChan.delete()
            ]);
        }, 60 * 1000);
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

        sb.append("================= LOG INFORMATION =================")
            .appendLine();
        for (const log of this._raidLogs) {
            sb.append(log).appendLine();
        }

        sb.appendLine(3)
            .append("================= PRIORITY REACTIONS =================")
            .appendLine();
        for (const [reaction, members] of this._pplWithEarlyLoc) {
            const reactionInfo = this._allEssentialOptions.get(reaction);
            if (!reactionInfo)
                continue;
            sb.append(`- ${reactionInfo.name} (${reactionInfo.type})`).appendLine();
            for (const {member, modifiers} of members) {
                sb.append(`\t> ${member.displayName} (${member.user.tag}, ${member.id})`).appendLine();
                if (modifiers.length > 0) {
                    sb.append(`\t> Modifiers: ${modifiers.join(", ")}`).appendLine();
                }
            }
        }

        sb.appendLine(3);
        for (const info of otherInfo) {
            sb.append(info)
                .appendLine(3);
        }

        await storageChannel.send({
            files: [
                new MessageAttachment(Buffer.from(sb.toString(), "utf8"),
                    `raidHistory_${this._memberInit.id}.txt`)
            ],
            content: `__**Report Generated: ${TimeUtilities.getDateTime()} GMT**__`
        });
    }


    /**
     * Gets an array of members that was in VC at the time the raid started.
     * @returns {GuildMember[]} The array of members.
     */
    public get membersThatJoinedVc(): GuildMember[] {
        return this._membersThatJoined;
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
        if (!this._addedToDb || !this._raidVc) return false;

        this._thisFeedbackChan = channel;
        // @ts-ignore
        const res = await MongoManager.updateAndFetchGuildDoc({
            guildId: this._guild.id,
            "activeRaids.vcId": this._raidVc.id
        }, {
            $set: {
                "activeRaids.$.otherChannels.feedbackChannelId": channel.id
            }
        });
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
    private async addEarlyLocationReaction(member: GuildMember, reactionCodeName: string, modifiers: string[],
                                           addToDb: boolean = false): Promise<boolean> {
        LOGGER.info(`${this._instanceInfo} Adding early location for ${member.displayName} with a ${reactionCodeName}`);
        if (!this._pplWithEarlyLoc.has(reactionCodeName))
            return false;
        const reactInfo = this._allEssentialOptions.get(reactionCodeName);
        if (!reactInfo)
            return false;

        const prop = this._pplWithEarlyLoc.get(reactionCodeName);
        if (!prop || !this.stillNeedEssentialReact(reactionCodeName))
            return false;
        prop.push({member: member, modifiers: modifiers});

        if (!addToDb || !this._raidVc || !this._addedToDb)
            return true;

        const res = await MongoManager.updateAndFetchGuildDoc({
            guildId: this._guild.id,
            "activeRaids.vcId": this._raidVc.id
        }, {
            $push: {
                "activeRaids.$.earlyLocationReactions": {
                    userId: member.id,
                    reactCodeName: reactionCodeName,
                    modifiers: modifiers
                }
            }
        });
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
        if (!this._raidVc || !this._addedToDb)
            return false;

        this._location = newLoc;
        this.logEvent(`${EmojiConstants.MAP_EMOJI} Location changed to: ${newLoc}`, true).catch();

        // Update the location in the database.
        const res = await MongoManager.updateAndFetchGuildDoc({
            guildId: this._guild.id,
            "activeRaids.vcId": this._raidVc.id
        }, {
            $set: {
                "activeRaids.$.location": newLoc
            }
        });

        if (!res)
            return false;
        this._guildDoc = res;
        return true;
    }

    /**
     * Updates the members that were in the raid VC at the time the raid VC closed (i.e. when AFK check ended).
     * @returns {Promise<boolean>} Whether this was successful.
     * @private
     */
    private async updateMembersArr(): Promise<boolean> {
        if (!this._raidVc || !this._addedToDb)
            return false;

        this._membersThatJoined = Array.from(this._raidVc.members.values());

        // Update the location in the database.
        const res = await MongoManager.updateAndFetchGuildDoc({
            guildId: this._guild.id,
            "activeRaids.vcId": this._raidVc.id
        }, {
            $set: {
                "activeRaids.$.membersThatJoined": this._membersThatJoined.map(x => x.id)
            }
        });

        if (!res)
            return false;
        this._guildDoc = res;
        return true;
    }

    /**
     * Adds a raid object to the database. This should only be called once the AFK check has started.
     * @returns {Promise<boolean>} Whether this was successful.
     * @private
     */
    private async addRaidToDatabase(): Promise<boolean> {
        if (this._addedToDb)
            return false;

        const obj = this.getRaidInfoObject();
        if (!obj) return false;
        const res = await MongoManager.updateAndFetchGuildDoc({guildId: this._guild.id}, {
            $push: {
                activeRaids: obj
            }
        });

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
        if (!this._raidVc || !this._addedToDb)
            return false;

        const res = await MongoManager.updateAndFetchGuildDoc({guildId: this._guild.id}, {
            $pull: {
                activeRaids: {
                    vcId: this._raidVc.id
                }
            }
        });
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
        if (!this._raidVc || !this._addedToDb)
            return false;

        this._raidStatus = status;
        // Update the location in the database.
        const res = await MongoManager.updateAndFetchGuildDoc({
            guildId: this._guild.id,
            "activeRaids.vcId": this._raidVc.id
        }, {
            $set: {
                "activeRaids.$.status": status
            }
        });
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
            members.forEach(async obj => {
                if (sentMsgTo.includes(obj.member.id))
                    return;
                sentMsgTo.push(obj.member.id);
                await GlobalFgrUtilities.tryExecuteAsync(async () => {
                    await obj.member.send(msgOpt);
                });
            });
        }
    }

    /**
     * Gets the corresponding `IRaidInfo` object. Everything should be initialized before this is called or this
     * will return null.
     * @returns {IRaidInfo | null} The raid object, which can be saved to a database. `null` if this raid/AFK check
     * has not been started yet.
     */
    public getRaidInfoObject(): IRaidInfo | null {
        if (!this._afkCheckMsg
            || !this._controlPanelMsg
            || !this._raidVc)
            return null;

        const raidObj: IRaidInfo = {
            dungeonCodeName: this._dungeon.codeName,
            startTime: this._startTime,
            expirationTime: this._expTime,
            memberInit: this._memberInit.id,
            raidChannels: this._raidSection.channels.raids,
            afkCheckMessageId: this._afkCheckMsg.id,
            controlPanelMessageId: this._controlPanelMsg.id,
            status: this._raidStatus,
            vcId: this._raidVc.id,
            location: this._location,
            sectionIdentifier: this._raidSection.uniqueIdentifier,
            earlyLocationReactions: [],
            otherChannels: {
                logChannelId: this._logChan?.id ?? "",
                feedbackChannelId: this._thisFeedbackChan?.id ?? ""
            },
            membersThatJoined: [],
            runStats: {
                completed: 0,
                failed: 0
            }
        };

        for (const [key, val] of this._pplWithEarlyLoc) {
            val.forEach(obj => {
                raidObj.earlyLocationReactions.push({
                    userId: obj.member.id,
                    reactCodeName: key,
                    modifiers: obj.modifiers
                });
            });
        }

        return raidObj;
    }

    /**
     * Interprets the parse result, returning an embed with the relevant information.
     * @param {IParseResponse} parseSummary The parse summary.
     * @param {User} initiatedBy The user that initiated this.
     * @param {VoiceChannel} vc The voice channel.
     * @returns {Promise<MessageEmbed>} The embed.
     */
    public static async interpretParseRes(parseSummary: IParseResponse, initiatedBy: User,
                                          vc: VoiceChannel): Promise<MessageEmbed> {
        const inVcNotInRaidFields = parseSummary.isValid
            ? parseSummary.inVcButNotInRaid
            : [];
        const inRaidNotInVcFields = parseSummary.isValid
            ? parseSummary.inRaidButNotInVC
            : [];

        const embed = MessageUtilities.generateBlankEmbed(initiatedBy, "RANDOM")
            .setTitle(`Parse Results for: **${vc?.name ?? "N/A"}**`)
            .setFooter({text: "Completed Time:"})
            .setTimestamp();

        if (parseSummary.isValid) {
            embed.setDescription(
                new StringBuilder("Parse Successful.")
                    .appendLine()
                    .append(`- ${parseSummary.inRaidButNotInVC.length} player(s) are in the /who screenshot `)
                    .append("but not in the raid voice channel.")
                    .appendLine()
                    .append(`- ${parseSummary.inVcButNotInRaid.length} player(s) are in the raid voice  `)
                    .append("channel but not in the /who screenshot.")
                    .appendLine(2)
                    .append("`/who` Results:")
                    .append(StringUtil.codifyString(parseSummary.whoRes.join(", ")))
                    .toString()
            );
        }
        else {
            embed.setDescription(
                "An error occurred when trying to parse this screenshot. Please try again later."
            );
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
        const toReturn: IParseResponse = {inRaidButNotInVC: [], inVcButNotInRaid: [], isValid: false, whoRes: []};
        // No raid VC = no parse.
        if (!vc) return toReturn;
        // Make sure the image exists.
        try {
            // Make a request to see if this URL points to the right place.
            const result = await Bot.AxiosClient.head(url);
            if (result.status > 300)
                return toReturn;
        } catch (e) {
            return toReturn;
        }

        // Make the request.
        const data = await GlobalFgrUtilities.tryExecuteAsync(async () => {
            const res = await RealmSharperWrapper.parseWhoScreenshotOnly(url);
            return res ? res : null;
        });

        if (!data)
            return null;

        const parsedNames = data.names;
        toReturn.whoRes = parsedNames;
        if (parsedNames.length === 0) return toReturn;
        // Parse results means the picture must be valid.
        toReturn.isValid = true;
        // Begin parsing.
        // Get people in raid VC but not in the raid itself. Could be alts.
        vc.members.forEach(member => {
            const igns = UserManager.getAllNames(member.displayName)
                .map(x => x.toLowerCase());
            const idx = parsedNames.findIndex(name => igns.includes(name.toLowerCase()));
            if (idx === -1) return;
            toReturn.inVcButNotInRaid.push(member.displayName);
        });

        // Get people in raid but not in the VC. Could be crashers.
        const allIgnsInVc = vc.members.map(x => UserManager.getAllNames(x.displayName.toLowerCase())).flat();
        parsedNames.forEach(name => {
            if (allIgnsInVc.includes(name.toLowerCase())) return;
            toReturn.inRaidButNotInVC.push(name);
        });

        return toReturn;
    }


    /**
     * Cleans the raid up. This will remove the raid voice channel, delete the control panel message, and remove
     * the raid from the database.
     *
     * @param {boolean} force Whether this should delete all channels related to this raid. Useful if one component
     * of the raid is deleted.
     */
    public async cleanUpRaid(force: boolean): Promise<void> {
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
            MessageUtilities.tryDelete(this._controlPanelMsg),
            // Step 4: Unpin the AFK check message.
            MessageUtilities.tryDelete(this._afkCheckMsg),
            // Step 5: Delete the raid VC
            GlobalFgrUtilities.tryExecuteAsync(async () => {
                await this._raidVc?.delete();
            }),
            // Step 6: Delete the logging channel
            GlobalFgrUtilities.tryExecuteAsync(async () => {
                await this._logChan?.delete();
            })
        ]);

        this._raidVc = null;
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
                allow: permsToEvaluate.find(x => x.key === PermsConstants.EVERYONE_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === PermsConstants.EVERYONE_ROLE)?.value.deny
            },
            {
                id: this._raidSection.roles.verifiedRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === PermsConstants.MEMBER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === PermsConstants.MEMBER_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.moderation.securityRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === PermsConstants.SECURITY_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === PermsConstants.SECURITY_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.moderation.officerRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === PermsConstants.OFFICER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === PermsConstants.OFFICER_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.moderation.moderatorRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === PermsConstants.MODERATOR_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === PermsConstants.MODERATOR_ROLE)?.value.deny
            },
            // Universal leader roles start here.
            {
                id: this._guildDoc.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === PermsConstants.ALMOST_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === PermsConstants.ALMOST_LEADER_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.universalLeaderRoleIds.leaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === PermsConstants.LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === PermsConstants.LEADER_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === PermsConstants.HEAD_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === PermsConstants.HEAD_LEADER_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.universalLeaderRoleIds.vetLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === PermsConstants.VETERAN_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === PermsConstants.VETERAN_LEADER_ROLE)?.value.deny
            },
            // Section leader roles start here
            {
                id: this._raidSection.roles.leaders.sectionAlmostLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === PermsConstants.ALMOST_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === PermsConstants.ALMOST_LEADER_ROLE)?.value.deny
            },
            {
                id: this._raidSection.roles.leaders.sectionLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === PermsConstants.LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === PermsConstants.LEADER_ROLE)?.value.deny
            },
            {
                id: this._raidSection.roles.leaders.sectionVetLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === PermsConstants.VETERAN_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === PermsConstants.VETERAN_LEADER_ROLE)?.value.deny
            }
        ].filter(y => GuildFgrUtilities.hasCachedRole(this._guild, y.id)
            && ((y.allow && y.allow.length !== 0) || (y.deny && y.deny.length !== 0)));
        // And then define any additional roles.
        // We only want role IDs here.
        permsToEvaluate.filter(x => MiscUtilities.isSnowflake(x.key))
            .filter(x => x.value.allow.length !== 0 || x.value.deny.length !== 0)
            .forEach(perm => permsToReturn.push({
                id: perm.key as Snowflake,
                allow: perm.value.allow,
                deny: perm.value.deny
            }));

        return permsToReturn;
    }

    /**
     * Asks the user for a new location.
     * @param {User} requestedAuthor The user that wants to change the location.
     * @returns {Promise<boolean>} True if the bot was able to ask for a new location (regardless of the response).
     */
    public async getNewLocation(requestedAuthor: User): Promise<boolean> {
        LOGGER.info(`${this._instanceInfo} Requesting new location`);
        if (!this._raidVc)
            return false;
        const descSb = new StringBuilder()
            .append(`Please type the **new location** for the raid with VC: ${this._raidVc.name}. `)
            .append("The location will be sent to every person that has reacted with an early location reaction. ")
            .append(`To cancel this process, simply react to the ${EmojiConstants.X_EMOJI} emoji.`)
            .appendLine()
            .appendLine()
            .append("You have one minute to perform this action. After one minute has passed, this process will ")
            .append("automatically be canceled.");
        const askLocEmbed: MessageEmbed = MessageUtilities.generateBlankEmbed(this._memberInit, "GREEN")
            .setTitle(`Setting New Location: ${this._raidVc.name}`)
            .setDescription(descSb.toString())
            .setFooter({text: `${this._guild.name} - AFK Check`})
            .setTimestamp();

        const res = await AdvancedCollector.startDoubleCollector<string>({
            cancelFlag: "-cancel",
            clearInteractionsAfterComplete: false,
            targetAuthor: requestedAuthor,
            targetChannel: this._controlPanelChannel,
            duration: 60 * 1000,
            msgOptions: {
                embeds: [askLocEmbed],
                components: AdvancedCollector.getActionRowsFromComponents([
                    ButtonConstants.CANCEL_BUTTON
                ])
            },
            deleteBaseMsgAfterComplete: true,
            deleteResponseMessage: true,
            acknowledgeImmediately: true
        }, AdvancedCollector.getStringPrompt(this._controlPanelChannel, {
            min: 1,
            max: 500
        }));

        // No response or emoji = canceled.
        // Return true since the process still completed.
        if (!res || res instanceof MessageComponentInteraction)
            return true;
        // Otherwise, update location.
        await this.updateLocation(res);
        await this.sendMsgToEarlyLocationPeople({
            content: new StringBuilder(`Your raid leader for the ${this._dungeon.dungeonName} raid has changed `)
                .append(`the raid location. Your new location is: **${this._location}**.`)
                .toString()
        });
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
        if (!this._raidVc) return null;
        if (this._raidStatus === RaidStatus.NOTHING || this._raidStatus === RaidStatus.IN_RUN) return null;

        const descSb = new StringBuilder();
        if (this._raidStatus === RaidStatus.AFK_CHECK) {
            descSb.append(`To participate in this raid, join ${this._raidVc.toString()} channel.`);
        }
        else {
            descSb.append("Only priority reactions can join the raid VC at this time. You will be able to join the ")
                .append("raid VC once all players with priority reactions have been confirmed.");
        }

        const prioritySb = new StringBuilder();
        // Account for the general early location roles.
        if (this._earlyLocToRole.size > 0) {
            prioritySb.append("If you have one of the listed role(s), press the corresponding button.")
                .appendLine(1);
            for (const [mapKey, roles] of this._earlyLocToRole) {
                const reactionInfo = this._allEssentialOptions.get(mapKey)!;

                if (roles.length === 1) {
                    prioritySb.append(`⇨ ${roles[0]}: **${reactionInfo.name}** `)
                        .appendLine();
                    continue;
                }

                prioritySb.append(`⇨ ${roles.join(", ")}: **${reactionInfo.name}**`)
                    .appendLine();
            }
        }

        if (this._allEssentialOptions.size - this._earlyLocToRole.size > 0) {
            prioritySb.append("Any __buttons__ containing gear or character preferences is a priority react. If ")
                .append("you are bringing one of the gear/character choices, press the corresponding button.");
        }

        const earlyLocInfo = this._allEssentialOptions.get("EARLY_LOC_POINTS");
        if (earlyLocInfo) {
            prioritySb.appendLine(2)
                .append(`If you have **\`${this._earlyLocPointCost}\`** points that you would like to redeem for`)
                .append("  priority, press the **Points** button.");
        }

        const raidStatus = this._raidStatus === RaidStatus.PRE_AFK_CHECK
            ? "Pre-AFK Check"
            : this._raidStatus === RaidStatus.AFK_CHECK
                ? "AFK Check"
                : "Raid";

        const afkCheckEmbed = new MessageEmbed()
            .setAuthor({
                name: `${this._leaderName} has started a ${this._dungeon.dungeonName} AFK check.`,
                iconURL: this._memberInit.user.displayAvatarURL()
            })
            .setDescription(descSb.toString())
            .setFooter({text: `${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName}: ${raidStatus}.`})
            .setTimestamp()
            .setColor(this._embedColor);

        if (this._afkCheckMsg && this._afkCheckMsg.embeds[0].thumbnail)
            afkCheckEmbed.setThumbnail(this._afkCheckMsg.embeds[0].thumbnail.url);
        else if (this._dungeon.bossLinks.length > 0)
            afkCheckEmbed.setThumbnail(ArrayUtilities.getRandomElement(this._dungeon.bossLinks).url);


        if (prioritySb.length() > 0) {
            afkCheckEmbed.addField("Priority Reactions (**Join** VC First)", prioritySb.toString());
        }

        if (this._raidStatus === RaidStatus.AFK_CHECK && this._nonEssentialReactions.length > 0) {
            afkCheckEmbed.addField(
                "Other Reactions",
                "To indicate your non-priority gear and/or class preference, please click on the corresponding"
                + " reactions."
            );
        }

        // Display percent of items needed.
        const earlyReactInfo: string[] = [];
        for (const [codeName, peopleThatReacted] of this._pplWithEarlyLoc) {
            if (!this.stillNeedEssentialReact(codeName))
                continue;

            const mappedAfkCheckOption = this._allEssentialOptions.get(codeName);
            if (!mappedAfkCheckOption)
                continue;

            const emoji = mappedAfkCheckOption.emojiInfo.isCustom
                ? GlobalFgrUtilities.getCachedEmoji(mappedAfkCheckOption.emojiInfo.identifier)
                : mappedAfkCheckOption.emojiInfo.identifier;
            if (!emoji)
                continue;

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
        LOGGER.debug(`${this._instanceInfo} Getting raid control panel embed`);
        if (!this._raidVc) return null;
        if (this._raidStatus === RaidStatus.NOTHING) return null;

        const descSb = new StringBuilder();
        const maxVc = `${this._raidVc.userLimit === 0 ? "Unlimited" : this._raidVc.userLimit}`;
        const raidStatus = this._raidStatus === RaidStatus.PRE_AFK_CHECK
            ? "Pre-AFK Check"
            : this._raidStatus === RaidStatus.AFK_CHECK
                ? "AFK Check"
                : "Raid";

        const generalStatus = new StringBuilder()
            .append(`⇨ AFK Check Started At: ${TimeUtilities.getDateTime(this._raidVc.createdTimestamp)} GMT`)
            .appendLine()
            .append(`⇨ VC Capacity: ${this._raidVc.members.size} / ${maxVc}`)
            .appendLine()
            .append(`⇨ Location: **\`${this._location ? this._location : "Not Set."}\`**`)
            .appendLine()
            .append(`⇨ Status: **\`${raidStatus}\`**`);

        const controlPanelEmbed = new MessageEmbed()
            .setAuthor({
                name: `${this._leaderName}'s Control Panel - ${this._raidVc.name}`,
                iconURL: this._memberInit.user.displayAvatarURL()
            })
            .setTitle(`**${this._dungeon.dungeonName}** Raid.`)
            .setFooter({
                text: `${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName} Control Panel.  Expires in `
                    + `${TimeUtilities.formatDuration(this._expTime - Date.now(), false, false)}.`
            })
            .setTimestamp()
            .setColor(this._embedColor)
            .addField("General Status", generalStatus.toString());

        if (this._controlPanelMsg && this._controlPanelMsg.embeds[0].thumbnail)
            controlPanelEmbed.setThumbnail(this._controlPanelMsg.embeds[0].thumbnail.url);
        else if (this._dungeon.bossLinks.length > 0)
            controlPanelEmbed.setThumbnail(ArrayUtilities.getRandomElement(this._dungeon.bossLinks).url);

        if (this._raidStatus === RaidStatus.PRE_AFK_CHECK) {
            descSb
                .append("This instance is currently in **PRE-AFK CHECK** mode. Only priority reactions can join the ")
                .append("raid VC. Use this opportunity to verify all priority reactions.")
                .appendLine(2)
                .append(`To use __this__ control panel, you **must** be in the **\`${this._raidVc.name}\`** voice `)
                .append("channel.")
                .appendLine(2)
                .append(`⇨ **Press** the **\`Start AFK Check\`** button if you want to start the AFK check. This `)
                .append("will allow any raiders to join your raid VC. __Make sure__ all priority reactions have been ")
                .append("verified before you do this.")
                .appendLine()
                .append(`⇨ **Press** the **\`Abort AFK Check\`** button if you want to end the AFK check __without__ `)
                .append("starting a raid. Use this option if you don't have enough raiders or reactions.")
                .appendLine()
                .append(`⇨ **Press** the **\`Set Location\`** button if you want to change this raid's location. `)
                .append("This will message everyone that is participating in this raid that has early location.");
        }
        else if (this._raidStatus === RaidStatus.AFK_CHECK) {
            descSb
                .append("This instance is currently in **AFK CHECK** mode. Any raiders can join this VC.")
                .appendLine(2)
                .append(`To use __this__ control panel, you **must** be in the **\`${this._raidVc.name}\`** voice `)
                .append("channel.")
                .appendLine(2)
                .append(`⇨ **Press** the **\`Start Raid\`** button if you want to end the AFK check and start the `)
                .append("raid.")
                .appendLine()
                .append(`⇨ **Press** the **\`Abort AFK Check\`** button if you want to end the AFK check __without__ `)
                .append("starting a raid. Use this option if you don't have enough raiders or reactions.")
                .appendLine()
                .append(`⇨ **Press** the **\`Set Location\`** button if you want to change this raid's location. `)
                .append("This will message everyone that is participating in this raid that has early location.");
        }
        else {
            // Otherwise, we're in a raid.
            descSb
                .append("This instance is currently in **RAID** mode. Under normal circumstances, raiders __cannot__ ")
                .append("join the raid VC.")
                .appendLine(2)
                .append(`To use __this__ control panel, you **must** be in the **${this._raidVc.toString()}** voice `)
                .append("channel.")
                .appendLine(2)
                .append("⇨ **Press** the **`End Raid`** button if you want to end this raid.")
                .appendLine()
                .append("⇨ **Press** the **`Set Location`** button if you want to change this raid's location.")
                .appendLine()
                .append("⇨ **Press** the **`Lock Raid VC`** button if you want to lock the raid voice channel.")
                .appendLine()
                .append("⇨ **Press** the **`Unlock Raid VC`** button if you want to unlock the raid voice channel.")
                .appendLine()
                .append("⇨ **Press** to the **`Parse Raid VC`** button if you want to parse a /who screenshot for ")
                .append("this run. You will be asked to provide a /who screenshot; please provide a cropped ")
                .append("screenshot so only the /who results are shown.");
        }

        controlPanelEmbed.setDescription(descSb.toString());

        // Display reactions properly
        const cpFields: string[] = [];
        for (const [codeName, peopleThatReacted] of this._pplWithEarlyLoc) {
            const mappedAfkCheckOption = this._allEssentialOptions.get(codeName);
            if (!mappedAfkCheckOption)
                continue;

            const emoji = GlobalFgrUtilities.getNormalOrCustomEmoji(mappedAfkCheckOption);

            // Must have emoji
            if (!emoji)
                continue;

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

            cpFields.push(
                new StringBuilder()
                    .append(`⇨ ${emoji} ${mappedAfkCheckOption.name}: \`${peopleThatReacted.length} / ${maximum}\``)
                    .appendLine()
                    .append(peopleThatReacted.map(x => `${x.member}: \`[${x.modifiers.join(", ")}]\``).join("\n"))
                    .appendLine()
                    .toString()
            );
        }

        const nModReactInfoFields = ArrayUtilities.arrayToStringFields(cpFields, (_, elem) => elem);
        let title = "Priority Reaction Information";
        for (const field of nModReactInfoFields) {
            controlPanelEmbed.addField(title, field);
            title = GeneralConstants.ZERO_WIDTH_SPACE;
        }
        return controlPanelEmbed;
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

        this.updateControlPanel().catch();
        this.updateRaidPanel().catch();

        return true;
    }

    /**
     * Interval for control panel
     */
    private async updateControlPanel() {
        LOGGER.debug(`${this._instanceInfo} Control Panel Interval`);
        /**
         * If control panel does not exist,
         * Stop intervals and return*/
        if (!this._controlPanelMsg || !this._raidVc) {
            await this.stopAllIntervalsAndCollectors("Control panel or raid vc does not exist");
            return;
        }
        /**If intervals have stopped,
         * Return
         */
        if (!this._intervalsAreRunning) {
            return;
        }
        /**
         * If headcount times out.
         * stop intervals and return
         */
        if (Date.now() > this._expTime) {
            LOGGER.info(`${this._instanceInfo} Raid expired, aborting`);
            this.cleanUpRaid(true).then();
            return true;
        }

        const editMessage = this._controlPanelMsg.edit({
            embeds: [this.getControlPanelEmbed()!]
        });

        const delayUpdate = delay(this._intervalDelay);

        await Promise.all([editMessage, delayUpdate]).catch();
        this.updateControlPanel().catch();
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
        /**If not in AFK check,
         * no need to update panel, return
         */
        if (this._raidStatus !== RaidStatus.AFK_CHECK && this._raidStatus !== RaidStatus.PRE_AFK_CHECK) {
            return;
        }
        const editMessage = this._afkCheckMsg.edit({
            embeds: [this.getAfkCheckEmbed()!],
            components: AdvancedCollector.getActionRowsFromComponents(this._afkCheckButtons),
        });

        const delayUpdate = delay(this._intervalDelay);

        await Promise.all([editMessage, delayUpdate]).catch();
        this.updateRaidPanel().catch();
    }

    /**
     * Starts an AFK check collector. Only works during an AFK check.
     * @returns {boolean} Whether the collector started successfully.
     * @private
     */
    private startAfkCheckCollector(): boolean {
        if (!this._afkCheckMsg) return false;
        if (this._afkCheckButtonCollector) return false;
        if (this._raidStatus !== RaidStatus.AFK_CHECK && this._raidStatus !== RaidStatus.PRE_AFK_CHECK)
            return false;

        LOGGER.info(`${this._instanceInfo} Starting raid AFK Check collector`);

        this._afkCheckButtonCollector = this._afkCheckMsg.createMessageComponentCollector({
            filter: i => !i.user.bot && this._allEssentialOptions.has(i.customId),
            time: this._raidSection.otherMajorConfig.afkCheckProperties.afkCheckTimeout
        });

        // Remember that interactions are all going to be in _allEssentialOptions
        this._afkCheckButtonCollector.on("collect", async i => {
            if (this._pplConfirmingReaction.has(i.user.id)) {
                i.reply({
                    content: "You are in the process of confirming a reaction. If you accidentally dismissed the"
                        + " confirmation message, you may need to wait 15 seconds before you can try again.",
                    ephemeral: true
                }).catch();
                return;
            }

            const memberThatResponded = await GuildFgrUtilities.fetchGuildMember(this._guild, i.user.id);
            if (!memberThatResponded) {
                i.reply({
                    content: "An unknown error occurred.",
                    ephemeral: true
                }).catch();
                return;
            }

            // Does the VC even exist?
            if (!this._raidVc || !GuildFgrUtilities.hasCachedChannel(this._guild, this._raidVc.id)) {
                await this.cleanUpRaid(true);
                return;
            }

            // Is the person in a VC?
            if (!memberThatResponded.voice.channel) {
                i.reply({
                    content: "In order to indicate your class/gear preference, you need to be in a voice channel.",
                    ephemeral: true
                }).catch();
                return;
            }

            const mapKey = i.customId;
            const reactInfo = this._allEssentialOptions.get(mapKey)!;
            const members = this._pplWithEarlyLoc.get(mapKey)!;

            LOGGER.info(`${this._instanceInfo} Collected reaction from ${memberThatResponded.displayName}`);
            // If the member already got this, then don't let them get this again.
            if (members.some(x => x.member.id === i.user.id)) {
                LOGGER.info(`${this._instanceInfo} Reaction was already accounted for`);
                i.reply({
                    content: "You have already selected this!",
                    ephemeral: true
                }).catch();
                return;
            }

            // Item display for future use
            const itemDis = getItemDisplay(reactInfo);
            // If we no longer need this anymore, then notify them
            if (!this.stillNeedEssentialReact(mapKey)) {
                LOGGER.info(`${this._instanceInfo} Reaction no longer essential, person not moved`);
                i.reply({
                    content: `Sorry, but the maximum number of ${itemDis} has been reached.`,
                    ephemeral: true
                }).catch();
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

            if (!this._raidVc) {
                LOGGER.info(`${this._instanceInfo} Raid closed during reaction`);
                if (res.success || res.errorReply.alreadyReplied) {
                    await i.editReply({
                        content: "The raid you are attempting to react to has been closed or aborted.",
                        components: []
                    });
                    return;
                }

                await i.reply({
                    content: "The raid you are attempting to react to has been closed or aborted.",
                    components: []
                });
                return;
            }

            this._pplConfirmingReaction.delete(i.user.id);
            if (!res.success) {
                if (res.errorReply.alreadyReplied) {
                    await i.editReply({
                        content: res.errorReply.errorMsg,
                        components: []
                    });
                }
                else {
                    await i.reply({
                        content: res.errorReply.errorMsg,
                        ephemeral: true,
                        components: []
                    });
                }
                return;
            }

            // Make sure we can actually give early location. It might have changed.
            if (!this.stillNeedEssentialReact(mapKey)) {
                LOGGER.info(`${this._instanceInfo} Reaction no longer essential, person not moved`);
                await i.editReply({
                    content: reactInfo.type === "EARLY_LOCATION"
                        ? "Although you reacted with this button, you are not able to receive early location"
                        + " because someone else beat you to the last slot."
                        : `Although you have a ${itemDis}, we do not need this anymore.`,
                    components: []
                });
                return;
            }

            // Add to database
            await this.addEarlyLocationReaction(memberThatResponded, mapKey, res.react!.modifiers, true);
            if (res.react?.successFunc) {
                await res.react.successFunc(memberThatResponded);
            }

            // If we no longer need this, then edit the button so no one else can click on it.
            if (!this.stillNeedEssentialReact(mapKey)) {
                LOGGER.info(`${this._instanceInfo} Reaction no longer essential, disabling button`);
                const idxOfButton = this._afkCheckButtons.findIndex(x => x.customId === mapKey);
                this._afkCheckButtons[idxOfButton].setDisabled(true);
            }
            LOGGER.info(`${this._instanceInfo} Reaction confirmed`);
            const confirmationContent = new StringBuilder()
                .append(`Thank you for confirming your choice of: `).append(itemDis)
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

            confirmationContent.appendLine(2)
                .append("**Make sure** the bot can send you direct messages. If the raid leader changes the ")
                .append("location, the new location will be sent to you via direct messages.");

            await i.editReply({
                content: confirmationContent.toString(),
                components: []
            });

            this.logEvent(
                `${EmojiConstants.KEY_EMOJI} ${memberThatResponded.displayName} (${memberThatResponded.id}) confirmed`
                + " that he or she has"
                + ` ${reactInfo.name} (${reactInfo.type}). Modifiers: \`[${res.react!.modifiers.join(", ")}]\``,
                true
            ).catch();

            if (memberThatResponded.voice.channel) {
                if (memberThatResponded.voice.channelId === this._raidVc.id)
                    return;
                LOGGER.info(`${this._instanceInfo} Moving ${memberThatResponded.displayName} into raid VC`);
                memberThatResponded.voice.setChannel(this._raidVc).catch();
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
     * Event handler that deals with voice state changes.
     * @param {VoiceState} oldState The old voice state.
     * @param {VoiceState} newState The new voice state.
     * @private
     */
    public async voiceStateUpdateEventFunction(oldState: VoiceState, newState: VoiceState): Promise<void> {
        if (!this._raidVc)
            return;

        // Event must be regarding this raid VC.
        if (oldState.channelId !== this._raidVc.id && newState.channelId !== this._raidVc.id)
            return;

        const member = oldState.member ?? newState.member;
        if (!member)
            return;

        if (member.voice.channelId
            && member.voice.channelId !== this._raidVc.id
            && this._peopleToAddToVc.has(member.id)) {
            member.voice.setChannel(this._raidVc).catch();
            this.logEvent(
                `${EmojiConstants.NITRO_EMOJI} ${member.displayName} (${member.id}) has been added to the VC for being a priority react.`,
                true
            ).catch();
            return;
        }

        if (oldState.channelId !== newState.channelId) {
            if (oldState.channelId && !newState.channelId) {
                // person left the VC
                this.logEvent(
                    `${EmojiConstants.EYES_EMOJI} ${member.displayName} (${member.id}) has left the raid VC.`,
                    true
                ).catch();
                return;
            }

            if (!oldState.channelId && newState.channelId) {
                // person joined the VC
                this.logEvent(
                    `${EmojiConstants.GREEN_CHECK_EMOJI} ${member.displayName} (${member.id}) has joined the raid VC.`,
                    true
                ).catch();
                return;
            }

            // otherwise, changed VC
            this.logEvent(
                `${EmojiConstants.REDIRECT_EMOJI} ${member.displayName} (${member.id}) has switched voice channels.\n`
                + `\tFrom: ${oldState.channel!.name} (${oldState.channelId})\n`
                + `\tTo: ${newState.channel!.name} (${newState.channelId})`,
                true
            ).catch();
            return;
        }

        // Don't care about local mute, only server
        if (oldState.serverMute && !newState.serverMute) {
            // person no longer server muted
            this.logEvent(
                `${EmojiConstants.MIC_EMOJI} ${member.displayName} (${member.id}) is no longer server muted.`,
                true
            ).catch();
            return;
        }

        if (!oldState.serverMute && newState.serverMute) {
            // person server/local muted
            this.logEvent(
                `${EmojiConstants.MIC_EMOJI} ${member.displayName} (${member.id}) is now server muted.`,
                true
            ).catch();
            return;
        }

        if (oldState.deaf && !newState.deaf) {
            // person no longer server/local deaf
            this.logEvent(
                `${EmojiConstants.HEADPHONE_EMOJI} ${member.displayName} (${member.id}) is no longer deafened.`,
                true
            ).catch();
            return;
        }

        if (!oldState.deaf && newState.deaf) {
            // person server/local deaf
            this.logEvent(
                `${EmojiConstants.HEADPHONE_EMOJI} ${member.displayName} (${member.id}) is now deafened.`,
                true
            ).catch();
            return;
        }

        if (oldState.selfVideo && !newState.selfVideo) {
            // person video off
            this.logEvent(
                `${EmojiConstants.CAM_EMOJI} ${member.displayName} (${member.id}) has turned off video.`,
                true
            ).catch();
            return;
        }

        if (!oldState.selfVideo && newState.selfVideo) {
            // person video on
            this.logEvent(
                `${EmojiConstants.CAM_EMOJI} ${member.displayName} (${member.id}) has turned on video.`,
                true
            ).catch();
            return;
        }

        if (oldState.streaming && !newState.streaming) {
            // person stream off
            this.logEvent(
                `${EmojiConstants.TV_EMOJI} ${member.displayName} (${member.id}) has stopped streaming.`,
                true
            ).catch();
            return;
        }

        if (!oldState.streaming && newState.streaming) {
            // person stream on
            this.logEvent(
                `${EmojiConstants.TV_EMOJI} ${member.displayName} (${member.id}) has started streaming.`,
                true
            ).catch();
            return;
        }
    }

    /**
     * Event handler that deals with interactions.
     * @param {Interaction} interaction The interaction.
     * @private
     */
    public async interactionEventFunction(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() || !this._afkCheckMsg || this._raidStatus !== RaidStatus.IN_RUN)
            return;

        if (interaction.customId !== `reconnect_${this._afkCheckMsg.id}`)
            return;

        if (this.membersThatJoinedVc.every(x => x.id !== interaction.user.id)) {
            await interaction.reply({
                ephemeral: true,
                content: "You didn't join this raid, so you can't be moved in at this time."
            });

            return;
        }

        const member = await GuildFgrUtilities.fetchGuildMember(this._guild, interaction.user.id);
        if (!member)
            return;

        if (!member.voice.channel) {
            await interaction.reply({
                ephemeral: true,
                content: "Please join a voice channel first."
            });
            return;
        }

        interaction.deferUpdate().catch();

        if (member.voice.channel.id === this._raidVc?.id)
            return;

        await GlobalFgrUtilities.tryExecuteAsync(async () => {
            await member.voice.setChannel(this._raidVc);
        });
        this.logEvent(
            `${EmojiConstants.GREEN_CHECK_EMOJI} ${member.displayName} (${member.id}) has reconnected to the raid VC.`,
            true
        ).catch();
        return;
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
            time: this._raidStatus === RaidStatus.IN_RUN ? 4 * 60 * 60 * 1000 : undefined
        });

        const validateInVc = async (i: MessageComponentInteraction): Promise<boolean> => {
            // Should have already been fetched from the collector filter function
            // So this should be cached
            const member = await GuildFgrUtilities.fetchGuildMember(this._guild, i.user.id);
            if (!member) {
                i.reply({
                    content: "An unknown error occurred. Please try again later.",
                    ephemeral: true
                }).catch();
                return false;
            }

            if (member.voice.channel?.id !== this._raidVc?.id) {
                i.reply({
                    content: "You need to be in the correct raiding VC to interact with these controls.",
                    ephemeral: true
                }).catch();
                return false;
            }

            return true;
        };

        if (this._raidStatus === RaidStatus.PRE_AFK_CHECK) {
            this._controlPanelReactionCollector.on("collect", async i => {
                if (!(await validateInVc(i))) {
                    return;
                }

                await i.deferUpdate();
                if (i.customId === RaidInstance.START_AFK_CHECK_ID) {
                    LOGGER.info(`${this._instanceInfo} Leader chose to start AFK Check`);
                    this.startAfkCheck().then();
                    return;
                }

                if (i.customId === RaidInstance.ABORT_AFK_ID) {
                    LOGGER.info(`${this._instanceInfo} Leader chose to abort Pre-AFK Check`);
                    this.endRaid(i.user).then();
                    return;
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
            this._controlPanelReactionCollector.on("collect", async i => {
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
                    LOGGER.info(`${this._instanceInfo} ${member?.displayName} chose to abort AFK Check`);
                    this.endRaid(i.user).then();
                    return;
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
        this._controlPanelReactionCollector.on("collect", async i => {
            if (!(await validateInVc(i))) {
                return;
            }
            const member = await GuildFgrUtilities.fetchGuildMember(this._guild, i.user.id);

            if (i.customId === RaidInstance.END_RAID_ID) {
                LOGGER.info(`${this._instanceInfo} ${member?.displayName} chose to end raid`);
                this.endRaid(i.user).then();
                return;
            }

            if (i.customId === RaidInstance.SET_LOCATION_ID) {
                await i.deferUpdate();
                LOGGER.info(`${this._instanceInfo} ${member?.displayName} chose to set a new location`);
                this.getNewLocation(i.user).then();
                return;
            }

            if (i.customId === RaidInstance.LOCK_VC_ID) {
                LOGGER.info(`${this._instanceInfo} ${member?.displayName} chose to lock the VC`);
                await Promise.all([
                    this._raidVc?.permissionOverwrites.edit(this._guild.roles.everyone.id, {
                        "CONNECT": false
                    }),
                    i.reply({
                        content: "Locked Raid VC.",
                        ephemeral: true
                    }),
                    this.logEvent("Raid VC locked.", true)
                ]);
                sendTemporaryAlert(
                    this._afkCheckChannel,
                    `${this._leaderName}'s Raid VC has been locked.`,
                    this._tempAlertDelay
                ).catch();
                return;
            }

            if (i.customId === RaidInstance.UNLOCK_VC_ID) {
                LOGGER.info(`${this._instanceInfo} ${member?.displayName} chose to unlock the VC`);
                await Promise.all([
                    this._raidVc?.permissionOverwrites.edit(this._guild.roles.everyone.id, {
                        "CONNECT": null
                    }),
                    i.reply({
                        content: "Unlocked Raid VC.",
                        ephemeral: true
                    }),
                    this.logEvent("Raid VC unlocked.", true).catch()
                ]);
                sendTemporaryAlert(
                    this._afkCheckChannel,
                    `${this._leaderName}'s Raid VC has been unlocked.`,
                    this._tempAlertDelay
                ).catch();
                return;
            }

            if (i.customId === RaidInstance.PARSE_VC_ID) {
                LOGGER.info(`${this._instanceInfo} ${member?.displayName} chose to parse the VC`);
                await i.deferUpdate();
                const res = await AdvancedCollector.startNormalCollector<MessageAttachment>({
                    msgOptions: {
                        content: "Please send a **screenshot** (not a URL to a screenshot, but an actual attachment)"
                            + " containing the results of your `/who` now. This screenshot does not need to be"
                            + " cropped. To cancel this process, please type `cancel`.",
                    },
                    cancelFlag: "cancel",
                    targetChannel: this._controlPanelChannel,
                    targetAuthor: i.user,
                    deleteBaseMsgAfterComplete: true,
                    deleteResponseMessage: false,
                    duration: 30 * 1000
                }, (m: Message) => {
                    if (m.attachments.size === 0)
                        return;

                    // Images have a height property, non-images don't.
                    const imgAttachment = m.attachments.find(x => x.height !== null);
                    if (!imgAttachment)
                        return;

                    return imgAttachment;
                });

                if (!res) return;
                const parseSummary = await RaidInstance.parseScreenshot(res.url, this._raidVc);
                if (!this._raidVc) return;

                this.logEvent(
                    `Parse executed by ${i.user.tag} (${i.user.id}). Link: \`${res.url}\``,
                    true
                ).catch();

                if (!parseSummary) {
                    this.logEvent(
                        "Parse failed; the API may not be functioning at this time.",
                        true
                    ).catch();

                    return;
                }

                const embed = await RaidInstance.interpretParseRes(parseSummary, i.user, this._raidVc);
                await this._controlPanelChannel.send({embeds: [embed]}).catch();
                if (!member) {
                    return;
                }

                const roleId = QuotaManager.findBestQuotaToAdd(member, this._guildDoc, "Parse");
                if (!roleId) {
                    return;
                }

                await QuotaManager.logQuota(member, roleId, "Parse", 1);
                return;
            }
        });

        this._controlPanelReactionCollector.on("end", async (_, r) => {
            if (r !== "time") return;
            this.endRaid(null).catch();
        });

        return true;
    }

    /**
     * Gets the raid voice channel, if any.
     * @returns {VoiceChannel | null} The raid voice channel.
     */
    public get raidVc(): VoiceChannel | null {
        return this._raidVc;
    }

    /**
     * Logs an event. This will store the event in an array containing all events and optionally send the event to
     * the logging channel.
     * @param {string} event The event.
     * @param {boolean} logToChannel Whether to log this event to the logging channel.
     */
    public async logEvent(event: string, logToChannel: boolean): Promise<void> {
        const time = getFormattedTime();

        if (logToChannel && this._logChan) {
            this._logChan.send(`**\`[${time}]\`** ${event}`).catch();
        }

        this._raidLogs.push(`[${time}] ${event}`);
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
        const membersThatLed: GuildMember[] = [];
        const membersKeyPoppers: PriorityLogInfo[] = [];
        const membersAtEnd: GuildMember[] = [];
        const membersThatLeft: GuildMember[] = [];

        // 1) Validate number of completions
        const botMsg = await GlobalFgrUtilities.sendMsg(this._controlPanelChannel, {
            embeds: [
                MessageUtilities.generateBlankEmbed(memberThatEnded, "RED")
                    .setTitle(`Logging Run: ${this._dungeon.dungeonName}`)
                    .setDescription(
                        "What was the run status of the __last__ dungeon that was completed? If you did a chain, you"
                        + " will need to manually log the other runs."
                    )
                    .setFooter({text: FOOTER_INFO_MSG})
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
                ButtonConstants.CANCEL_LOGGING_BUTTON
            ])
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
            targetChannel: this._controlPanelChannel
        });

        if (!runStatusRes || runStatusRes.customId === ButtonConstants.CANCEL_LOGGING_ID) {
            // TODO validate this better
            botMsg.delete().catch();
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
            ButtonConstants.CANCEL_BUTTON
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
                            "Who was the main leader in the __last__ run? Usually, the main leader is the"
                            + " leader that led a majority of the run."
                        )
                        .addField(
                            "Selected Main Leader",
                            `${mainLeader} - \`${mainLeader.displayName}\``
                        )
                        .addField(
                            "Instructions",
                            "The selected main leader is shown above. To select a main leader, either type an in-game"
                            + " name, Discord ID, or mention a person. Once you are satisfied with your choice,"
                            + " press the **Confirm** button. If you don't want to log this run with *any* main"
                            + " leader, select the **Skip** button."
                        )
                        .setFooter({text: FOOTER_INFO_MSG})
                ],
                components: buttonsForSelectingMembers
            });

            const memberToPick = await AdvancedCollector.startDoubleCollector<GuildMember | -1>({
                cancelFlag: "-cancel",
                deleteResponseMessage: true,
                acknowledgeImmediately: true,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                duration: 5 * 60 * 1000,
                oldMsg: botMsg,
                targetAuthor: memberThatEnded,
                targetChannel: this._controlPanelChannel
            }, async m => (await UserManager.resolveMember(this._guild, m.content ?? "", true))?.member ?? -1);

            if (!memberToPick) {
                botMsg.delete().catch();
                return;
            }

            if (typeof memberToPick === "number") {
                await botMsg.edit({
                    embeds: [
                        MessageUtilities.generateBlankEmbed(this._guild, "RED")
                            .setTitle("Invalid Member Given")
                            .setDescription("Please specify a valid member. This can either be a mention, ID, or IGN.")
                            .setFooter({text: "After 5 seconds, this message will ask again."})
                    ],
                    components: []
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
                    botMsg.delete().catch();
                    return;
                }

                continue;
            }

            mainLeader = memberToPick;
        }

        // 3) Get key poppers
        LOGGER.info(`${this._instanceInfo} Determining key poppers`);
        const allKeys = this._allEssentialOptions.filter(x => x.type === "KEY" || x.type === "NM_KEY");
        for await (const [key, reactionInfo] of allKeys) {
            const possiblePoppers = this._pplWithEarlyLoc.get(key)!;
            const selectMenus: MessageSelectMenu[] = [];
            ArrayUtilities.breakArrayIntoSubsets(possiblePoppers, 25).forEach((subset, index) => {
                selectMenus.push(
                    new MessageSelectMenu()
                        .setCustomId(`${key}-${index}`)
                        .setMinValues(1)
                        .setMaxValues(1)
                        .setOptions(subset.map(x => {
                            return {
                                label: x.member.displayName,
                                value: x.member.id,
                                description: `Modifiers: [${x.modifiers.join(", ")}]`
                            };
                        }))
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
                                `You are now logging the ${getItemDisplay(reactionInfo)} popper for the __last`
                                + " dungeon__ that was either completed or failed. If you need to log more than one"
                                + " key, please manually do it by command."
                            )
                            .addField(
                                "Selected Popper",
                                selectedMember
                                    ? `${selectedMember} - \`${selectedMember.displayName}\``
                                    : "Not Selected."
                            )
                            .addField(
                                "Instructions",
                                "The popper for this key is shown above. To log the person that used this key for"
                                + " the last dungeon in this run, either send their in-game name, Discord ID, or"
                                + " mention them. You may alternatively select their IGN from the select menu below."
                                + " If no one used this key for the last dungeon in this run (excluding Bis keys),"
                                + " press the `Skip` button. Once you selected the correct member, press the"
                                + " `Confirm` button."
                            )
                            .setFooter({text: FOOTER_INFO_MSG})
                    ],
                    components: components
                });

                const memberToPick = await AdvancedCollector.startDoubleCollector<GuildMember | -1>({
                    cancelFlag: "-cancel",
                    deleteResponseMessage: true,
                    acknowledgeImmediately: true,
                    clearInteractionsAfterComplete: false,
                    deleteBaseMsgAfterComplete: false,
                    duration: 5 * 60 * 1000,
                    oldMsg: botMsg,
                    targetAuthor: memberThatEnded,
                    targetChannel: this._controlPanelChannel
                }, async m => (await UserManager.resolveMember(this._guild, m.content ?? "", true))?.member ?? -1);

                if (!memberToPick) {
                    botMsg.delete().catch();
                    return;
                }


                if (typeof memberToPick === "number") {
                    await botMsg.edit({
                        embeds: [
                            MessageUtilities.generateBlankEmbed(this._guild, "RED")
                                .setTitle("Invalid Member Given")
                                .setDescription("Please specify a valid member. This can either be a mention, ID, or IGN.")
                                .setFooter({text: "After 5 seconds, this message will ask again."})
                        ],
                        components: []
                    });

                    await MiscUtilities.stopFor(5 * 1000);
                    continue;
                }

                if (memberToPick instanceof MessageComponentInteraction) {
                    if (memberToPick.isSelectMenu()) {
                        selectedMember = possiblePoppers.find(x => x.member.id === memberToPick.values[0])!.member;
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
                        botMsg.delete().catch();
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
                    name: reactionInfo.name
                });
            }
        }

        // 4) Get /who if success
        // Otherwise, give everyone in the VC a fail
        LOGGER.info(`${this._instanceInfo} Parsing /who for completions`);
        if (isSuccess) {
            await botMsg.edit({
                embeds: [
                    MessageUtilities.generateBlankEmbed(memberThatEnded, "RED")
                        .setTitle(`Logging Run: ${this._dungeon.dungeonName}`)
                        .setDescription(
                            "Please send a screenshot containing the `/who` results from the completion of the"
                            + " dungeon. If you don't have a `/who` screenshot, press the `Skip` button. Your"
                            + " screenshot should be an image, not a link to one."
                        )
                        .addField(
                            "Warning",
                            "The person that ended the run should be the same person that took this /who screenshot."
                        )
                        .setFooter({text: FOOTER_INFO_MSG})
                ],
                components: AdvancedCollector.getActionRowsFromComponents([
                    skipButton
                ])
            });

            let attachment: MessageAttachment | null = null;
            const resObj = await AdvancedCollector.startDoubleCollector<Message>({
                oldMsg: botMsg,
                cancelFlag: "cancel",
                targetChannel: this._controlPanelChannel,
                targetAuthor: memberThatEnded,
                deleteBaseMsgAfterComplete: false,
                deleteResponseMessage: false,
                duration: 5 * 60 * 1000,
                acknowledgeImmediately: true,
                clearInteractionsAfterComplete: false
            }, (m: Message) => {
                if (m.attachments.size === 0)
                    return;

                // Images have a height property, non-images don't.
                const imgAttachment = m.attachments.find(x => x.height !== null);
                if (!imgAttachment) {
                    m.delete().catch();
                    return;
                }

                attachment = imgAttachment;
                return m;
            });

            if (!resObj) {
                botMsg.delete().catch();
                return;
            }

            if (resObj instanceof Message && attachment) {
                const data = await GlobalFgrUtilities.tryExecuteAsync(async () => {
                    const res = await RealmSharperWrapper.parseWhoScreenshotOnly(attachment!.url);
                    return res ? res : null;
                });
                LOGGER.info(`${this._instanceInfo} Names found in completion: ${data?.names}`);
                resObj.delete().catch();
                if (data && data.names.length > 0) {
                    for (const memberThatJoined of this._membersThatJoined) {
                        const names = UserManager.getAllNames(memberThatJoined.displayName, true);
                        // If we can find at least one name (in the person's display name) that is also in the
                        // /who, then give them credit
                        if (data.names.some(x => names.includes(x.toLowerCase()))) {
                            membersAtEnd.push(memberThatJoined);
                            continue;
                        }

                        membersThatLeft.push(memberThatJoined);
                    }
                }
                else {
                    await botMsg.edit({
                        embeds: [
                            MessageUtilities.generateBlankEmbed(memberThatEnded, "RED")
                                .setTitle(`Logging Run: ${this._dungeon.dungeonName}`)
                                .setDescription(
                                    "It appears that the parsing API isn't up, or the screenshot that you provided"
                                    + " is not valid. In either case, this step has been skipped."
                                )
                                .setFooter({text: "This will move to the next step in 5 seconds."})
                        ]
                    });

                    await MiscUtilities.stopFor(5 * 1000);
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
        await Promise.all(membersKeyPoppers.map(x => LoggerManager.logKeyUse(x.member, x.id, 1)));
        await Promise.all(membersThatLeft.map(x => LoggerManager.logDungeonRun(x, dungeonId, false, 1)));
        await Promise.all(membersAtEnd.map(x => LoggerManager.logDungeonRun(x, dungeonId, true, 1)));

        await botMsg.edit({
            components: [],
            embeds: [
                MessageUtilities.generateBlankEmbed(this._guild, "RED")
                    .setTitle("Logging Successful")
                    .setDescription(`Your \`${this._dungeon.dungeonName}\` run was successfully logged.`)
                    .addField(
                        "Logging Summary",
                        new StringBuilder()
                            .append(`- Main Leader: ${mainLeader ?? "N/A"}`).appendLine()
                            .append(membersKeyPoppers.map(x => `- ${x.name}: ${x.member}`).join("\n"))
                            .appendLine()
                            .append(`- Completed: ${membersAtEnd.length}`).appendLine()
                            .append(`- Failed: ${membersThatLeft.length}`)
                            .toString()
                    )
                    .addField(
                        "Next Step(s)",
                        "If you did more dungeons in this raid (i.e. this was a chain), you will need to manually"
                        + " log the *other* runs that were led. Note that you also need to log assisting raid leaders"
                        + " for all runs that were completed in this raid (including this one).\n\nAlso, be sure to"
                        + " log any keys that were popped along with any priority reactions so those that brought"
                        + " the key and/or priority reactions can be rewarded, if applicable."
                    )
            ]
        });
    }


    public get afkCheckMsg(): Message | null {
        return this._afkCheckMsg;
    }

    public get controlPanelMsg(): Message | null {
        return this._controlPanelMsg;
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
    IN_RUN
}

interface IParseResponse {
    inVcButNotInRaid: string[];
    inRaidButNotInVC: string[];
    isValid: boolean;
    whoRes: string[];
}