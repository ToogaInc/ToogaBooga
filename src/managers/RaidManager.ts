import {
    Collection,
    Emoji,
    EmojiResolvable,
    Guild, GuildEmoji,
    GuildMember,
    MessageEmbed, MessageReaction,
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
import {DungeonData} from "../constants/DungeonData";
import {MappedReactions} from "../constants/MappedReactions";
import {StringBuilder} from "../utilities/StringBuilder";
import {ArrayUtilities} from "../utilities/ArrayUtilities";
import {AdvancedReactionCollector} from "../utilities/AdvancedReactionCollector";
import {IReactionProps} from "../definitions/major/parts/IReactionProps";
import {MiscUtils} from "../utilities/MiscUtils";
import {OneRealmBot} from "../OneRealmBot";

export namespace RaidManager {
    export interface IAfkCheckOptions {
        location: string;
        raidMessage?: string;
        section: ISectionInfo;
        dungeon: IDungeonInfo;
    }

    function getRolesAndCorrespondingPerms(guild: Guild, guildDb: IGuildInfo,
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

        const brokenUpName = UserManager.getAllNames(memberInitiated.displayName);
        const leaderName = brokenUpName.length > 0
            ? brokenUpName[0]
            : memberInitiated.displayName;

        // get necessary reactions. remember that the server admins may have defined their own reactions.
        const dungeonReactions = (details.section.otherMajorConfig.afkCheckProperties.dungeonReactionOverride
                .find(x => x.dungeonCodeName === details.dungeon.codeName)?.reactions
            ?? (DungeonData.find(x => x.codeName === details.dungeon.codeName) as IDungeonInfo).reactions)
            .filter(x => OneRealmBot.BotInstance.client.emojis
                .resolve(MappedReactions[x.mappingEmojiName].emojiId) !== null);

        const allKeys = dungeonReactions.filter(x => MappedReactions[x.mappingEmojiName].emojiType === "KEY");
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
            .setFooter("AFK Check Started")
            .setTimestamp();

        const afkCheckMessage = await afkCheckChannel.send("@here", {embed: initialAfkCheckEmbed});
        await MiscUtils.stopFor(5 * 1000);

        // K = key for mappedreaction
        const earlyLocReacts = new Collection<string, [GuildMember[], boolean]>();
        dungeonReactions
            .concat({
                mappingEmojiName: "NITRO",
                maxEarlyLocation: guildDb.otherMajorConfig.afkCheckProperties.nitroEarlyLocationLimit
            })
            .filter(x => x.maxEarlyLocation > 0)
            .forEach(r => earlyLocReacts.set(r.mappingEmojiName as string, [[], true]));

        /**
         * Creates a new AFK check embed.
         * @returns The new AFK check embed.
         */
        const createFormalAfkEmbed = (): [MessageEmbed, EmojiResolvable[]] => {
            const afkEmojis: EmojiResolvable[] = [
                MappedReactions.NITRO.emojiId,
                ...allKeys.map(x => MappedReactions[x.mappingEmojiName].emojiId),
            ];

            afkEmojis.push(...dungeonReactions.map(x => MappedReactions[x.mappingEmojiName].emojiId)
                .filter(x => !afkEmojis.includes(x)));

            const newDescSb = new StringBuilder()
                .append(`🔈 **Join** the **\`${leaderName}'s Raid\`** voice channel if you want to participate in `)
                .append("this raid. You do not have to react to anything.");

            const afkEmbed = new MessageEmbed()
                .setAuthor(`${leaderName} has started a/an ${details.dungeon.dungeonName} AFK check.`,
                    memberInitiated.user.displayAvatarURL())
                .setThumbnail(details.dungeon.portalLink)
                .setDescription(newDescSb.toString())
                .setFooter("AFK Check Started")
                .setTimestamp();

            const optReactSb = new StringBuilder();
            if (allKeys.length === 1) {
                const onlyKey = OneRealmBot.BotInstance.client.emojis
                    .resolve(MappedReactions[allKeys[0].mappingEmojiName].emojiId) as Emoji;
                optReactSb.append(`🔑 **React** with ${onlyKey} if you have `)
                    .append(`a ${MappedReactions[allKeys[0].mappingEmojiName].emojiName} and would like to use it for `)
                    .append("this raid.")
                    .appendLine();
            }
            else if (allKeys.length > 1) {
                const allPossKeys = allKeys.map(x => OneRealmBot.BotInstance.client.emojis
                    .resolve(MappedReactions[x.mappingEmojiName].emojiId) as Emoji);
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

            const reactStatusSb = new StringBuilder();
            for (const [reactCodeName, [peopleThatReacted, stillNeeded]] of earlyLocReacts) {
                const idx = dungeonReactions
                    .findIndex(x => x.mappingEmojiName === reactCodeName);
                if (idx === -1)
                    continue;

                const resolvedEmoji = OneRealmBot.BotInstance.client.emojis
                    .resolve(MappedReactions[reactCodeName].emojiId);
                if (!resolvedEmoji)
                    continue;

                reactStatusSb.append(`${resolvedEmoji} ${peopleThatReacted.length}`)
                    .append(`/${dungeonReactions[idx].maxEarlyLocation} `);
                if (!stillNeeded)
                    reactStatusSb.append("`✅`");
                reactStatusSb.appendLine();

                afkEmbed.addField("Needed Reactions", reactStatusSb.toString());
            }

            return [afkEmbed, afkEmojis];
        };

        /**
         * Returns a new control panel embed that can be used to control the AFK check.
         * @returns The new control panel embed.
         */
        const createFormalControlPanelEmbed = (): [MessageEmbed, EmojiResolvable[]] => {
            const tempControlPanelEmojis: EmojiResolvable[] = [];
            const controlPanelDesc = new StringBuilder()
                .append(`⇒ Section: ${details.section.sectionName}`)
                .appendLine()
                .append(`⇒ Leader: ${leaderName} (${memberInitiated}`)
                .appendLine()
                .append(`⇒ Dungeon: ${details.dungeon.dungeonName}`)
                .appendLine()
                .append(`⇒ Voice Channel: ${raidVc.name}`)
                .appendLine();

            const locationField = new StringBuilder()
                .append("The current location is set to:")
                .append(`\`\`\`${details.location}\`\`\``)
                .appendLine()
                .append("To change this location, react to the 🟦 emoji.");
            tempControlPanelEmojis.push("🟦");

            const afkCheckField = new StringBuilder()
                .append("⇒ To __end__ the AFK check and formally start the raid, react to the 🔴 emoji.")
                .appendLine()
                .append("⇒ To __abort__ the AFK check, react to the ❌ emoji.");
            tempControlPanelEmojis.push("🔴", "❌");

            const tempControlPanelEmbed = new MessageEmbed()
                .setAuthor(`Control Panel: **${leaderName}'s Raid**`)
                .setTitle(`${leaderName}'s ${details.dungeon.dungeonName} AFK Check.`)
                .setDescription(controlPanelDesc)
                .addField("Location Management", locationField.toString())
                .addField("AFK Check Management", afkCheckField.toString());

            if (allKeys.some(x => x.maxEarlyLocation > 1)) {
                const keys = allKeys.map(x => OneRealmBot.BotInstance.client.emojis
                    .resolve(MappedReactions[x.mappingEmojiName].emojiId) as GuildEmoji);

                const keyField = new StringBuilder()
                    .append("You may choose to remove key emojis from the list of possible reactions shown on the ")
                    .append("AFK check. This will prevent people from being able to react to said key emojis. To")
                    .append("remove one or more key emojis, simply react to the corresponding key emojis here.")
                    .appendLine()
                    .append(`Key Emojis: ${keys.join(" ")}`);

                tempControlPanelEmbed.addField("Key Management", keyField);
                tempControlPanelEmojis.push(...keys);
            }

            return [tempControlPanelEmbed, tempControlPanelEmojis];
        };

        await raidVc.updateOverwrite(guild.roles.everyone, {
            CONNECT: null
        }).catch();

        const [afkCheckEmbed, afkCheckReactions] = createFormalAfkEmbed();
        await afkCheckMessage.edit("@here", {embed: afkCheckEmbed})
            .catch();
        AdvancedReactionCollector.reactFaster(afkCheckMessage, afkCheckReactions);

        const [controlPanelEmbed, controlPanelReactions] = createFormalControlPanelEmbed();
        const controlPanelMessage = await controlPanel.send({embed: controlPanelEmbed});
        AdvancedReactionCollector.reactFaster(controlPanelMessage, controlPanelReactions);

        // begin collectors
        const funcAfkCheck = (_: MessageReaction, u: User) => !u.bot;
        const funcControlPanel = (_: MessageReaction, u: User) => {
            const member = guild.member(u);
            if (member === null)
                return false;

            return member.voice.channelID === raidVc.id && ([
                    details.section.roles.leaders.sectionHeadLeaderRoleId,
                    details.section.roles.leaders.sectionRaidLeaderRoleId,
                    details.section.roles.leaders.sectionAlmostRaidLeaderRoleId,
                    guildDb.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId,
                    guildDb.roles.staffRoles.universalLeaderRoleIds.leaderRoleId,
                    guildDb.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId,
                ].some(x => member.roles.cache.has(x))
                || member.hasPermission("ADMINISTRATOR"));
        };
        const afkCheckCollector = afkCheckMessage.createReactionCollector(funcAfkCheck);
        const controlPanelCollector = controlPanelMessage.createReactionCollector(funcControlPanel);

        afkCheckCollector.on("collect", async (r: MessageReaction, u: User) => {
            const emojiDetails = dungeonReactions
                .find(x => MappedReactions[x.mappingEmojiName].emojiId === r.emoji.id);

            if (!emojiDetails || !earlyLocReacts.has(emojiDetails.mappingEmojiName as string))
                return;

            const reactInfo = earlyLocReacts.get(emojiDetails.mappingEmojiName as string);
            if (details.section.otherMajorConfig.afkCheckProperties.removeKeyReactsDuringAfk
                && MappedReactions[emojiDetails.mappingEmojiName].emojiType === "KEY")
                await r.users.remove(u).catch();

            // this will only hit if we no longer need said reaction.
            if (!reactInfo![1])
                return;

            const confirmation = await confirmReaction(u, emojiDetails);
            if (!confirmation)
                return;

            if (reactInfo![0].length + 1 >= emojiDetails.maxEarlyLocation) {
                // too many people
                return;
            }

            const newArr = reactInfo![0].concat(await guild.members.fetch(u));
            const needMorePeople = newArr.length < emojiDetails.maxEarlyLocation;
            earlyLocReacts.set(emojiDetails.mappingEmojiName as string, [newArr, needMorePeople]);

            if (!needMorePeople) {
                const idx = allKeys.findIndex(x => x.mappingEmojiName === emojiDetails.mappingEmojiName);
                if (idx !== -1)
                    allKeys.splice(idx, 1);

                await r.remove().catch();
            }


            await afkCheckMessage.edit({embed: createFormalAfkEmbed()[0]});
            await controlPanelMessage.edit({embed: createFormalControlPanelEmbed()[0]});
        });

        controlPanelCollector.on("collect", async (r: MessageReaction, u: User) => {
            // handle location
            if (r.emoji.name === "🟦") {

                return;
            }

            // afk check ended
            if (r.emoji.name === "🔴") {

                return;
            }

            // afk check aborted
            if (r.emoji.name === "❌") {

                return;
            }

            const keyIdx = allKeys
                .findIndex(x => MappedReactions[x.mappingEmojiName].emojiId === r.emoji.id);
            if (keyIdx === -1)
                return;

            allKeys.splice(keyIdx, 1);
            await r.remove().catch();
            // remove this emoji from the afk check.
            await afkCheckMessage.reactions.cache
                .find(x => x.emoji.id === MappedReactions[allKeys[keyIdx].mappingEmojiName].emojiId)?.remove();

            if (earlyLocReacts.has(allKeys[keyIdx].mappingEmojiName as string)) {
                const v = earlyLocReacts.get(allKeys[keyIdx].mappingEmojiName as string)!;
                earlyLocReacts.set(allKeys[keyIdx].mappingEmojiName as string, [v[0], false]);
            }

            await afkCheckMessage.edit({embed: createFormalAfkEmbed()[0]});
            await controlPanelMessage.edit({embed: createFormalControlPanelEmbed()[0]});
        });
    }

    export async function confirmReaction(user: User, emojiInfo: IReactionProps): Promise<boolean> {

        return true;
    }

    export async function endAfkCheck(guild: Guild, guildDb: IGuildInfo, details: IAfkCheckOptions) {

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
}