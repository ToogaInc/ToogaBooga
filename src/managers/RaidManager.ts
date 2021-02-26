import {
    Collection, DMChannel,
    EmojiResolvable,
    Guild,
    GuildMember, Message,
    MessageEmbed,
    OverwriteResolvable,
    PermissionResolvable,
    TextChannel, User
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
        let dungeonReactions = details.section.otherMajorConfig.afkCheckProperties.dungeonReactionOverride
            .find(x => x.dungeonCodeName === details.dungeon.codeName)?.reactions ?? details.dungeon.reactions;
        // Remove any bad emojis
        dungeonReactions = dungeonReactions.filter(x => OneRealmBot.BotInstance.client.emojis.cache
            .has(MappedReactions[x.mappingEmojiName].emojiId));
        const allKeys = dungeonReactions.filter(x => MappedReactions[x.mappingEmojiName].emojiType === "KEY");

        // Get the leader's name so we can display it.
        const brokenUpName = UserManager.getAllNames(memberInitiated.displayName);
        const leaderName = brokenUpName.length > 0
            ? brokenUpName[0]
            : memberInitiated.displayName;

        // Create a new VC
        const raidVc = await guild.channels.create(`🔒 ${leaderName}'s Raid`, {
            type: "voice",
            userLimit: details.section.otherMajorConfig.afkCheckProperties.vcLimit,
            permissionOverwrites: getRolesAndCorrespondingPerms(guild, guildDb, details.section)
        });

        await raidVc.setParent(afkCheckChannel.parent).catch();

        const descSb = new StringBuilder()
            .append(`⌛ **Prepare** to join the **\`${leaderName}'s Raid\`** voice channel. The channel will be `)
            .append("unlocked after 5 seconds.");

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

        await MiscUtils.stopFor(5 * 1000);

        // K = Mapping Emoji ID
        // V = The guild members that reacted and whether this reaction is accepting more spots
        const earlyLocReacts = new Collection<string, [GuildMember[], boolean]>();
        dungeonReactions
            .concat({
                mappingEmojiName: "NITRO",
                maxEarlyLocation: guildDb.otherMajorConfig.afkCheckProperties.nitroEarlyLocationLimit
            })
            .filter(x => x.maxEarlyLocation > 0)
            .forEach(r => earlyLocReacts.set(r.mappingEmojiName as string, [[], true]));


    }

    /**
     * A function that should be called when someone reacts to an emoji.
     * @param {User} user
     * @param {IReactionProps} emojiInfo
     * @param {Guild} guild
     * @param {IAfkCheckOptions} afkCheckInfo
     * @return {Promise<boolean>}
     */
    export async function confirmReaction(user: User, emojiInfo: IReactionProps, guild: Guild,
                                          afkCheckInfo: IAfkCheckOptions): Promise<boolean> {
        return new Promise((resolve) => {
            const askConfirmEmbed = MessageUtil.generateBlankEmbed(user, "GREEN")
                .setTitle("Confirm Reaction")
                .setDescription("");
        });
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
            return possibleSections[1];

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

        return null;
    }

    /**
     * Checks whether a person can manage raids in the specified section. The section must have a control panel and
     * AFK check channel defined and the person must have at least one leader role.
     * @param {ISectionInfo} section The section in question.
     * @param {GuildMember} member The member in question.
     *  @param {IGuildInfo} guildInfo The guild document.
     * @return {boolean} Whether the person can manage raids in the specified section.
     * @private
     */
    function canManageRaidsIn(section: ISectionInfo, member: GuildMember, guildInfo: IGuildInfo): boolean {
        const guild = member.guild;
        if (!guild.roles.cache.has(section.roles.verifiedRoleId))
            return false;

        if (!guild.channels.cache.has(section.channels.raids.controlPanelChannelId))
            return false;

        if (!guild.channels.cache.has(section.channels.raids.afkCheckChannelId))
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