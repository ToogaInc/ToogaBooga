// TODO add temp event handlers to client here.

// Suppress unused methods for this file.
// noinspection JSUnusedGlobalSymbols

import {AdvancedCollector} from "../utilities/collectors/AdvancedCollector";
import {
    Collection,
    Guild,
    GuildEmoji,
    GuildMember, Interaction,
    InteractionCollector,
    Message,
    MessageActionRow, MessageAttachment,
    MessageButton,
    MessageComponentInteraction,
    MessageEmbed,
    MessageOptions,
    OverwriteResolvable,
    Role,
    Snowflake,
    TextChannel,
    User,
    VoiceChannel, VoiceState
} from "discord.js";
import {StringBuilder} from "../utilities/StringBuilder";
import {ChannelTypes, MessageButtonStyles} from "discord.js/typings/enums";
import {ArrayUtilities} from "../utilities/ArrayUtilities";
import {StartAfkCheck} from "../commands/raid-leaders/StartAfkCheck";
import {MAPPED_AFK_CHECK_REACTIONS} from "../constants/MappedAfkCheckReactions";
import {MessageUtilities} from "../utilities/MessageUtilities";
import {DUNGEON_DATA} from "../constants/DungeonData";
import {StringUtil} from "../utilities/StringUtilities";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {MongoManager} from "../managers/MongoManager";
import {GlobalFgrUtilities} from "../utilities/fetch-get-request/GlobalFgrUtilities";
import {GeneralConstants} from "../constants/GeneralConstants";
import {RealmSharperWrapper} from "../private-api/RealmSharperWrapper";
import {OneLifeBot} from "../OneLifeBot";
import {Emojis} from "../constants/Emojis";
import {MiscUtilities} from "../utilities/MiscUtilities";
import {UserManager} from "../managers/UserManager";
import {
    IAfkCheckReaction, ICustomDungeonInfo,
    IDungeonInfo,
    IGuildInfo,
    IRaidInfo,
    IRaidOptions,
    IReactionInfo,
    ISectionInfo
} from "../definitions";
import {TimeUtilities} from "../utilities/TimeUtilities";

type ReactionInfoMore = IReactionInfo & { earlyLocAmt: number; isCustomReaction: boolean; };

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
            .setEmoji(Emojis.LONG_RIGHT_TRIANGLE_EMOJI)
            .setCustomId(RaidInstance.START_AFK_CHECK_ID)
            .setStyle(MessageButtonStyles.PRIMARY),
        new MessageButton()
            .setLabel("Abort AFK Check")
            .setEmoji(Emojis.WASTEBIN_EMOJI)
            .setCustomId(RaidInstance.ABORT_AFK_ID)
            .setStyle(MessageButtonStyles.DANGER)
    ]);

    private static readonly CP_AFK_BUTTONS: MessageActionRow[] = AdvancedCollector.getActionRowsFromComponents([
        new MessageButton()
            .setLabel("Start Raid")
            .setEmoji(Emojis.LONG_RIGHT_TRIANGLE_EMOJI)
            .setCustomId(RaidInstance.START_RAID_ID)
            .setStyle(MessageButtonStyles.PRIMARY),
        new MessageButton()
            .setLabel("Abort AFK Check")
            .setEmoji(Emojis.WASTEBIN_EMOJI)
            .setCustomId(RaidInstance.ABORT_AFK_ID)
            .setStyle(MessageButtonStyles.DANGER),
        new MessageButton()
            .setLabel("Set Location")
            .setEmoji(Emojis.MAP_EMOJI)
            .setCustomId(RaidInstance.SET_LOCATION_ID)
            .setStyle(MessageButtonStyles.PRIMARY)
    ]);

    private static readonly CP_RAID_BUTTONS: MessageActionRow[] = AdvancedCollector.getActionRowsFromComponents([
        new MessageButton()
            .setLabel("End Raid")
            .setEmoji(Emojis.RED_SQUARE_EMOJI)
            .setCustomId(RaidInstance.END_RAID_ID)
            .setStyle(MessageButtonStyles.DANGER),
        new MessageButton()
            .setLabel("Set Location")
            .setEmoji(Emojis.MAP_EMOJI)
            .setCustomId(RaidInstance.SET_LOCATION_ID)
            .setStyle(MessageButtonStyles.PRIMARY),
        new MessageButton()
            .setLabel("Lock Raid VC")
            .setEmoji(Emojis.LOCK_EMOJI)
            .setCustomId(RaidInstance.LOCK_VC_ID)
            .setStyle(MessageButtonStyles.PRIMARY),
        new MessageButton()
            .setLabel("Unlock Raid VC")
            .setEmoji(Emojis.UNLOCK_EMOJI)
            .setCustomId(RaidInstance.UNLOCK_VC_ID)
            .setStyle(MessageButtonStyles.PRIMARY),
        new MessageButton()
            .setLabel("Parse Raid VC")
            .setEmoji(Emojis.PRINTER_EMOJI)
            .setCustomId(RaidInstance.PARSE_VC_ID)
            .setStyle(MessageButtonStyles.PRIMARY)
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
    private readonly _nonEssentialReactions: GuildEmoji[];

    // Buttons to display on the AFK check. These should only contain essential buttons.
    private readonly _afkCheckButtons: MessageButton[];
    // All essential options (options that give early location). Equivalent to _afkCheckButtons but as raw data
    // instead of buttons. The key is the mapping key.
    private readonly _allEssentialOptions: Collection<string, ReactionInfoMore>;
    // A collection that contains the IAfkCheckReaction.mapKey as the key and the members with the corresponding
    // item as the value.
    private readonly _pplWithEarlyLoc: Collection<string, GuildMember[]>;
    // A collection that deals with *general* (Nitro, Patreon, etc.) early location. The key is the mapKey and the
    // value is an object containing the roles needed.
    private readonly _earlyLocToRole: Collection<string, Role[]>;

    // The guild document.
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

    // The timeout used to update the AFK check message with information regarding reactions.
    private _afkCheckInterval: NodeJS.Timeout | null;
    // The timeout used to update the control panel message with information regarding reactions.
    private _controlPanelInterval: NodeJS.Timeout | null;
    // Whether these intervals are running.
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
    // The raid message defined by the raid leader.
    private readonly _raidMsg: string;

    // The members that are joining this raid.
    private readonly _membersThatJoined: string[] = [];
    private readonly _raidLogs: string[] = [];

    /**
     * Creates a new `RaidInstance` object.
     * @param {GuildMember} memberInit The member that initiated this raid.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section where this raid is occurring. Note that the verified role must exist.
     * @param {IDungeonInfo | ICustomDungeonInfo} dungeon The dungeon that is being raided.
     * @param {string} location The location.
     * @param {IRaidOptions} raidOptions The raid message, if any.
     */
    private constructor(memberInit: GuildMember, guildDoc: IGuildInfo, section: ISectionInfo,
                        dungeon: IDungeonInfo | ICustomDungeonInfo, location: string, raidOptions: IRaidOptions) {
        this._memberInit = memberInit;
        this._guild = memberInit.guild;
        this._dungeon = dungeon;
        this._location = location;
        this._raidMsg = raidOptions.raidMessage;
        this._raidStatus = RaidStatus.NOTHING;
        this._raidVc = null;
        this._afkCheckMsg = null;
        this._controlPanelMsg = null;
        this._afkCheckInterval = null;
        this._controlPanelInterval = null;
        this._guildDoc = guildDoc;
        this._raidSection = section;
        this._membersThatJoined = [];

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

        // Which essential reacts are we going to use.
        const reactions = RaidInstance.getReactions(dungeon, guildDoc);

        // This defines the number of people that gets early location via NITRO only.
        let numEarlyLoc: number = -2;
        // And this is the raid VC limit
        let vcLimit: number = -2;
        // Process dungeon based on whether it is custom or not.
        if (dungeon.isBaseOrDerived) {
            const dgnOverride = guildDoc.properties.dungeonOverride
                .find(x => x.codeName === dungeon.codeName);

            if (dgnOverride && dgnOverride.vcLimit !== -1)
                vcLimit = dgnOverride.vcLimit;

            if (dgnOverride && dgnOverride.nitroEarlyLocationLimit !== -1)
                numEarlyLoc = dgnOverride.nitroEarlyLocationLimit;
            else if (section.otherMajorConfig.afkCheckProperties.nitroEarlyLocationLimit !== -1)
                numEarlyLoc = section.otherMajorConfig.afkCheckProperties.nitroEarlyLocationLimit;
        }
        else {
            // If this is not a base or derived dungeon (i.e. it's a custom dungeon), then it must specify the nitro
            // limit.
            numEarlyLoc = (dungeon as ICustomDungeonInfo).nitroEarlyLocationLimit;
        }

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

        this._numNitroEarlyLoc = numEarlyLoc;

        // Go through all early location reactions and associate each reaction to a set of roles
        // If no roles can be associated, remove the reaction from the collection.
        this._earlyLocToRole = new Collection();
        Array.from(reactions.filter(x => x.type === "EARLY_LOCATION").entries()).forEach(x => {
            const [mapKey,] = x;
            if (mapKey === "NITRO" && this._guild.roles.premiumSubscriberRole) {
                this._earlyLocToRole.set(mapKey, [this._guild.roles.premiumSubscriberRole]);
                return;
            }

            const rolesForEarlyLoc = (this._guildDoc.properties.genEarlyLocReactions
                .find(kv => kv.key === mapKey)?.value
                .filter(role => GuildFgrUtilities.hasCachedRole(this._guild, role))
                .map(role => GuildFgrUtilities.getCachedRole(this._guild, role)) ?? []) as Role[];

            if (rolesForEarlyLoc.length === 0) {
                reactions.delete(mapKey);
                return;
            }
            this._earlyLocToRole.set(mapKey, rolesForEarlyLoc);
        });

        // Populate the collections
        this._allEssentialOptions = new Collection<string, ReactionInfoMore>();
        this._pplWithEarlyLoc = new Collection<string, GuildMember[]>();
        this._nonEssentialReactions = [];
        this._afkCheckButtons = [];

        for (const [key, reactionInfo] of reactions) {
            // Non-essential reaction.
            if (reactionInfo.earlyLocAmt <= 0) {
                // No emoji = we can't do anything, so skip this one.
                if (!GlobalFgrUtilities.hasCachedEmoji(reactionInfo.emojiId))
                    continue;

                // If this is early loc, then there's no point in putting it as an unessential react.
                if (reactionInfo.type === "EARLY_LOCATION")
                    continue;

                this._nonEssentialReactions.push(
                    GlobalFgrUtilities.getCachedEmoji(reactionInfo.emojiId)!
                );

                continue;
            }

            // Otherwise, we're dealing with essential reactions.
            this._pplWithEarlyLoc.set(key, []);
            this._allEssentialOptions.set(key, reactionInfo);

            // Create the button which will be put on AFK check.
            const button = new MessageButton()
                .setLabel(reactionInfo.name)
                .setStyle(MessageButtonStyles.PRIMARY)
                .setCustomId(key);

            const emoji = GlobalFgrUtilities.getCachedEmoji(reactionInfo.emojiId);
            if (emoji)
                button.setEmoji(emoji.id ?? emoji.name!);

            this._afkCheckButtons.push(button);
        }
    }

    /**
     * Gets all relevant reactions. This accounts for overrides as well.
     * @param {IDungeonInfo} dungeon The dungeon.
     * @param {IGuildInfo} guildDoc The guild document.
     * @return {Collection<string, IReactionInfo & {earlyLocAmt: number; isCustom: boolean;}>} The collection of
     * reactions. The key is the mapping key and the value is the reaction information (along with the number of
     * early locations.
     */
    public static getReactions(
        dungeon: IDungeonInfo,
        guildDoc: IGuildInfo
    ): Collection<string, ReactionInfoMore> {
        const reactions = new Collection<string, ReactionInfoMore>();

        // Define a local function that will check both MappedAfkCheckReactions & customReactions for reactions.
        function findAndAddReaction(reaction: IAfkCheckReaction): void {
            // Is the reaction key in MappedAfkCheckReactions? If so, it's as simple as grabbing that data.
            if (reaction.mapKey in MAPPED_AFK_CHECK_REACTIONS) {
                if (!GlobalFgrUtilities.hasCachedEmoji(MAPPED_AFK_CHECK_REACTIONS[reaction.mapKey].emojiId))
                    return;

                reactions.set(reaction.mapKey, {
                    ...MAPPED_AFK_CHECK_REACTIONS[reaction.mapKey],
                    earlyLocAmt: reaction.maxEarlyLocation,
                    isCustomReaction: false
                });
                return;
            }

            // Is the reaction key associated with a custom emoji? If so, grab that as well. 
            const customEmoji = guildDoc.properties.customReactions.findIndex(x => x.key === reaction.mapKey);
            if (customEmoji !== -1) {
                if (!GlobalFgrUtilities.hasCachedEmoji(guildDoc.properties.customReactions[customEmoji].value.emojiId))
                    return;

                reactions.set(reaction.mapKey, {
                    ...guildDoc.properties.customReactions[customEmoji].value,
                    earlyLocAmt: reaction.maxEarlyLocation,
                    isCustomReaction: true
                });
            }
        }

        // If the dungeon is base or derived base, we need to check for dungeon overrides. 
        if (dungeon.isBaseOrDerived) {
            // Check if we need to deal with any dungeon overrides. 
            const overrideIdx = guildDoc.properties.dungeonOverride.findIndex(x => x.codeName === dungeon.codeName);

            if (overrideIdx !== -1) {
                // We need to deal with overrides. In this case, go through every reaction defined in the override
                // info and add them to the collection of reactions.
                const overrideInfo = guildDoc.properties.dungeonOverride[overrideIdx];

                for (const reaction of overrideInfo.keyReactions.concat(overrideInfo.otherReactions)) {
                    findAndAddReaction(reaction);
                }

                // We don't need to check anything else.
                return reactions;
            }

            // Otherwise, we 100% know that this is the base dungeon with no random custom emojis.
            // Get all keys + reactions
            for (const key of dungeon.keyReactions.concat(dungeon.otherReactions)) {
                reactions.set(key.mapKey, {
                    ...MAPPED_AFK_CHECK_REACTIONS[key.mapKey],
                    earlyLocAmt: key.maxEarlyLocation,
                    isCustomReaction: false
                });
            }

            return reactions;
        }

        // Otherwise, this is a fully custom dungeon so we can simply just combine all reactions into one array and
        // process that.
        for (const r of dungeon.keyReactions.concat(dungeon.otherReactions)) {
            findAndAddReaction(r);
        }

        return reactions;
    }

    /**
     * Creates a new `RaidInstance` object. Use this method to create a new instance instead of the constructor.
     * @param {GuildMember} memberInit The member that initiated this raid.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section where this raid is occurring. Note that the verified role must exist.
     * @param {IDungeonInfo} dungeon The dungeon that is being raided.
     * @param {string} location The location.
     * @param {IRaidOptions} raidOptions The raid message, if any.
     * @returns {RaidInstance | null} The `RaidInstance` object, or `null` if the AFK check channel or control panel
     * channel or the verified role is invalid or both channels don't have a category.
     */
    public static new(memberInit: GuildMember, guildDoc: IGuildInfo, section: ISectionInfo, dungeon: IDungeonInfo,
                      location: string, raidOptions: IRaidOptions): RaidInstance | null {
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

        return new RaidInstance(memberInit, guildDoc, section, dungeon, location, raidOptions);
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
        const guild = await GlobalFgrUtilities.fetchGuild(guildDoc.guildId);
        if (!guild) return null;

        const memberInit = await GuildFgrUtilities.fetchGuildMember(guild, raidInfo.memberInit);
        if (!memberInit) return null;

        const section = guildDoc.guildSections.find(x => x.uniqueIdentifier === raidInfo.sectionIdentifier);
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
            raidInfo.channels.afkCheckChannelId
        );
        const controlPanelChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            guild,
            raidInfo.channels.controlPanelChannelId
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
        const rm = new RaidInstance(memberInit, guildDoc, section, dungeon, raidInfo.location, {
            raidMessage: raidInfo.raidMessage,
            vcLimit: raidVc.userLimit
        });

        rm._raidVc = raidVc;
        rm._afkCheckMsg = afkCheckMsg;
        rm._controlPanelMsg = controlPanelMsg;
        rm._raidStatus = raidInfo.status;

        // Add early location entries.
        for await (const entry of raidInfo.earlyLocationReactions) {
            const member = await GuildFgrUtilities.fetchGuildMember(guild, entry.userId);
            if (!member) continue;
            await rm.addEarlyLocationReaction(member, entry.reactCodeName, false);
        }

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
        const verifiedRole = await GuildFgrUtilities.fetchRole(this._guild, this._raidSection.roles.verifiedRoleId);
        if (!verifiedRole)
            throw new ReferenceError("Verified role not defined.");

        // Don't use setRaidStatus since we didn't save the afk check info yet
        this._raidStatus = RaidStatus.PRE_AFK_CHECK;
        // Raid VC MUST be initialized first before we can use a majority of the helper methods.
        const vc = await this._guild.channels.create(`${Emojis.LOCK_EMOJI} ${this._leaderName}'s Raid`, {
            type: ChannelTypes.GUILD_VOICE,
            userLimit: this._vcLimit,
            permissionOverwrites: this.getPermissionsForRaidVc(false),
            parent: this._afkCheckChannel!.parent!
        });

        if (!vc) return;
        this._raidVc = vc as VoiceChannel;

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

        const tempMsg = await this._afkCheckChannel.send({
            content: `${this._raidVc.toString()} will be unlocked in 5 seconds. Prepare to join!`
        });
        await MiscUtilities.stopFor(5 * 1000);

        // We are officially in AFK check mode.
        // We do NOT start the intervals OR collector since pre-AFK and AFK have the exact same collectors/intervals.
        await this.setRaidStatus(RaidStatus.AFK_CHECK);
        await this._raidVc.permissionOverwrites.set(this.getPermissionsForRaidVc(true));

        // We do need to restart the control panel collector.
        this._controlPanelReactionCollector?.stop();
        this.startControlPanelCollector();

        // However, we forcefully edit the embeds.
        await this._afkCheckMsg.edit({
            content: "@here An AFK Check is currently ongoing.",
            embeds: [this.getAfkCheckEmbed()!],
            components: AdvancedCollector.getActionRowsFromComponents(this._afkCheckButtons)
        });
        AdvancedCollector.reactFaster(this._afkCheckMsg, this._nonEssentialReactions);
        await this._controlPanelMsg.edit({
            embeds: [this.getControlPanelEmbed()!],
            components: RaidInstance.CP_AFK_BUTTONS
        });
    }

    /**
     * Ends the AFK check. There will be no post-AFK check.
     * @param {GuildMember | User | null} memberEnded The member that ended the AFK check, or `null` if it was ended
     * automatically.
     */
    public async endAfkCheck(memberEnded: GuildMember | User | null): Promise<void> {
        // No raid VC means we haven't started AFK check.
        if (!this._raidVc || !this._afkCheckMsg || !this._controlPanelMsg || this._raidStatus !== RaidStatus.AFK_CHECK)
            return;

        // Update the database so it is clear that we are in raid mode.
        await this.setRaidStatus(RaidStatus.IN_RUN);

        // Lock the VC as well.
        await this._raidVc.permissionOverwrites.edit(this._guild.roles.everyone.id, {
            "CONNECT": false
        }).catch();

        // Add all members that were in the VC at the time.
        this._membersThatJoined.push(...Array.from(this._raidVc.members.values()).map(x => x.id));

        // End the collector since it's useless. We'll use it again though.
        this.stopAllIntervalsAndCollectors("AFK Check ended.");

        // Remove reactions from AFK check.
        await this._afkCheckMsg.reactions.removeAll().catch();

        // Edit the control panel accordingly and re-react and start collector + intervals again.
        await this._controlPanelMsg.edit({
            embeds: [this.getControlPanelEmbed()!],
            components: RaidInstance.CP_RAID_BUTTONS
        }).catch();
        this.startControlPanelCollector();
        this.startIntervals();

        const afkEndedEnded = new MessageEmbed()
            .setColor(ArrayUtilities.getRandomElement(this._dungeon.dungeonColors))
            .setAuthor(`${this._leaderName}'s ${this._dungeon.dungeonName} AFK check is now over.`,
                this._memberInit.user.displayAvatarURL())
            .setFooter(`${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName}: Raid`)
            .setTimestamp()
            .setDescription(
                memberEnded
                    ? `The AFK check has been ended by ${memberEnded} and the raid is currently ongoing.`
                    : `The AFK check has ended automatically. The raid is currently ongoing.`
            );

        if (this._raidSection.otherMajorConfig.afkCheckProperties.customMsg.postAfkCheckInfo) {
            afkEndedEnded.addField(
                "Post-AFK Info",
                this._raidSection.otherMajorConfig.afkCheckProperties.customMsg.postAfkCheckInfo
            );
        }

        if (this._raidMsg)
            afkEndedEnded.addField("Message From Your Leader", this._raidMsg);

        const rejoinRaidSb = new StringBuilder()
            .append("If you disconnected from this raid voice channel, you are able to reconnect by pressing the ")
            .append(`**Reconnect** button.`)
            .appendLine()
            .appendLine()
            .append("If you did not make it into the raid voice channel before the AFK check is over, then pressing ")
            .append("the button will not do anything.");
        afkEndedEnded.addField("Rejoin Raid", rejoinRaidSb.toString());

        // And edit the AFK check message + start the collector.
        await this._afkCheckMsg.edit({
            embeds: [afkEndedEnded],
            content: "The AFK check is now over.",
            components: AdvancedCollector.getActionRowsFromComponents([
                new MessageButton()
                    .setCustomId(`reconnect_${this._afkCheckMsg.id}`)
                    .setEmoji(Emojis.INBOX_EMOJI)
                    .setLabel("Reconnect")
                    .setStyle(MessageButtonStyles.SUCCESS)
            ])
        }).catch();
    }

    /**
     * Ends the raid.
     * @param {GuildMember | User} memberEnded The member that ended the raid or aborted the AFK check.
     */
    public async endRaid(memberEnded: GuildMember | User): Promise<void> {
        // No raid VC means we haven't started AFK check.
        if (!this._raidVc || !this._afkCheckMsg || !this._controlPanelMsg)
            return;

        const memberThatEnded = memberEnded instanceof User
            ? GuildFgrUtilities.getCachedMember(this._guild, memberEnded.id) ?? this._memberInit
            : memberEnded;

        // Get the name.
        const name = UserManager.getAllNames(memberThatEnded.displayName);
        const leaderName = name.length === 0 ? memberThatEnded.displayName : name[0];
        // Stop the collector.
        // We don't care about the result of this function, just that it should run.
        this.cleanUpRaid().then();

        // If this method was called during the AFK check, simply abort the AFK check.
        if (this._raidStatus === RaidStatus.AFK_CHECK) {
            const abortAfkEmbed = new MessageEmbed()
                .setAuthor(`${leaderName} has aborted the ${this._dungeon.dungeonName} AFK check.`,
                    memberThatEnded.user.displayAvatarURL())
                .setDescription("There was probably not enough keys or raiders. Check back at a later time.")
                .setFooter(`${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName} AFK Check Aborted.`)
                .setTimestamp()
                .setColor(ArrayUtilities.getRandomElement(this._dungeon.dungeonColors));
            await this._afkCheckMsg.edit({embeds: [abortAfkEmbed]}).catch();
            return;
        }

        // Otherwise, we treat it as if the raid is officially over.
        const endAfkEmbed = new MessageEmbed()
            .setAuthor(`${this._leaderName} has ended the ${this._dungeon.dungeonName} run.`,
                memberThatEnded.user.displayAvatarURL())
            .setDescription("The raid is now over. Thank you all for attending.")
            .setFooter(`${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName} Run Ended.`)
            .setTimestamp()
            .setColor(ArrayUtilities.getRandomElement(this._dungeon.dungeonColors));
        await this._afkCheckMsg.edit({embeds: [endAfkEmbed]}).catch();
    }


    /**
     * Gets an array of members that was in VC at the time the raid started.
     * @returns {string[]} The array of members.
     */
    public get membersThatJoinedVc(): string[] {
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
        const pplWithEarlyLoc = this._pplWithEarlyLoc.get(reactCodeName)!;
        return pplWithEarlyLoc.length < reactInfo.earlyLocAmt;
    }

    /**
     * Adds an early location entry to the early location map, optionally also saving it to the database.
     * @param {GuildMember} member The guild member that is getting early location.
     * @param {string} reactionCodeName The reaction code name corresponding to the reaction that the person chose.
     * @param {boolean} [addToDb = false] Whether to add to the database.
     * @returns {Promise<boolean>} True if added to the map, false otherwise.
     * @private
     */
    private async addEarlyLocationReaction(member: GuildMember, reactionCodeName: string,
                                           addToDb: boolean = false): Promise<boolean> {
        if (!this._pplWithEarlyLoc.has(reactionCodeName))
            return false;
        const reactInfo = this._allEssentialOptions.get(reactionCodeName);
        if (!reactInfo)
            return false;

        const prop = this._pplWithEarlyLoc.get(reactionCodeName);
        if (!prop || !this.stillNeedEssentialReact(reactionCodeName))
            return false;
        prop.push(member);

        if (!addToDb || !this._raidVc)
            return true;

        const res = await MongoManager.updateAndFetchGuildDoc({
            guildId: this._guild.id,
            "activeRaids.vcId": this._raidVc.id
        }, {
            $push: {
                "activeRaids.$.earlyLocationReactions": {
                    userId: member.id,
                    reactCodeName: prop
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
        this._location = newLoc;
        if (!this._raidVc)
            return false;
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
     * Adds a raid object to the database. This should only be called once the AFK check has started.
     * @returns {Promise<boolean>} Whether this was successful.
     * @private
     */
    private async addRaidToDatabase(): Promise<boolean> {
        const obj = this.getRaidInfoObject();
        if (!obj) return false;
        const res = await MongoManager.updateAndFetchGuildDoc({guildId: this._guild.id}, {
            $push: {
                activeRaids: obj
            }
        });

        if (!res) return false;
        this._guildDoc = res;
        return true;
    }

    /**
     * Removes a raid object from the database. This should only be called once per raid.
     * @returns {Promise<boolean>} Whether this was successful.
     * @private
     */
    private async removeRaidFromDatabase(): Promise<boolean> {
        if (!this._raidVc) return false;
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
        if (!this._raidVc) return false;
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
        const sentMsgTo: string[] = [];
        for (const [, members] of this._pplWithEarlyLoc) {
            members.forEach(async person => {
                if (sentMsgTo.includes(person.id))
                    return;
                sentMsgTo.push(person.id);
                await person.send(msgOpt).catch();
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
            || !this._raidVc
            || !this._afkCheckInterval
            || !this._controlPanelInterval)
            return null;

        const raidObj: IRaidInfo = {
            dungeonCodeName: this._dungeon.codeName,
            memberInit: this._memberInit.id,
            channels: this._raidSection.channels.raids,
            afkCheckMessageId: this._afkCheckMsg.id,
            controlPanelMessageId: this._controlPanelMsg.id,
            raidMessage: this._raidMsg,
            status: this._raidStatus,
            vcId: this._raidVc.id,
            location: this._location,
            sectionIdentifier: this._raidSection.uniqueIdentifier,
            earlyLocationReactions: []
        };

        for (const [key, val] of this._pplWithEarlyLoc) {
            val.forEach(member => {
                raidObj.earlyLocationReactions.push({userId: member.id, reactCodeName: key});
            });
        }

        return raidObj;
    }

    /**
     * Parses a screenshot.
     * @param {string} url The url to the screenshot.
     * @return {Promise<IParseResponse>} An object containing the parse results.
     */
    public async parseScreenshot(url: string): Promise<IParseResponse> {
        const toReturn: IParseResponse = {inRaidButNotInVC: [], inVcButNotInRaid: [], isValid: false};
        // No raid VC = no parse.
        if (!this._raidVc) return toReturn;
        // Make sure the image exists.
        try {
            // Make a request to see if this URL points to the right place.
            const result = await OneLifeBot.AxiosClient.head(url);
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
            return toReturn;

        const parsedNames = data.names;
        if (parsedNames.length === 0) return toReturn;
        // Parse results means the picture must be valid.
        toReturn.isValid = true;
        // Begin parsing.
        // Get people in raid VC but not in the raid itself. Could be alts.
        this._raidVc.members.forEach(member => {
            const igns = UserManager.getAllNames(member.displayName)
                .map(x => x.toLowerCase());
            const idx = parsedNames.findIndex(name => igns.includes(name.toLowerCase()));
            if (idx === -1) return;
            toReturn.inVcButNotInRaid.push(member);
        });

        // Get people in raid but not in the VC. Could be crashers.
        const allIgnsInVc = this._raidVc.members.map(x => UserManager.getAllNames(x.displayName.toLowerCase())).flat();
        parsedNames.forEach(name => {
            if (allIgnsInVc.includes(name.toLowerCase())) return;
            toReturn.inRaidButNotInVC.push(name);
        });

        return toReturn;
    }


    /**
     * Cleans the raid up. This will remove the raid voice channel, delete the control panel message, and remove
     * the raid from the database.
     */
    public async cleanUpRaid(): Promise<void> {
        // Step 0: Remove the raid object. We don't need it anymore.
        // Also stop all collectors.
        await this.removeRaidFromDatabase();
        await this.stopAllIntervalsAndCollectors();

        // Step 1: Remove the control panel message.
        await this._controlPanelMsg?.delete().catch();

        // Step 2: Unpin the AFK check message.
        await this._afkCheckMsg?.unpin().catch();

        // Step 3: Move people out of raid VC and delete.
        if (this._raidVc) {
            const vcParent = this._raidVc.parent;
            let vcToMovePeopleTo: VoiceChannel | null = null;
            // See if we can find a queue/lounge VC in the same category as the raid VC.
            if (vcParent) {
                const queueVc = vcParent.children
                    .find(x => x.type === "GUILD_VOICE"
                        && (x.name.toLowerCase().includes("queue") || x.name.toLowerCase().includes("lounge")));
                vcToMovePeopleTo = queueVc
                    ? queueVc as VoiceChannel
                    : null;
            }
            // If we didn't find a VC, assign the AFK VC.
            vcToMovePeopleTo ??= this._guild.afkChannel;
            // Now see if the VC exists.
            if (vcToMovePeopleTo) {
                const promises = this._raidVc.members.map(async (x) => {
                    await x.voice.setChannel(vcToMovePeopleTo).catch();
                });
                await Promise.all(promises).catch();
            }
            // Enter an infinite loop where we constantly check the VC to ensure that everyone is out
            // Before we delete the voice channel.
            while (true) {
                if (this._raidVc.members.size !== 0) continue;
                await this._raidVc.delete().catch();
                break;
            }
        }

        // Step 4: Remove from ActiveRaids collection
        RaidInstance.ActiveRaids.delete(this._afkCheckMsg!.id);
    }

    /**
     * Checks whether a person can manage raids in the specified section. The section must have a control panel and
     * AFK check channel defined, the person must have at least one leader role, and the channels must be under a
     * category.
     * @param {ISectionInfo} section The section in question.
     * @param {GuildMember} member The member in question.
     * @param {IGuildInfo} guildInfo The guild document.
     * @return {boolean} Whether the person can manage raids in the specified section.
     * @static
     */
    public static canManageRaidsIn(section: ISectionInfo, member: GuildMember, guildInfo: IGuildInfo): boolean {
        const guild = member.guild;

        // Verified role doesn't exist.
        if (!GuildFgrUtilities.hasCachedRole(guild, section.roles.verifiedRoleId))
            return false;

        // Control panel does not exist.
        if (!GuildFgrUtilities.hasCachedChannel(guild, section.channels.raids.controlPanelChannelId))
            return false;

        // AFK check does not exist.
        if (!GuildFgrUtilities.hasCachedChannel(guild, section.channels.raids.afkCheckChannelId))
            return false;

        const cpCategory = GuildFgrUtilities.getCachedChannel<TextChannel>(
            guild,
            section.channels.raids.controlPanelChannelId
        )!;
        const acCategory = GuildFgrUtilities.getCachedChannel<TextChannel>(
            guild,
            section.channels.raids.afkCheckChannelId
        )!;

        // AFK check and/or control panel do not have categories.
        if (!cpCategory.parent || !acCategory.parent)
            return false;

        // Categories are not the same.
        if (cpCategory.parent.id !== acCategory.parent.id)
            return false;

        return [
            section.roles.leaders.sectionLeaderRoleId,
            section.roles.leaders.sectionAlmostLeaderRoleId,
            guildInfo.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId,
            guildInfo.roles.staffRoles.universalLeaderRoleIds.leaderRoleId,
            guildInfo.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId
        ].some(x => GuildFgrUtilities.hasCachedRole(guild, x));
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
                id: this._raidSection.roles.verifiedRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.MEMBER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.MEMBER_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.moderation.securityRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.SECURITY_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.SECURITY_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.moderation.officerRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.OFFICER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.OFFICER_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.moderation.moderatorRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.MODERATOR_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.MODERATOR_ROLE)?.value.deny
            },
            // Universal leader roles start here.
            {
                id: this._guildDoc.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.ALMOST_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.ALMOST_LEADER_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.universalLeaderRoleIds.leaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.LEADER_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.HEAD_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.HEAD_LEADER_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.universalLeaderRoleIds.vetLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.VETERAN_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.VETERAN_LEADER_ROLE)?.value.deny
            },
            // Section leader roles start here
            {
                id: this._raidSection.roles.leaders.sectionAlmostLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.ALMOST_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.ALMOST_LEADER_ROLE)?.value.deny
            },
            {
                id: this._raidSection.roles.leaders.sectionLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.LEADER_ROLE)?.value.deny
            },
            {
                id: this._raidSection.roles.leaders.sectionVetLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.VETERAN_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.VETERAN_LEADER_ROLE)?.value.deny
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
        if (!this._raidVc)
            return false;
        const descSb = new StringBuilder()
            .append(`Please type the **new location** for the raid with VC: ${this._raidVc.name}. `)
            .append("The location will be sent to every person that has reacted with an early location reaction. ")
            .append(`To cancel this process, simply react to the ${Emojis.X_EMOJI} emoji.`)
            .appendLine()
            .appendLine()
            .append("You have one minute to perform this action. After one minute has passed, this process will ")
            .append("automatically be canceled.");
        const askLocEmbed: MessageEmbed = MessageUtilities.generateBlankEmbed(this._memberInit, "GREEN")
            .setTitle(`Setting New Location: ${this._raidVc.name}`)
            .setDescription(descSb.toString())
            .setFooter(`${this._guild.name} - AFK Check`)
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
                    new MessageButton()
                        .setLabel("Cancel")
                        .setEmoji(Emojis.X_EMOJI)
                        .setLabel("-cancel")
                        .setStyle(MessageButtonStyles.DANGER)
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
        return true;
    }

    /**
     * A collector that should be used for the control panel.
     * @param {User} u The user.
     * @return {Promise<boolean>} Whether the collector is satisfied with the given variables.
     * @private
     */
    private async controlPanelCollectorFilter(u: User): Promise<boolean> {
        if (u.bot) return false;

        const member = await GuildFgrUtilities.fetchGuildMember(this._guild, u.id);
        if (!member || !this._raidVc)
            return false;

        const neededRoles: string[] = [
            // This section's leader roles
            this._raidSection.roles.leaders.sectionLeaderRoleId,
            this._raidSection.roles.leaders.sectionAlmostLeaderRoleId,
            this._raidSection.roles.leaders.sectionVetLeaderRoleId,

            // Universal leader roles
            this._guildDoc.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId,
            this._guildDoc.roles.staffRoles.universalLeaderRoleIds.leaderRoleId,
            this._guildDoc.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId,
            this._guildDoc.roles.staffRoles.universalLeaderRoleIds.vetLeaderRoleId
        ];

        const customPermData = this._guildDoc.properties.customCmdPermissions
            .find(x => x.key === StartAfkCheck.START_AFK_CMD_CODE);
        // If you can start an AFK check, you should be able to manipulate control panel.
        if (customPermData && !customPermData.value.useDefaultRolePerms)
            neededRoles.push(...customPermData.value.rolePermsNeeded);

        return member.voice.channel?.id === this._raidVc.id
            && (neededRoles.some(x => GuildFgrUtilities.hasCachedRole(member.guild, x))
                || member.permissions.has("ADMINISTRATOR"));
    }

    /**
     * Creates an AFK check embed. This is only for AFK check; this will not work for during a raid.
     * @return {MessageEmbed | null} The new AFK check embed if the raid VC is initialized. Null otherwise.
     * @private
     */
    public getAfkCheckEmbed(): MessageEmbed | null {
        if (!this._raidVc) return null;
        if (this._raidStatus === RaidStatus.NOTHING || this._raidStatus === RaidStatus.IN_RUN) return null;

        const descSb = new StringBuilder();
        if (this._raidStatus === RaidStatus.AFK_CHECK) {
            descSb.append(`⇨ To participate in this raid, join ${this._raidVc.toString()}.`)
                .appendLine()
                .append("⇨ There are **no** required reactions.");
        }
        else {
            descSb.append("⇨ Only priority reactions can join the raid VC at this time. You will be able to join the ")
                .append("raid VC once all players with priority reactions have been confirmed.");
        }

        const prioritySb = new StringBuilder();
        // Account for the general early location roles.
        if (this._earlyLocToRole.size > 0) {
            prioritySb.append("If you have one of the listed role(s), press the corresponding button.")
                .appendLine(2);
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
            prioritySb.append("⇨ Any __buttons__ containing gear or character preferences is a priority react. If ")
                .append("you are bringing one of the gear/character choices, press the corresponding button. *Be sure ")
                .append("to read through the raid guidelines to understand the **specifics** of these choices*.");
        }

        const raidStatus = this._raidStatus === RaidStatus.PRE_AFK_CHECK
            ? "Pre-AFK Check"
            : this._raidStatus === RaidStatus.AFK_CHECK
                ? "AFK Check"
                : "Raid";

        const afkCheckEmbed = new MessageEmbed()
            .setAuthor(`${this._leaderName} has started a ${this._dungeon.dungeonName} AFK check.`,
                this._memberInit.user.displayAvatarURL())
            .setDescription(descSb.toString())
            .setFooter(`${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName}: ${raidStatus}.`)
            .setTimestamp()
            .setColor(ArrayUtilities.getRandomElement(this._dungeon.dungeonColors))
            .setThumbnail(
                this._afkCheckMsg
                    ? this._afkCheckMsg.embeds[0].thumbnail!.url
                    : ArrayUtilities.getRandomElement(this._dungeon.bossLinks.concat(this._dungeon.portalEmojiId))
            );

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
        const afkCheckFields: string[] = [];
        for (const [codeName, peopleThatReacted] of this._pplWithEarlyLoc) {
            if (!this.stillNeedEssentialReact(codeName))
                continue;

            const mappedAfkCheckOption = this._allEssentialOptions.get(codeName);
            if (!mappedAfkCheckOption)
                continue;

            // Don't display early location stats.
            if (mappedAfkCheckOption.type === "EARLY_LOCATION")
                continue;

            const currentAmt = peopleThatReacted.length;
            const maximum = this._allEssentialOptions.get(codeName)!.earlyLocAmt;

            const emoji = GlobalFgrUtilities.getCachedEmoji(mappedAfkCheckOption.emojiId);
            const percentBar = StringUtil.getEmojiProgressBar(8, currentAmt / maximum);
            const peopleNeededStr = `${currentAmt} / ${maximum}`;
            afkCheckFields.push(`${emoji ?? mappedAfkCheckOption.name}: ${percentBar} (${peopleNeededStr})`);
        }

        const brokenUpFields = ArrayUtilities.arrayToStringFields(afkCheckFields, (_, elem) => elem);
        for (const field of brokenUpFields) {
            afkCheckEmbed.addField(GeneralConstants.ZERO_WIDTH_SPACE, field);
        }

        if (this._raidSection.otherMajorConfig.afkCheckProperties.customMsg.additionalAfkCheckInfo) {
            afkCheckEmbed.addField(
                "Section Raid Info",
                this._raidSection.otherMajorConfig.afkCheckProperties.customMsg.additionalAfkCheckInfo
            );
        }

        if (this._raidMsg)
            afkCheckEmbed.addField("Message From Your Leader", this._raidMsg);

        return afkCheckEmbed;
    }

    /**
     * Creates a control panel embed.
     * @returns {MessageEmbed | null} The message embed if the raid VC is initialized. Null otherwise.
     * @private
     */
    public getControlPanelEmbed(): MessageEmbed | null {
        if (!this._raidVc) return null;
        if (this._raidStatus === RaidStatus.NOTHING) return null;

        // First thing's first, both AFK Check + In Raid control panels will display reactions.
        const cpFields: string[] = [];
        for (const [codeName, peopleThatReacted] of this._pplWithEarlyLoc) {
            const mappedAfkCheckOption = this._allEssentialOptions.get(codeName);
            if (!mappedAfkCheckOption)
                continue;

            const emoji = GlobalFgrUtilities.getCachedEmoji(mappedAfkCheckOption.emojiId);
            const currentAmt = peopleThatReacted.length;
            const maximum = this._allEssentialOptions.get(codeName)!.earlyLocAmt;

            const sb = new StringBuilder()
                .append(`⇨ ${emoji ?? mappedAfkCheckOption.name}: ${currentAmt} / ${maximum}`)
                .appendLine()
                .append(peopleThatReacted.slice(0, 15).join(", "));
            if (peopleThatReacted.length > 15)
                sb.append(` and ${peopleThatReacted.length - 15} more.`);

            cpFields.push(sb.appendLine(2).toString());
        }

        const fields = ArrayUtilities.arrayToStringFields(cpFields, (_, elem) => elem);
        const descSb = new StringBuilder();
        const maxVc = `${this._raidVc.userLimit === 0 ? "Unlimited" : this._raidVc.userLimit}`;
        const raidStatus = this._raidStatus === RaidStatus.PRE_AFK_CHECK
            ? "Pre-AFK Check"
            : this._raidStatus === RaidStatus.AFK_CHECK
                ? "AFK Check"
                : "Raid";

        const generalStatus = new StringBuilder()
            .append(`⇨ AFK Check Started At: ${TimeUtilities.getTime(this._raidVc.createdTimestamp)} UTC`)
            .appendLine()
            .append(`⇨ VC Capacity: ${this._raidVc.members.size} / ${maxVc}`)
            .appendLine()
            .append(`⇨ Location: **\`${this._location}\`**`)
            .appendLine()
            .append(`⇨ Status: **\`${raidStatus}\`**`);

        const controlPanelEmbed = new MessageEmbed()
            .setAuthor(`${this._leaderName}'s Control Panel - ${this._raidVc.name}`,
                this._memberInit.user.displayAvatarURL())
            .setTitle(`**${this._dungeon.dungeonName}** Raid.`)
            .setFooter(`${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName} Control Panel.`)
            .setTimestamp()
            .setColor(ArrayUtilities.getRandomElement(this._dungeon.dungeonColors))
            .setThumbnail(this._controlPanelMsg
                ? this._controlPanelMsg.embeds[0].thumbnail!.url
                : ArrayUtilities.getRandomElement(this._dungeon.bossLinks.concat(this._dungeon.portalEmojiId)))
            .addField("General Status", generalStatus.toString());

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
                .append("starting a raid. Use this option if you don't have enough raiders or reactions.");
        }
        else if (this._raidStatus === RaidStatus.AFK_CHECK) {
            descSb
                .append("This instance is currently in **AFK CHECK** mode. Any raiders can join this VC.")
                .appendLine(2)
                .append(`To use __this__ control panel, you **must** be in the **\`${this._raidVc.name}\`** voice `)
                .append("channel.")
                .appendLine(2)
                .append(`⇨ **Press** the **\`End AFK Check\`** button if you want to end the AFK check and start the `)
                .append("raid.")
                .appendLine()
                .append(`⇨ **Press** the **\`Abort AFK Check\`** button if you want to end the AFK check __without__ `)
                .append("starting a raid. Use this option if you don't have enough raiders or reactions.")
                .appendLine()
                .append(`⇨ **Press** the **\`Change Location\`** button if you want to change this raid's location. `)
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
                .append(`⇨ **Press** the **\`End Raid \`** button if you want to end this raid. This will move `)
                .append("everyone out if applicable and delete the raid VC.")
                .appendLine()
                .append(`⇨ **Press** the **\`Change Location\`** button if you want to change this raid's location. `)
                .append("This will ask you for a new location and then forward that location to all early location ")
                .append("people.")
                .appendLine()
                .append(`⇨ **Press** the **\`Lock VC\`** button if you want to lock the raid voice channel. `)
                .appendLine()
                .append(`⇨ **Press** the **\`Unlock VC\`** button if you want to unlock the raid voice channel. `)
                .appendLine()
                .append(`⇨ **Press** to the **\`Parse VC/Who\`** button if you want to parse a /who screenshot for `)
                .append("this run. You will be asked to provide a /who screenshot; please provide a cropped ")
                .append("screenshot so only the /who results are shown.");
        }

        controlPanelEmbed
            .setDescription(descSb.toString());

        for (const field of fields)
            controlPanelEmbed.addField(GeneralConstants.ZERO_WIDTH_SPACE, field);

        return controlPanelEmbed;
    }

    /**
     * Stops all intervals and collectors that is being used and set the intervals and collectors instance variables
     * to null.
     * @param {string} [reason] The reason.
     * @private
     */
    private stopAllIntervalsAndCollectors(reason?: string): void {
        if (this._intervalsAreRunning) {
            if (this._afkCheckInterval) {
                clearInterval(this._afkCheckInterval);
                this._afkCheckInterval = null;
            }

            if (this._controlPanelInterval) {
                clearInterval(this._controlPanelInterval);
                this._controlPanelInterval = null;
            }

            this._intervalsAreRunning = false;
        }

        this._controlPanelReactionCollector?.stop(reason);
        this._controlPanelReactionCollector = null;
        this._afkCheckButtonCollector?.stop(reason);
        this._afkCheckButtonCollector = null;
    }

    /**
     * Starts the intervals, which periodically updates the AFK check message and the control panel message.
     * @return {boolean} Whether the intervals started.
     * @private
     */
    private startIntervals(): boolean {
        if (!this._afkCheckMsg || !this._controlPanelMsg) return false;
        if (this._intervalsAreRunning || this._raidStatus === RaidStatus.NOTHING) return false;
        this._intervalsAreRunning = true;

        // If we're in AFK check mode, then start intervals for AFK check message + control panel message.
        if (this._raidStatus === RaidStatus.AFK_CHECK || this._raidStatus === RaidStatus.PRE_AFK_CHECK) {
            this._afkCheckInterval = setInterval(async () => {
                if (!this._afkCheckMsg) {
                    this.stopAllIntervalsAndCollectors();
                    return;
                }

                await this._afkCheckMsg.edit({
                    embeds: [this.getAfkCheckEmbed()!]
                }).catch();
            }, 4 * 1000);

            this._controlPanelInterval = setInterval(async () => {
                if (!this._controlPanelMsg) {
                    this.stopAllIntervalsAndCollectors();
                    return;
                }

                await this._controlPanelMsg.edit({
                    embeds: [this.getControlPanelEmbed()!]
                }).catch();
            }, 4 * 1000);

            return true;
        }

        // Otherwise, we're in raid mode and we only need to update the control panel message.
        this._controlPanelInterval = setInterval(async () => {
            if (!this._controlPanelMsg || !this._raidVc) {
                this.stopAllIntervalsAndCollectors();
                return;
            }

            await this._controlPanelMsg.edit({
                embeds: [this.getControlPanelEmbed()!]
            }).catch();
        }, 5 * 1000);

        return true;
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

        this._afkCheckButtonCollector = this._afkCheckMsg.createMessageComponentCollector({
            filter: i => !i.user.bot && this._allEssentialOptions.has(i.customId),
            time: this._raidSection.otherMajorConfig.afkCheckProperties.afkCheckTimeout * 60 * 1000
        });

        // Remember that interactions are all going to be in _allEssentialOptions
        this._afkCheckButtonCollector.on("collect", async i => {
            await i.deferUpdate();
            const memberThatResponded = await GuildFgrUtilities.fetchGuildMember(this._guild, i.user.id);
            if (!memberThatResponded)
                return;

            // Does the VC even exist?
            if (!this._raidVc || this._raidVc.deleted) {
                await this.cleanUpRaid();
                return;
            }

            // Is the person in a VC?
            if (!memberThatResponded.voice.channel) {
                const notInVcEmbed = MessageUtilities.generateBlankEmbed(memberThatResponded, "RED")
                    .setTitle("Not In Raid VC")
                    .setDescription("In order to indicate your class/gear preference, you need to be in the raid "
                        + "VC.")
                    .setTimestamp();
                await i.reply({
                    embeds: [notInVcEmbed],
                    ephemeral: true
                }).catch();
                return;
            }

            const mapKey = i.customId;
            const reactInfo = this._allEssentialOptions.get(mapKey)!;
            const members = this._pplWithEarlyLoc.get(mapKey)!;
            // If the member already got this, then don't let them get this again.
            if (members.some(x => x.id === i.user.id))
                return;

            // Item display for future use
            const itemDisplay = new StringBuilder();
            if (GlobalFgrUtilities.hasCachedEmoji(reactInfo.emojiId))
                itemDisplay.append(GlobalFgrUtilities.getCachedEmoji(reactInfo.emojiId)!).append(" ");
            itemDisplay.append(`**\`${reactInfo.name}\`**`);

            // If we no longer need this anymore, then notify them
            if (!this.stillNeedEssentialReact(mapKey)) {
                const noLongerNeedEmbed = MessageUtilities.generateBlankEmbed(memberThatResponded.user, "RED")
                    .setTitle("No Longer Needed")
                    .setDescription(`We no longer need **\`${itemDisplay.toString()}\`**.`)
                    .addField("What This Means", "You will not be given early location. However, you "
                        + "are free to bring this along.")
                    .setFooter("No Longer Needed.");

                i.reply({
                    embeds: [noLongerNeedEmbed],
                    ephemeral: true
                }).catch();
            }

            // Ask the member if they're willing to actually bring it.
            const contentDisplay = new StringBuilder()
                .append(`You pressed the ${itemDisplay} button.`)
                .appendLine(2);

            if (reactInfo.type !== "EARLY_LOCATION") {
                contentDisplay.append(`Please confirm that you will bring ${itemDisplay} to the raid by pressing `)
                    .append("the **Yes** button. If you do not plan on bring said item, then please press **No** ")
                    .append("or don't respond.")
                    .appendLine(2);
            }

            contentDisplay
                .append("You have **15** seconds to choose. Failure to respond will result in an ")
                .append("automatic **no**.")
                .toString();
            const [, response] = await AdvancedCollector.askBoolFollowUp({
                interaction: i,
                time: 15 * 1000,
                contentToSend: {
                    content: contentDisplay.toString()
                },
                channel: i.channel as TextChannel
            });

            // Response of "no" or failure to respond implies no.
            if (!response) {
                await i.editReply({
                    content: "You failed to respond within 15 seconds.",
                    components: []
                });
                return;
            }

            // Make sure we can actually give early location. It might have changed.
            if (!this.stillNeedEssentialReact(mapKey)) {
                await i.editReply({
                    content: reactInfo.type === "EARLY_LOCATION"
                        ? "Although you reacted with this button, you are not able to receive early location"
                        + " because someone else beat you to the last slot."
                        : `Although you said you would bring ${itemDisplay}, we do not need this anymore.`,
                    components: []
                });
                return;
            }

            // Add to database
            await this.addEarlyLocationReaction(memberThatResponded, mapKey, true);
            // If we no longer need this, then edit the button so no one else can click on it.
            if (!this.stillNeedEssentialReact(mapKey)) {
                const idxOfButton = this._afkCheckButtons.findIndex(x => x.customId === mapKey);
                this._afkCheckButtons[idxOfButton].setDisabled(true);
            }

            const confirmationContent = new StringBuilder()
                .append(`Thank you for confirming your choice of: ${itemDisplay}. `)
                .appendLine(2)
                .append(`The raid location is: **${this._location}**.`)
                .appendLine(2);

            if (reactInfo.type !== "EARLY_LOCATION"
                && this._raidSection.otherMajorConfig.afkCheckProperties.customMsg.earlyLocConfirmMsg) {
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
        });

        // If time expires, then end AFK check immediately.
        this._afkCheckButtonCollector.on("end", (reason: string) => {
            if (reason !== "time") return;
            this.endAfkCheck(null).then();
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

        if (oldState.channelId !== newState.channelId) {
            if (oldState.channelId && !newState.channelId) {
                // person left the VC
            }

            if (!oldState.channelId && newState.channelId) {
                // person joined the VC
            }

            // otherwise, changed VC
        }

        if (oldState.mute && !newState.mute) {
            // person no longer server/local muted
        }

        if (!oldState.mute && newState.mute) {
            // person server/local muted
        }

        if (oldState.deaf && !newState.deaf) {
            // person no longer server/local deaf
        }

        if (!oldState.deaf && newState.deaf) {
            // person server/local deaf
        }

        if (oldState.selfVideo && !newState.selfVideo) {
            // person video off
        }

        if (!oldState.selfVideo && newState.selfVideo) {
            // person video on
        }

        if (oldState.streaming && !newState.streaming) {
            // person stream off
        }

        if (!oldState.streaming && newState.streaming) {
            // person stream on
        }
    }

    /**
     * Event handler that deals with interactions.
     * @param {Interaction} interaction The interaction.
     * @private
     */
    private async interactionEventFunction(interaction: Interaction): Promise<void> {
        if (!interaction.isButton() || !this._afkCheckMsg)
            return;

        if (!this.membersThatJoinedVc.includes(interaction.user.id)) {
            await interaction.reply({
                ephemeral: true,
                content: "You didn't join this raid, so you can't be moved in at this time."
            });
        }

        if (interaction.customId !== `reconnect_${this._afkCheckMsg.id}`)
            return;

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

        await member.voice.setChannel(this._raidVc).catch();
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

        this._controlPanelReactionCollector = this._controlPanelMsg.createMessageComponentCollector({
            filter: i => this.controlPanelCollectorFilter(i.user)
            // Infinite time
        });

        if (this._raidStatus === RaidStatus.PRE_AFK_CHECK) {
            this._controlPanelReactionCollector.on("collect", async i => {
                await i.deferUpdate();
                if (i.customId === RaidInstance.START_AFK_CHECK_ID) {
                    this.startAfkCheck().then();
                    return;
                }

                if (i.customId === RaidInstance.ABORT_AFK_ID) {
                    this.endRaid(i.user).then();
                    return;
                }
            });
            return true;
        }

        if (this._raidStatus === RaidStatus.AFK_CHECK) {
            this._controlPanelReactionCollector.on("collect", async i => {
                await i.deferUpdate();
                if (i.customId === RaidInstance.START_RAID_ID) {
                    this.endAfkCheck(i.user).then();
                    return;
                }

                if (i.customId === RaidInstance.ABORT_AFK_ID) {
                    this.endRaid(i.user).then();
                    return;
                }

                if (i.customId === RaidInstance.SET_LOCATION_ID) {
                    this.getNewLocation(i.user).then();
                    return;
                }
            });

            return true;
        }

        this._controlPanelReactionCollector.on("collect", async i => {
            await i.deferUpdate();
            if (i.customId === RaidInstance.END_RAID_ID) {
                this.endRaid(i.user).then();
                return;
            }

            if (i.customId === RaidInstance.SET_LOCATION_ID) {
                this.getNewLocation(i.user).then();
                return;
            }

            if (i.customId === RaidInstance.LOCK_VC_ID) {
                await this._raidVc?.permissionOverwrites.edit(this._guild.roles.everyone.id, {
                    "CONNECT": false
                }).catch();
                await i.reply({
                    content: "Locked Raid VC.",
                    ephemeral: true
                }).catch();
                return;
            }

            if (i.customId === RaidInstance.UNLOCK_VC_ID) {
                await this._raidVc?.permissionOverwrites.edit(this._guild.roles.everyone.id, {
                    "CONNECT": null
                }).catch();
                await i.reply({
                    content: "Unlocked Raid VC.",
                    ephemeral: true
                }).catch();
                return;
            }

            if (i.customId === RaidInstance.PARSE_VC_ID) {
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
                const parseSummary = await this.parseScreenshot(res.url);

                const inVcNotInRaidFields = parseSummary.isValid
                    ?
                    ArrayUtilities.arrayToStringFields(
                        parseSummary.inRaidButNotInVC,
                        (_, elem) => `- ${elem}: \`/kick ${elem}\``
                    )
                    : [];
                const inRaidNotInVcFields = parseSummary.isValid
                    ? ArrayUtilities.arrayToStringFields(
                        parseSummary.inVcButNotInRaid,
                        (_, elem) => `- ${elem}`
                    )
                    : [];

                const embed = MessageUtilities.generateBlankEmbed(i.user, "RANDOM")
                    .setTitle(`Parse Results for: **${this._raidVc?.name ?? "N/A"}**`)
                    .setFooter("Completed Time:")
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
                            .toString()
                    );
                }
                else {
                    embed.setDescription(
                        "An error occurred when trying to parse this screenshot. Please try again later."
                    );
                }

                for (const field of inRaidNotInVcFields) {
                    embed.addField("In /who, Not In Raid VC.", field);
                }

                for (const field of inVcNotInRaidFields) {
                    embed.addField("In Raid VC, Not In /who.", field);
                }

                await this._controlPanelChannel.send({embeds: [embed]}).catch();
                return;
            }
        });

        return true;
    }
}

enum RaidStatus {
    NOTHING,
    PRE_AFK_CHECK,
    AFK_CHECK,
    IN_RUN
}

interface IParseResponse {
    inVcButNotInRaid: GuildMember[];
    inRaidButNotInVC: string[];
    isValid: boolean;
}