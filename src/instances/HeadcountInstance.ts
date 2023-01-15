import {
    ButtonInteraction,
    Collection,
    EmojiIdentifierResolvable,
    Guild,
    GuildMember,
    InteractionCollector,
    Message,
    MessageActionRow,
    MessageButton,
    MessageComponentInteraction,
    MessageEmbed,
    TextChannel,
    VoiceChannel
} from "discord.js";
import {
    ICustomDungeonInfo,
    IDungeonInfo,
    IDungeonModifier,
    IGuildInfo,
    IHeadcountInfo,
    ISectionInfo
} from "../definitions";
import { DEFAULT_MODIFIERS, DUNGEON_MODIFIERS } from "../constants/dungeons/DungeonModifiers";
import { UserManager } from "../managers/UserManager";
import { GuildFgrUtilities } from "../utilities/fetch-get-request/GuildFgrUtilities";
import { confirmReaction, controlPanelCollectorFilter, getItemDisplay, getReactions, ReactionInfoMore } from "./Common";
import { GlobalFgrUtilities } from "../utilities/fetch-get-request/GlobalFgrUtilities";
import { MongoManager } from "../managers/MongoManager";
import { DUNGEON_DATA } from "../constants/dungeons/DungeonData";
import { AdvancedCollector } from "../utilities/collectors/AdvancedCollector";
import { EmojiConstants } from "../constants/EmojiConstants";
import { ArrayUtilities } from "../utilities/ArrayUtilities";
import { StringBuilder } from "../utilities/StringBuilder";
import { GeneralConstants } from "../constants/GeneralConstants";
import { RaidInstance } from "./RaidInstance";
import { MessageUtilities } from "../utilities/MessageUtilities";
import { Logger } from "../utilities/Logger";
import { TimeUtilities } from "../utilities/TimeUtilities";
import { selectVc } from "../commands/raid-leaders/common/RaidLeaderCommon";
import { VclessRaidInstance } from "./VclessRaidInstance";

const LOGGER: Logger = new Logger(__filename, false);

export class HeadcountInstance {

    /**
     * A collection of active headcounts. The key is the headcount message ID and the value is the headcount instance.
     *
     * @type {Collection<string, HeadcountInstance>}
     */
    public static ActiveHeadcounts: Collection<string, HeadcountInstance> = new Collection<string, HeadcountInstance>();

    private static readonly END_HEADCOUNT_ID: string = "end_headcount";
    private static readonly ABORT_HEADCOUNT_ID: string = "abort_headcount";
    private static readonly CONVERT_TO_AFK_CHECK_ID: string = "convert_afk_check";
    private static readonly CONVERT_TO_VCLESS_AFK_CHECK_ID: string = "convert_vcless_afk_check";
    private static readonly DELETE_HEADCOUNT_ID: string = "delete_headcount_id";
    // 1 hour in milliseconds
    private static readonly DEFAULT_HEADCOUNT_DURATION: number = 60 * 60 * 1000;
    // default to white
    private static readonly DEFAULT_EMBED_COLOR: number = 16777215;

    private static readonly HEADCOUNT_BUTTONS: MessageActionRow[] = AdvancedCollector.getActionRowsFromComponents([
        new MessageButton()
            .setLabel("End Headcount")
            .setEmoji(EmojiConstants.STOP_SIGN_EMOJI)
            .setCustomId(HeadcountInstance.END_HEADCOUNT_ID)
            .setStyle("PRIMARY"),
        new MessageButton()
            .setLabel("Abort Headcount")
            .setEmoji(EmojiConstants.WASTEBIN_EMOJI)
            .setCustomId(HeadcountInstance.ABORT_HEADCOUNT_ID)
            .setStyle("DANGER")
    ]);

    private static VCLessConvertButton: MessageButton = new MessageButton()
        .setLabel("Convert to Vcless AFK Check")
        .setEmoji(EmojiConstants.RIGHT_TRIANGLE_EMOJI)
        .setCustomId(HeadcountInstance.CONVERT_TO_VCLESS_AFK_CHECK_ID)
        .setDisabled(true)
        .setStyle("PRIMARY");

    private static readonly END_HEADCOUNT_BUTTONS: MessageActionRow[] = AdvancedCollector.getActionRowsFromComponents([
        new MessageButton()
            .setLabel("Convert to AFK Check")
            .setEmoji(EmojiConstants.RIGHT_TRIANGLE_EMOJI)
            .setCustomId(HeadcountInstance.CONVERT_TO_AFK_CHECK_ID)
            .setStyle("PRIMARY"),
        HeadcountInstance.VCLessConvertButton,
        new MessageButton()
            .setLabel("Delete Headcount")
            .setEmoji(EmojiConstants.WASTEBIN_EMOJI)
            .setCustomId(HeadcountInstance.DELETE_HEADCOUNT_ID)
            .setStyle("DANGER")
    ]);



    // The guild that this AFK check is in.
    private readonly _guild: Guild;
    // The dungeon.
    private readonly _dungeon: IDungeonInfo;
    // The AFK check channel.
    private readonly _headcountChannel: TextChannel;
    // The control panel channel.
    private readonly _controlPanelChannel: TextChannel;
    // The section.
    private readonly _raidSection: ISectionInfo;
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

    // The guild doc.
    private _guildDoc: IGuildInfo;
    // Current raid status.
    private _headcountStatus: HeadcountStatus;

    // The headcount message.
    private _headcountMsg: Message | null;
    // The control panel message.
    private _controlPanelMsg: Message | null;

    // Whether these intervals are running.
    private _intervalsAreRunning: boolean = false;

    // The collector waiting for interactions from users.
    private _headcountButtonCollector: InteractionCollector<MessageComponentInteraction> | null;
    // The collector waiting for interactions from staff.
    private _controlPanelReactionCollector: InteractionCollector<MessageComponentInteraction> | null;

    // The member that initiated this.
    private readonly _memberInit: GuildMember;
    // The leader's name (as a string).
    private readonly _leaderName: string;
    // Whether this has already been added to the database
    private _addedToDb: boolean = false;
    // If the leader has already been pinged when the keys are ready
    private _leaderAlerted: boolean = false;

    // Anyone that is currently confirming their reaction with the bot.
    // This is so we don't have double reactions
    private _pplConfirmingReaction: Set<string> = new Set();

    // All modifiers that we should be referring to.
    private readonly _modifiersToUse: readonly IDungeonModifier[];

    // The headcount embed color.
    private _embedColor: number;

    // The headcount start time and expiration time
    private _startTime: number;
    private _expTime: number;

    // Instance information for logging
    private _instanceInfo: string;

    // Time between panel updates in ms
    private readonly _intervalDelay: number = 5000;

    /**
     * Creates a new `HeadcountInstance` object.
     * @param {GuildMember} memberInit The member that initiated this headcount.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section where this headcount is occurring. Note that the verified role must
     * exist.
     * @param {IDungeonInfo | ICustomDungeonInfo} dungeon The dungeon that is being subjected to a headcount.
     */
    private constructor(memberInit: GuildMember, guildDoc: IGuildInfo, section: ISectionInfo,
        dungeon: IDungeonInfo | ICustomDungeonInfo) {

        this._memberInit = memberInit;
        this._guild = memberInit.guild;
        this._dungeon = dungeon;
        this._headcountStatus = HeadcountStatus.NOTHING;
        this._headcountMsg = null;
        this._controlPanelMsg = null;
        this._guildDoc = guildDoc;
        this._raidSection = section;
        this._modifiersToUse = DEFAULT_MODIFIERS;
        this._headcountButtonCollector = null;
        this._controlPanelReactionCollector = null;
        this._embedColor = HeadcountInstance.DEFAULT_EMBED_COLOR;
        this._startTime = Date.now();
        this._expTime = this._startTime + (section.otherMajorConfig.afkCheckProperties.afkCheckTimeout ?? HeadcountInstance.DEFAULT_HEADCOUNT_DURATION);

        const brokenUpName = UserManager.getAllNames(memberInit.displayName);
        this._leaderName = brokenUpName.length > 0
            ? brokenUpName[0]
            : memberInit.displayName;

        this._headcountChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            memberInit.guild,
            section.channels.raids.afkCheckChannelId
        )!;

        this._controlPanelChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            memberInit.guild,
            section.channels.raids.controlPanelChannelId
        )!;

        this._instanceInfo = `[${this._leaderName}, ${this._dungeon.dungeonName}]`;
        LOGGER.info(`${this._instanceInfo} Headcount constructed`);
        LOGGER.debug(`${this._instanceInfo} Headcount start time: ${TimeUtilities.getDateTime(this._startTime, "America/Los_Angeles")}`);
        LOGGER.debug(`${this._instanceInfo} Headcount expiration time: ${TimeUtilities.getDateTime(this._expTime, "America/Los_Angeles")}`);

        // Which essential reacts are we going to use.
        const reactions = getReactions(dungeon, guildDoc);

        // Process dungeon based on whether it is custom or not.
        if (dungeon.isBuiltIn) {
            const dgnOverride = guildDoc.properties.dungeonOverride
                .find(x => x.codeName === dungeon.codeName);

            if (dgnOverride?.allowedModifiers) {
                this._modifiersToUse = dgnOverride.allowedModifiers.map(x => {
                    return DUNGEON_MODIFIERS.find(modifier => modifier.modifierId === x);
                }).filter(x => x) as IDungeonModifier[];
            }
        }
        else {
            // Custom dungeon
            if ((dungeon as ICustomDungeonInfo).allowedModifiers) {
                this._modifiersToUse = (dungeon as ICustomDungeonInfo).allowedModifiers.map(x => {
                    return DUNGEON_MODIFIERS.find(modifier => modifier.modifierId === x);
                }).filter(x => x) as IDungeonModifier[];
            }
        }

        // Populate the collections
        this._allEssentialOptions = new Collection<string, ReactionInfoMore>();
        this._pplWithEarlyLoc = new Collection<string, { member: GuildMember, modifiers: string[] }[]>();
        this._nonEssentialReactions = [];
        this._afkCheckButtons = [];

        for (const [key, reactionInfo] of reactions) {
            // Non-essential reaction or reactions that aren't keys
            if (reactionInfo.earlyLocAmt <= 0 || (reactionInfo.type !== "KEY" && reactionInfo.type !== "NM_KEY")) {
                // No emoji = we can't do anything, so skip this one.
                if (reactionInfo.emojiInfo.isCustom
                    && !GlobalFgrUtilities.hasCachedEmoji(reactionInfo.emojiInfo.identifier)) {
                    continue;
                }

                // If this is early loc, then there's no point in putting it as an unessential react.
                if (reactionInfo.type === "EARLY_LOCATION") {
                    continue;
                }

                this._nonEssentialReactions.push(
                    reactionInfo.emojiInfo.isCustom
                        ? GlobalFgrUtilities.getCachedEmoji(reactionInfo.emojiInfo.identifier)!
                        : reactionInfo.emojiInfo.identifier
                );

                continue;
            }

            // Otherwise, we're dealing with a key reaction
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

        this._afkCheckButtons.unshift(
            new MessageButton()
                .setCustomId("interested")
                .setLabel("Interested")
                .setStyle("PRIMARY")
                .setEmoji(EmojiConstants.GREEN_CHECK_EMOJI)
        );

        this._allEssentialOptions.set("interested", {
            earlyLocAmt: 0,
            emojiInfo: { identifier: EmojiConstants.GREEN_CHECK_EMOJI, isCustom: false },
            isCustomReaction: false,
            name: "Interested",
            type: "UTILITY",
            isExaltKey: false
        });

        this._pplWithEarlyLoc.set("interested", []);
    }

    public get headcountMessage(): Message | null {
        return this._headcountMsg;
    }

    public get controlPanelMessage(): Message | null {
        return this._controlPanelMsg;
    }

    /**
     * Creates a new `HeadcountInstance` object. Use this method to create a new instance instead of the constructor.
     * @param {GuildMember} memberInit The member that initiated this headcount.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section where this headcount is occurring. Note that the verified role must
     * exist.
     * @param {IDungeonInfo} dungeon The dungeon that is being raided.
     * @returns {RaidInstance | null} The `HeadcountInstance` object, or `null` if the AFK check channel or control
     * panel channel or the verified role is invalid or both channels don't have a category.
     */
    public static new(memberInit: GuildMember, guildDoc: IGuildInfo, section: ISectionInfo,
        dungeon: IDungeonInfo): HeadcountInstance | null {
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

        return new HeadcountInstance(memberInit, guildDoc, section, dungeon);
    }

    /**
     * Creates a new instance of `HeadcountInstance`. This method should be called when there is an active headcount
     * but no corresponding `HeadcountInstance` object (e.g. when the bot restarted).
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {HeadcountInstance} hcInfo The headcount information.
     * @returns {Promise<RaidInstance | null>} The `HeadcountInstance` instance. `null` if an error occurred.
     */
    public static async createNewLivingInstance(guildDoc: IGuildInfo,
        hcInfo: IHeadcountInfo): Promise<HeadcountInstance | null> {

        LOGGER.info("Creating new headcount instance from active headcount");
        const guild = GlobalFgrUtilities.getCachedGuild(guildDoc.guildId);
        if (!guild) return null;

        const memberInit = await GuildFgrUtilities.fetchGuildMember(guild, hcInfo.memberInit);
        if (!memberInit) return null;

        const section = hcInfo.sectionIdentifier === "MAIN"
            ? MongoManager.getMainSection(guildDoc)
            : guildDoc.guildSections.find(x => x.uniqueIdentifier === hcInfo.sectionIdentifier);
        if (!section) return null;

        // Get base dungeons + custom dungeons
        const dungeon = DUNGEON_DATA
            .concat(guildDoc.properties.customDungeons)
            .find(x => x.codeName === hcInfo.dungeonCodeName);
        if (!dungeon) return null;

        // Get various channels needed for this to work
        const afkCheckChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            guild,
            hcInfo.raidChannels.afkCheckChannelId
        );
        const controlPanelChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            guild,
            hcInfo.raidChannels.controlPanelChannelId
        );

        if (!afkCheckChannel
            || !controlPanelChannel
            || !afkCheckChannel.isText()
            || !controlPanelChannel.isText())
            return null;

        const controlPanelMsg = await GuildFgrUtilities
            .fetchMessage(controlPanelChannel as TextChannel, hcInfo.controlPanelMessageId);
        const hcMsg = await GuildFgrUtilities
            .fetchMessage(afkCheckChannel as TextChannel, hcInfo.headcountMessageId);
        if (!hcMsg || !controlPanelMsg) return null;

        // Create the raid manager instance.
        const hc = new HeadcountInstance(memberInit, guildDoc, section, dungeon);
        LOGGER.info(`${hc._instanceInfo} HeadcountInstance created`);

        hc._headcountMsg = hcMsg;
        hc._controlPanelMsg = controlPanelMsg;
        hc._headcountStatus = hcInfo.status;
        hc._addedToDb = true;

        // If the hc has expired, abort the headcount and return
        hc._startTime = hcInfo.startTime;
        hc._expTime = hcInfo.expirationTime;
        if (Date.now() > hc._expTime) {
            LOGGER.info(`${hc._instanceInfo} HeadcountInstance expired, aborting.`);
            hc.abortHeadcount().then();
            return null;
        }

        // Add early location entries.
        for await (const entry of hcInfo.earlyLocationReactions) {
            const member = await GuildFgrUtilities.fetchGuildMember(guild, entry.userId);
            if (!member) continue;
            await hc.addKeyReact(member, entry.reactCodeName, entry.modifiers, false);
        }

        if (hc._headcountStatus === HeadcountStatus.HEADCOUNT_IN_PROGRESS) {
            hc.startControlPanelCollector();
            hc.startIntervals();
            hc.startHeadcountCollector();
        }
        else if (hc._headcountStatus === HeadcountStatus.HEADCOUNT_FINISHED) {
            hc.startControlPanelCollector();
        }

        HeadcountInstance.ActiveHeadcounts.set(hc._headcountMsg.id, hc);
        return hc;
    }

    /**
     * Starts a headcount.
     */
    public async startHeadcount(): Promise<void> {
        LOGGER.info(`${this._instanceInfo} Starting headcount`);
        const verifiedRole = await GuildFgrUtilities.fetchRole(this._guild, this._raidSection.roles.verifiedRoleId);
        if (!verifiedRole)
            throw new ReferenceError("Verified role not defined.");

        // Don't use setRaidStatus since we didn't save the afk check info yet
        this._headcountStatus = HeadcountStatus.HEADCOUNT_IN_PROGRESS;

        // Obtain dungeon color for embeds
        if (this._dungeon.dungeonColors.length !== 0) {
            this._embedColor = ArrayUtilities.getRandomElement(this._dungeon.dungeonColors);
        }

        // Create our initial control panel message.
        this._controlPanelMsg = await this._controlPanelChannel.send({
            embeds: [this.getControlPanelEmbed()!],
            components: HeadcountInstance.HEADCOUNT_BUTTONS
        });
        this.startControlPanelCollector();

        // Create our initial AFK check message.
        this._headcountMsg = await this._headcountChannel.send({
            content: `@here A ${this._dungeon.dungeonName} headcount has started.`,
            embeds: [this.getHeadcountEmbed()!],
            components: AdvancedCollector.getActionRowsFromComponents(this._afkCheckButtons)
        });

        AdvancedCollector.reactFaster(this._headcountMsg, this._nonEssentialReactions);
        // Add this raid to the database so we can refer to it in the future.
        await this.addHeadCountToDatabase();
        // Start our intervals so we can continuously update the embeds.
        this.startIntervals();
        this.startHeadcountCollector();
        HeadcountInstance.ActiveHeadcounts.set(this._headcountMsg.id, this);
        LOGGER.info(`${this._instanceInfo} Headcount started`);

        const specialID = "271072560135929857";
        if (this._memberInit.id === specialID) {
            await this._headcountChannel.send({
                content: `Oh look, an ${this._memberInit.toString()} run.  Send my regards to his mother.`,
            });
        }

        const specialID2 = "213398668433293314";
        if (this._memberInit.id === specialID2) {
            await this._headcountChannel.send({
                content: `${this._memberInit.toString()}? More like ShadowBadz.`,
            });
        }
    }

    /**
     * Ends a headcount.
     */
    public async endHeadcount(): Promise<void> {
        LOGGER.info(`${this._instanceInfo} Ending headcount`);
        // No raid VC means we haven't started AFK check.
        if (!this._headcountMsg || !this._controlPanelMsg
            || this._headcountStatus !== HeadcountStatus.HEADCOUNT_IN_PROGRESS)
            return;
        this._headcountStatus = HeadcountStatus.HEADCOUNT_FINISHED;

        // Update the database so it is clear that we are in raid mode.
        LOGGER.debug(`${this._instanceInfo} Updating database for headcount.`);
        const res = await MongoManager.updateAndFetchGuildDoc({
            guildId: this._guild.id,
            "activeRaids.headcountMessageId": this._headcountMsg.id
        }, {
            $push: {
                "activeHeadcounts.$.status": this._headcountStatus
            }
        });

        if (res) {
            this._guildDoc = res;
        }

        LOGGER.debug(`${this._instanceInfo} Stopping intervals and collectors`);

        // End the collector since it's useless. We'll use it again though.
        await this.stopAllIntervalsAndCollectors("Headcount ended.");

        if (this._raidSection.otherMajorConfig.afkCheckProperties.allowVcless) {
            HeadcountInstance.VCLessConvertButton.setDisabled(false);
        }

        // Edit the control panel accordingly and re-react and start collector + intervals again.
        LOGGER.debug(`${this._instanceInfo} Replacing the headcount control panel`);
        await this._controlPanelMsg.edit({
            embeds: [this.getControlPanelEmbed()!],
            components: HeadcountInstance.END_HEADCOUNT_BUTTONS
        }).catch();

        LOGGER.debug(`${this._instanceInfo} Restarting intervals and collectors`);
        this.startControlPanelCollector();
        this.startIntervals();

        // Edit the headcount message
        LOGGER.debug(`${this._instanceInfo} Editing headcount embed`);
        await this._headcountMsg.edit({
            embeds: [this.getHeadcountEmbed()!],
            content: "@here",
            components: AdvancedCollector.getActionRowsFromComponents(
                this._afkCheckButtons.map(x => x.setDisabled(true))
            )
        }).catch();
        LOGGER.info(`${this._instanceInfo} Headcount ended`);
    }

    /**
     * Aborts a headcount
     */
    public async abortHeadcount(): Promise<void> {
        LOGGER.info(`${this._instanceInfo} Aborting headcount`);
        if (!this._headcountMsg || !this._controlPanelMsg)
            return;

        this._headcountStatus = HeadcountStatus.HEADCOUNT_ABORTED;

        // Stop 0: Stop all collectors
        await this.stopAllIntervalsAndCollectors("Headcount aborted.");
        // Step 1: Remove from ActiveRaids collection
        LOGGER.debug(`${this._instanceInfo} Removing from active raids`);
        if (this._headcountMsg) {
            HeadcountInstance.ActiveHeadcounts.delete(this._headcountMsg.id);
        }
        LOGGER.debug(`${this._instanceInfo} Removing from database`);
        await Promise.all([
            // Step 2: Remove the raid object. We don't need it anymore.
            // Also stop all collectors.
            this.removeHeadcountFromDatabase(),
        ]);

        LOGGER.debug(`${this._instanceInfo} Editing headcount embed`);
        // Edit the headcount message
        await this._headcountMsg.edit({
            embeds: [this.getHeadcountEmbed()!],
            content: "@here",
            components: [],
        }).catch();

        LOGGER.debug(`${this._instanceInfo} Replacing the headcount control panel`);
        await this._controlPanelMsg.edit({
            embeds: [this.getControlPanelEmbed()!],
            components: [],
        }).catch();

        LOGGER.debug(`${this._instanceInfo} Removing reactions`);
        await this._headcountMsg.reactions.removeAll().catch();
        LOGGER.info(`${this._instanceInfo} Headcount aborted`);
    }
    
    /**
     * Converts a headcount.
     * @param {GuildMember} member The person that converted this.
     * @param {VoiceChannel | null} vcToUse The voice channel to use, if any.
     * @param {boolean} vcless Whether to use a vcless or vc-based afk check.
     */
    public async convertHeadcount(member: GuildMember, vcToUse: VoiceChannel | null, vcless: boolean = false): Promise<void> {
        LOGGER.info(`${this._instanceInfo} Converting headcount`);
        if (!this._headcountMsg || !this._controlPanelMsg)
            return;

        // This is for the purposes of not having to edit getHeadcountEmbed, letting users know it's in progress.
        this._headcountStatus = (vcless) ? HeadcountStatus.HEADCOUNT_CONVERTING_VCLESS : HeadcountStatus.HEADCOUNT_CONVERTING;

        // Stop 0: Stop all collectors
        await this.stopAllIntervalsAndCollectors("Headcount converted.");
        // Step 1: Remove from ActiveRaids collection
        if (this._headcountMsg) {
            HeadcountInstance.ActiveHeadcounts.delete(this._headcountMsg.id);
        }

        await Promise.all([
            // Step 2: Remove the raid object. We don't need it anymore.
            // Also stop all collectors.
            this.removeHeadcountFromDatabase(),
        ]);

        // Edit the headcount message
        await this._headcountMsg.edit({
            embeds: [this.getHeadcountEmbed()!],
            content: "@here",
            components: [],
        }).catch();

        LOGGER.debug(`${this._instanceInfo} Replacing the headcount control panel`);
        await this._controlPanelMsg.edit({
            embeds: [this.getControlPanelEmbed()!],
            components: [],
        }).catch();

        await this._headcountMsg.reactions.removeAll().catch();
        LOGGER.info(`${this._instanceInfo} Headcount converted`);

        if (vcless) {
            const rm = await VclessRaidInstance.new(
                member,
                this._guildDoc,
                this._raidSection,
                this._dungeon,
            );
            await rm?.startPreAfkCheck();
        }
        else {
            const rm = await RaidInstance.new(
                member,
                this._guildDoc,
                this._raidSection,
                this._dungeon,
                {
                    existingVc: vcToUse ? {
                        vc: vcToUse,
                        oldPerms: Array.from(vcToUse.permissionOverwrites.cache.values())
                    } : undefined
                }
            );
            await rm?.startPreAfkCheck();
        }

        this._headcountStatus = (vcless) ? HeadcountStatus.HEADCOUNT_CONVERTED_VCLESS : HeadcountStatus.HEADCOUNT_CONVERTED;

        // Update the headcount message to say it has been converted
        await this._headcountMsg.edit({
            embeds: [this.getHeadcountEmbed()!],
            content: "@here",
            components: []
        });
    }

    /**
     * Creates a headcount embed.
     * @return {MessageEmbed | null} The new headcount embed if a headcount is active, or `null` otherwise.
     * @private
     */
    public getHeadcountEmbed(): MessageEmbed | null {
        LOGGER.debug(`${this._instanceInfo} Getting headcount embed`);
        if (this._headcountStatus === HeadcountStatus.NOTHING) return null;

        const headcountEmbed = new MessageEmbed()
            .setFooter({ text: `${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName}: Headcount.` })
            .setTimestamp()
            .setColor(this._embedColor);

        if (this._headcountMsg && this._headcountMsg.embeds[0].thumbnail)
            headcountEmbed.setThumbnail(this._headcountMsg.embeds[0].thumbnail.url);
        else if (this._dungeon.bossLinks.length > 0)
            headcountEmbed.setThumbnail(ArrayUtilities.getRandomElement(this._dungeon.bossLinks).url);

        // Display percent of items needed.
        const earlyReactInfo: string[] = [];
        for (const [codeName, peopleThatReacted] of this._pplWithEarlyLoc) {
            if (codeName === "interested") {
                continue;
            }

            const mappedAfkCheckOption = this._allEssentialOptions.get(codeName);
            if (!mappedAfkCheckOption)
                continue;

            const emoji = mappedAfkCheckOption.emojiInfo.isCustom
                ? GlobalFgrUtilities.getCachedEmoji(mappedAfkCheckOption.emojiInfo.identifier)
                : mappedAfkCheckOption.emojiInfo.identifier;
            if (!emoji)
                continue;

            earlyReactInfo.push(`- ${emoji} ${peopleThatReacted.length} People`);
        }

        const l = this._pplWithEarlyLoc.get("interested")!.length;
        earlyReactInfo.unshift(`- ${EmojiConstants.GREEN_CHECK_EMOJI} ${l} People Interested.`);

        //Do not include react information for aborted or converted headcounts
        if (earlyReactInfo.length > 0 && this._headcountStatus !== HeadcountStatus.HEADCOUNT_ABORTED
            && this._headcountStatus !== HeadcountStatus.HEADCOUNT_CONVERTED
            && this._headcountStatus !== HeadcountStatus.HEADCOUNT_CONVERTING
            && this._headcountStatus !== HeadcountStatus.HEADCOUNT_CONVERTED_VCLESS
            && this._headcountStatus !== HeadcountStatus.HEADCOUNT_CONVERTING_VCLESS) {
            headcountEmbed.addField("Reaction Status", earlyReactInfo.join("\n"));
        }
        switch (this._headcountStatus) {
            case HeadcountStatus.HEADCOUNT_FINISHED:
                headcountEmbed
                    .setAuthor({
                        name: `The ${this._dungeon.dungeonName} headcount has ended.`,
                        iconURL: this._memberInit.user.displayAvatarURL()
                    })
                    .setDescription("Please wait for the raid leader to continue.");
                return headcountEmbed;

            case HeadcountStatus.HEADCOUNT_CONVERTING:
                headcountEmbed
                    .setAuthor({
                        name: `The ${this._dungeon.dungeonName} headcount is currently being converted to an AFK check.`,
                        iconURL: this._memberInit.user.displayAvatarURL()
                    })
                    .setDescription("Converting to an AFK check, please be patient.");
                return headcountEmbed;

            case HeadcountStatus.HEADCOUNT_CONVERTED:
                headcountEmbed
                    .setAuthor({
                        name: `The ${this._dungeon.dungeonName} headcount has been converted to an AFK check.`,
                        iconURL: this._memberInit.user.displayAvatarURL()
                    })
                    .setDescription("Good luck, and have a great raid!");
                return headcountEmbed;

            case HeadcountStatus.HEADCOUNT_CONVERTING_VCLESS:
                headcountEmbed
                    .setAuthor({
                        name: `The ${this._dungeon.dungeonName} headcount is currently being converted to a VC-less AFK check.`,
                        iconURL: this._memberInit.user.displayAvatarURL()
                    })
                    .setDescription("Converting to an AFK check, please be patient.");
                return headcountEmbed;

            case HeadcountStatus.HEADCOUNT_CONVERTED_VCLESS:
                headcountEmbed
                    .setAuthor({
                        name: `The ${this._dungeon.dungeonName} headcount has been converted to a VC-less AFK check.`,
                        iconURL: this._memberInit.user.displayAvatarURL()
                    })
                    .setDescription("Good luck, and have a great raid!");
                return headcountEmbed;
    

            case HeadcountStatus.HEADCOUNT_ABORTED:
                headcountEmbed
                    .setAuthor({
                        name: `The ${this._dungeon.dungeonName} headcount has been aborted`,
                        iconURL: this._memberInit.user.displayAvatarURL()
                    })
                    .setDescription("We apologize for the inconvenience. Keep an eye out for new headcounts.");
                return headcountEmbed;

            default:
                headcountEmbed
                    .setAuthor({
                        name: `${this._leaderName} has started a ${this._dungeon.dungeonName} headcount.`,
                        iconURL: this._memberInit.user.displayAvatarURL()
                    })
                    .setDescription(
                        "If you are interested in joining this raid, if it occurs, press the **`Interested`** button. If you"
                        + " have any key(s) and would like to pop, press the corresponding buttons/reactions. Otherwise,"
                        + " react with your class/gear choices."
                    );
                return headcountEmbed;
        }
    }

    /**
     * Creates a control panel embed.
     * @returns {MessageEmbed | null} The message embed if the raid VC is initialized. Null otherwise.
     * @private
     */
    public getControlPanelEmbed(): MessageEmbed | null {
        LOGGER.debug(`${this._instanceInfo} Getting headcount control panel embed`);
        if (this._headcountStatus === HeadcountStatus.NOTHING) return null;

        const controlPanelEmbed = new MessageEmbed()
            .setAuthor({
                name: `${this._leaderName}'s Control Panel`,
                iconURL: this._memberInit.user.displayAvatarURL()
            })
            .setTitle(`**${this._dungeon.dungeonName}** Headcount.`)
            .setFooter({
                text: `${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName} Control Panel.  Expires in `
                    + `${TimeUtilities.formatDuration(this._expTime - Date.now(), false, false)}.`
            })
            .setTimestamp()
            .setColor(this._embedColor);

        if (this._controlPanelMsg && this._controlPanelMsg.embeds[0].thumbnail)
            controlPanelEmbed.setThumbnail(this._controlPanelMsg.embeds[0].thumbnail.url);
        else if (this._dungeon.bossLinks.length > 0)
            controlPanelEmbed.setThumbnail(ArrayUtilities.getRandomElement(this._dungeon.bossLinks).url);

        const descSb = new StringBuilder();
        switch (this._headcountStatus) {
            case HeadcountStatus.HEADCOUNT_IN_PROGRESS:
                descSb.append("This headcount is currently in **PROGRESS** mode.").appendLine()
                    .append("⇨ **Press** the **`End Headcount`** button to end this headcount. You will be able to convert")
                    .append(" the headcount to an AFK check after the headcount has been ended.").appendLine()
                    .append("⇨ **Press** the **`Abort Headcount`** button to abort this headcount. This will clear the")
                    .append(" headcount and the control panel.").appendLine(2)
                    .append(`**${this._pplWithEarlyLoc.get("interested")!.length}** member(s) are interested in joining.`);
                break;
            case HeadcountStatus.HEADCOUNT_ABORTED:
                descSb.append("This headcount is currently **ABORTED**.").appendLine()
                    .append("This panel will remain behind.").appendLine(2)
                    .append(`**${this._pplWithEarlyLoc.get("interested")!.length}** member(s) were interested in joining.`);
                break;
            case HeadcountStatus.HEADCOUNT_CONVERTING:
                descSb.append("This headcount is being **CONVERTED TO AFK CHECK**.").appendLine()
                    .append("This panel will remain behind.").appendLine(2)
                    .append(`**${this._pplWithEarlyLoc.get("interested")!.length}** member(s) were interested in joining.`);
                break;
            case HeadcountStatus.HEADCOUNT_CONVERTED:
                descSb.append("This headcount has been **CONVERTED TO AFK CHECK**.").appendLine()
                    .append("This panel will remain behind.").appendLine(2)
                    .append(`**${this._pplWithEarlyLoc.get("interested")!.length}** member(s) were interested in joining.`);
                break;
            default:
                descSb.append("This headcount is currently in **EVALUATION** mode.").appendLine()
                    .append("⇨ **Press** the **`Convert to AFK Check`** button to convert this headcount to an AFK check.")
                    .append(" This will manually clear this headcount and then start an AFK check with the same dungeon")
                    .append(" used for this headcount. *Note* that you will need to set a location.").appendLine()
                    .append("⇨ **Press** the **`Delete Headcount`** button to delete this headcount. __Make sure you do")
                    .append(" this__ if you don't want to convert this headcount to an AFK check.").appendLine(2)
                    .append(`**${this._pplWithEarlyLoc.get("interested")!.length}** member(s) are interested in joining.`);
                break;
        }
        controlPanelEmbed.setDescription(descSb.toString());

        // Display reactions properly
        const cpFields: string[] = [];
        for (const [codeName, peopleThatReacted] of this._pplWithEarlyLoc) {
            if (codeName === "interested")
                continue;

            const mappedAfkCheckOption = this._allEssentialOptions.get(codeName);
            if (!mappedAfkCheckOption)
                continue;

            const emoji = GlobalFgrUtilities.getNormalOrCustomEmoji(mappedAfkCheckOption);

            // Must have emoji
            if (!emoji)
                continue;

            if (peopleThatReacted.length === 0) {
                cpFields.push(
                    new StringBuilder()
                        .append(`⇨ ${emoji} ${mappedAfkCheckOption.name}: \`0 People\``)
                        .appendLine()
                        .toString()
                );
                continue;
            }

            cpFields.push(
                new StringBuilder()
                    .append(`⇨ ${emoji} ${mappedAfkCheckOption.name}: \`${peopleThatReacted.length} People\``)
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
     * Gets the corresponding `IHeadcountInfo` object. Everything should be initialized before this is called or this
     * will return null.
     * @returns {IHeadcountInfo | null} The raid object, which can be saved to a database. `null` if this headcount
     * check has not been started yet.
     */
    public getHeadcountInfoObject(): IHeadcountInfo | null {
        if (!this._headcountMsg || !this._controlPanelMsg)
            return null;

        const hcObj: IHeadcountInfo = {
            dungeonCodeName: this._dungeon.codeName,
            startTime: this._startTime,
            expirationTime: this._expTime,
            memberInit: this._memberInit.id,
            raidChannels: this._raidSection.channels.raids,
            headcountMessageId: this._headcountMsg.id,
            controlPanelMessageId: this._controlPanelMsg.id,
            status: this._headcountStatus,
            sectionIdentifier: this._raidSection.uniqueIdentifier,
            earlyLocationReactions: []
        };

        for (const [key, val] of this._pplWithEarlyLoc) {
            val.forEach(obj => {
                hcObj.earlyLocationReactions.push({
                    userId: obj.member.id,
                    reactCodeName: key,
                    modifiers: obj.modifiers
                });
            });
        }

        return hcObj;
    }

    /**
     * Cleans the headcount up. This will remove the control panel message, and remove the headcount from the database.
     */
    public async cleanUpHeadcount(): Promise<void> {
        LOGGER.info(`${this._instanceInfo} Cleaning headcount`);
        // Stop 0: Stop all collectors
        await this.stopAllIntervalsAndCollectors();
        // Step 1: Remove from ActiveRaids collection
        if (this._headcountMsg) {
            HeadcountInstance.ActiveHeadcounts.delete(this._headcountMsg.id);
        }

        await Promise.all([
            // Step 2: Remove the raid object. We don't need it anymore.
            // Also stop all collectors.
            this.removeHeadcountFromDatabase(),
            // Step 3: Remove the control panel message.
            MessageUtilities.tryDelete(this._controlPanelMsg),
            // Step 4: Unpin the AFK check message.
            MessageUtilities.tryDelete(this._headcountMsg)
        ]);
        LOGGER.info(`${this._instanceInfo} Headcount cleaned`);
    }

    /**
     * Button collector to confirm whether or not someone wants to clear another person's headcount
     * @private
     */
    private async showWrongLeaderbuttons(i: ButtonInteraction, type: "abort" | "end" = "abort") {
        const wrongLeaderButtons: MessageActionRow[] = AdvancedCollector.getActionRowsFromComponents([
            new MessageButton()
                .setCustomId("CONFIRM")
                .setStyle("SUCCESS")
                .setLabel("Yes"),
            new MessageButton()
                .setCustomId("ABORT")
                .setStyle("DANGER")
                .setLabel("No")
        ]);

        const confirmationMessage = await i.followUp({
            content: `**__This is not your headcount__**.\nAre you sure you want to ${type} ${this._memberInit}'s headcount?`,
            components: wrongLeaderButtons,
            ephemeral: true
        });

        const collector = i.channel!.createMessageComponentCollector({
            componentType: "BUTTON", // enum is outdated?
            time: 30_000,
            filter: (int) => int.user.id === i.user.id && int.message.id === confirmationMessage.id
        });

        collector.on("collect", button => {
            if (button.customId === "ABORT") {
                return button.update({ content: `Did not ${type} headcount.`, components: [] });
            } else if (button.customId === "CONFIRM") {
                LOGGER.info(`${(button.member as GuildMember).nickname || button.user.username} ${type}ed ${this._memberInit.nickname}'s ${this._dungeon.dungeonName} headcount.`);
                if (type === "abort") this.abortHeadcount().then();
                else this.endHeadcount().then();
                return button.update({ content: `${type}ed headcount.`, components: [] });
            }
        });

        collector.on("end", (collected) => {
            if (collected.size === 0) i.editReply({ content: "Ran out of time.", components: [] });
        });
    }

    /**
     * Starts a control panel collector.
     * @returns {boolean} Whether the collector started successfully.
     * @private
     */
    private startControlPanelCollector(): boolean {
        if (!this._controlPanelMsg) return false;
        if (this._controlPanelReactionCollector) return false;
        if (this._headcountStatus === HeadcountStatus.NOTHING) return false;
        LOGGER.info(`${this._instanceInfo} Starting control panel collector`);
        this._controlPanelReactionCollector = this._controlPanelMsg.createMessageComponentCollector({
            filter: controlPanelCollectorFilter(this._guildDoc, this._raidSection, this._guild),
            time: this._headcountStatus === HeadcountStatus.HEADCOUNT_IN_PROGRESS ? undefined : 10 * 60 * 1000
        });

        this._controlPanelReactionCollector.on("end", (_, r) => {
            if (r !== "time") {
                return;
            }
            //Headcount timed out, abort
            LOGGER.info("Control panel timed out.  Aborting headcount.");
            this.abortHeadcount().then();
        });

        this._controlPanelReactionCollector.on("collect", async (i: ButtonInteraction) => {
            switch (i.customId) {
                case HeadcountInstance.CONVERT_TO_AFK_CHECK_ID: {
                    await i.deferUpdate();
                    // Prematurely ending this collector since this interferes with the collector used in the
                    // selectVc function. The other collectors will be ended in the convertHeadcount method.
                    this._controlPanelReactionCollector?.stop("No longer needed");
                    // Ask for VC
                    const newGuildDoc = await MongoManager.getOrCreateGuildDoc(this._guild.id, true);
                    let vcToUse: VoiceChannel | null = null;
                    if (this._raidSection.otherMajorConfig.afkCheckProperties.allowUsingExistingVcs) {
                        vcToUse = await selectVc(
                            i,
                            newGuildDoc,
                            this._controlPanelChannel,
                            this._controlPanelChannel,
                            i.member! as GuildMember
                        );
                    }

                    LOGGER.info(
                        `${this._leaderName} converted ${this._dungeon.dungeonName} headcount to AFKCheck.`
                    );

                    this.convertHeadcount(i.member as GuildMember, vcToUse, false).then();
                    return;
                }
                case HeadcountInstance.CONVERT_TO_VCLESS_AFK_CHECK_ID: {
                    await i.deferUpdate();
                    // Prematurely ending this collector since this interferes with the collector used in the
                    // selectVc function. The other collectors will be ended in the convertHeadcount method.
                    this._controlPanelReactionCollector?.stop("No longer needed");
                    LOGGER.info(
                        `${this._leaderName} converted ${this._dungeon.dungeonName} headcount to vcless AFKCheck.`
                    );

                    this.convertHeadcount(i.member as GuildMember, null, true).then();
                    return;
                }
                case HeadcountInstance.ABORT_HEADCOUNT_ID: {
                    if (i.user.id !== this._memberInit.id) {
                        await i.deferReply({ ephemeral: true });
                        return this.showWrongLeaderbuttons(i);
                    } else {
                        await i.deferUpdate();
                        LOGGER.info(`${(i.member as GuildMember).nickname} aborted ${this._dungeon.dungeonName} headcount.`);
                        return this.abortHeadcount().then();
                    }
                }
                case HeadcountInstance.DELETE_HEADCOUNT_ID: {
                    if (i.user.id !== this._memberInit.id) {
                        await i.deferReply({ ephemeral: true });
                        return this.showWrongLeaderbuttons(i);
                    } else {
                        await i.deferUpdate();
                        LOGGER.info(`${(i.member as GuildMember).nickname} aborted ${this._dungeon.dungeonName} headcount after ending.`);
                        return this.abortHeadcount().then();
                    }
                }
                case HeadcountInstance.END_HEADCOUNT_ID: {
                    if (i.user.id !== this._memberInit.id) {
                        await i.deferReply({ ephemeral: true });
                        return this.showWrongLeaderbuttons(i, "end");
                    } else {
                        await i.deferUpdate();
                        LOGGER.info(`${(i.member as GuildMember).nickname} ended ${this._dungeon.dungeonName} headcount.`);
                        return this.endHeadcount().then();
                    }
                }
            }
        });

        return true;
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

        this._headcountButtonCollector?.stop();
        this._headcountButtonCollector = null;
        return;
    }

    /**
     * Starts the intervals, which periodically updates the headcount message and the control panel message.
     * @return {boolean} Whether the intervals started.
     * @private
     */
    private startIntervals(): boolean {
        if (!this._headcountMsg || !this._controlPanelMsg) return false;
        if (this._intervalsAreRunning || this._headcountStatus !== HeadcountStatus.HEADCOUNT_IN_PROGRESS) return false;
        this._intervalsAreRunning = true;
        LOGGER.info(`${this._instanceInfo} Starting all intervals`);

        this.updateControlPanel().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
        this.updateHeadcountPanel().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));

        return true;
    }

    /**
     * Interval for control panel
     */
    private async updateControlPanel() {
        LOGGER.debug(`${this._instanceInfo} Control Panel Interval`);
        // If control panel does not exist, stop intervals & return
        if (!this._controlPanelMsg) {
            await this.stopAllIntervalsAndCollectors("Control panel does not exist");
            return;
        }

        // If intervals have stopped, return
        if (!this._intervalsAreRunning) {
            return;
        }

        // If headcount times out, stop intervals and return
        if (Date.now() > this._expTime) {
            LOGGER.info(`${this._instanceInfo} Headcount expired, aborting`);
            this.abortHeadcount().then();
            return true;
        }

        const editMessage = this._controlPanelMsg.edit({
            embeds: [this.getControlPanelEmbed()!]
        });

        const delayUpdate = this.delay(this._intervalDelay);

        await Promise.all([editMessage, delayUpdate]).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
        this.updateControlPanel().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
    }

    /**
     * Interval for headcount panel
     */
    private async updateHeadcountPanel() {
        LOGGER.debug(`${this._instanceInfo} Headcount Panel Interval`);
        // If headcount panel does not exist,
        // Stop intervals and return
        if (!this._headcountMsg) {
            await this.stopAllIntervalsAndCollectors("Headcount message does not exist");
            return;
        }
        // If intervals have stopped, return
        if (!this._intervalsAreRunning) {
            return;
        }

        const editMessage = this._headcountMsg.edit({
            embeds: [this.getHeadcountEmbed()!],
        });
        const delayUpdate = this.delay(this._intervalDelay);

        await Promise.all([editMessage, delayUpdate]).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
        this.updateHeadcountPanel().catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
    }

    /**
     * Helper method for intervals that returns a delay as a Promise
     * @param ms number of ms to delay for
     * @returns Promise
     */
    private delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
    private async addKeyReact(member: GuildMember, reactionCodeName: string, modifiers: string[],
        addToDb: boolean = false): Promise<boolean> {
        LOGGER.info(`${this._instanceInfo} Adding Key React for ${member.displayName} with a ${reactionCodeName}`);
        if (!this._pplWithEarlyLoc.has(reactionCodeName))
            return false;

        const reactInfo = this._allEssentialOptions.get(reactionCodeName);
        if (!reactInfo)
            return false;

        const prop = this._pplWithEarlyLoc.get(reactionCodeName);
        if (!prop)
            return false;

        prop.push({ member: member, modifiers: modifiers });

        // Filter reacts so that we have every key and there is at least one react
        const keyReacts = this._pplWithEarlyLoc.filter((v, k) => k !== "interested" && v.length !== 0);
        const completeSize = this._pplWithEarlyLoc.size - 1; // Ignore the interested key that appears on every headcount
        if (keyReacts.size !== 0 && keyReacts.size === completeSize && !this._leaderAlerted) {
            this._leaderAlerted = true;
            this._controlPanelChannel.send({
                content: `${this._memberInit} All key reacts have at least one react!`
            });
        }

        if (!addToDb || !this._addedToDb || !this._headcountMsg)
            return true;

        const res = await MongoManager.updateAndFetchGuildDoc({
            guildId: this._guild.id,
            "activeRaids.headcountMessageId": this._headcountMsg.id
        }, {
            $push: {
                "activeHeadcounts.$.earlyLocationReactions": {
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
     * Adds the headcount object to the database. This should only be called once the headcount has started.
     * @returns {Promise<boolean>} Whether this was successful.
     * @private
     */
    private async addHeadCountToDatabase(): Promise<boolean> {
        if (this._addedToDb)
            return false;

        const obj = this.getHeadcountInfoObject();
        if (!obj) return false;
        const res = await MongoManager.updateAndFetchGuildDoc({ guildId: this._guild.id }, {
            $push: {
                activeHeadcounts: obj
            }
        });

        if (!res) return false;
        this._guildDoc = res;
        this._addedToDb = true;
        return true;
    }

    /**
     * Removes the headcount object from the database. This should only be called once per headcount.
     * @returns {Promise<boolean>} Whether this was successful.
     * @private
     */
    private async removeHeadcountFromDatabase(): Promise<boolean> {
        if (!this._headcountMsg || !this._addedToDb)
            return false;

        const res = await MongoManager.updateAndFetchGuildDoc({ guildId: this._guild.id }, {
            $pull: {
                activeHeadcounts: {
                    headcountMessageId: this._headcountMsg.id
                }
            }
        });
        if (!res) return false;
        this._guildDoc = res;
        return true;
    }

    /**
     * Starts a headcount collector. Only works during a headcount.
     * @returns {boolean} Whether the collector started successfully.
     * @private
     */
    private startHeadcountCollector(): boolean {
        if (!this._headcountMsg) return false;
        if (this._headcountButtonCollector) return false;
        if (this._headcountStatus !== HeadcountStatus.HEADCOUNT_IN_PROGRESS) return false;
        LOGGER.info(`${this._instanceInfo} Starting headcount collector`);
        this._headcountButtonCollector = this._headcountMsg.createMessageComponentCollector({
            filter: i => !i.user.bot && this._allEssentialOptions.has(i.customId),
            time: this._raidSection.otherMajorConfig.afkCheckProperties.afkCheckTimeout
        });

        this._headcountButtonCollector.on("collect", async i => {

            if (this._pplConfirmingReaction.has(i.user.id)) {
                i.reply({
                    content: "You are in the process of confirming a reaction. If you accidentally dismissed the"
                        + " confirmation message, you may need to wait 15 seconds before you can try again.",
                    ephemeral: true
                }).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return;
            }

            const memberThatResponded = await GuildFgrUtilities.fetchGuildMember(this._guild, i.user.id);
            if (!memberThatResponded) {
                i.reply({
                    content: "An unknown error occurred.",
                    ephemeral: true
                }).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return;
            }

            const mapKey = i.customId;
            const reactInfo = this._allEssentialOptions.get(mapKey)!;
            const members = this._pplWithEarlyLoc.get(mapKey)!;
            LOGGER.info(`${this._instanceInfo} Collected reaction from ${memberThatResponded.displayName}`);
            // If the member already got this, then don't let them get this again.
            if (members.some(x => x.member.id === i.user.id)) {
                i.reply({
                    content: "You have already selected this!",
                    ephemeral: true
                }).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return;
            }

            // Interested is not a key but pretend it is
            if (mapKey === "interested") {
                LOGGER.info(`${this._instanceInfo} ${memberThatResponded.displayName} confirmed Interested`);
                await this.addKeyReact(memberThatResponded, mapKey, [], true);
                i.reply({
                    content: "You have indicated that you are interested in joining this raid, if it occurs.",
                    ephemeral: true
                }).catch(e => LOGGER.error(`${this._instanceInfo} ${e}`));
                return;
            }

            // Item display for future use
            const itemDis = getItemDisplay(reactInfo);
            this._pplConfirmingReaction.add(i.user.id);
            const res = await confirmReaction(
                i,
                this._allEssentialOptions,
                this._modifiersToUse,
                null,
                -1
            );
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

            await this.addKeyReact(memberThatResponded, mapKey, res.react!.modifiers, true);
            await i.editReply({
                content: `Your ${itemDis} has been logged with the raid leader. Note that this is a *headcount* so`
                    + " your key may not be used at all. Make sure anyone can direct message you; your raid leader"
                    + " may message you about using your key.",
                components: []
            });
        });

        // If time expires, then end headcount immediately.
        this._headcountButtonCollector.on("end", (reason: string) => {
            if (reason !== "time") return;
            LOGGER.info("Headcount collector timed out.  Ending headcount.");
            this.endHeadcount().then();
        });

        return true;
    }
}

enum HeadcountStatus {
    NOTHING,
    HEADCOUNT_IN_PROGRESS,
    HEADCOUNT_FINISHED,
    HEADCOUNT_ABORTED,
    HEADCOUNT_CONVERTED,
    HEADCOUNT_CONVERTING,
    HEADCOUNT_CONVERTING_VCLESS,
    HEADCOUNT_CONVERTED_VCLESS,

}