import {
    Collection,
    DMChannel, Emoji,
    EmojiResolvable,
    Guild,
    GuildMember,
    Message,
    MessageEmbed, MessageOptions, MessageReaction, OverwriteResolvable, ReactionCollector,
    TextChannel, User,
    VoiceChannel
} from "discord.js";
import {ISectionInfo} from "../definitions/major/ISectionInfo";
import {IDungeonInfo} from "../definitions/major/parts/IDungeonInfo";
import {AdvancedCollector} from "../utilities/collectors/AdvancedCollector";
import {StringBuilder} from "../utilities/StringBuilder";
import {MessageUtilities} from "../utilities/MessageUtilities";
import {IGuildInfo} from "../definitions/major/IGuildInfo";
import {MiscUtilities} from "../utilities/MiscUtilities";
import {Emojis} from "../constants/Emojis";
import {IReactionProps} from "../definitions/major/parts/IReactionProps";
import {MappedReactions} from "../constants/MappedReactions";
import {ArrayUtilities} from "../utilities/ArrayUtilities";
import {OneRealmBot} from "../OneRealmBot";
import {IRaidInfo} from "../definitions/major/IRaidInfo";
import {FetchRequestUtilities} from "../utilities/FetchRequestUtilities";
import {DungeonData} from "../constants/DungeonData";
import {MongoManager} from "./MongoManager";
import {UserManager} from "./UserManager";
import {StringUtil} from "../utilities/StringUtilities";
import {GeneralConstants} from "../constants/GeneralConstants";
import {RealmSharperWrapper} from "../private_api/RealmSharperWrapper";

// TODO Get votes.

/**
 * This class represents a raid.
 */
export class RaidManager {
    private static readonly ALL_CONTROL_PANEL_AFK_EMOJIS: EmojiResolvable[] = [
        Emojis.LONG_RIGHT_TRIANGLE_EMOJI,
        Emojis.WASTEBIN_EMOJI,
        Emojis.MAP_EMOJI
    ];

    private static readonly ALL_CONTROL_PANEL_RAID_EMOJIS: EmojiResolvable[] = [
        Emojis.RED_SQUARE_EMOJI,
        Emojis.MAP_EMOJI,
        Emojis.LOCK_EMOJI,
        Emojis.UNLOCK_EMOJI,
        Emojis.PRINTER_EMOJI
    ];

    private readonly _guild: Guild;
    private readonly _dungeon: IDungeonInfo;
    private readonly _afkCheckChannel: TextChannel;
    private readonly _controlPanelChannel: TextChannel;
    private readonly _raidSection: ISectionInfo;

    private readonly _allReactions: IReactionProps[];
    private readonly _earlyLocationReactions: Collection<string, [GuildMember[], boolean]>;

    private _guildDoc: IGuildInfo;
    private _location: string;
    private _raidStatus: RaidStatus;

    private _raidVc: VoiceChannel | null;
    private _afkCheckMsg: Message | null;
    private _controlPanelMsg: Message | null;
    private _afkCheckInterval: NodeJS.Timeout | null;
    private _controlPanelInterval: NodeJS.Timeout | null;
    private _intervalsAreRunning: boolean = false;

    private _afkCheckReactionCollector: ReactionCollector | null;
    private _controlPanelReactionCollector: ReactionCollector | null;

    private readonly _memberInit: GuildMember;
    private readonly _leaderName: string;
    private readonly _raidMsg: string;

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
    public constructor(memberInit: GuildMember, guildDoc: IGuildInfo, section: ISectionInfo, dungeon: IDungeonInfo,
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

        this._afkCheckReactionCollector = null;
        this._controlPanelReactionCollector = null;

        const brokenUpName = UserManager.getAllNames(memberInit.displayName);
        this._leaderName = brokenUpName.length > 0
            ? brokenUpName[0]
            : memberInit.displayName;

        this._afkCheckChannel = memberInit.guild.channels.cache
            .get(section.channels.raids.afkCheckChannelId)! as TextChannel;
        this._controlPanelChannel = memberInit.guild.channels.cache
            .get(section.channels.raids.controlPanelChannelId)! as TextChannel;

        // Reaction stuff.
        this._allReactions = (section.otherMajorConfig.afkCheckProperties.dungeonReactionOverride
            .find(x => x.dungeonCodeName === dungeon.codeName)?.reactions ?? dungeon.reactions)
            .filter(x => OneRealmBot.BotInstance.client.emojis.cache
                .has(MappedReactions[x.mappingEmojiName].emojiId));
        this._earlyLocationReactions = new Collection<string, [GuildMember[], boolean]>();
        // Initialize all keys.
        this._allReactions
            .concat({
                mappingEmojiName: "NITRO",
                maxEarlyLocation: guildDoc.otherMajorConfig.afkCheckProperties.nitroEarlyLocationLimit
            })
            .filter(x => x.maxEarlyLocation > 0)
            .forEach(r => this._earlyLocationReactions.set(r.mappingEmojiName as string, [[], true]));
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
        const guild = await FetchRequestUtilities.fetchGuild(guildDoc.guildId);
        if (!guild) return null;

        const memberInit = await FetchRequestUtilities.fetchGuildMember(guild, raidInfo.memberInit);
        if (!memberInit) return null;

        const section = guildDoc.guildSections.find(x => x.uniqueIdentifier === raidInfo.sectionIdentifier);
        if (!section) return null;

        const dungeon = DungeonData.find(x => x.codeName === raidInfo.dungeonCodeName);
        if (!dungeon) return null;

        const raidVc = guild.channels.cache.get(raidInfo.vcId) as VoiceChannel | undefined;
        if (!raidVc) return null;

        const afkCheckChannel = guild.channels.cache.get(raidInfo.channels.afkCheckChannelId);
        const controlPanelChannel = guild.channels.cache.get(raidInfo.channels.controlPanelChannelId);
        if (!afkCheckChannel || !controlPanelChannel || !afkCheckChannel.isText() || !controlPanelChannel.isText())
            return null;

        const controlPanelMsg = await FetchRequestUtilities
            .fetchMessage(controlPanelChannel as TextChannel, raidInfo.controlPanelMessageId);
        const afkCheckMsg = await FetchRequestUtilities
            .fetchMessage(afkCheckChannel as TextChannel, raidInfo.afkCheckMessageId);
        if (!afkCheckMsg || !controlPanelMsg) return null;

        const rm = new RaidManager(memberInit, guildDoc, section, dungeon, raidInfo.location, raidInfo.raidMessage);
        rm._raidVc = raidVc;
        rm._afkCheckMsg = afkCheckMsg;
        rm._controlPanelMsg = controlPanelMsg;
        rm._raidStatus = raidInfo.status;

        // Add early location entries.
        for await (const entry of raidInfo.earlyLocationReactions) {
            const member = await FetchRequestUtilities.fetchGuildMember(guild, entry.userId);
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
        const verifiedRole = await FetchRequestUtilities.fetchRole(this._guild, this._raidSection.roles.verifiedRoleId);
        if (!verifiedRole)
            throw new ReferenceError("Verified role not defined.");

        // We are officially in AFK check mode.
        this._raidStatus = RaidStatus.AFK_CHECK;
        // Raid VC MUST be initialized first before we can use a majority of the helper methods.
        this._raidVc = await this._guild.channels.create(`🔒 ${this._leaderName}'s Raid`, {
            type: "voice",
            userLimit: this._raidSection.otherMajorConfig.afkCheckProperties.vcLimit,
            permissionOverwrites: this.getPermissionsForRaidVc(true),
            parent: this._afkCheckChannel!.parent!
        });

        // Create our initial control panel message.
        this._controlPanelMsg = await this._controlPanelChannel.send({
            embed: this.createControlPanelEmbedForAfkCheck()!
        });
        AdvancedCollector.reactFaster(this._controlPanelMsg, RaidManager.ALL_CONTROL_PANEL_AFK_EMOJIS);

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
        this._afkCheckMsg = await this._afkCheckChannel.send("@here An AFK Check is starting soon.", {
            embed: initialAfkCheckEmbed
        });

        // Add this raid to the database so we can refer to it in the future.
        await this.addRaidToDatabase();
        // Start our intervals so we can continuously update the embeds.
        this.startIntervalsForAfkCheck(5 * 1000);
        // Wait 5 seconds so people can prepare.
        await MiscUtilities.stopFor(5 * 1000);
        // Update the message and react to the AFK check message. Note that the only reason why we are doing this is
        // because we need to update the message content. Maybe I'll remove this in the future...
        await this._afkCheckMsg.edit("@here An AFK Check is currently running", {
            embed: this.createAfkCheckEmbed()!
        }).catch();
        AdvancedCollector.reactFaster(this._afkCheckMsg, this._allReactions
            .map(x => MappedReactions[x.mappingEmojiName].emojiId));
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
        // Remove reactions.
        await this._controlPanelMsg.reactions.removeAll().catch();
        await this._afkCheckMsg.reactions.removeAll().catch();
        // Edit the control panel accordingly and re-react and start collector + intervals again.
        await this._controlPanelMsg.edit(this.createControlPanelEmbedForRaid()!).catch();
        this.startControlPanelRaidCollector();
        this.startIntervalsForRaid();
        AdvancedCollector.reactFaster(this._controlPanelMsg, RaidManager.ALL_CONTROL_PANEL_RAID_EMOJIS);
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
        await this._afkCheckMsg.edit("The AFK check is now over.", {embed: afkEndedEnded}).catch();
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
            await this._afkCheckMsg.edit(abortAfkEmbed).catch();
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
        await this._afkCheckMsg.edit(endAfkEmbed).catch();
    }

    //#region AFK CHECK COLLECTORS & INTERVAL METHODS

    /**
     * Starts the AFK check collector.
     * @return {boolean} Whether the collector was started.
     * @private
     */
    private startAfkCheckCollectorDuringAfk(): boolean {
        if (!this._afkCheckMsg)
            return false;

        if (this._afkCheckReactionCollector)
            return false;

        const afkCheckFilterFunction = (_: MessageReaction, u: User) => !u.bot;
        this._afkCheckReactionCollector = this._afkCheckMsg.createReactionCollector(afkCheckFilterFunction, {
            time: this._raidSection.otherMajorConfig.afkCheckProperties.afkCheckTimeout * 60 * 1000
        });

        this._afkCheckReactionCollector.on("collect", async (reaction: MessageReaction, user: User) => {
            const memberThatReacted = await FetchRequestUtilities.fetchGuildMember(this._guild, user);
            if (!memberThatReacted)
                return;

            // Check to ensure the person is in a voice channel.
            const notInVcEmbed = MessageUtilities.generateBlankEmbed(memberThatReacted, "RED")
                .setTitle("Not In Raid VC")
                .setDescription("In order to indicate your reaction preference, you need to be in the raid VC.")
                .setTimestamp();

            // Not in a VC = no go.
            if (!memberThatReacted.voice.channelID) {
                await memberThatReacted.send(notInVcEmbed).catch();
                return;
            }

            // If the VC doesn't exist, then stop the collector.
            if (!this._raidVc || this._raidVc.deleted) {
                this.stopAllIntervalsAndCollectors();
                return;
            }

            // If the person is in the wrong VC AND people won't be moved in if VC is full, then no go.
            if (memberThatReacted.voice.channelID !== this._raidVc.id
                && !this._raidSection.otherMajorConfig.afkCheckProperties.allowKeyReactsToBypassFullVc) {
                await memberThatReacted.send(notInVcEmbed).catch();
                return;
            }

            const emojiId = reaction.emoji.id;
            // AFK check emojis should all be custom.
            if (!emojiId) return;
            let correctMapping: string | null = null;
            // Get the correct code name.
            for (const mapping in MappedReactions) {
                if (MappedReactions[mapping].emojiId !== emojiId)
                    continue;
                correctMapping = mapping;
                break;
            }

            // Mapping wasn't found.
            if (!correctMapping)
                return;

            // If this isn't an early location reaction, ignore it.
            if (!this._earlyLocationReactions.has(correctMapping))
                return;

            // Remove the reaction if we have to.
            if (this._raidSection.otherMajorConfig.afkCheckProperties.removeKeyReactsDuringAfk)
                await reaction.users.remove(user).catch();

            const emoji = OneRealmBot.BotInstance.client.emojis.cache.get(MappedReactions[correctMapping].emojiId);
            const reactionData = this._earlyLocationReactions.get(correctMapping)!;

            // This reaction is not accepting anymore people.
            if (!reactionData[1])
                return;

            // This person already reacted to this emoji.
            if (reactionData[0].findIndex(x => x.id === memberThatReacted.id) !== -1)
                return;

            // Ask if this person wants to contribute whatever s/he reacted to.
            const askEmbedDesc = new StringBuilder()
                .append("You have reacted with the following emoji:")
                .appendLine()
                .append(`${emoji} ${MappedReactions[correctMapping].emojiName}`)
                .appendLine()
                .appendLine()
                .append("Review the raid details below and then **confirm** your selection by reacting to the ")
                .append(`${Emojis.GREEN_CHECK_EMOJI} emoji. If this was a mistake, please react to the `)
                .append(`${Emojis.X_EMOJI} or simply ignore this notice. This message will automatically disappear `)
                .append("in 15 seconds.")
                .toString();

            const raidDetails = new StringBuilder()
                .append(`⇒ **Guild:** ${this._guild.name}`)
                .appendLine()
                .append(`⇒ **Section:** ${this._raidSection.sectionName}`)
                .appendLine()
                .append(`⇒ **Raid Leader:** ${this._memberInit} (${this._memberInit.displayName}`)
                .appendLine()
                .append(`⇒ **VC Name:** ${this._raidVc.name}`)
                .appendLine()
                .append(`⇒ **Dungeon:** ${this._dungeon.dungeonName}`)
                .toString();

            const askEmbed = MessageUtilities.generateBlankEmbed(memberThatReacted, "RANDOM")
                .setTitle(`Confirm Reaction: ${MappedReactions[correctMapping].emojiName}`)
                .setDescription(askEmbedDesc)
                .addField("Raid Details", raidDetails)
                .setTimestamp()
                .setFooter(`${this._guild.name} AFK Check`);

            const confirmMsg = await FetchRequestUtilities.sendMsg(memberThatReacted, {
                embed: askEmbed
            });

            // Couldn't send the message.
            if (!confirmMsg)
                return;
            // Begin a collector.
            const resp = await new AdvancedCollector(confirmMsg.channel as DMChannel, memberThatReacted, 15, "S")
                .waitForSingleReaction(confirmMsg, {
                    reactToMsg: true,
                    reactions: [Emojis.GREEN_CHECK_EMOJI, Emojis.X_EMOJI]
                });

            // No response or rejected.
            if (!resp || resp.name === Emojis.X_EMOJI) {
                const noConfirmDesc = new StringBuilder()
                    .append("You reacted with the following emoji:")
                    .appendLine()
                    .append(`${emoji} ${MappedReactions[correctMapping].emojiName}`)
                    .appendLine()
                    .appendLine()
                    .append("You have selected: `No`. ");
                if (correctMapping === "NITRO")
                    noConfirmDesc.append("You do not need to do anything else.");
                else
                    noConfirmDesc.append("This means that you are not required to bring whatever you reacted to.");
                const noConfirmEmbed = MessageUtilities.generateBlankEmbed(memberThatReacted, "DARK_ORANGE")
                    .setTitle(`Denied Confirmation for Reaction: ${MappedReactions[correctMapping].emojiName}`)
                    .setDescription(noConfirmDesc.toString())
                    .addField("Raid Details", raidDetails)
                    .setTimestamp()
                    .setFooter(`${this._guild.name} AFK Check`);
                await confirmMsg.edit(noConfirmEmbed).catch();
                return;
            }

            // Accepted.
            // However, the emoji is no longer accepting. :(
            if (!reactionData[1]) {
                const noMoreSlotsDesc = new StringBuilder()
                    .append("You reacted with the following emoji:")
                    .appendLine()
                    .append(`${emoji} ${MappedReactions[correctMapping].emojiName}`)
                    .appendLine()
                    .appendLine()
                    .append("You have selected: `Yes`. However, we no longer need this! ");
                if (correctMapping === "NITRO")
                    noMoreSlotsDesc.append("At this time, you are not able to get early location.");
                else
                    noMoreSlotsDesc.append("This means that you are not required to bring whatever you reacted to.");

                const noMoreSlotsEmbed = MessageUtilities.generateBlankEmbed(memberThatReacted, "DARK_ORANGE")
                    .setTitle(`Accepted Confirmation for Reaction: ${MappedReactions[correctMapping].emojiName}`)
                    .setDescription(noMoreSlotsDesc.toString())
                    .addField("Raid Details", raidDetails)
                    .setTimestamp()
                    .setFooter(`${this._guild.name} AFK Check`);
                await confirmMsg.edit(noMoreSlotsEmbed).catch();
                return;
            }
            // Enough slots to accommodate another person.
            // Add to the database.
            await this.addEarlyLocationReaction(memberThatReacted, correctMapping, true);

            // Again, we check to make sure the emoji is still accepting. If the emoji is not accepting, remove it.
            if (!reactionData[1])
                await reaction.remove();

            const acceptedLocDesc = new StringBuilder()
                .append("You reacted with the following emoji:")
                .appendLine()
                .append(`${emoji} ${MappedReactions[correctMapping].emojiName}`)
                .appendLine()
                .appendLine()
                .append("You have selected: `Yes`. The location to this raid is shown below. ");
            if (correctMapping !== "NITRO")
                acceptedLocDesc.append("You must bring the class/gear choice that you indicated you would bring. ")
                    .append("Failure to do so may result in consequences. ");
            acceptedLocDesc.append("Also, do **not** share this location with anyone else. Doing so may result in ")
                .append("serious consequences.");

            const acceptedEmbed = MessageUtilities.generateBlankEmbed(memberThatReacted, "GREEN")
                .setTitle(`Accepted Confirmation for Reaction: ${MappedReactions[correctMapping].emojiName}`)
                .setDescription(acceptedLocDesc.toString())
                .addField("Raid Details", raidDetails)
                .addField("Location", StringUtil.codifyString(this._location))
                .setTimestamp()
                .setFooter(`${this._guild.name} AFK Check`);
            await confirmMsg.edit(acceptedEmbed).catch();
        });
        return true;
    }

    /**
     * Starts the control panel collector during an AFK check.
     * @return {boolean} Whether the collector was started.
     * @private
     */
    private startControlPanelAfkCheckModeCollector(): boolean {
        if (!this._controlPanelMsg)
            return false;

        if (this._controlPanelReactionCollector)
            return false;

        this._controlPanelReactionCollector = this._controlPanelMsg
            .createReactionCollector(this.controlPanelCollectorFilter, {
                time: this._raidSection.otherMajorConfig.afkCheckProperties.afkCheckTimeout * 60 * 1000
            });

        this._controlPanelReactionCollector.on("collect", async (reaction: MessageReaction, user: User) => {
            if (!this._controlPanelMsg) {
                this.stopAllIntervalsAndCollectors();
                return;
            }

            // Not a valid emoji = leave.
            if (!RaidManager.ALL_CONTROL_PANEL_AFK_EMOJIS.includes(reaction.emoji.name))
                return;

            const memberThatReacted = await FetchRequestUtilities.fetchGuildMember(this._guild, user);
            if (!memberThatReacted)
                return;

            // End afk check
            if (reaction.emoji.name === Emojis.LONG_RIGHT_TRIANGLE_EMOJI) {
                await this.endAfkCheck(memberThatReacted);
                return;
            }

            // Abort afk check.
            if (reaction.emoji.name === Emojis.WASTEBIN_EMOJI) {
                await this.endRaid(memberThatReacted);
                return;
            }

            // Set location.
            if (reaction.emoji.name === Emojis.MAP_EMOJI) {
                const res = await this.getNewLocation(this._controlPanelMsg);
                if (res) {
                    const sb = new StringBuilder()
                        .append(`Your raid leader, ${this._memberInit}, has set a new location for your `)
                        .append(`${this._dungeon.dungeonName} raid. The new location is:`)
                        .append(StringUtil.codifyString(this._location))
                        .appendLine()
                        .append("As the AFK check has not ended, please follow all directions your raid leader has ")
                        .append("for you. Failure to do so may result in consequences.");
                    const newLocationEmbed = MessageUtilities.generateBlankEmbed(this._memberInit, "RANDOM")
                        .setTitle("New Location Set")
                        .setDescription(sb.toString())
                        .setFooter(`AFK Check - Section: ${this._raidSection.sectionName}`)
                        .setTimestamp();
                    this.sendMsgToEarlyLocationPeople({embed: newLocationEmbed});
                }
                return;
            }
        });
        return true;
    }

    /**
     * Starts the intervals for the AFK check, which automatically edits the AFK check and control panel message at the
     * specified delay.
     * @return {boolean} Whether the intervals have been started.
     * @private
     */
    private startIntervalsForAfkCheck(delay: number = 4 * 1000): boolean {
        if (this._intervalsAreRunning || !this._raidVc)
            return false;

        this._intervalsAreRunning = true;
        this._afkCheckInterval = setInterval(async () => {
            if (!this._afkCheckMsg || !this._raidVc) {
                this.stopAllIntervalsAndCollectors();
                return;
            }

            await this._afkCheckMsg.edit(this.createAfkCheckEmbed()!).catch();
        }, delay);

        this._controlPanelInterval = setInterval(async () => {
            if (!this._controlPanelMsg || !this._raidVc) {
                this.stopAllIntervalsAndCollectors();
                return;
            }

            await this._controlPanelMsg.edit(this.createControlPanelEmbedForAfkCheck()!).catch();
        }, delay);

        return true;
    }

    //#endregion

    //#region RAID COLLECTORS & INTERVALS

    /**
     * Starts the intervals for a raid, which automatically edits the control panel message at the specified delay.
     * @return {boolean} Whether the intervals have been started.
     * @private
     */
    private startIntervalsForRaid(delay: number = 4 * 1000): boolean {
        if (this._intervalsAreRunning || !this._raidVc)
            return false;
        this._intervalsAreRunning = true;
        this._controlPanelInterval = setInterval(async () => {
            if (!this._controlPanelMsg || !this._raidVc) {
                this.stopAllIntervalsAndCollectors();
                return;
            }

            await this._controlPanelMsg.edit(this.createControlPanelEmbedForRaid()!).catch();
        }, delay);

        return true;
    }

    /**
     * Starts the control panel collector during a raid.
     * @return {boolean} Whether the collector was started.
     * @private
     */
    private startControlPanelRaidCollector(): boolean {
        if (!this._controlPanelMsg)
            return false;

        if (this._controlPanelReactionCollector)
            return false;

        this._controlPanelReactionCollector = this._controlPanelMsg
            .createReactionCollector(this.controlPanelCollectorFilter);

        this._controlPanelReactionCollector.on("collect", async (reaction: MessageReaction, user: User) => {
            if (!this._controlPanelMsg) {
                this.stopAllIntervalsAndCollectors();
                return;
            }

            // Not a valid emoji = leave.
            if (!RaidManager.ALL_CONTROL_PANEL_RAID_EMOJIS.includes(reaction.emoji.name))
                return;

            const memberThatReacted = await FetchRequestUtilities.fetchGuildMember(this._guild, user);
            if (!memberThatReacted)
                return;

            // End the run.
            if (reaction.emoji.name === Emojis.RED_SQUARE_EMOJI) {
                await this.endRaid(memberThatReacted);
                return;
            }

            // Ask for a location.
            if (reaction.emoji.name === Emojis.MAP_EMOJI) {
                const res = await this.getNewLocation(this._controlPanelMsg);
                if (res) {
                    const sb = new StringBuilder()
                        .append(`Your raid leader, ${this._memberInit}, has set a new location for your `)
                        .append(`${this._dungeon.dungeonName} raid. The new location is:`)
                        .append(StringUtil.codifyString(this._location))
                        .appendLine()
                        .append("Follow your raid leader's directions, if any. Do not share this location unless ")
                        .append("your leader permits it.");
                    const newLocationEmbed = MessageUtilities.generateBlankEmbed(this._memberInit, "RANDOM")
                        .setTitle("New Location Set")
                        .setDescription(sb.toString())
                        .setFooter(`AFK Check - Section: ${this._raidSection.sectionName}`)
                        .setTimestamp();
                    this.sendMsgToEarlyLocationPeople({embed: newLocationEmbed});
                }
                return;
            }

            // Locks VC
            if (reaction.emoji.name === Emojis.LOCK_EMOJI) {
                await this._raidVc!.updateOverwrite(this._guild.roles.everyone, {
                    CONNECT: false
                });
                return;
            }

            // Unlock VC.
            if (reaction.emoji.name === Emojis.UNLOCK_EMOJI) {
                await this._raidVc!.updateOverwrite(this._guild.roles.everyone, {
                    CONNECT: null
                });
                return;
            }

            // Parse screenshot.
            if (reaction.emoji.name === Emojis.PRINTER_EMOJI) {
                // TODO implement this.
                return;
            }
        });

        return true;
    }

    /**
     * Starts the AFK check collector for during a raid.
     * @return {boolean} Whether the collector was started.
     * @private
     */
    private startAfkCheckCollectorDuringRaid(): boolean {
        if (!this._afkCheckMsg)
            return false;

        if (this._afkCheckReactionCollector)
            return false;

        const afkCheckFilterFunction = (r: MessageReaction, u: User) => !u.bot
            && this._membersThatJoined.includes(u.id)
            && r.emoji.id === Emojis.INBOX_EMOJI;

        this._afkCheckReactionCollector = this._afkCheckMsg.createReactionCollector(afkCheckFilterFunction);
        this._afkCheckReactionCollector.on("collect", async (reaction: MessageReaction, user: User) => {
            const memberThatReacted = await FetchRequestUtilities.fetchGuildMember(this._guild, user);
            if (!memberThatReacted)
                return;
            if (!memberThatReacted.voice.channel) {
                const notInVcEmbed = MessageUtilities.generateBlankEmbed(memberThatReacted, "RED")
                    .setTitle("Not In VC")
                    .setDescription("In order to rejoin the raid VC, you need to be in a voice channel.")
                    .setTimestamp();
                await FetchRequestUtilities.sendMsg(memberThatReacted, {embed: notInVcEmbed});
                return;
            }
            await memberThatReacted.voice.setChannel(this._raidVc, "Joining back raid.").catch();
        });

        return true;
    }

    //#endregion

    //#region UNIVERSAL COLLECTORS

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
        }
        this._controlPanelReactionCollector?.stop(reason);
        this._controlPanelReactionCollector = null;
        this._afkCheckReactionCollector?.stop(reason);
        this._afkCheckReactionCollector = null;
    }

    //#endregion

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
        if (!this._earlyLocationReactions.has(reactionCodeName))
            return false;
        const reactInfo = this._allReactions.find(x => x.mappingEmojiName === reactionCodeName);
        if (!reactInfo)
            return false;

        const prop = this._earlyLocationReactions.get(reactionCodeName);
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
            }, {returnOriginal: false});

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
        this._earlyLocationReactions.map(x => x[0]).flatMap(x => x).forEach(async person => {
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

        for (const [key, val] of this._earlyLocationReactions) {
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
            const result = await OneRealmBot.AxiosClient.head(url);
            if (result.status < 300)
                return toReturn;
        } catch (e) {
            return toReturn;
        }

        // Make the request.
        const parsedNames = await RealmSharperWrapper.parseWhoScreenshot({url});
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
                    .find(x => x.type === "voice"
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
        if (!guild.roles.cache.has(section.roles.verifiedRoleId))
            return false;

        // Control panel does not exist.
        if (!guild.channels.cache.has(section.channels.raids.controlPanelChannelId))
            return false;

        // AFK check does not exist.
        if (!guild.channels.cache.has(section.channels.raids.afkCheckChannelId))
            return false;

        const cpCategory = guild.channels.cache.get(section.channels.raids.controlPanelChannelId)!;
        const acCategory = guild.channels.cache.get(section.channels.raids.afkCheckChannelId)!;

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
        ].some(x => member.roles.cache.has(x));
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
                id: this._raidSection.roles.verifiedRoleId,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.MEMBER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.MEMBER_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.moderation.securityRoleId,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.SECURITY_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.SECURITY_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.moderation.officerRoleId,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.OFFICER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.OFFICER_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.moderation.moderatorRoleId,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.MODERATOR_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.MODERATOR_ROLE)?.value.deny
            },
            // Universal leader roles start here.
            {
                id: this._guildDoc.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.UNIVERSAL_ALMOST_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.UNIVERSAL_ALMOST_LEADER_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.universalLeaderRoleIds.leaderRoleId,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.UNIVERSAL_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.UNIVERSAL_LEADER_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.UNIVERSAL_HEAD_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.UNIVERSAL_HEAD_LEADER_ROLE)?.value.deny
            },
            {
                id: this._guildDoc.roles.staffRoles.universalLeaderRoleIds.vetLeaderRoleId,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.UNIVERSAL_VETERAN_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.UNIVERSAL_VETERAN_LEADER_ROLE)?.value.deny
            },
            // Section leader roles start here
            {
                id: this._raidSection.roles.leaders.sectionAlmostRaidLeaderRoleId,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.SECTION_ALMOST_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.SECTION_ALMOST_LEADER_ROLE)?.value.deny
            },
            {
                id: this._raidSection.roles.leaders.sectionRaidLeaderRoleId,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.SECTION_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.SECTION_LEADER_ROLE)?.value.deny
            },
            {
                id: this._raidSection.roles.leaders.sectionHeadLeaderRoleId,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.SECTION_HEAD_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.SECTION_HEAD_LEADER_ROLE)?.value.deny
            },
            {
                id: this._raidSection.roles.leaders.sectionVetLeaderRoleId,
                allow: permsToEvaluate.find(x => x.key === GeneralConstants.SECTION_VETERAN_LEADER_ROLE)?.value.allow,
                deny: permsToEvaluate.find(x => x.key === GeneralConstants.SECTION_VETERAN_LEADER_ROLE)?.value.deny
            }
        ].filter(y => this._guild.roles.cache.has(y.id)
            && ((y.allow && y.allow.length !== 0) || (y.deny && y.deny.length !== 0)));
        // And then define any additional roles.
        permsToEvaluate.filter(x => !x.key.startsWith("PD-"))
            .filter(x => x.value.allow.length !== 0 || x.value.deny.length !== 0)
            .forEach(perm => permsToReturn.push({
                id: perm.key,
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
        const res = await new AdvancedCollector(msg.channel as TextChannel, this._memberInit, 1, "M")
            .startDoubleCollector<string>({
                embed: askLocEmbed
            }, AdvancedCollector.getStringPrompt(msg.channel, {
                min: 1,
                max: 500
            }), {
                reactions: [Emojis.X_EMOJI],
                deleteBaseMsgAfterComplete: true
            });

        // No response or emoji = canceled.
        // Return true since the process still completed.
        if (!res || res instanceof Emoji)
            return true;
        // Otherwise, update location.
        await this.updateLocation(res);
        return true;
    }

    /**
     * Asks the user to select a section.
     * @param {Message} msg The message object. Note that the bot must be able to send messages to the channel where
     * this message object was sent to.
     * @param {GuildMember} member The member to ask.
     * @param {IGuildInfo} guildDoc The guild document.
     * @return {Promise<ISectionInfo | null>} The section that was selected, or null if one wasn't selected.
     * @static
     */
    public static async selectSection(msg: Message, member: GuildMember,
                                      guildDoc: IGuildInfo): Promise<ISectionInfo | null> {
        const possibleSections = MiscUtilities.getAllSections(guildDoc)
            .filter(x => RaidManager.canManageRaidsIn(x, member, guildDoc));

        if (possibleSections.length === 0)
            return null;

        if (possibleSections.length === 1)
            return possibleSections[0];

        for (const section of possibleSections) {
            const afkCheckChannel = member.guild.channels.cache
                .get(section.channels.raids.afkCheckChannelId) as TextChannel;
            // If the person typed in a channel that is under a specific section, use that section.
            if ((msg.channel as TextChannel).parent?.id === afkCheckChannel.parent!.id)
                return section;
        }

        const askSectionEmbed = MessageUtilities.generateBlankEmbed(member.guild, "RANDOM")
            .setTitle("Select a Section")
            .setDescription("You are about to start an AFK check or headcount. However, you need to select a section" +
                " where you want to start this AFK check or headcount.\n\nPlease react to the number emoji" +
                " corresponding to the section that you want to start an AFK check in. If you want to cancel, simply" +
                " react with the X emoji.")
            .setFooter("Section Selector.");

        let idx = 0;
        const emojisToReactWith: EmojiResolvable[] = [];
        for (const section of possibleSections) {
            const afkCheckChannel = member.guild.channels.cache
                .get(section.channels.raids.afkCheckChannelId) as TextChannel;
            const controlPanelChannel = member.guild.channels.cache
                .get(section.channels.raids.controlPanelChannelId) as TextChannel;

            const sb = new StringBuilder()
                .append(`⇨ AFK Check Channel: ${afkCheckChannel}`)
                .appendLine()
                .append(`⇨ Control Panel Channel: ${controlPanelChannel}`);
            emojisToReactWith.push(Emojis.NUMERICAL_EMOJIS[idx]);
            askSectionEmbed.addField(`**\`[${++idx}]\`** ${section.sectionName}`, sb.toString());
        }

        emojisToReactWith.push(Emojis.X_EMOJI);

        const botMsg = await msg.channel.send(askSectionEmbed);
        const reactionToUse = await new AdvancedCollector(botMsg.channel as TextChannel | DMChannel, member, 5, "M")
            .waitForSingleReaction(botMsg, {
                reactions: emojisToReactWith,
                reactToMsg: true
            });
        await botMsg.delete().catch();

        if (reactionToUse === null)
            return null;

        const selectedIndex = emojisToReactWith.findIndex(x => x === reactionToUse.name);
        if (selectedIndex < possibleSections.length)
            return possibleSections[selectedIndex];

        // X was used.
        return null;
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

        const member = await FetchRequestUtilities.fetchGuildMember(this._guild, u);
        if (!member || !this._raidVc)
            return false;

        return member.voice.channelID === this._raidVc.id && ([
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
        ].some(x => member.roles.cache.has(x)) || member.hasPermission("ADMINISTRATOR"));
    }

    //#endregion

    //#region EMBED/MSG METHODS

    /**
     * Creates a control panel embed for a raid.
     * @returns {MessageEmbed | null} The message embed if the raid VC is initialized. Null otherwise.
     * @private
     */
    private createControlPanelEmbedForRaid(): MessageEmbed | null {
        if (!this._raidVc) return null;
        const descSb = new StringBuilder()
            .append(`To use __this__ control panel, you **must** be in the **\`${this._raidVc.name}\`** voice channel.`)
            .appendLine()
            .appendLine()
            .append(`⇨ **React** to the ${Emojis.RED_SQUARE_EMOJI} emoji if you want to end this raid. This will `)
            .append("move everyone out if applicable and delete the raid VC.")
            .appendLine()
            .append(`⇨ **React** to the ${Emojis.MAP_EMOJI} emoji if you want to change this raid's location. This `)
            .append("will ask you for a new location and then forward that location to all early location people.")
            .appendLine()
            .append(`⇨ **React** to the ${Emojis.LOCK_EMOJI} emoji if you want to lock the raid voice channel. `)
            .appendLine()
            .append(`⇨ **React** to the ${Emojis.UNLOCK_EMOJI} emoji if you want to unlock the raid voice channel. `)
            .appendLine()
            .append(`⇨ **React** to the ${Emojis.PRINTER_EMOJI} emoji if you want to parse a /who screenshot for `)
            .append("this run. You will be asked to provide a /who screenshot; please provide a cropped screenshot ")
            .append("so only the /who results are shown.");

        const maxVc = `${this._raidVc.userLimit === 0 ? "Unlimited" : this._raidVc.userLimit}`;
        const generalStatus = new StringBuilder()
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
            .setDescription(descSb.toString())
            .setThumbnail(this._controlPanelMsg
                ? this._controlPanelMsg.embeds[0].thumbnail!.url
                : ArrayUtilities.getRandomElement(this._dungeon.bossLinks.concat(this._dungeon.portalEmojiId)))
            .addField("General Status", generalStatus.toString());

        for (const [emojiCodeName, [peopleThatReacted,]] of this._earlyLocationReactions) {
            const mappedEmojiInfo = MappedReactions[emojiCodeName];
            const emoji = OneRealmBot.BotInstance.client.emojis.cache.get(mappedEmojiInfo.emojiId)!;
            const reactionInfo = this._allReactions.findIndex(x => x.mappingEmojiName === emojiCodeName);
            const amtTakenAmtMax = `${peopleThatReacted.length} / ${this._allReactions[reactionInfo].maxEarlyLocation}`;
            const info = new StringBuilder()
                .append(emoji).append(" ")
                .append(peopleThatReacted.slice(0, 50).join(", "));
            if (peopleThatReacted.length > 50)
                info.append(` and ${peopleThatReacted.length - 50} more.`);
            const title = `Early Location Reaction: ${mappedEmojiInfo.emojiName} (${amtTakenAmtMax})`;
            controlPanelEmbed.addField(title, info.toString());
        }

        return controlPanelEmbed;
    }

    /**
     * Creates a control panel embed for an AFK check..
     * @returns {MessageEmbed | null} The message embed if the raid VC is initialized. Null otherwise.
     * @private
     */
    private createControlPanelEmbedForAfkCheck(): MessageEmbed | null {
        if (!this._raidVc) return null;
        const descSb = new StringBuilder()
            .append(`To use __this__ control panel, you **must** be in the **\`${this._raidVc.name}\`** voice channel.`)
            .appendLine()
            .appendLine()
            .append(`⇨ **React** to the ${Emojis.LONG_RIGHT_TRIANGLE_EMOJI} emoji if you want to end the AFK check `)
            .append("and start the raid. There is no post-AFK check.")
            .appendLine()
            .append(`⇨ **React** to the ${Emojis.WASTEBIN_EMOJI} emoji if you want to end the AFK check __without__ `)
            .append("starting a raid. Use this option if you don't have enough raiders or reactions.")
            .appendLine()
            .append(`⇨ **React** to the ${Emojis.MAP_EMOJI} emoji if you want to change this raid's location. This `)
            .append("will message everyone that is participating in this raid that has early location.");

        const maxVc = `${this._raidVc.userLimit === 0 ? "Unlimited" : this._raidVc.userLimit}`;
        const generalStatus = new StringBuilder()
            .append(`⇨ Started At: ${MiscUtilities.getTime(this._raidVc.createdTimestamp)} UTC`)
            .appendLine()
            .append(`⇨ VC Capacity: ${this._raidVc.members.size} / ${maxVc}`)
            .appendLine()
            .append(`⇨ Location: **\`${this._location}\`**`);
        const controlPanelEmbed = new MessageEmbed()
            .setAuthor(`${this._leaderName}'s Control Panel - ${this._raidVc.name}`,
                this._memberInit.user.displayAvatarURL())
            .setTitle(`**${this._dungeon.dungeonName}** Raid.`)
            .setDescription(descSb.toString())
            .setFooter(`${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName} Control Panel.`)
            .setTimestamp()
            .setColor(ArrayUtilities.getRandomElement(this._dungeon.dungeonColors))
            .setThumbnail(this._controlPanelMsg
                ? this._controlPanelMsg.embeds[0].thumbnail!.url
                : ArrayUtilities.getRandomElement(this._dungeon.bossLinks.concat(this._dungeon.portalEmojiId)))
            .addField("General Status", generalStatus.toString());

        for (const [emojiCodeName, [peopleThatReacted, isAcceptingMore]] of this._earlyLocationReactions) {
            const mappedEmojiInfo = MappedReactions[emojiCodeName];
            const emoji = OneRealmBot.BotInstance.client.emojis.cache.get(mappedEmojiInfo.emojiId)!;
            const reactionInfo = this._allReactions.findIndex(x => x.mappingEmojiName === emojiCodeName);
            if (reactionInfo === -1)
                continue;
            const amtTakenAmtMax = `${peopleThatReacted.length} / ${this._allReactions[reactionInfo].maxEarlyLocation}`;
            const info = new StringBuilder()
                .append(emoji).append(" ")
                .append(peopleThatReacted.slice(0, 50).join(", "));
            if (peopleThatReacted.length > 50)
                info.append(` and ${peopleThatReacted.length - 50} more.`);
            const emojiForTitle = isAcceptingMore ? Emojis.HOURGLASS_EMOJI : Emojis.GREEN_CHECK_EMOJI;
            const title = `${emojiForTitle} Reaction: ${mappedEmojiInfo.emojiName} (${amtTakenAmtMax})`;
            controlPanelEmbed.addField(title, info.toString());
        }

        return controlPanelEmbed;
    }

    /**
     * Creates an AFK check embed.
     * @return {MessageEmbed | null} The new AFK check embed if the raid VC is initialized. Null otherwise.
     * @private
     */
    private createAfkCheckEmbed(): MessageEmbed | null {
        if (!this._raidVc) return null;
        const brokenUpNames = UserManager.getAllNames(this._memberInit.displayName)[0];
        const nameToUse = brokenUpNames.length === 0 ? this._memberInit.displayName : brokenUpNames[0];

        const descSb = new StringBuilder()
            .append(`⇨ To participate in this raid, __just__ join the **\`${nameToUse}'s Raid\`** voice channel.`)
            .appendLine()
            .append("⇨ There are **no** required reactions.");

        const optSb = new StringBuilder();
        if (this._earlyLocationReactions.has("NITRO")) {
            const nitroEmoji = OneRealmBot.BotInstance.client.emojis.cache.get(MappedReactions.NITRO.emojiId);
            const earlyLocRoleStr = this._guildDoc.roles.earlyLocationRoles
                .filter(x => this._memberInit.roles.cache.has(x))
                .map(x => this._memberInit.roles.cache.get(x))
                .join(", ");
            optSb.append(`⇨ If you are a Nitro booster or have the following roles (${earlyLocRoleStr}), then react `)
                .append(`to the ${nitroEmoji} emoji to get early location.`)
                .appendLine()
                .append("⇨ Otherwise, react to the emojis corresponding to your gear and/or class preference.");
        }

        const afkCheckEmbed = new MessageEmbed()
            .setAuthor(`${nameToUse} has started a ${this._dungeon.dungeonName} AFK check.`,
                this._memberInit.user.displayAvatarURL())
            .setDescription(descSb.toString())
            .setFooter(`${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName} AFK Check.`)
            .setTimestamp()
            .setColor(ArrayUtilities.getRandomElement(this._dungeon.dungeonColors))
            .setThumbnail(this._afkCheckMsg
                ? this._afkCheckMsg.embeds[0].thumbnail!.url
                : ArrayUtilities.getRandomElement(this._dungeon.bossLinks.concat(this._dungeon.portalEmojiId)))
            .addField("Optional Reactions", optSb.toString());

        if (this._raidMsg)
            afkCheckEmbed.addField("Message From Your Leader", this._raidMsg);

        const neededReactionsSb = new StringBuilder();
        for (const [emojiCodeName, [peopleThatReacted, isAcceptingMore]] of this._earlyLocationReactions) {
            const mappedEmojiInfo = MappedReactions[emojiCodeName];
            const emoji = OneRealmBot.BotInstance.client.emojis.cache.get(mappedEmojiInfo.emojiId)!;
            const reactionInfo = this._allReactions.findIndex(x => x.mappingEmojiName === emojiCodeName);
            // TODO test this to make sure.
            if (reactionInfo === -1 || !isAcceptingMore)
                continue;

            neededReactionsSb
                .append(Emojis.HOURGLASS_EMOJI)
                .append(" ")
                .append(`${emoji}: ${peopleThatReacted.length} / ${this._allReactions[reactionInfo].maxEarlyLocation} `)
                .appendLine();
        }

        if (neededReactionsSb.length() !== 0)
            afkCheckEmbed.addField("Needed (Priority) Reactions", neededReactionsSb.toString());

        return afkCheckEmbed;
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