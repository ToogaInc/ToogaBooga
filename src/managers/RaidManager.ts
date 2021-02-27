import {
    Collection, DMChannel,
    EmojiResolvable,
    Guild,
    GuildMember, Message,
    MessageEmbed,
    OverwriteResolvable,
    PermissionResolvable,
    TextChannel, VoiceChannel
} from "discord.js";
import {IDungeonInfo} from "../definitions/major/parts/IDungeonInfo";
import {ISectionInfo} from "../definitions/major/ISectionInfo";
import {IGuildInfo} from "../definitions/major/IGuildInfo";
import {IRaidInfo} from "../definitions/major/IRaidInfo";
import {MongoManager} from "./MongoManager";
import {UserManager} from "./UserManager";
import {MappedReactions} from "../constants/MappedReactions";
import {StringBuilder} from "../utilities/StringBuilder";
import {ArrayUtilities} from "../utilities/ArrayUtilities";
import {IReactionProps} from "../definitions/major/parts/IReactionProps";
import {MiscUtils} from "../utilities/MiscUtils";
import {OneRealmBot} from "../OneRealmBot";
import {MessageUtil} from "../utilities/MessageUtil";
import {Emojis} from "../constants/Emojis";
import {AdvancedCollector} from "../utilities/AdvancedCollector";

export namespace RaidManager {
    export interface IAfkCheckOptions {
        location: string;
        raidMessage?: string;
        section: ISectionInfo;
        dungeon: IDungeonInfo;
    }

    /**
     * Generates an array of permissions that will be used for the AFK check.
     * @param {Guild} guild The guild object.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section where the AFK check will be held.
     * @return {OverwriteResolvable[]} The list of permissions.
     * @private
     */
    function getRolesAndCorrespondingPerms(guild: Guild, guildDoc: IGuildInfo,
                                           section: ISectionInfo): OverwriteResolvable[] {
        const permCol: OverwriteResolvable[] = [];

        // No verified role = no point in using this function
        if (!guild.roles.cache.has(section.roles.verifiedRoleId))
            return permCol;

        permCol.push(
            {
                id: guild.roles.everyone.id,
                deny: ["VIEW_CHANNEL", "SPEAK", "STREAM", "CONNECT"]
            },
            {
                id: section.roles.verifiedRoleId,
                allow: ["VIEW_CHANNEL"]
            },
            // general staff roles
            {
                id: guildDoc.roles.staffRoles.moderation.securityRoleId,
                allow: ["CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS", "STREAM"]
            },
            {
                id: guildDoc.roles.staffRoles.moderation.officerRoleId,
                allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "STREAM"]
            },
            {
                id: guildDoc.roles.staffRoles.moderation.moderatorRoleId,
                allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "STREAM"]
            },
            // universal leader roles
            {
                id: guildDoc.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId,
                allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS", "STREAM"]
            },
            {
                id: guildDoc.roles.staffRoles.universalLeaderRoleIds.leaderRoleId,
                allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS", "DEAFEN_MEMBERS", "STREAM"]
            },
            {
                id: guildDoc.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId,
                allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "STREAM"]
            },
            // section leader roles
            {
                id: section.roles.leaders.sectionAlmostRaidLeaderRoleId,
                allow: ["CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS", "STREAM"]
            },
            {
                id: section.roles.leaders.sectionRaidLeaderRoleId,
                allow: ["CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS", "DEAFEN_MEMBERS", "STREAM"]
            },
            {
                id: section.roles.leaders.sectionHeadLeaderRoleId,
                allow: ["CONNECT", "SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "STREAM"]
            }
        );

        const updatePerms = (r: string, p: PermissionResolvable) => {
            const idx = permCol.findIndex(x => x.id === r);
            if (idx === -1) {
                permCol.push({
                    id: r,
                    allow: p
                });

                return;
            }

            const thisPerms = permCol[idx].allow;
            if (Array.isArray(thisPerms) && !thisPerms.includes(p))
                permCol[idx].allow = thisPerms.concat(p);
        };

        for (const r of guildDoc.roles.speakingRoles)
            updatePerms(r, ["SPEAK"]);

        for (const r of guildDoc.roles.streamingRoles)
            updatePerms(r, ["STREAM"]);

        return permCol.filter(x => guild.roles.cache.has(x.id as string));
    }

    /**
     * Creates a new AFK check. It is expected that the AFK check channel and the control panel channel are defined.
     * @param {Guild} guild The guild object.
     * @param {GuildMember} memberInitiated The member that started this AFK check.
     * @param {IGuildInfo} guildDb The guild DB.
     * @param {IAfkCheckOptions} details The AFK check details.
     */
    export async function startAfkCheck(guild: Guild, memberInitiated: GuildMember, guildDb: IGuildInfo,
                                        details: IAfkCheckOptions) {
        const afkCheckChannel = guild.channels
            .resolve(details.section.channels.raids.afkCheckChannelId) as TextChannel;
        const controlPanel = guild.channels
            .resolve(details.section.channels.raids.controlPanelChannelId) as TextChannel;

        // get necessary reactions. remember that the server admins may have defined their own reactions.
        let allReactions = details.section.otherMajorConfig.afkCheckProperties.dungeonReactionOverride
            .find(x => x.dungeonCodeName === details.dungeon.codeName)?.reactions ?? details.dungeon.reactions;
        // Remove any bad emojis
        // All emojis beyond this line should exist.
        allReactions = allReactions.filter(x => OneRealmBot.BotInstance.client.emojis.cache
            .has(MappedReactions[x.mappingEmojiName].emojiId));

        // Get the leader's name so we can display it.
        const brokenUpName = UserManager.getAllNames(memberInitiated.displayName);
        const leaderName = brokenUpName.length > 0
            ? brokenUpName[0]
            : memberInitiated.displayName;

        // K = Mapping Emoji ID
        // V = The guild members that reacted and whether this reaction is accepting more spots
        const earlyLocReacts = new Collection<string, [GuildMember[], boolean]>();
        allReactions
            .concat({
                mappingEmojiName: "NITRO",
                maxEarlyLocation: guildDb.otherMajorConfig.afkCheckProperties.nitroEarlyLocationLimit
            })
            .filter(x => x.maxEarlyLocation > 0)
            .forEach(r => earlyLocReacts.set(r.mappingEmojiName as string, [[], true]));

        // Create a new VC
        // TODO set position of VC to top.
        const raidVc = await guild.channels.create(`🔒 ${leaderName}'s Raid`, {
            type: "voice",
            userLimit: details.section.otherMajorConfig.afkCheckProperties.vcLimit,
            permissionOverwrites: getRolesAndCorrespondingPerms(guild, guildDb, details.section)
        });

        await raidVc.setParent(afkCheckChannel.parent).catch();

        const controlPanelMessage = await controlPanel.send({
            embed: createControlPanelEmbedForAfkCheck(memberInitiated, details, raidVc, allReactions, earlyLocReacts)
        });
        AdvancedCollector.reactFaster(controlPanelMessage, [
            Emojis.RIGHT_TRIANGLE_EMOJI,
            Emojis.LONG_RIGHT_TRIANGLE_EMOJI,
            Emojis.WASTEBIN_EMOJI,
            Emojis.MAP_EMOJI,
            Emojis.SPEECH_BUBBLE_EMOJI
        ]);

        const descSb = new StringBuilder()
            .append(`⌛ **Prepare** to join the **\`${leaderName}'s Raid\`** voice channel. The channel will be `)
            .append("unlocked in 10 seconds.");
        const initialAfkCheckEmbed = new MessageEmbed()
            .setAuthor(`${leaderName} has started a ${details.dungeon.dungeonName} AFK check.`,
                memberInitiated.user.displayAvatarURL())
            .setThumbnail(details.dungeon.portalLink)
            .setImage(ArrayUtilities.getRandomElement(details.dungeon.bossLinks))
            .setDescription(descSb.toString())
            .setFooter("AFK Check Started.")
            .setTimestamp();

        const afkCheckMessage = await afkCheckChannel.send("@here An AFK Check is starting soon.", {
            embed: initialAfkCheckEmbed
        });

        const raidInfo: IRaidInfo = {
            channels: details.section.channels.raids,
            afkCheckMessageId: afkCheckMessage.id,
            controlPanelMessageId: controlPanelMessage.id,
            raidMessage: details.raidMessage ?? "",
            status: 1,
            vcId: raidVc.id,
            location: details.location,
            sectionIdentifier: details.section.uniqueIdentifier
        };
        await addRaidToDatabase(guild, raidInfo);

        // 10 seconds so people can prepare for the raid.
        await MiscUtils.stopFor(10 * 1000);
        await raidVc.updateOverwrite(guild.roles.everyone, {
            CONNECT: null
        }, "Allow raiders to connect to raid VC.");

        await afkCheckMessage.edit("@here An AFK Check is currently running.", {
            embed: createAfkCheckEmbed(memberInitiated, details, guildDb, allReactions, earlyLocReacts)
        });
        AdvancedCollector.reactFaster(afkCheckMessage, allReactions
            .map(x => MappedReactions[x.mappingEmojiName].emojiId));
        // Reactions ready
        // TODO finish
    }

    /**
     * Adds a raid object to the database.
     *
     * @param {Guild} guild The guild where the raid is being held.
     * @param {IRaidInfo} afk The raid object.
     * @returns {Promise<IGuildInfo>} The revised guild document.
     */
    export async function addRaidToDatabase(guild: Guild, afk: IRaidInfo): Promise<IGuildInfo> {
        const res = await MongoManager
            .getGuildCollection()
            .findOneAndUpdate({guildId: guild.id}, {
                $push: {
                    activeRaids: afk
                }
            }, {returnOriginal: false});

        return res.value as IGuildInfo;
    }

    /**
     * Creates a control panel embed..
     * @param {GuildMember} memberResponsible The member that is responsible for this AFK check.
     * @param {RaidManager.IAfkCheckOptions} details The details of this raid.
     * @param {VoiceChannel} raidVc The raid voice channel.
     * @param {IReactionProps[]} allReactions Every reaction for this AFK check.
     * @param {Collection<string, [GuildMember[], boolean]>} earlyLocCollection The early location object.
     * @return {MessageEmbed} The new AFK check embed.
     * @private
     */
    function createControlPanelEmbedForAfkCheck(memberResponsible: GuildMember, details: IAfkCheckOptions,
                                                raidVc: VoiceChannel,
                                                allReactions: readonly IReactionProps[],
                                                earlyLocCollection: Collection<string, [GuildMember[], boolean]>): MessageEmbed {
        const brokenUpNames = UserManager.getAllNames(memberResponsible.displayName)[0];
        const nameToUse = brokenUpNames.length === 0 ? memberResponsible.displayName : brokenUpNames[0];
        const descSb = new StringBuilder()
            .append(`To operate __this__ control panel, you **must** be in the **\`${raidVc.name}\`** voice channel.`)
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
            .append("message everyone that is participating in this raid that has early location.")
            .appendLine()
            .append(`⇨ **React** to the ${Emojis.SPEECH_BUBBLE_EMOJI} if you want to __release__ this raid's `)
            .append("location to everyone. You will **not** be able to undo this.");

        const maxVc = `${raidVc.userLimit === 0 ? "Unlimited" : raidVc.userLimit}`;
        const generalStatus = new StringBuilder()
            .append(`⇨ Started At: ${MiscUtils.getTime(raidVc.createdTimestamp)} UTC`)
            .appendLine()
            .append(`⇨ VC Capacity: ${raidVc.members.size} / ${maxVc}`)
            .appendLine()
            .append(`⇨ Location: **\`${details.location}\`**`);
        const controlPanelEmbed = new MessageEmbed()
            .setAuthor(`${nameToUse}'s Control Panel - ${raidVc.name}`,
                memberResponsible.user.displayAvatarURL())
            .setDescription(descSb.toString())
            .setFooter(`${memberResponsible.guild.name} ⇨ ${details.section.sectionName} Control Panel.`)
            .setTimestamp()
            .setThumbnail(ArrayUtilities.getRandomElement(details.dungeon.bossLinks
                .concat(details.dungeon.portalEmojiId)))
            .addField("General Status", generalStatus.toString());

        for (const [emojiCodeName, [peopleThatReacted, isAcceptingMore]] of earlyLocCollection) {
            const mappedEmojiInfo = MappedReactions[emojiCodeName];
            const emoji = OneRealmBot.BotInstance.client.emojis.cache.get(mappedEmojiInfo.emojiId)!;
            const reactionInfo = allReactions.findIndex(x => x.mappingEmojiName === emojiCodeName);
            if (reactionInfo === -1)
                continue;
            const amtTakenAmtMax = `${peopleThatReacted.length} / ${allReactions[reactionInfo].maxEarlyLocation}`;
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
     * @param {GuildMember} memberResponsible The member that is responsible for this AFK check.
     * @param {RaidManager.IAfkCheckOptions} details The details of this raid.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {IReactionProps[]} allReactions Every reaction for this AFK check.
     * @param {Collection<string, [GuildMember[], boolean]>} earlyLocCollection The early location object.
     * @return {MessageEmbed} The new AFK check embed.
     * @private
     */
    function createAfkCheckEmbed(memberResponsible: GuildMember, details: IAfkCheckOptions,
                                 guildDoc: IGuildInfo,
                                 allReactions: readonly IReactionProps[],
                                 earlyLocCollection: Collection<string, [GuildMember[], boolean]>): MessageEmbed {
        const brokenUpNames = UserManager.getAllNames(memberResponsible.displayName)[0];
        const nameToUse = brokenUpNames.length === 0 ? memberResponsible.displayName : brokenUpNames[0];

        const descSb = new StringBuilder()
            .append(`⇨ To participate in this raid, __just__ join the **\`${nameToUse}'s Raid\`** voice channel.`)
            .appendLine()
            .append("⇨ There are **no** required reactions.");

        const optSb = new StringBuilder();
        if (earlyLocCollection.has("NITRO")) {
            const nitroEmoji = OneRealmBot.BotInstance.client.emojis.cache.get(MappedReactions.NITRO.emojiId);
            const earlyLocRoleStr = guildDoc.roles.earlyLocationRoles
                .filter(x => memberResponsible.roles.cache.has(x))
                .map(x => memberResponsible.roles.cache.get(x))
                .join(", ");
            optSb.append(`⇨ If you are a Nitro booster or have the following roles (${earlyLocRoleStr}), then react `)
                .append(`to the ${nitroEmoji} emoji to get early location.`)
                .appendLine()
                .append("⇨ Otherwise, react to the emojis corresponding to your gear and/or class preference.");
        }

        const afkCheckEmbed = new MessageEmbed()
            .setAuthor(`${nameToUse} has started a ${details.dungeon.dungeonName} AFK check.`,
                memberResponsible.user.displayAvatarURL())
            .setDescription(descSb.toString())
            .setFooter(`${memberResponsible.guild.name} ⇨ ${details.section.sectionName} AFK Check.`)
            .setTimestamp()
            .setThumbnail(ArrayUtilities.getRandomElement(details.dungeon.bossLinks
                .concat(details.dungeon.portalEmojiId)))
            .addField("Optional Reactions", optSb.toString());

        const neededReactionsSb = new StringBuilder();
        for (const [emojiCodeName, [peopleThatReacted, isAcceptingMore]] of earlyLocCollection) {
            const mappedEmojiInfo = MappedReactions[emojiCodeName];
            const emoji = OneRealmBot.BotInstance.client.emojis.cache.get(mappedEmojiInfo.emojiId)!;
            const reactionInfo = allReactions.findIndex(x => x.mappingEmojiName === emojiCodeName);
            // TODO test this to make sure.
            if (reactionInfo === -1 || !isAcceptingMore)
                continue;

            neededReactionsSb
                .append(Emojis.HOURGLASS_EMOJI)
                .append(" ")
                .append(`${emoji}: ${peopleThatReacted.length} / ${allReactions[reactionInfo].maxEarlyLocation} `)
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
     */
    export async function selectSection(msg: Message, member: GuildMember,
                                        guildDoc: IGuildInfo): Promise<ISectionInfo | null> {
        const possibleSections = MiscUtils.getAllSections(guildDoc)
            .filter(x => canManageRaidsIn(x, member, guildDoc));

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

        const askSectionEmbed = MessageUtil.generateBlankEmbed(member.guild, "RANDOM")
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
     * @private
     */
    function canManageRaidsIn(section: ISectionInfo, member: GuildMember, guildInfo: IGuildInfo): boolean {
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