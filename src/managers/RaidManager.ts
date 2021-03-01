import {
    Collection,
    DMChannel, Emoji,
    EmojiResolvable,
    Guild,
    GuildMember,
    Message,
    MessageEmbed,
    TextChannel,
    VoiceChannel
} from "discord.js";
import {ISectionInfo} from "../definitions/major/ISectionInfo";
import {IDungeonInfo} from "../definitions/major/parts/IDungeonInfo";
import {AdvancedCollector} from "../utilities/AdvancedCollector";
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

/**
 * This class represents a raid.
 */
export class RaidManager {
    private readonly _memberInit: GuildMember;
    private readonly _guild: Guild;
    private readonly _dungeon: IDungeonInfo;
    private readonly _allReactions: IReactionProps[];
    private readonly _earlyLocationReactions: Collection<string, [GuildMember[], boolean]>;
    private readonly _afkCheckChannel: TextChannel;
    private readonly _controlPanelChannel: TextChannel;
    private readonly _raidSection: ISectionInfo;

    private _guildDoc: IGuildInfo;
    private _location: string;
    private _raidMsg: string;
    private _raidStatus: RaidStatus;

    private _raidVc: VoiceChannel | null;
    private _afkCheckMsg: Message | null;
    private _controlPanelMsg: Message | null;
    private _afkCheckInterval: NodeJS.Timeout | null;
    private _controlPanelInterval: NodeJS.Timeout | null;


    /**
     * Creates a new `RaidManager` object.
     * @param {GuildMember} memberInit The member that initiated this raid.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section where this raid is occurring.
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

        // Add early location entries.
        for await (const entry of raidInfo.earlyLocationReactions) {
            const member = await FetchRequestUtilities.fetchGuildMember(guild, entry.userId);
            if (!member) continue;
            await rm.addEarlyLocationReaction(member, entry.reactCodeName, false);
        }

        return rm;
    }

    /**
     * Gets the corresponding `IRaidInfo` object.
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
                deleteBaseMsg: true
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
     * Cleans the raid up. This will remove the raid voice channel, delete the control panel message, and remove
     * the raid from the database.
     * @private
     */
    private async cleanUpRaid(): Promise<void> {
        // Step 0: Remove the raid object. We don't need it anymore.
        await this.removeRaidFromDatabase();

        // Step 1: Remove the control panel message.
        await this._controlPanelMsg?.delete().catch();

        // Step 2: Unpin the AFK check message.
        await this._afkCheckMsg?.delete().catch();

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

        const prop = this._earlyLocationReactions.get(reactionCodeName)!;
        if (!prop[1])
            return false;
        if (prop[0].includes(member))
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
     * Creates a control panel embed.
     * @returns {MessageEmbed | null} The message embed if the raid VC is initialized. Null otherwise.
     * @private
     */
    private createControlPanelEmbedForAfkCheck(): MessageEmbed | null {
        if (!this._raidVc) return null;
        const brokenUpNames = UserManager.getAllNames(this._memberInit.displayName)[0];
        const nameToUse = brokenUpNames.length === 0 ? this._memberInit.displayName : brokenUpNames[0];
        const descSb = new StringBuilder()
            .append(`To use __this__ control panel, you **must** be in the **\`${this._raidVc.name}\`** voice channel.`)
            .appendLine()
            .appendLine()
            .append(`⇨ **React** to the ${Emojis.RIGHT_TRIANGLE_EMOJI} if you want to end the AFK check and start `)
            .append("the raid. This will initiate the post-AFK check.")
            .appendLine()
            .append(`⇨ **React** to the ${Emojis.LONG_RIGHT_TRIANGLE_EMOJI} if you want to end the AFK check and `)
            .append("start the raid. __This will skip the post-AFK check.__")
            .appendLine()
            .append(`⇨ **React** to the ${Emojis.WASTEBIN_EMOJI} if you want to end the AFK check __without__ `)
            .append("starting a raid.")
            .appendLine()
            .append(`⇨ **React** to the ${Emojis.MAP_EMOJI} if you want to change this raid's location. This will `)
            .append("message everyone that is participating in this raid that has early location.");

        const maxVc = `${this._raidVc.userLimit === 0 ? "Unlimited" : this._raidVc.userLimit}`;
        const generalStatus = new StringBuilder()
            .append(`⇨ Started At: ${MiscUtilities.getTime(this._raidVc.createdTimestamp)} UTC`)
            .appendLine()
            .append(`⇨ VC Capacity: ${this._raidVc.members.size} / ${maxVc}`)
            .appendLine()
            .append(`⇨ Location: **\`${this._location}\`**`);
        const controlPanelEmbed = new MessageEmbed()
            .setAuthor(`${nameToUse}'s Control Panel - ${this._raidVc.name}`,
                this._memberInit.user.displayAvatarURL())
            .setDescription(descSb.toString())
            .setFooter(`${this._memberInit.guild.name} ⇨ ${this._raidSection.sectionName} Control Panel.`)
            .setTimestamp()
            .setThumbnail(ArrayUtilities.getRandomElement(this._dungeon.bossLinks
                .concat(this._dungeon.portalEmojiId)))
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
            const emojiForTitle = isAcceptingMore ? Emojis.HOURGLASS_EMOJI : Emojis.GREEN_CHECK_MARK_EMOJI;
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
            .setThumbnail(ArrayUtilities.getRandomElement(this._dungeon.bossLinks
                .concat(this._dungeon.portalEmojiId)))
            .addField("Optional Reactions", optSb.toString());

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
}

enum RaidStatus {
    NOTHING,
    AFK_CHECK,
    IN_RUN
}