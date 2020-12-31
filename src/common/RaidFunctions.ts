import {
    Emoji,
    EmojiResolvable,
    Guild,
    GuildMember,
    MessageEmbed,
    OverwriteResolvable,
    PermissionResolvable,
    TextChannel
} from "discord.js";
import {IDungeonInfo} from "../definitions/major/parts/IDungeonInfo";
import {ISectionInfo} from "../definitions/major/ISectionInfo";
import {IGuildInfo} from "../definitions/major/IGuildInfo";
import {IRaidInfo} from "../definitions/major/IRaidInfo";
import {MongoFunctions} from "./MongoFunctions";
import {UserFunctions} from "./UserFunctions";
import {DungeonData} from "../constants/DungeonData";
import {MappedReactions} from "../constants/MappedReactions";
import {StringBuilder} from "../utilities/StringBuilder";
import {ArrayUtilities} from "../utilities/ArrayUtilities";
import {AdvancedReactionCollector} from "../utilities/AdvancedReactionCollector";

export module RaidFunctions {
    interface IReactionCount {
        earlyReactCount: number;
        keyCount: Array<{
            id: string;
            amt: number;
        }>;
        vcCount: number;
    }

    export interface IAfkCheckOptions {
        location: string;
        raidMessage?: string;
        section: ISectionInfo;
        dungeon: IDungeonInfo;
    }

    function getRolesAndCorrespondingPerms(guild: Guild, guildDb: IGuildInfo,
                                           section: ISectionInfo): Array<OverwriteResolvable> {
        const permCol: Array<OverwriteResolvable> = [];

        // No verified role = no point in using this function
        if (!guild.roles.cache.has(section.roles.verifiedRoleId))
            return permCol;

        permCol.push(
            {
                id: guild.roles.everyone.id,
                deny: ["VIEW_CHANNEL", "SPEAK", "STREAM"]
            },
            {
                id: section.roles.verifiedRoleId,
                allow: ["VIEW_CHANNEL", "CONNECT"]
            },
            // general staff roles
            {
                id: guildDb.roles.staffRoles.moderation.securityRoleId,
                allow: ["CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS", "STREAM"]
            },
            {
                id: guildDb.roles.staffRoles.moderation.officerRoleId,
                allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "STREAM"]
            },
            {
                id: guildDb.roles.staffRoles.moderation.moderatorRoleId,
                allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "DEAFEN_MEMBERS", "MOVE_MEMBERS", "STREAM"]
            },
            // universal leader roles
            {
                id: guildDb.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId,
                allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS", "STREAM"]
            },
            {
                id: guildDb.roles.staffRoles.universalLeaderRoleIds.leaderRoleId,
                allow: ["VIEW_CHANNEL", "CONNECT", "SPEAK", "MUTE_MEMBERS", "MOVE_MEMBERS", "DEAFEN_MEMBERS", "STREAM"]
            },
            {
                id: guildDb.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId,
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

        for (const r of guildDb.roles.speakingRoles)
            updatePerms(r, ["SPEAK"]);

        for (const r of guildDb.roles.streamingRoles)
            updatePerms(r, ["STREAM"]);

        return permCol.filter(x => guild.roles.cache.has(x.id as string));
    }

    /**
     * Creates a new AFK check.
     * @param {Guild} guild The guild object.
     * @param {GuildMember} memberInitiated The member that started this AFK check.
     * @param {IGuildInfo} guildDb The guild DB.
     * @param {IAfkCheckOptions} details The AFK check details.
     */
    export async function startAfkCheck(guild: Guild, memberInitiated: GuildMember, guildDb: IGuildInfo,
                                        details: IAfkCheckOptions) {
        // These should probably be validated.
        const afkCheckChannel = guild.channels.resolve(details.section.channels.raids.afkCheckChannelId) as TextChannel;
        const controlPanel = guild.channels.resolve(details.section.channels.raids.controlPanelChannelId) as TextChannel;

        const brokenUpName = UserFunctions.getAllNames(memberInitiated.displayName);
        const leaderName = brokenUpName.length > 0
            ? brokenUpName[0]
            : memberInitiated.displayName;

        const vcName = `${leaderName}'s Raid`;

        const afkEmbed: MessageEmbed = new MessageEmbed()
            .setAuthor(`${leaderName} has started a/an ${details.dungeon.dungeonName} AFK check.`,
                memberInitiated.user.displayAvatarURL())
            .setThumbnail(ArrayUtilities.getRandomElement(details.dungeon.bossLinks))
            .setDescription(`🔈 **Join** the **\`${vcName}\`** voice channel if you want to participate in this raid.`)
            .setFooter("AFK Check Started:")
            .setTimestamp();

        const reactions = (details.section.properties.afkCheckProperties.dungeonReactionOverride
                .find(x => x.dungeonCodeName === details.dungeon.codeName)?.reactions
            ?? (DungeonData.find(x => x.codeName === details.dungeon.codeName) as IDungeonInfo).reactions)
            .filter(x => guild.emojis.resolve(MappedReactions[x.mappingEmojiName].emojiId) !== null);

        const allKeys = reactions.filter(x => MappedReactions[x.mappingEmojiName].emojiType === "KEY");
        const optReactSb = new StringBuilder();
        if (allKeys.length === 1) {
            const onlyKey = guild.emojis.resolve(MappedReactions[allKeys[0].mappingEmojiName].emojiId) as Emoji;
            optReactSb.append(`🔑 **React** with ${MappedReactions[allKeys[0].mappingEmojiName].emojiId} if you have `)
                .append(`a ${MappedReactions[allKeys[0].mappingEmojiName].emojiName} and would like to use it for `)
                .append("this raid.")
                .appendLine();
        }
        else if (allKeys.length > 1) {
            const allPossKeys = allKeys.map(x => guild.emojis.resolve(MappedReactions[x.mappingEmojiName]
                .emojiId) as Emoji);
            optReactSb.append("🔑 **React** to the emojis corresponding to the following keys if you have one and ")
                .append("would like to use it for this raid: ")
                .append(allPossKeys.join(" "))
                .appendLine();
        }

        optReactSb.append("🔷 **React** to the emojis corresponding to the classes and gear that you plan on bringing" +
            " for this raid.");
        afkEmbed.addField("Optional Reactions", optReactSb.toString());

        if (details.section.otherMajorConfig.afkCheckProperties.additionalAfkCheckInfo)
            afkEmbed.addField("Section Information", details.section.otherMajorConfig.afkCheckProperties
                .additionalAfkCheckInfo);

        if (details.raidMessage)
            afkEmbed.addField("Message From Your Leader", details.raidMessage);

        const raidVc = await guild.channels.create(vcName, {
            type: "voice",
            userLimit: details.section.otherMajorConfig.afkCheckProperties.vcLimit,
            permissionOverwrites: getRolesAndCorrespondingPerms(guild, guildDb, details.section)
        });

        await raidVc.setParent(afkCheckChannel.parent).catch();

        const afkCheckMessage = await afkCheckChannel.send({embed: afkEmbed});
        await afkCheckMessage.pin().catch();
        const emojis: Array<EmojiResolvable> = [
            ...allKeys.map(x => MappedReactions[x.mappingEmojiName].emojiId),
            ...reactions.filter(a => !allKeys.includes(a)).map(x => MappedReactions[x.mappingEmojiName].emojiId)
        ];

        AdvancedReactionCollector.reactFaster(afkCheckMessage, emojis);
    }


    /**
     * Adds a raid object to the database.
     *
     * @param {Guild} guild The guild where the raid is being held.
     * @param {IRaidInfo} afk The raid object.
     * @returns {Promise<IGuildInfo>} The revised guild document.
     */
    export async function addRaidToDatabase(guild: Guild, afk: IRaidInfo): Promise<IGuildInfo> {
        const res = await MongoFunctions
            .getGuildCollection()
            .findOneAndUpdate({guildId: guild.id}, {
                $push: {
                    activeRaids: afk
                }
            }, {returnOriginal: false});

        return res.value as IGuildInfo;
    }
}