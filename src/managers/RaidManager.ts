import {
    Collection,
    Emoji,
    Guild,
    GuildMember,
    InteractionCollector,
    Message,
    MessageActionRow,
    MessageButton,
    MessageComponentInteraction,
    MessageEmbed,
    MessageOptions,
    MessageReaction,
    OverwriteResolvable,
    ReactionCollector,
    Snowflake,
    TextChannel,
    User,
    VoiceChannel
} from "discord.js";
import {ISectionInfo} from "../definitions/db/ISectionInfo";
import {IDungeonInfo} from "../definitions/parts/IDungeonInfo";
import {AdvancedCollector} from "../utilities/collectors/AdvancedCollector";
import {StringBuilder} from "../utilities/StringBuilder";
import {MessageUtilities} from "../utilities/MessageUtilities";
import {IGuildInfo} from "../definitions/db/IGuildInfo";
import {MiscUtilities} from "../utilities/MiscUtilities";
import {Emojis} from "../constants/Emojis";
import {IAfkCheckOptionData} from "../definitions/parts/IAfkCheckOptionData";
import {MappedAfkCheckOptions} from "../constants/MappedAfkCheckOptions";
import {ArrayUtilities} from "../utilities/ArrayUtilities";
import {OneLifeBot} from "../OneLifeBot";
import {IRaidInfo} from "../definitions/db/IRaidInfo";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {DungeonData} from "../constants/DungeonData";
import {MongoManager} from "./MongoManager";
import {UserManager} from "./UserManager";
import {GeneralConstants} from "../constants/GeneralConstants";
import {RealmSharperWrapper} from "../private-api/RealmSharperWrapper";
import {StartAfkCheck} from "../commands/raid-leaders/StartAfkCheck";
import {ChannelTypes, MessageButtonStyles} from "discord.js/typings/enums";
import {GlobalFgrUtilities} from "../utilities/fetch-get-request/GlobalFgrUtilities";
import {StringUtil} from "../utilities/StringUtilities";
import {BypassFullVcOption} from "../definitions/parts/IAfkCheckProperties";

// TODO Get votes.

/**
 * This class represents a raid.
 */
export class RaidManager {
    private static readonly CP_AFK_BUTTONS: MessageActionRow[] = AdvancedCollector.getActionRowsFromComponents([
        new MessageButton()
            .setLabel("Start Raid")
            .setEmoji(Emojis.LONG_RIGHT_TRIANGLE_EMOJI)
            .setCustomId("start_raid")
            .setStyle(MessageButtonStyles.PRIMARY),
        new MessageButton()
            .setLabel("Abort AFK Check")
            .setEmoji(Emojis.WASTEBIN_EMOJI)
            .setCustomId("abort_afk")
            .setStyle(MessageButtonStyles.DANGER),
        new MessageButton()
            .setLabel("Set Location")
            .setEmoji(Emojis.MAP_EMOJI)
            .setCustomId("set_location")
            .setStyle(MessageButtonStyles.PRIMARY)
    ]);

    private static readonly CP_RAID_BUTTONS: MessageActionRow[] = AdvancedCollector.getActionRowsFromComponents([
        new MessageButton()
            .setLabel("End Raid")
            .setEmoji(Emojis.RED_SQUARE_EMOJI)
            .setCustomId("end_raid")
            .setStyle(MessageButtonStyles.DANGER),
        new MessageButton()
            .setLabel("Set Location")
            .setEmoji(Emojis.MAP_EMOJI)
            .setCustomId("set_location")
            .setStyle(MessageButtonStyles.PRIMARY),
        new MessageButton()
            .setLabel("Lock Raid VC")
            .setEmoji(Emojis.LOCK_EMOJI)
            .setCustomId("lock_vc")
            .setStyle(MessageButtonStyles.PRIMARY),
        new MessageButton()
            .setLabel("Unlock Raid VC")
            .setEmoji(Emojis.UNLOCK_EMOJI)
            .setCustomId("unlock_vc")
            .setStyle(MessageButtonStyles.PRIMARY),
        new MessageButton()
            .setLabel("Parse Raid VC")
            .setEmoji(Emojis.PRINTER_EMOJI)
            .setCustomId("parse_vc")
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

    // Nonessential reactions. These are reactions that don't give any perks. More can be added at any point.
    private readonly _nonEssentialReactions: Emoji[];

    // Buttons to display on the AFK check. These should only contain essential buttons.
    private readonly _afkCheckButtons: MessageButton[];
    // All essential options (options that give early location). Equivalent to _afkCheckButtons but as raw data
    // instead of buttons.
    private readonly _allEssentialOptions: Collection<string, IAfkCheckOptionData & {name: string;}>;
    // A collection that contains the IAfkCheckOptionData.mapKey as the key and the members with the corresponding
    // item as the value.
    private readonly _pplWithEarlyLoc: Collection<string, [GuildMember[], boolean]>;

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
    private _controlPanelReactionCollector: ReactionCollector | null;

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

    /**
     * Creates a new `RaidManager` object.
     * @param {GuildMember} memberInit The member that initiated this raid.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section where this raid is occurring. Note that the verified role must exist.
     * @param {IDungeonInfo} dungeon The dungeon that is being raided.
     * @param {string} location The location.
     * @param {string} [raidMsg] The raid message, if any.
     */
    private constructor(memberInit: GuildMember, guildDoc: IGuildInfo, section: ISectionInfo, dungeon: IDungeonInfo,
                        location: string, raidMsg?: string) {
        this._memberInit = memberInit;
        this._guild = memberInit.guild;
        this._dungeon = dungeon;
        this._location = location;
        this._raidMsg = raidMsg ?? "";
        this._raidStatus = RaidStatus.NOTHING;
        this._raidVc = null;
        this._afkCheckMsg = null;
        this._controlPanelMsg = null;
        this._afkCheckInterval = null;
        this._controlPanelInterval = null;
        this._guildDoc = guildDoc;
        this._raidSection = section;

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

        // VC Limit.
        const overrideSettings = section.otherMajorConfig.afkCheckProperties.dungeonSettingsOverride
            .find(x => x.dungeonCodeName === dungeon.codeName);
        this._vcLimit = overrideSettings
            ? overrideSettings.vcLimit
            : section.otherMajorConfig.afkCheckProperties.vcLimit;

        // Which essential reacts are we going to use.
        const keysToUse = overrideSettings?.keyData ?? dungeon.keyData;
        const optionsToUse = overrideSettings?.buttonInfo ?? dungeon.otherData;
        const includeEarlyLoc = overrideSettings?.includeEarlyLoc ?? dungeon.includeEarlyLoc ?? true;
        const allOptionsToUse = keysToUse;
        if (includeEarlyLoc) {
            allOptionsToUse.push({
                maxEarlyLocation: guildDoc.otherMajorConfig.afkCheckProperties.nitroEarlyLocationLimit,
                mapKey: "NITRO"
            });
        }
        allOptionsToUse.push(...optionsToUse);

        this._allEssentialOptions = new Collection<string, IAfkCheckOptionData & {name: string;}>();
        this._pplWithEarlyLoc = new Collection<string, [GuildMember[], boolean]>();

        // The buttons to display.
        this._afkCheckButtons = allOptionsToUse
            .filter(x => x.maxEarlyLocation > 0)
            .map(x => {
                this._pplWithEarlyLoc.set(x.mapKey as string, [[], true]);
                this._allEssentialOptions.set(x.mapKey as string, x);

                const button = new MessageButton()
                    .setLabel(MappedAfkCheckOptions[x.mapKey].name)
                    .setStyle(MessageButtonStyles.PRIMARY)
                    .setCustomId(x.mapKey as string);

                const emoji = GlobalFgrUtilities.getCachedEmoji(MappedAfkCheckOptions[x.mapKey].emojiId);
                if (emoji)
                    button.setEmoji(emoji.id ?? emoji.name!);

                return button;
            });

        // And any other irrelevant reactions.
        this._nonEssentialReactions = allOptionsToUse
            .filter(x => x.maxEarlyLocation === 0
                && GlobalFgrUtilities.hasCachedEmoji(MappedAfkCheckOptions[x.mapKey].emojiId))
            .map(x => GlobalFgrUtilities.getCachedEmoji(MappedAfkCheckOptions[x.mapKey].emojiId)!);
    }

    /**
     * Creates a new `RaidManager` object. Use this method to create a new instance instead of the constructor.
     * @param {GuildMember} memberInit The member that initiated this raid.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section where this raid is occurring. Note that the verified role must exist.
     * @param {IDungeonInfo} dungeon The dungeon that is being raided.
     * @param {string} location The location.
     * @param {string} [raidMsg] The raid message, if any.
     * @returns {RaidManager | null} The `RaidManager` object, or `null` if the AFK check channel or control panel
     * channel is invalid.
     */
    public static new(memberInit: GuildMember, guildDoc: IGuildInfo, section: ISectionInfo, dungeon: IDungeonInfo,
                      location: string, raidMsg?: string): RaidManager | null {
        // Could put these all in one if-statement but too long.
        if (!memberInit.guild)
            return null;
        if (!GuildFgrUtilities.hasCachedRole(memberInit.guild, section.roles.verifiedRoleId))
            return null;
        if (!GuildFgrUtilities.hasCachedChannel(memberInit.guild, section.channels.raids.afkCheckChannelId))
            return null;
        if (!GuildFgrUtilities.hasCachedChannel(memberInit.guild, section.channels.raids.controlPanelChannelId))
            return null;

        return new RaidManager(memberInit, guildDoc, section, dungeon, location, raidMsg);
    }

    /**
     * Creates a new instance of `RaidManager`. This method should be called when there is an active raid but no
     * corresponding `RaidManager` object (e.g. when the bot restarted).
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {IRaidInfo} raidInfo The raid information.
     * @returns {Promise<RaidManager | null>} The `RaidManager` instance. `null` if an error occurred.
     */
    public static async createNewLivingInstance(guildDoc: IGuildInfo,
                                                raidInfo: IRaidInfo): Promise<RaidManager | null> {
        const guild = await GlobalFgrUtilities.fetchGuild(guildDoc.guildId);
        if (!guild) return null;

        const memberInit = await GuildFgrUtilities.fetchGuildMember(guild, raidInfo.memberInit);
        if (!memberInit) return null;

        const section = guildDoc.guildSections.find(x => x.uniqueIdentifier === raidInfo.sectionIdentifier);
        if (!section) return null;

        const dungeon = DungeonData.find(x => x.codeName === raidInfo.dungeonCodeName);
        if (!dungeon) return null;

        const raidVc = GuildFgrUtilities.getCachedChannel<VoiceChannel>(guild, raidInfo.vcId);
        if (!raidVc) return null;

        const afkCheckChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            guild,
            raidInfo.channels.afkCheckChannelId
        );
        const controlPanelChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            guild,
            raidInfo.channels.controlPanelChannelId
        );
        if (!afkCheckChannel || !controlPanelChannel || !afkCheckChannel.isText() || !controlPanelChannel.isText())
            return null;

        const controlPanelMsg = await GuildFgrUtilities
            .fetchMessage(controlPanelChannel as TextChannel, raidInfo.controlPanelMessageId);
        const afkCheckMsg = await GuildFgrUtilities
            .fetchMessage(afkCheckChannel as TextChannel, raidInfo.afkCheckMessageId);
        if (!afkCheckMsg || !controlPanelMsg) return null;

        const rm = new RaidManager(memberInit, guildDoc, section, dungeon, raidInfo.location, raidInfo.raidMessage);
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

        if (rm._raidStatus === RaidStatus.AFK_CHECK) {
            rm.startIntervalsForAfkCheck(5 * 1000);
            rm.startControlPanelAfkCheckModeCollector();
            rm.startAfkCheckCollectorDuringAfk();
        }
        else if (rm._raidStatus === RaidStatus.IN_RUN) {
            rm.startIntervalsForRaid(5 * 1000);
            rm.startControlPanelRaidCollector();
            rm.startAfkCheckCollectorDuringRaid();
        }
        return rm;
    }

    /**
     * Starts an AFK check for this raid instance.
     * @throws {ReferenceError} If the verified role for the section does not exist.
     */
    public async startAfkCheck(): Promise<void> {
        const verifiedRole = await GuildFgrUtilities.fetchRole(this._guild, this._raidSection.roles.verifiedRoleId);
        if (!verifiedRole)
            throw new ReferenceError("Verified role not defined.");

        // We are officially in AFK check mode.
        this._raidStatus = RaidStatus.AFK_CHECK;
        // Raid VC MUST be initialized first before we can use a majority of the helper methods.
        const vc = await this._guild.channels.create(`🔒 ${this._leaderName}'s Raid`, {
            type: ChannelTypes.GUILD_VOICE,
            userLimit: this._vcLimit,
            permissionOverwrites: this.getPermissionsForRaidVc(true),
            parent: this._afkCheckChannel!.parent!
        });

        if (!vc) return;
        this._raidVc = vc as VoiceChannel;

        // Create our initial control panel message.
        this._controlPanelMsg = await this._controlPanelChannel.send({
            embeds: [this.getControlPanelEmbed()!],
            components: RaidManager.CP_AFK_BUTTONS
        });

        // Create our initial AFK check message.
        const descSb = new StringBuilder()
            .append(`⌛ **Prepare** to join the **\`${this._leaderName}'s Raid\`** voice channel. The channel will be `)
            .append("unlocked in 5 seconds.");
        const initialAfkCheckEmbed = new MessageEmbed()
            .setAuthor(`${this._leaderName} has started a ${this._dungeon.dungeonName} AFK check.`,
                this._memberInit.user.displayAvatarURL())
            .setThumbnail(this._dungeon.portalLink)
            .setImage(ArrayUtilities.getRandomElement(this._dungeon.bossLinks))
            .setDescription(descSb.toString())
            .setFooter("AFK Check Started.")
            .setTimestamp();
        if (this._raidMsg)
            initialAfkCheckEmbed.addField("Message From Your Leader", this._raidMsg);
        this._afkCheckMsg = await this._afkCheckChannel.send({
            content: "@here An AFK Check is starting soon.",
            embeds: [initialAfkCheckEmbed]
        });

        // Add this raid to the database so we can refer to it in the future.
        await this.addRaidToDatabase();
        // Start our intervals so we can continuously update the embeds.
        this.startIntervalsForAfkCheck(5 * 1000);
        // Wait 5 seconds so people can prepare.
        await MiscUtilities.stopFor(5 * 1000);
        // Update the message and react to the AFK check message. Note that the only reason why we are doing this is
        // because we need to update the message content. Maybe I'll remove this in the future...
        await this._afkCheckMsg.edit({
            content: "@here An AFK Check is currently running",
            embeds: [this.getAfkCheckEmbed()!],
            components: AdvancedCollector.getActionRowsFromComponents(this._afkCheckButtons)
        }).catch();
        // Begin the AFK check collector.
        this.startAfkCheckCollectorDuringAfk();
        this.startControlPanelAfkCheckModeCollector();
    }

    /**
     * Ends the AFK check. There will be no post-AFK check.
     * @param {GuildMember} memberEnded The member that ended the AFK check.
     */
    public async endAfkCheck(memberEnded: GuildMember): Promise<void> {
        // No raid VC means we haven't started AFK check.
        if (!this._raidVc || !this._afkCheckMsg || !this._controlPanelMsg || this._raidStatus !== RaidStatus.AFK_CHECK)
            return;

        // Add all members that were in the VC at the time.
        this._membersThatJoined.push(...Array.from(this._raidVc.members.values()).map(x => x.id));
        // End the collector since it's useless. We'll use it again though.
        this.stopAllIntervalsAndCollectors("AFK Check ended.");
        // Remove otherButtons.
        await this._controlPanelMsg.reactions.removeAll().catch();
        await this._afkCheckMsg.reactions.removeAll().catch();
        // Edit the control panel accordingly and re-react and start collector + intervals again.
        await this._controlPanelMsg.edit({
            embeds: [this.getControlPanelEmbed()!],
            components: RaidManager.CP_RAID_BUTTONS
        }).catch();
        this.startControlPanelRaidCollector();
        this.startIntervalsForRaid();
        // Update the database so it is clear that we are in raid mode.
        await this.setRaidStatus(RaidStatus.IN_RUN);

        const afkEndedEnded = new MessageEmbed()
            .setColor(ArrayUtilities.getRandomElement(this._dungeon.dungeonColors))
            .setAuthor(`${this._leaderName}'s ${this._dungeon.dungeonName} AFK check is now over.`,
                this._memberInit.user.displayAvatarURL())
            .setFooter(`${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName} AFK Check.`)
            .setTimestamp()
            .setDescription(`The AFK check has been ended by ${memberEnded} and the raid is currently in progress.`);

        if (this._raidMsg)
            afkEndedEnded.addField("Message From Your Leader", this._raidMsg);

        const rejoinRaidSb = new StringBuilder()
            .append("If you disconnected from this raid voice channel, you are able to reconnect by reacting to the ")
            .append(`${Emojis.INBOX_EMOJI} emoji.`)
            .appendLine()
            .appendLine()
            .append("If you did not make it into the raid voice channel before the AFK check is over, then reacting ")
            .append("to the emoji will not do anything.");
        afkEndedEnded.addField("Rejoin Raid", rejoinRaidSb.toString());

        // And edit the AFK check message + start the collector.
        await this._afkCheckMsg.edit({
            embeds: [afkEndedEnded],
            content: "The AFK check is now over."
        }).catch();
        await this._afkCheckMsg.react(Emojis.INBOX_EMOJI).catch();
        this.startAfkCheckCollectorDuringRaid();
    }

    /**
     * Ends the raid.
     * @param {GuildMember} memberEnded The member that ended the raid or aborted the AFK check.
     */
    public async endRaid(memberEnded: GuildMember): Promise<void> {
        // No raid VC means we haven't started AFK check.
        if (!this._raidVc || !this._afkCheckMsg || !this._controlPanelMsg)
            return;
        // Get the name.
        const name = UserManager.getAllNames(memberEnded.displayName);
        const leaderName = name.length === 0 ? memberEnded.displayName : name[0];
        // Stop the collector.
        // We don't care about the result of this function, just that it should run.
        this.cleanUpRaid().then();

        // If this method was called during the AFK check, simply abort the AFK check.
        if (this._raidStatus === RaidStatus.AFK_CHECK) {
            const abortAfkEmbed = new MessageEmbed()
                .setAuthor(`${leaderName} has aborted the ${this._dungeon.dungeonName} AFK check.`,
                    memberEnded.user.displayAvatarURL())
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
                memberEnded.user.displayAvatarURL())
            .setDescription("The raid is now over. Thank you all for attending.")
            .setFooter(`${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName} Run Ended.`)
            .setTimestamp()
            .setColor(ArrayUtilities.getRandomElement(this._dungeon.dungeonColors));
        await this._afkCheckMsg.edit({embeds: [endAfkEmbed]}).catch();
    }

    //#region DATABASE METHODS

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
        if (!prop || !prop[1] || prop[0].includes(member))
            return false;
        prop[0].push(member);
        prop[1] = prop[0].length < reactInfo.maxEarlyLocation;

        if (!addToDb || !this._raidVc)
            return true;

        await MongoManager.getGuildCollection().updateOne({
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
        return true;
    }

    /**
     * Updates the location to the specified location.
     * @param {string} newLoc The specified location.
     * @private
     */
    private async updateLocation(newLoc: string): Promise<void> {
        this._location = newLoc;
        if (!this._raidVc)
            return;
        // Update the location in the database.
        await MongoManager.getGuildCollection().findOneAndUpdate({
            guildId: this._guild.id,
            "activeRaids.vcId": this._raidVc.id
        }, {
            $set: {
                "activeRaids.$.location": newLoc
            }
        });
    }

    /**
     * Adds a raid object to the database. This should only be called once the AFK check has started.
     * @private
     */
    private async addRaidToDatabase(): Promise<void> {
        const obj = this.getRaidInfoObject();
        if (!obj) return;
        const res = await MongoManager
            .getGuildCollection()
            .findOneAndUpdate({guildId: this._guild.id}, {
                $push: {
                    activeRaids: obj
                }
            }, {returnDocument: "after"});

        this._guildDoc = res.value!;
    }

    /**
     * Removes a raid object from the database. This should only be called once per raid.
     * @private
     */
    private async removeRaidFromDatabase(): Promise<void> {
        if (!this._raidVc) return;
        await MongoManager
            .getGuildCollection()
            .updateOne({guildId: this._guild.id}, {
                $pull: {
                    activeRaids: {
                        vcId: this._raidVc.id
                    }
                }
            });
    }

    /**
     * Sets the raid status to an ongoing raid. This should only be called once per raid.
     * @param {RaidStatus} status The status to set this raid to.
     * @private
     */
    private async setRaidStatus(status: RaidStatus): Promise<void> {
        if (!this._raidVc) return;
        this._raidStatus = status;
        // Update the location in the database.
        await MongoManager.getGuildCollection().findOneAndUpdate({
            guildId: this._guild.id,
            "activeRaids.vcId": this._raidVc.id
        }, {
            $set: {
                "activeRaids.$.status": status
            }
        });
    }

    //#endregion

    //#region UTILITY

    /**
     * Sends a message to all early location people.
     * @param {MessageOptions} msgOpt The message content to send.
     * @private
     */
    private sendMsgToEarlyLocationPeople(msgOpt: MessageOptions): void {
        const sentMsgTo: string[] = [];
        this._pplWithEarlyLoc.map(x => x[0]).flatMap(x => x).forEach(async person => {
            if (sentMsgTo.includes(person.id))
                return;
            sentMsgTo.push(person.id);
            await person.send(msgOpt).catch();
        });
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
            earlyLocationReactions: [],
            controlPanelIntervalId: this._controlPanelInterval,
            afkCheckIntervalId: this._afkCheckInterval
        };

        for (const [key, val] of this._pplWithEarlyLoc) {
            val[0].forEach(member => {
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
        const data = await RealmSharperWrapper.parseWhoScreenshot(url);
        const parsedNames = data.whoResult;
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
            section.roles.leaders.sectionRaidLeaderRoleId,
            section.roles.leaders.sectionAlmostRaidLeaderRoleId,
            section.roles.leaders.sectionHeadLeaderRoleId,
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
                id: this._raidSection.roles.leaders.sectionAlmostRaidLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.ALMOST_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.ALMOST_LEADER_ROLE)?.value.deny
            },
            {
                id: this._raidSection.roles.leaders.sectionRaidLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.LEADER_ROLE)?.value.deny
            },
            {
                id: this._raidSection.roles.leaders.sectionHeadLeaderRoleId as Snowflake,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.HEAD_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.HEAD_LEADER_ROLE)?.value.deny
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
        permsToEvaluate.filter(x => !Number.isNaN(x))
            .filter(x => x.value.allow.length !== 0 || x.value.deny.length !== 0)
            .forEach(perm => permsToReturn.push({
                id: perm.key as Snowflake,
                allow: perm.value.allow,
                deny: perm.value.deny
            }));

        return permsToReturn;
    }

    //#endregion

    //#region INTERACTIVE METHODS

    /**
     * Asks the user for a new location.
     * @param {Message} msg The message object.
     * @returns {Promise<boolean>} True if the bot was able to ask for a new location (regardless of the response).
     */
    public async getNewLocation(msg: Message): Promise<boolean> {
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
            targetAuthor: msg.author,
            targetChannel: msg.channel as TextChannel,
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
        }, AdvancedCollector.getStringPrompt(msg.channel as TextChannel, {
            min: 1,
            max: 500
        }));

        // No response or emoji = canceled.
        // Return true since the process still completed.
        if (!res || res instanceof MessageComponentInteraction)
            return true;
        // Otherwise, update location.
        await this.updateLocation(res);
        return true;
    }

    /**
     * A collector that should be used for the control panel.
     * @param {MessageReaction} _ The message reaction. Not used but required.
     * @param {User} u The user.
     * @return {Promise<boolean>} Whether the collector is satisfied with the given variables.
     * @private
     */
    private async controlPanelCollectorFilter(_: MessageReaction, u: User): Promise<boolean> {
        if (u.bot) return false;

        const member = await GuildFgrUtilities.fetchGuildMember(this._guild, u.id);
        if (!member || !this._raidVc)
            return false;

        const neededRoles: string[] = [
            // This section's leader roles
            this._raidSection.roles.leaders.sectionHeadLeaderRoleId,
            this._raidSection.roles.leaders.sectionRaidLeaderRoleId,
            this._raidSection.roles.leaders.sectionAlmostRaidLeaderRoleId,
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

    //#endregion

    //#region EMBEDS

    /**
     * Creates an AFK check embed.
     * @return {MessageEmbed | null} The new AFK check embed if the raid VC is initialized. Null otherwise.
     * @private
     */
    public getAfkCheckEmbed(): MessageEmbed | null {
        if (!this._raidVc) return null;
        if (this._raidStatus === RaidStatus.NOTHING) return null;

        const descSb = new StringBuilder()
            .append(`⇨ To participate in this raid, join the **\`${this._leaderName}'s Raid\`** voice channel.`)
            .appendLine()
            .append("⇨ There are **no** required reactions.");

        const optSb = new StringBuilder();
        // Account for the general early location roles.
        if (this._pplWithEarlyLoc.size > 0) {
            const earlyLocRoles = this._guildDoc.roles.earlyLocationRoles
                .filter(x => GuildFgrUtilities.hasCachedRole(this._guild, x))
                .map(x => GuildFgrUtilities.getCachedRole(this._guild, x)!);
            const nitroRole = this._guild.roles.premiumSubscriberRole;
            if (nitroRole)
                earlyLocRoles.unshift(nitroRole);

            optSb.append(`⇨ If you have __one__ of the following roles, click the **\`Early Location\`** button.`)
                .appendLine()
                .append(`Valid Early Location Roles: ${earlyLocRoles.join(", ")}`)
                .appendLine()
                .appendLine();
        }

        optSb.append("⇨ To indicate your gear and/or class preference, please click on the corresponding buttons.");

        const afkCheckEmbed = new MessageEmbed()
            .setAuthor(`${this._leaderName} has started a ${this._dungeon.dungeonName} AFK check.`,
                this._memberInit.user.displayAvatarURL())
            .setDescription(descSb.toString())
            .setFooter(`${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName} AFK Check.`)
            .setTimestamp()
            .setColor(ArrayUtilities.getRandomElement(this._dungeon.dungeonColors))
            .setThumbnail(
                this._afkCheckMsg
                    ? this._afkCheckMsg.embeds[0].thumbnail!.url
                    : ArrayUtilities.getRandomElement(this._dungeon.bossLinks.concat(this._dungeon.portalEmojiId))
            )
            .addField("Optional Reactions", optSb.toString());

        // Display percent of items needed.
        const afkCheckFields: string[] = [];
        for (const [codeName, [peopleThatReacted, isAcceptingMore]] of this._pplWithEarlyLoc) {
            if (!isAcceptingMore)
                continue;

            const mappedAfkCheckOption = MappedAfkCheckOptions[codeName];
            if (!mappedAfkCheckOption)
                continue;

            const currentAmt = peopleThatReacted.length;
            const maximum = this._allEssentialOptions.get(codeName)!.maxEarlyLocation;

            const emoji = GlobalFgrUtilities.getCachedEmoji(mappedAfkCheckOption.emojiId);
            const percentBar = StringUtil.getEmojiProgressBar(8, currentAmt / maximum);
            const peopleNeededStr = `${currentAmt} / ${maximum}`;
            afkCheckFields.push(`${emoji ?? mappedAfkCheckOption.name}: ${percentBar} (${peopleNeededStr})`);
        }

        const brokenUpFields = ArrayUtilities.arrayToStringFields(afkCheckFields, (_, elem) => elem);
        for (const field of brokenUpFields) {
            afkCheckEmbed.addField("", field);
        }

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
        for (const [codeName, [peopleThatReacted,]] of this._pplWithEarlyLoc) {
            const mappedAfkCheckOption = MappedAfkCheckOptions[codeName];
            if (!mappedAfkCheckOption)
                continue;

            const currentAmt = peopleThatReacted.length;
            const maximum = this._allEssentialOptions.get(codeName)!.maxEarlyLocation;

            const emoji = GlobalFgrUtilities.getCachedEmoji(mappedAfkCheckOption.emojiId);
            const percentBar = StringUtil.getEmojiProgressBar(8, currentAmt / maximum);
            const peopleNeededStr = `${currentAmt} / ${maximum}`;

            const sb = new StringBuilder()
                .append(`${emoji ?? mappedAfkCheckOption.name}: ${percentBar} (${peopleNeededStr})`)
                .appendLine()
                .append(`⇨ ${peopleThatReacted.slice(0, 30).join(", ")} `);
            if (peopleThatReacted.length > 30)
                sb.append(`and ${peopleThatReacted.length - 30} more.`);

            cpFields.push(sb.appendLine(2).toString());
        }

        const fields = ArrayUtilities.arrayToStringFields(cpFields, (_, elem) => elem);
        const descSb = new StringBuilder();
        const maxVc = `${this._raidVc.userLimit === 0 ? "Unlimited" : this._raidVc.userLimit}`;
        const generalStatus = new StringBuilder()
            .append(`⇨ AFK Check Started At: ${MiscUtilities.getTime(this._raidVc.createdTimestamp)} UTC`)
            .appendLine()
            .append(`⇨ VC Capacity: ${this._raidVc.members.size} / ${maxVc}`)
            .appendLine()
            .append(`⇨ Location: **\`${this._location}\`**`);

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

        if (this._raidStatus === RaidStatus.AFK_CHECK) {
            descSb
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
                .append(`To use __this__ control panel, you **must** be in the **\`${this._raidVc.name}\`** voice `)
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
            controlPanelEmbed.addField("", field);

        return controlPanelEmbed;
    }

    //#endregion

    //#region COLLECTORS

    public async startAfkCheckCollector(): boolean {
        if (!this._afkCheckMsg) return false;
        if (this._afkCheckButtonCollector) return false;

        if (this._raidStatus === RaidStatus.AFK_CHECK) {
            this._afkCheckButtonCollector = this._afkCheckMsg.createMessageComponentCollector({
                filter: i => !i.user.bot,
                time: this._raidSection.otherMajorConfig.afkCheckProperties.afkCheckTimeout * 60 * 1000
            });

            this._afkCheckButtonCollector.on("collect", async i => {
                const memberThatResponded = await GuildFgrUtilities.fetchGuildMember(this._guild, i.user.id);
                if (!memberThatResponded) return;

                // Is the person in a VC?
                if (!memberThatResponded.voice.channel) {
                    const notInVcEmbed = MessageUtilities.generateBlankEmbed(memberThatResponded, "RED")
                        .setTitle("Not In Raid VC")
                        .setDescription("In order to indicate your class/gear preference, you need to be in the raid VC.")
                        .setTimestamp();
                    await i.reply({
                        embeds: [notInVcEmbed],
                        ephemeral: true
                    }).catch();
                    return;
                }

                // Does the VC even exist?
                if (!this._raidVc || this._raidVc.deleted) {
                    await this.cleanUpRaid();
                    return;
                }

                const mapKey = i.customId;

                // Check if the person can be moved in.
                const buttonResponseType = MappedAfkCheckOptions[mapKey].type === "KEY"
                    ? BypassFullVcOption.KeysOnly as number
                    : BypassFullVcOption.KeysAndPriority as number;
                if (this._raidVc.members.size === 0 && memberThatResponded.voice.channelId !== this._raidVc.id) {
                    const noMoveInEmbed = MessageUtilities.generateBlankEmbed(memberThatResponded.user, "RED")
                        .setTitle("Cannot Move You In")
                        .setDescription("You cannot be moved in at this time.");
                    const bypassOptions = this._raidSection.otherMajorConfig.afkCheckProperties.bypassFullVcOption;
                    // flat out not allowed
                    if (bypassOptions === BypassFullVcOption.NotAllowed) {
                        noMoveInEmbed.addField(
                            "Reason",
                            "Server staff have disallowed any keys or priority reactions from joining a full VC."
                        );
                        i.reply({
                            embeds: [noMoveInEmbed],
                            ephemeral: true
                        }).catch();
                        return;
                    }

                    // keys only but the person has a priority react
                    if (bypassOptions === BypassFullVcOption.KeysOnly
                        && (buttonResponseType & (BypassFullVcOption.KeysOnly as number)) === 0) {
                        noMoveInEmbed.addField(
                            "Reason",
                            "Server staff have disallowed priority reactions from joining a full VC."
                        );
                        i.reply({
                            embeds: [noMoveInEmbed],
                            ephemeral: true
                        }).catch();
                        return;
                    }
                }

                const earlyLocData = this._pplWithEarlyLoc.get(mapKey);
                // Somehow, this doesn't exist in collection of early location reacts
                if (!earlyLocData) return;
                // We no longer need this anymore
                if (!earlyLocData[1]) {
                    const noLongerNeedEmbed = MessageUtilities.generateBlankEmbed(memberThatResponded.user, "RED")
                        .setTitle("No Longer Needed")
                        .setDescription(`We no longer need **\`${MappedAfkCheckOptions}\`**`);
                }
            });
        }

        return true;
    }

    //#endregion
}

enum RaidStatus {
    NOTHING,
    AFK_CHECK,
    IN_RUN
}

interface IParseResponse {
    inVcButNotInRaid: GuildMember[];
    inRaidButNotInVC: string[];
    isValid: boolean;
}