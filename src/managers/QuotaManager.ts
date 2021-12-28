// QuotaManager does NOT support the use of placeholder role values (for example, "RaidLeader").
// It only supports role IDs.

import {
    Collection,
    DMChannel,
    Guild,
    GuildMember,
    Message,
    MessageAttachment, MessageEmbed,
    MessageSelectMenu,
    TextChannel
} from "discord.js";
import {QuotaLogType} from "../definitions/Types";
import {MongoManager} from "./MongoManager";
import {StringBuilder} from "../utilities/StringBuilder";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {GlobalFgrUtilities} from "../utilities/fetch-get-request/GlobalFgrUtilities";
import {MessageUtilities} from "../utilities/MessageUtilities";
import {ArrayUtilities} from "../utilities/ArrayUtilities";
import {AdvancedCollector} from "../utilities/collectors/AdvancedCollector";
import {IGuildInfo, IQuotaInfo} from "../definitions";
import {DUNGEON_DATA} from "../constants/DungeonData";
import {TimeUtilities} from "../utilities/TimeUtilities";
import {StringUtil} from "../utilities/StringUtilities";
import {GeneralConstants} from "../constants/GeneralConstants";
import {DungeonUtilities} from "../utilities/DungeonUtilities";
import {Emojis} from "../constants/Emojis";

export namespace QuotaManager {
    const ALL_QUOTA_LOG_TYPES: QuotaLogType[] = [
        "RunAssist",
        "RunComplete",
        "RunFailed",
        "Parse",
        "PunishmentIssued",
        "ManualVerify"
    ];

    /**
     * Checks if the string is of some quota type.
     * @param {string} str The string to test.
     * @return {boolean} Whether the string is a quota type.
     */
    export function isQuotaLog(str: string): str is QuotaLogType {
        if ((ALL_QUOTA_LOG_TYPES as string[]).includes(str))
            return true;

        if (!str.startsWith("RunAssist")
            && !str.startsWith("RunComplete")
            && !str.startsWith("RunFailed"))
            return false;

        return str.split(":").length === 2;
    }

    /**
     * Resets the quota for a particular role ID. This will
     * - Send a message containing a summary of quotas.
     * - Reset the quota leaderboard
     *
     * @param {Guild} guild The guild.
     * @param {string} roleId The role ID to reset.
     * @returns {Promise<boolean>} Whether this was successful.
     */
    export async function resetQuota(guild: Guild, roleId: string): Promise<boolean> {
        const guildDoc = await MongoManager.getOrCreateGuildDoc(guild, true);
        if (!guildDoc)
            return false;

        const oldQuotas = guildDoc.quotas.quotaInfo.find(x => x.roleId === roleId);
        if (!oldQuotas)
            return false;

        // No channel = pull from database since we can't update it
        const quotaChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(guild, oldQuotas.channel);
        if (!quotaChannel) {
            await MongoManager.updateAndFetchGuildDoc({guildId: guild.id}, {
                $pull: {
                    "quotas.quotaInfo.roleId": roleId
                }
            });
            return false;
        }

        const role = await GuildFgrUtilities.fetchRole(guild, roleId);
        // TODO this seems like a very poor idea on my part
        await guild.members.fetch();
        const quotaMsg = await GuildFgrUtilities.fetchMessage(quotaChannel, oldQuotas.messageId);
        // Only care about quota actions worth points
        const quotaLogMap = new Collection<string, number>();
        for (const {key, value} of oldQuotas.pointValues) {
            if (value === 0) continue;
            quotaLogMap.set(key, value);
        }

        // Sort all data into a map for easier use
        // key = user ID
        const quotaPointMap = new Collection<string, {
            points: number;
            quotaBreakdown: {
                [quotaType: string]: { pts: number; qty: number; breakdown: string[] };
            };
        }>();

        if (role) {
            for (const [id,] of role.members) {
                quotaPointMap.set(id, {
                    points: 0,
                    quotaBreakdown: {}
                });
            }
        }

        for (const logInfo of oldQuotas.quotaLog) {
            if (!quotaPointMap.has(logInfo.userId)) {
                quotaPointMap.set(logInfo.userId, {
                    points: 0,
                    quotaBreakdown: {}
                });
            }

            if (!quotaLogMap.has(logInfo.logType)) continue;

            const points = quotaLogMap.get(logInfo.logType)!;
            const pointLogEntry = quotaPointMap.get(logInfo.userId)!;

            pointLogEntry.points += points * logInfo.amount;
            if (!pointLogEntry.quotaBreakdown[logInfo.logType]) {
                pointLogEntry.quotaBreakdown[logInfo.logType] = {
                    qty: logInfo.amount,
                    pts: points * logInfo.amount,
                    breakdown: [
                        `\t\t\t[${TimeUtilities.getDateTime(logInfo.timeIssued)}] Logged ${logInfo.amount} QTY.`
                    ]
                };
                continue;
            }

            pointLogEntry.quotaBreakdown[logInfo.logType].qty += logInfo.amount;
            pointLogEntry.quotaBreakdown[logInfo.logType].pts += points * logInfo.amount;
            pointLogEntry.quotaBreakdown[logInfo.logType].breakdown.push(
                `\t\t\t[${TimeUtilities.getDateTime(logInfo.timeIssued)}] Logged ${logInfo.amount} QTY.`
            );
        }

        // Process it so it can be put in a text file
        const arrStrArr: string[] = [];
        const memberIds = Array.from(quotaPointMap.keys());
        const members = await Promise.all(memberIds.map(x => GuildFgrUtilities.fetchGuildMember(guild, x)));
        for (let i = 0; i < members.length; i++) {
            const logInfo = quotaPointMap.get(memberIds[i])!;
            const memberDisplay = members[i]?.displayName ?? memberIds[i];
            const status = logInfo.points >= oldQuotas.pointsNeeded
                ? " Complete  "
                : logInfo.points > 0
                    ? "Incomplete "
                    : "Not Started";
            const sb = new StringBuilder()
                .append(`- [${status}] ${memberDisplay}: ${logInfo.points}/${oldQuotas.pointsNeeded}`)
                .appendLine()
                .append(`\tUser Tag (ID): ${members[i]?.user.tag ?? "N/A"} (${memberIds[i]})`)
                .appendLine()
                .append(`\tRoles: [${members[i]?.roles.cache.map(x => x.name).join(", ") ?? ""}]`)
                .appendLine()
                .append(`\tBreakdown:`)
                .appendLine();
            const entries = Object.entries(logInfo.quotaBreakdown);
            if (entries.length === 0) {
                sb.append("\t\t- None Available.")
                    .appendLine();
            }
            else {
                for (const [quotaType, {pts, qty, breakdown}] of entries) {
                    // Need to look into quota types like `RunComplete:DUNGEON_ID` or `Parse`.
                    const logArr = quotaType.split(":");
                    if (logArr.length === 2) {
                        // We assume the second element is the dungeon ID.
                        // Get the dungeon name
                        const dungeonName = (DungeonUtilities.isCustomDungeon(logArr[1])
                            ? guildDoc.properties.customDungeons.find(x => x.codeName === logArr[1])?.dungeonName
                            : DUNGEON_DATA.find(x => x.codeName === logArr[1])?.dungeonName) ?? logArr[1];

                        sb.append(`\t\t- ${logArr[0]} (${dungeonName}): ${pts} PTS (${qty})`)
                            .appendLine()
                            .append(breakdown.join("\n"))
                            .appendLine();
                        continue;
                    }

                    sb.append(`\t\t- ${quotaType}: ${pts} PTS (${qty})`)
                        .append(breakdown.join("\n"))
                        .appendLine();
                }
            }

            arrStrArr.push(sb.toString().trim());
        }

        // If there's nothing to update, then we don't need to send inactive quota
        const finalSummaryStr = new StringBuilder()
            .append("================= QUOTA SUMMARY =================").appendLine()
            .append(`- Start Time: ${TimeUtilities.getDateTime(oldQuotas.lastReset)} GMT`).appendLine()
            .append(`- End Time: ${TimeUtilities.getDateTime(Date.now())} GMT`).appendLine()
            .append(`- Members w/ Role: ${role?.members.size ?? "N/A"}`).appendLine()
            .append(`- Minimum Points Needed: ${oldQuotas.pointsNeeded}`).appendLine(2)
            .append("================= POINT SUMMARY =================").appendLine()
            .append(getPointListAsString(guildDoc, oldQuotas)).appendLine(2)
            .append("================= MEMBER SUMMARY =================").appendLine()
            .append(arrStrArr.join("\n"))
            .toString();
        const storageChannel = await MongoManager.getStorageChannel(guild);
        const channelToUse = storageChannel ? storageChannel : quotaChannel;
        let urlToFile: string | null = null;
        if (channelToUse) {
            const storageMsg = await GlobalFgrUtilities.sendMsg(
                channelToUse,
                {
                    files: [
                        new MessageAttachment(Buffer.from(finalSummaryStr, "utf8"),
                            `quota_${guild.id}_${roleId}_${Date.now()}.txt`)
                    ]
                }
            ).catch();

            if (storageMsg)
                urlToFile = storageMsg.attachments.first()!.url;
        }

        const descSb = new StringBuilder()
            .append(`- Start Time: \`${TimeUtilities.getDateTime(oldQuotas.lastReset)} GMT\``).appendLine()
            .append(`- End Time: \`${TimeUtilities.getDateTime(Date.now())} GMT\``).appendLine()
            .append(`- Members w/ Role: \`${role?.members.size ?? "N/A"}\``).appendLine()
            .append(`- Minimum Points Needed: \`${oldQuotas.pointsNeeded}\``).appendLine();
        if (!role) {
            descSb.append("- Warning: This role was not found; it might have been deleted. This role has been ")
                .append("removed from the quota system.");
        }

        const summaryEmbed = MessageUtilities.generateBlankEmbed(guild, "RANDOM")
            .setTitle(`Inactive Quota - Summary: **${role?.name ?? "ID " + roleId}**`)
            .setDescription(descSb.toString())
            .setTimestamp();
        if (urlToFile) {
            summaryEmbed.addField(
                "Summary",
                `Click [here](${urlToFile}) to get this quota period's summary. This will download a file.`
            );
        }
        else {
            const fields = ArrayUtilities.arrayToStringFields(
                arrStrArr,
                (_, elem) => elem
            );
            for (const field of fields) {
                summaryEmbed.addField(GeneralConstants.ZERO_WIDTH_SPACE, field);
            }
        }

        if (quotaMsg) {
            await quotaMsg.edit({embeds: [summaryEmbed]});
            quotaMsg.unpin().catch();
        }
        else
            await quotaChannel.send({embeds: [summaryEmbed]});


        const startTime = new Date();
        const endTime = TimeUtilities.getNextDate(
            startTime,
            guildDoc.quotas.resetTime.dayOfWeek,
            guildDoc.quotas.resetTime.time
        );
        const timeLeft = TimeUtilities.formatDuration(endTime.getTime() - startTime.getTime());

        if (role) {
            oldQuotas.quotaLog = [];
            oldQuotas.lastReset = startTime.getTime();
            const newMsg: Message = await quotaChannel.send({
                embeds: [
                    (await getQuotaLeaderboardEmbed(guild, guildDoc, oldQuotas))!
                ]
            });

            newMsg.pin().catch();

            await MongoManager.updateAndFetchGuildDoc({
                guildId: guild.id,
                "quotas.quotaInfo.roleId": roleId
            }, {
                $set: {
                    "quotas.quotaInfo.$.quotaLog": [],
                    "quotas.quotaInfo.$.lastReset": startTime.getTime(),
                    "quotas.quotaInfo.$.messageId": newMsg.id
                }
            });
        }
        else {
            await MongoManager.updateAndFetchGuildDoc({guildId: guild.id}, {
                $pull: {
                    "quotas.quotaInfo.roleId": roleId
                }
            });
        }

        return true;
    }

    /**
     * Resets all quotas.
     * @param {Guild} guild The guild.
     */
    export async function resetAllQuota(guild: Guild): Promise<void> {
        const doc = await MongoManager.getOrCreateGuildDoc(guild.id, true);
        await Promise.all(doc.quotas.quotaInfo.map(async x => resetQuota(guild, x.roleId)));
    }

    type QuotaMemberInfo = {
        roleId: string;
        pointsNeeded: number;
        currentPoints: number;
        percentComplete: number;
    };

    /**
     * Finds the best possible quota for this person to log data in.
     * @param {GuildMember} member The member.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {string} logType The log type. If you are logging a run completion, failure, or assist, DO NOT include
     * the dungeon ID.
     * @param {string} [dungeonId] The dungeon ID, if any. This is required if `logType` pertains to a dungeon type.
     * @return {string | null} The best role ID corresponding to the quota to log, if any. `null` otherwise.
     */
    export function findBestQuotaToAdd(member: GuildMember, guildDoc: IGuildInfo, logType: QuotaLogType,
                                       dungeonId?: string): string | null {
        let resolvedLogType: string = logType;
        if (logType === "RunAssist" || logType === "RunComplete" || logType === "RunFailed") {
            if (!dungeonId) return null;
            resolvedLogType = `${logType}:${dungeonId}`;
        }

        const availableQuotas = guildDoc.quotas.quotaInfo.filter(x => {
            return GuildFgrUtilities.memberHasCachedRole(member, x.roleId)
                && x.pointsNeeded > 0
                // RunAssist, RunComplete, and RunFailed will either be one of:
                // - Run_____:DUNGEON_ID            For specific dungeon(s)
                // - Run_____                       For all dungeons (i.e. no ID specifier).
                && (x.pointValues.find(y => y.key === resolvedLogType || y.key === logType)?.value ?? 0) > 0;
        });

        if (availableQuotas.length === 0)
            return null;

        const quotaData: QuotaMemberInfo[] = availableQuotas.map(x => {
            const curPts = calcTotalQuotaPtsForMember(member.id, x.roleId, guildDoc);
            return {
                roleId: x.roleId,
                currentPoints: curPts,
                pointsNeeded: x.pointsNeeded,
                percentComplete: curPts / x.pointsNeeded
            };
        });

        quotaData.sort((a, b) => a.percentComplete - b.percentComplete);
        return quotaData[0].roleId;
    }

    /**
     * Logs a quota event for a person.
     * @param {GuildMember} member The member to log for.
     * @param {string} roleId The role ID for the quota.
     * @param {QuotaLogType} logType The quota type.
     * @param {number} amt The amount of said action to log.
     */
    export async function logQuota(member: GuildMember, roleId: string, logType: string,
                                   amt: number): Promise<void> {
        await MongoManager.updateAndFetchGuildDoc({
            guildId: member.guild.id,
            "quotas.quotaInfo.roleId": roleId
        }, {
            $push: {
                "quotas.quotaInfo.$.quotaLog": {
                    userId: member.id,
                    logType: logType,
                    amount: amt,
                    timeIssued: Date.now()
                }
            }
        });
    }

    /**
     * Calculates the amount of quota points the member has.
     * @param {string} memberId The member.
     * @param {string} roleId The role.
     * @param {IGuildInfo} guildDoc The guild document.
     * @returns {number} The number of points.
     */
    export function calcTotalQuotaPtsForMember(memberId: string, roleId: string, guildDoc: IGuildInfo): number {
        const quotaInfo = guildDoc.quotas.quotaInfo.find(x => x.roleId === roleId);
        if (!quotaInfo) return 0;

        let ptsEarned = 0;
        for (const l of quotaInfo.quotaLog) {
            if (l.userId !== memberId) {
                continue;
            }

            // Inefficient, might need to find better way to do this
            ptsEarned += (quotaInfo.pointValues.find(x => x.key === l.logType)?.value ?? 0) * l.amount;
        }

        return ptsEarned;
    }

    /**
     * Logs a quota event for a person. This function should be used when the role that should be used is unknown.
     * @param {Message | GuildMember} obj The guild message that led to this. If you would rather deal with a guild
     * member, use a guild member. The only difference is how the bot will send the message (to a channel or DM).
     * @param {QuotaLogType} logType The quota type.
     * @param {number} amt The amount of said action to log.
     * @param {string} [dungeonId] The dungeon ID. This must be specified if we're logging dungeon completions,
     * assists, or failures.
     */
    export async function logQuotaInteractive(obj: Message | GuildMember, logType: QuotaLogType,
                                              amt: number, dungeonId?: string): Promise<boolean> {
        let resolvedLogType: string = logType;
        if (logType === "RunAssist" || logType === "RunComplete" || logType === "RunFailed") {
            if (!dungeonId) return false;
            resolvedLogType = `${logType}:${dungeonId}`;
        }

        const member = "member" in obj ? obj.member! : obj;
        let channel: TextChannel | DMChannel | null;
        if ("channel" in obj)
            channel = obj.channel as TextChannel;
        else
            channel = await GlobalFgrUtilities.openDirectMessage(obj.user);

        const guild = obj.guild!;
        const doc = await MongoManager.getOrCreateGuildDoc(guild.id, true);
        if (doc.quotas.quotaInfo.length === 0) return false;

        let possibleChoices = doc.quotas.quotaInfo.filter(x => {
            const role = GuildFgrUtilities.resolveMainCachedGuildRoles(guild, doc, x.roleId);

            return (x.pointValues.find(y => y.key === resolvedLogType || y.key === logType)?.value ?? 0) > 0
                && GuildFgrUtilities.memberHasCachedRole(member, role?.id ?? "");
        });

        if (possibleChoices.length === 0)
            return false;

        if (possibleChoices.length === 1) {
            await QuotaManager.logQuota(member, possibleChoices[0].roleId, resolvedLogType, amt);
            return true;
        }

        // If there's more than 1 choice, then let's see which choices may need the quotas.
        const lowestPoints: [string, number] = ["", Number.MAX_SAFE_INTEGER];
        const canAddChoices = [];
        for (const choice of possibleChoices) {
            const ptsEarned = calcTotalQuotaPtsForMember(member.id, choice.roleId, doc);

            if (ptsEarned >= choice.pointsNeeded)
                continue;

            if (ptsEarned < lowestPoints[1]) {
                lowestPoints[1] = ptsEarned;
                lowestPoints[0] = choice.roleId;
            }

            canAddChoices.push(choice);
        }
        // Two conditions.
        // - If this is 0, then we just let the person choose as if nothing happened
        // - Otherwise, break it down
        if (canAddChoices.length > 0) {
            if (canAddChoices.length === 1) {
                await QuotaManager.logQuota(member, canAddChoices[0].roleId, resolvedLogType, amt);
                return true;
            }

            // At this point, we can just re-evaluate `possibleChoices`
            possibleChoices = canAddChoices;
        }

        // Use a try block in case we can't send messages.
        if (channel) {
            // Ask what role to use.
            const selectMenu = new MessageSelectMenu()
                .setMaxValues(1)
                .setMinValues(1)
                .addOptions({
                    label: "Cancel",
                    description: "Select this if you don't want to log this.",
                    value: "cancel"
                });
            for await (const choice of possibleChoices) {
                const role = await GuildFgrUtilities.fetchMainGuildRole(guild, doc, choice.roleId);
                if (!role)
                    continue;

                // If this particular log type doesn't give you points, then don't show it.
                const ptsCanEarn = choice.pointValues.find(x => x.key === resolvedLogType);
                if (!ptsCanEarn)
                    continue;

                const ptsEarned = calcTotalQuotaPtsForMember(member.id, choice.roleId, doc);

                selectMenu.addOptions({
                    label: role.name,
                    description: `${ptsEarned}/${choice.pointsNeeded} PTS. Possible PTS: ${ptsCanEarn.value * amt}.`,
                    value: choice.roleId
                });
            }

            try {
                // TODO resolve dungeon name here.
                const questionMsg = await member.send({
                    embeds: [
                        MessageUtilities.generateBlankEmbed(member, "RANDOM")
                            .setTitle("Select Quota Logging Type")
                            .setDescription(
                                new StringBuilder()
                                    .append(`You are logging: ${amt} ${resolvedLogType}.`)
                                    .appendLine(2)
                                    .append("You can use the above log type to satisfy one of many quotas. Please ")
                                    .append("select the quota that you want to use this for. If you don't want to ")
                                    .append("log this, choose the **Cancel** choice.")
                                    .toString()
                            )
                            .setTimestamp()
                    ],
                    components: AdvancedCollector.getActionRowsFromComponents([selectMenu])
                });

                const res = await AdvancedCollector.startInteractionCollector({
                    targetChannel: channel,
                    targetAuthor: member,
                    acknowledgeImmediately: true,
                    deleteBaseMsgAfterComplete: true,
                    duration: 60 * 1000,
                    oldMsg: questionMsg,
                    clearInteractionsAfterComplete: false
                });

                if (!res || !res.isSelectMenu() || res.values[0] === "cancel")
                    return false;

                await QuotaManager.logQuota(member, res.values[0], resolvedLogType, amt);
                return true;
            } catch (_) {
                // If it falls to the catch block, then keep going
            }
        }

        // Otherwise, pick the first one and use that.
        await QuotaManager.logQuota(member, lowestPoints[0], resolvedLogType, amt);
        return true;
    }

    /**
     * Gets the points that you can earn for a particular quota in a listed string format.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {IQuotaInfo} quotaInfo The quota to get point information for.
     * @returns {string} The listed string format containing all points.
     */
    export function getPointListAsString(guildDoc: IGuildInfo, quotaInfo: IQuotaInfo): string {
        return quotaInfo.pointValues.map(x => {
            const {key, value} = x;
            const logTypeDgnId = key.split(":");
            const logType = logTypeDgnId[0];
            if (key.startsWith("Run")) {
                if (logTypeDgnId.length === 1) {
                    return `- ${GeneralConstants.ALL_QUOTAS_KV[logType]} (All): ${value} PT`;
                }

                const dungeonName = DungeonUtilities.getDungeonInfo(logTypeDgnId[1], guildDoc)?.dungeonName;
                if (!dungeonName) {
                    return "";
                }

                return `${GeneralConstants.ALL_QUOTAS_KV[logType]} (${dungeonName}): ${value} PT`;
            }

            return `${GeneralConstants.ALL_QUOTAS_KV[key]}: ${value} PT`;
        }).filter(x => x).join("\n");
    }

    /**
     * Generates a leaderboard embed for the specified quota.
     * @param {Guild} guild The guild.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {IQuotaInfo} quotaInfo The quota for which the leaderboard should be made for.
     * @returns {Promise<MessageEmbed | null>} The embed, if any. `null` only if the role corresponding to the quota
     * could not be found.
     */
    export async function getQuotaLeaderboardEmbed(guild: Guild, guildDoc: IGuildInfo,
                                                   quotaInfo: IQuotaInfo): Promise<MessageEmbed | null> {
        const role = GuildFgrUtilities.getCachedRole(guild, quotaInfo.roleId);
        if (!role)
            return null;

        const startTime = quotaInfo.lastReset;
        const endTime = TimeUtilities.getNextDate(
            quotaInfo.lastReset,
            guildDoc.quotas.resetTime.dayOfWeek,
            guildDoc.quotas.resetTime.time
        );
        const timeLeft = TimeUtilities.formatDuration(endTime.getTime() - Date.now(), false);

        const quotaPtDisplay = getPointListAsString(guildDoc, quotaInfo);
        const embed = MessageUtilities.generateBlankEmbed(guild, "RANDOM")
            .setTitle(`Active Quota: ${role.name}`)
            .setDescription(
                new StringBuilder()
                    .append(`- Start Time: \`${TimeUtilities.getDateTime(startTime)} GMT\``).appendLine()
                    .append(`- End Time: \`${TimeUtilities.getDateTime(endTime)} GMT\``).appendLine()
                    .append(`- Members w/ Role: \`${role.members.size}\``).appendLine()
                    .append(`- Minimum Points Needed: \`${quotaInfo.pointsNeeded}\``).appendLine()
                    .append("__**Point Values**__")
                    .append(
                        StringUtil.codifyString(
                            quotaPtDisplay.length === 0
                                ? "N/A"
                                : quotaPtDisplay
                        )
                    )
                    .append("__**Time Left**__")
                    .append(StringUtil.codifyString(timeLeft))
                    .toString()
            )
            .setTimestamp()
            .setFooter("Leaderboard Updated Every 30 Seconds. Last Updated:");

        if (quotaInfo.quotaLog.length === 0)
            return embed;

        const points: [GuildMember | string, number][] = [];
        const memberIdSeen = new Set<string>();
        for (const {userId} of quotaInfo.quotaLog) {
            if (memberIdSeen.has(userId))
                continue;
            memberIdSeen.add(userId);
            const member = await GuildFgrUtilities.fetchGuildMember(guild, userId);
            points.push([member ?? userId, calcTotalQuotaPtsForMember(userId, role.id, guildDoc)]);
        }

        const leaderboard = ArrayUtilities.generateLeaderboardArray(
            points,
            p => p[1]
        );

        const fields = ArrayUtilities.arrayToStringFields(
            leaderboard,
            (_, elem) => {
                const [rank, [member, amt]] = elem;
                const displayMember = typeof member === "string"
                    ? `ID ${member}`
                    : member.displayName;

                const emojiStr = amt >= quotaInfo.pointsNeeded ? Emojis.GREEN_CHECK_EMOJI : "";
                return `[${rank}] ${displayMember} - ${amt} PTS ${emojiStr}\n`;
            },
            1000
        );

        let initialAdded = false;
        for (const field of fields) {
            embed.addField(
                initialAdded ? GeneralConstants.ZERO_WIDTH_SPACE : "Leaderboard",
                StringUtil.codifyString(field)
            );
            initialAdded = true;
        }

        return embed;
    }
}

// Service that updates quota leaderboards every 5 minutes
export namespace QuotaService {
    let _isRunning = false;

    /**
     * Starts the quota service. When started, the bot will update all quotas every 5 minutes.
     */
    export async function startService(): Promise<void> {
        if (_isRunning) return;

        const docs = await MongoManager.getGuildCollection().find().toArray();
        if (docs.length > 0) {
            const allQuotasToReset: Promise<boolean>[] = [];
            for (const doc of docs) {
                const guild = await GlobalFgrUtilities.fetchGuild(doc.guildId);
                if (!guild)
                    continue;

                doc.quotas.quotaInfo.filter(quotaInfo => {
                    const endTime = TimeUtilities.getNextDate(
                        quotaInfo.lastReset,
                        doc.quotas.resetTime.dayOfWeek,
                        doc.quotas.resetTime.time
                    );

                    return endTime.getTime() - Date.now() < 0;
                }).forEach(quotasToReset => {
                    allQuotasToReset.push(QuotaManager.resetQuota(guild, quotasToReset.roleId));
                });

                await Promise.all(allQuotasToReset);
            }
        }

        _isRunning = true;
        run().then();
    }

    /**
     * Stops the quota service.
     */
    export function stopService(): void {
        if (!_isRunning) return;
        _isRunning = false;
    }

    /**
     * Runs tbe quota service once. This updates all active quotas across all guilds.
     * @private
     */
    async function run(): Promise<void> {
        const allGuildDocs = await MongoManager.getGuildCollection().find().toArray();
        for await (const guildDoc of allGuildDocs) {
            if (guildDoc.quotas.quotaInfo.length === 0)
                continue;

            const guild = await GlobalFgrUtilities.fetchGuild(guildDoc.guildId);
            if (!guild)
                continue;

            for (const quotaInfo of guildDoc.quotas.quotaInfo) {
                const quotaChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(guild, quotaInfo.channel);
                const role = await GuildFgrUtilities.fetchRole(guild, quotaInfo.roleId);

                if (!role || !quotaChannel)
                    continue;

                const quotaMsg = await GuildFgrUtilities.fetchMessage(quotaChannel, quotaInfo.messageId);
                if (!quotaMsg) {
                    const newMsg: Message = await quotaChannel.send({
                        embeds: [
                            (await QuotaManager.getQuotaLeaderboardEmbed(guild, guildDoc, quotaInfo))!
                        ]
                    });

                    newMsg.pin().catch();

                    await MongoManager.updateAndFetchGuildDoc({
                        guildId: guild.id,
                        "quotas.quotaInfo.roleId": role.id
                    }, {
                        $set: {
                            "quotas.quotaInfo.$.messageId": newMsg.id
                        }
                    });

                    continue;
                }

                await quotaMsg.edit({
                    embeds: [
                        (await QuotaManager.getQuotaLeaderboardEmbed(guild, guildDoc, quotaInfo))!
                    ]
                });
            }
        }

        setTimeout(run, 30 * 1000);
    }
}