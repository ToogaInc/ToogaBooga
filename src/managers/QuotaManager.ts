// QuotaManager does NOT support the use of placeholder role values (for example, "RaidLeader").
// It only supports role IDs.

import {
    Collection,
    DMChannel,
    Guild,
    GuildMember,
    Message,
    MessageAttachment,
    MessageEmbed,
    MessageSelectMenu,
    TextBasedChannel,
    TextChannel
} from "discord.js";
import { QuotaLogType } from "../definitions/Types";
import { MongoManager } from "./MongoManager";
import { StringBuilder } from "../utilities/StringBuilder";
import { GuildFgrUtilities } from "../utilities/fetch-get-request/GuildFgrUtilities";
import { GlobalFgrUtilities } from "../utilities/fetch-get-request/GlobalFgrUtilities";
import { MessageUtilities } from "../utilities/MessageUtilities";
import { ArrayUtilities } from "../utilities/ArrayUtilities";
import { AdvancedCollector } from "../utilities/collectors/AdvancedCollector";
import { IGuildInfo, IQuotaInfo, IUserInfo } from "../definitions";
import { DUNGEON_DATA } from "../constants/dungeons/DungeonData";
import { TimeUtilities, TimestampType } from "../utilities/TimeUtilities";
import { StringUtil } from "../utilities/StringUtilities";
import { GeneralConstants } from "../constants/GeneralConstants";
import { DungeonUtilities } from "../utilities/DungeonUtilities";
import { MiscUtilities } from "../utilities/MiscUtilities";
import { EmojiConstants } from "../constants/EmojiConstants";
import { Logger } from "../utilities/Logger";
import { Bot } from "../Bot";
import { Filter, UpdateFilter } from "mongodb";

const LOGGER: Logger = new Logger(__filename, true);
export namespace QuotaManager {
    export const ALL_QUOTAS_KV: { [key: string]: string } = {
        "Parse": "Parse",
        "ManualVerify": "Manual Verify",
        "PunishmentIssued": "Punishment Issued",
        "NameAdjustment": "Name Add/Change/Remove",
        "ModmailRespond": "Respond to Modmail",
        "RunComplete": "Run Complete",
        "RunAssist": "Run Assist",
        "RunFailed": "Run Failed"
    };

    const ALL_QUOTA_LOG_TYPES: QuotaLogType[] = [
        "RunAssist",
        "RunComplete",
        "RunFailed",
        "Parse",
        "PunishmentIssued",
        "ManualVerify",
        "ModmailRespond",
        "NameAdjustment"
    ];

    // 1 day in ms
    const DEFAULT_CHECK_RESET = 24 * 60 * 60 * 1000;
    // 100 seconds to ignore small times that result from checking while the loop still goes on
    const IGNORE_RESET_TIME = 100_000;

    // Id to keep track of timeouts set so they don't eventually spam if the bot process isn't cleared
    export let quotaTimeoutId: NodeJS.Timeout | null = null;

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
        LOGGER.info(`Resetting quota for roleid ${MiscUtilities.getRoleName(roleId, guild)}`);

        try {
            const guildDoc = await MongoManager.getOrCreateGuildDoc(guild, true);
            if (!guildDoc) return false;

            const oldQuotas = guildDoc.quotas.quotaInfo.find(x => x.roleId === roleId);
            if (!oldQuotas) return false;

            const quotaChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(guild, oldQuotas.channel);

            // If channel is gone, remove the quota config and bail gracefully
            if (!quotaChannel) {
                await MongoManager.updateAndFetchGuildDoc(
                    { guildId: guild.id },
                    { $pull: { "quotas.quotaInfo": { roleId } } }
                );
                LOGGER.warn(`Quota channel missing; removed quota config for role ${roleId}`);
                return true;
            }

            const role = await GuildFgrUtilities.fetchRole(guild, roleId);

            // Build a “points per key” map (skip zero-point rules)
            const quotaLogMap = new Collection<string, number>();
            for (const { key, value } of oldQuotas.pointValues) {
                if (value !== 0) quotaLogMap.set(key, value);
            }

            // Aggregate user points (only members we actually see in cache)
            const quotaPointMap = new Collection<string, {
                points: number;
                quotaBreakdown: {
                    [quotaType: string]: { pts: number; qty: number; breakdown: string[] };
                };
            }>();

            if (role) {
                for (const [id] of role.members) {
                    quotaPointMap.set(id, { points: 0, quotaBreakdown: {} });
                }
            }

            for (const logInfo of oldQuotas.quotaLog) {
                if (!quotaPointMap.has(logInfo.userId)) {
                    quotaPointMap.set(logInfo.userId, { points: 0, quotaBreakdown: {} });
                }

                const baseRule = logInfo.logType.split(":")[0];
                let ruleToLog = logInfo.logType;
                if (quotaLogMap.has(baseRule)) ruleToLog = baseRule;

                if (!quotaLogMap.has(ruleToLog)) continue;

                const pts = quotaLogMap.get(ruleToLog)!;
                const pointLogEntry = quotaPointMap.get(logInfo.userId)!;

                pointLogEntry.points += pts * logInfo.amount;
                if (!pointLogEntry.quotaBreakdown[ruleToLog]) {
                    pointLogEntry.quotaBreakdown[ruleToLog] = {
                        qty: logInfo.amount,
                        pts: pts * logInfo.amount,
                        breakdown: [
                            `\t\t\t[${TimeUtilities.getDateTime(logInfo.timeIssued)}] Logged ${logInfo.amount} QTY.`
                        ]
                    };
                } else {
                    pointLogEntry.quotaBreakdown[ruleToLog].qty += logInfo.amount;
                    pointLogEntry.quotaBreakdown[ruleToLog].pts += pts * logInfo.amount;
                    pointLogEntry.quotaBreakdown[ruleToLog].breakdown.push(
                        `\t\t\t[${TimeUtilities.getDateTime(logInfo.timeIssued)}] Logged ${logInfo.amount} QTY.`
                    );
                }
            }

            // Build summary text (unchanged from your logic, just wrapped safely)
            const arrStrArr: string[] = [];
            const memberIds = Array.from(quotaPointMap.keys());
            const members = await Promise.all(memberIds.map(x => GuildFgrUtilities.fetchGuildMember(guild, x)));

            for (let i = 0; i < members.length; i++) {
                const logInfo = quotaPointMap.get(memberIds[i])!;
                const memberDisplay = members[i]?.displayName ?? memberIds[i];
                const status = logInfo.points >= oldQuotas.pointsNeeded
                    ? "Complete"
                    : logInfo.points > 0
                        ? "Incomplete"
                        : "Not Started";

                const sb = new StringBuilder()
                    .append(`- [${status}] ${memberDisplay}: ${logInfo.points}/${oldQuotas.pointsNeeded}`)
                    .appendLine()
                    .append(`\tUser Tag (ID): ${members[i]?.user.tag ?? "N/A"} (${memberIds[i]})`)
                    .appendLine()
                    .append(`\tRoles: [${members[i]?.roles.cache.map(x => x.name).join(", ") ?? ""}]`)
                    .appendLine()
                    .append("\tBreakdown:")
                    .appendLine();

                const entries = Object.entries(logInfo.quotaBreakdown);
                if (entries.length === 0) {
                    sb.append("\t\t- None Available.").appendLine();
                } else {
                    for (const [quotaType, { pts, qty, breakdown }] of entries) {
                        const logArr = quotaType.split(":");
                        if (logArr.length === 2) {
                            const dungeonName = (DungeonUtilities.isCustomDungeon(logArr[1])
                                ? guildDoc.properties.customDungeons.find(x => x.codeName === logArr[1])?.dungeonName
                                : DUNGEON_DATA.find(x => x.codeName === logArr[1])?.dungeonName) ?? logArr[1];

                            sb.append(`\t\t- ${logArr[0]} (${dungeonName}): ${pts} PTS (${qty})`)
                                .appendLine()
                                .append(breakdown.join("\n"))
                                .appendLine();
                        } else {
                            sb.append(`\t\t- ${quotaType}: ${pts} PTS (${qty})`)
                                .appendLine()
                                .append(breakdown.join("\n"))
                                .appendLine();
                        }
                    }
                }

                arrStrArr.push(sb.toString().trim());
            }

            const finalSummaryStr = new StringBuilder()
                .append("================= QUOTA SUMMARY =================").appendLine()
                .append(`- Role: ${MiscUtilities.getRoleName(oldQuotas.roleId, guild)}`)
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
            const fileName = (`quota_${guild.name.replaceAll(" ", "-")}_${MiscUtilities.getRoleName(roleId, guild).replaceAll(" ", "-")}_${Date.now()}.txt`);

            if (channelToUse) {
                const storageMsg = await GlobalFgrUtilities.sendMsg(
                    channelToUse,
                    {
                        files: [
                            new MessageAttachment(Buffer.from(finalSummaryStr, "utf8"), fileName)
                        ]
                    }
                ).catch(LOGGER.error);

                if (storageMsg) urlToFile = storageMsg.attachments.first()?.url ?? null;
            }

            const descSb = new StringBuilder()
                .append(`- Start Time: ${TimeUtilities.getDiscordTime({ time: oldQuotas.lastReset, style: TimestampType.FullDateNoDay })}`).appendLine()
                .append(`- End Time: ${TimeUtilities.getDiscordTime({ style: TimestampType.FullDateNoDay })}`).appendLine()
                .append(`- Members w/ Role: \`${role?.members.size ?? "N/A"}\``).appendLine()
                .append(`- Minimum Points Needed: \`${oldQuotas.pointsNeeded}\``).appendLine();
            if (!role) {
                descSb.append("- Warning: This role was not found; it might have been deleted. This role has been removed from the quota system.");
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
            } else {
                const fields = ArrayUtilities.arrayToStringFields(arrStrArr, (_, elem) => elem);
                for (const field of fields) {
                    summaryEmbed.addField(GeneralConstants.ZERO_WIDTH_SPACE, field);
                }
            }

            const quotaMsg = await GuildFgrUtilities.fetchMessage(quotaChannel, oldQuotas.messageId);
            if (quotaMsg) {
                await quotaMsg.edit({ embeds: [summaryEmbed] }).catch(LOGGER.error);
                await quotaMsg.unpin().catch(LOGGER.error);
            } else {
                await quotaChannel.send({ embeds: [summaryEmbed] }).catch(LOGGER.error);
            }

            // Finally, clear logs & upsert a fresh leaderboard message
            const startTime = new Date();

            if (role) {
                oldQuotas.quotaLog = [];
                oldQuotas.lastReset = startTime.getTime();

                const newMsg = await quotaChannel.send({
                    embeds: [(await getQuotaLeaderboardEmbed(guild, guildDoc, oldQuotas))!]
                }).catch(LOGGER.error);

                if (newMsg) {
                    await newMsg.pin().catch(LOGGER.error);
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
            } else {
                await MongoManager.updateAndFetchGuildDoc({ guildId: guild.id }, {
                    $pull: { "quotas.quotaInfo": { roleId } }
                });
            }

            return true;
        } catch (err) {
            LOGGER.error(`resetQuota failed for role ${roleId}: ${String(err)}`);
            return false;
        }
    }


    /**
     * Resets all quotas.
     * @param {Guild} guild The guild.
     */
    export async function resetAllQuota(guild: Guild): Promise<void> {
        LOGGER.info(`Resetting all quotas for guild ${guild.name}`);
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
        LOGGER.info(`Finding best quota to add ${logType} for ${member.displayName}`);
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

        if (availableQuotas.length === 0) {
            LOGGER.info(`No available quotas for ${member.displayName} to add ${resolvedLogType}.`);
            return null;
        }

        //bestQuotes stores the best quota from each section, including moderation
        let bestQuotas: IQuotaInfo[] = [];

        /* 
         * For each section, check if the leader's available quotas include leading roles from that section.
         * If so, only choose the quota for the highest role available for that section
         */
        const sections = MongoManager.getAllSections(guildDoc);
        sections.forEach(section => {

            let bestQuotaInSection: { quota: IQuotaInfo, rank: number } | undefined;
            const roleArr: { id: string, rank: number }[] = [];
            roleArr.push({ id: section.roles.leaders.sectionVetLeaderRoleId, rank: 3 });
            roleArr.push({ id: section.roles.leaders.sectionLeaderRoleId, rank: 2 });
            roleArr.push({ id: section.roles.leaders.sectionAlmostLeaderRoleId, rank: 1 });

            for (const leaderRole of roleArr) {
                const quota = availableQuotas.find(userRole => userRole.roleId === leaderRole.id);
                if (quota) {
                    if (!bestQuotaInSection || leaderRole.rank > bestQuotaInSection.rank) {
                        bestQuotaInSection = { quota, rank: leaderRole.rank };
                    }
                }
            }
            if (bestQuotaInSection) {
                bestQuotas.push(bestQuotaInSection.quota);
            }
        });

        //Run a pass for moderation quota
        const roleArr: { id: string, rank: number }[] = [];
        roleArr.push({ id: guildDoc.roles.staffRoles.moderation.moderatorRoleId, rank: 4 });
        roleArr.push({ id: guildDoc.roles.staffRoles.moderation.officerRoleId, rank: 3 });
        roleArr.push({ id: guildDoc.roles.staffRoles.moderation.securityRoleId, rank: 2 });
        roleArr.push({ id: guildDoc.roles.staffRoles.moderation.helperRoleId, rank: 1 });

        let bestQuotaInModeration: { quota: IQuotaInfo, rank: number } | undefined;

        for (const moderationRole of roleArr) {
            const quota = availableQuotas.find(userRole => userRole.roleId === moderationRole.id);
            if (quota) {
                if (!bestQuotaInModeration || moderationRole.rank > bestQuotaInModeration.rank) {
                    bestQuotaInModeration = { quota, rank: moderationRole.rank };
                }
            }
        }
        if (bestQuotaInModeration) {
            bestQuotas.push(bestQuotaInModeration.quota);
        }

        //If no best quotas were found, just use the available quotas
        if (!bestQuotas.length) {
            bestQuotas = availableQuotas;
        }

        //Of the best available quotas per section, pick the quota that is closest to completion
        const quotaData: QuotaMemberInfo[] = bestQuotas.map(quota => {
            const curPts = calcTotalQuotaPtsForMember(member.id, quota.roleId, guildDoc);
            return {
                roleId: quota.roleId,
                currentPoints: curPts,
                pointsNeeded: quota.pointsNeeded,
                percentComplete: curPts / quota.pointsNeeded
            };
        });

        quotaData.sort((a, b) => a.percentComplete - b.percentComplete);
        LOGGER.debug(`Selected ${MiscUtilities.getRoleName(quotaData[0].roleId, member.guild)}`);
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
        LOGGER.info(`Logging quota for ${member.displayName}, role: ${MiscUtilities.getRoleName(roleId, member.guild)}, type: ${logType}, amount: ${amt}`);
        const guildDoc = await MongoManager.updateAndFetchGuildDoc({
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
        if (!guildDoc) {
            LOGGER.error(`Couldn't update quota in the guild document for ${member.guild.name}`);
            return;
        }

        // Dispatch an event to edit quota embeds for the guild. We can re-use the guildDoc to not waste more calls
        const quotaInfo = guildDoc.quotas.quotaInfo.find(x => x.roleId === roleId);
        const newQuota = { member, roleId, logType, amt };
        Bot.BotInstance.client.emit("quotaEvent", quotaInfo, guildDoc, newQuota);
    }

    /**
     * Adds value to the user's quotaPoints
     * @param {GuildMember} member The member to log for.
     * @param {number} pts the number of poitns to add.
     * @returns {IUserInfo | null} the updated IUserInfo
     */
    export async function addQuotaPts(member: GuildMember, serverId: string, pts: number) {
        const userDoc = await MongoManager.getOrCreateUserDoc(member.id);
        const index = userDoc.details.quotaPoints.findIndex(x => x.key === serverId);

        let newPts = pts;
        let filterQuery: Filter<IUserInfo>;
        let updateQuery: UpdateFilter<IUserInfo>;

        if (index >= 0) {
            if (!isNaN(userDoc.details.quotaPoints[index]?.value)) {
                newPts += Number(userDoc.details.quotaPoints[index].value);
                if (newPts < 0) newPts = 0;
            }

            filterQuery = {
                discordId: member.id,
                "details.quotaPoints.key": serverId
            };
            updateQuery = {
                $set: {
                    "details.quotaPoints.$.value": newPts
                }
            };
        } else {
            if (newPts < 0) newPts = 0;
            filterQuery = { discordId: member.id };
            updateQuery = {
                $push: {
                    "details.quotaPoints": {
                        key: serverId,
                        value: newPts
                    }
                }
            };
        }


        LOGGER.info(`Adding ${pts} points to ${member.displayName} for a total of ${newPts}`);

        const returnDoc = await MongoManager.getUserCollection().findOneAndUpdate(
            filterQuery,
            updateQuery,
            { returnDocument: "after" }
        );

        return returnDoc?.value;
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

            if (l.logType.startsWith("Run")) {
                // See if we have RunComplete for all dungeons instead of specific dungeons
                const baseLogType = l.logType.split(":")[0];
                const quotaRule = quotaInfo.pointValues.find(x => x.key === baseLogType);
                if (quotaRule) {
                    ptsEarned += quotaRule.value * l.amount;
                    continue;
                }
            }

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
            const { key, value } = x;
            const logTypeDgnId = key.split(":");
            const logType = logTypeDgnId[0];
            if (key.startsWith("Run")) {
                if (logTypeDgnId.length === 1) {
                    return `- ${ALL_QUOTAS_KV[logType]} (All): ${value} PT`;
                }

                const dungeonName = DungeonUtilities.getDungeonInfo(logTypeDgnId[1], guildDoc)?.dungeonName;
                if (!dungeonName) {
                    return "";
                }

                return `- ${ALL_QUOTAS_KV[logType]} (${dungeonName}): ${value} PT`;
            }

            return `- ${ALL_QUOTAS_KV[key]}: ${value} PT`;
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
    export async function getQuotaLeaderboardEmbed(
        guild: Guild,
        guildDoc: IGuildInfo,
        quotaInfo: IQuotaInfo
    ): Promise<MessageEmbed | null> {
        LOGGER.debug(`Getting Quota Leaderboard Embed: ${MiscUtilities.getRoleName(quotaInfo.roleId, guild)}`);

        const role = GuildFgrUtilities.getCachedRole(guild, quotaInfo.roleId);
        if (!role)
            return null;

        const startTime = quotaInfo.lastReset;
        const { dayOfWeek, time } = guildDoc.quotas.resetTime;

        const quotaPtDisplay = getPointListAsString(guildDoc, quotaInfo);

        const baseDesc = new StringBuilder()
            .append(`- Start Time: ${TimeUtilities.getDiscordTime({ time: startTime, style: TimestampType.FullDateNoDay })}`).appendLine()
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
            .toString();

        const embed = MessageUtilities.generateBlankEmbed(guild, "RANDOM")
            .setTitle(`Active Quota: ${role.name}`)
            .setDescription(baseDesc)
            .setTimestamp();

        let timeLeftLabel: string | null = null;

        // Auto-reset mode
        if (dayOfWeek !== -1 && time !== -1) {
            const endTime = TimeUtilities.getNextDate(startTime, dayOfWeek, time);
            const endTimeDisplay = TimeUtilities.getDiscordTime({
                time: endTime.getTime(),
                style: TimestampType.FullDateNoDay
            });

            embed.setDescription(
                embed.description + `\n- End Time: ${endTimeDisplay}`
            );

            timeLeftLabel = `Quota period ends ${TimeUtilities.getDiscordTime({ time: endTime.getTime() })}`;
        }
        // Manual-only mode
        else {
            const panelEndTime = guildDoc.quotas.panelEndTime ?? null;
            
            if (panelEndTime) {
                const endDisplay = TimeUtilities.getDiscordTime({
                    time: panelEndTime,
                    style: TimestampType.FullDateNoDay
                });

                embed.setDescription(
                    embed.description + `\n- End Time: ${endDisplay}`
                );
            } else {
                embed.setDescription(
                    embed.description + "\n- End Time: Manual reset only"
                );
            }
        }


        // No logs: just show time left if applicable
        if (quotaInfo.quotaLog.length === 0) {
            if (timeLeftLabel) {
                embed.addField("**__Time left__**", timeLeftLabel);
            }
            return embed;
        }

        // Build leaderboard
        const points: [GuildMember | string, number][] = [];
        const memberIdSeen = new Set<string>();

        for (const { userId } of quotaInfo.quotaLog) {
            if (memberIdSeen.has(userId))
                continue;
            memberIdSeen.add(userId);

            const member = await GuildFgrUtilities.fetchGuildMember(guild, userId);
            if (member && member.roles.cache.has(role.id)) {
                points.push([member, calcTotalQuotaPtsForMember(userId, role.id, guildDoc)]);
            }
        }

        const leaderboard = ArrayUtilities.generateLeaderboardArray(points, p => p[1]);

        const fields = ArrayUtilities.arrayToStringFields(
            leaderboard,
            (_, elem) => {
                const [rank, [member, amt]] = elem;
                const displayMember = typeof member === "string"
                    ? `ID ${member}`
                    : member.displayName;

                const emojiStr = amt >= quotaInfo.pointsNeeded ? EmojiConstants.GREEN_CHECK_EMOJI : "";
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

        if (timeLeftLabel) {
            embed.addField("**__Time left__**", timeLeftLabel);
        }

        return embed;
    }


    /**
     * Sends or edits an existing quota leaderboard with the most recent leaderboard
     * @param {string | null} messageId The existing message to check. If null, a new message will always be sent 
     * @param {IQuotaInfo} quotaInfo Quota info to retrieve associated info for
     * @param {IGuildInfo} guildDoc Guild Doc
     * @returns {Promise<string>} The message id
     */
    export async function upsertLeaderboardMessage(messageId: string | null, quotaInfo: IQuotaInfo, guildDoc: IGuildInfo): Promise<string> {
        // Check if the leaderboard already exists
        const channel = GlobalFgrUtilities.getCachedChannel<TextBasedChannel>(quotaInfo.channel);
        if (!channel) {
            const guild = GlobalFgrUtilities.getCachedGuild(guildDoc.guildId);
            LOGGER.error(`Could not find a suitable channel to upsert leaderboard in ${guild?.name} (${guildDoc.guildId})`);
            return "0";
        }

        const guild = GlobalFgrUtilities.getCachedGuild(guildDoc.guildId) as Guild; // We must know the guild exists if there is a channel
        const quotaEmbed = await getQuotaLeaderboardEmbed(guild, guildDoc, quotaInfo) as MessageEmbed; // By proxy, we can only update a quota that exists
        const role = GuildFgrUtilities.getCachedRole(guild, quotaInfo.roleId);

        LOGGER.info(`Attempting to update quota for ${role?.name} in ${guild}`);

        // Asserting just to avoid duplicating code, null id will return falsy
        let message = await GuildFgrUtilities.fetchMessage(channel, messageId!);
        if (!message) {
            try {
                message = await GlobalFgrUtilities.sendMsg(channel, { embeds: [quotaEmbed] });
                if (!message) {
                    LOGGER.error(`Couldn't send a message in ${guildDoc.guildId}`);
                    return "0";
                }

                await message?.pin();
            } catch {
                return "0";
            }
        } else {
            await message.edit({ embeds: [quotaEmbed] }).catch(() => LOGGER.error(`Couldn't edit a message in ${guildDoc.guildId}`));
        }

        if (message.id !== messageId) {
            await MongoManager.updateAndFetchGuildDoc({
                guildId: guildDoc.guildId,
                "quotas.quotaInfo.roleId": quotaInfo.roleId
            }, {
                $set: {
                    "quotas.quotaInfo.$.messageId": message.id
                }
            });
        }

        return message.id;
    }

    /**
     * Iterates through all quotas and checks if they should be reset.
     * On restart the bot will iterate through again and find the lowest timeout.
     */
    export async function checkForReset() {
        const guildDocs = await MongoManager.getGuildCollection().find().toArray();

        let nextReset = DEFAULT_CHECK_RESET;
        let hasAutoResetGuild = false;

        for (const guildDoc of guildDocs) {
            const guild = GlobalFgrUtilities.getCachedGuild(guildDoc.guildId);
            if (!guild) continue;

            const { dayOfWeek, time } = guildDoc.quotas.resetTime;

            // Manual-only mode: update embeds if you want, but don't schedule resets
            if (dayOfWeek === -1 || time === -1) {
                for (const quotaInfo of guildDoc.quotas.quotaInfo) {
                    await upsertLeaderboardMessage(quotaInfo.messageId, quotaInfo, guildDoc);
                }
                continue;
            }

            hasAutoResetGuild = true;

            for (const quotaInfo of guildDoc.quotas.quotaInfo) {
                const endTime = TimeUtilities.getNextDate(
                    quotaInfo.lastReset,
                    dayOfWeek,
                    time
                );

                const diff = endTime.getTime() - Date.now();

                if (diff > IGNORE_RESET_TIME && diff < nextReset) {
                    nextReset = diff;
                    LOGGER.info(`Found a more suitable end time: ${TimeUtilities.formatDuration(nextReset, false)}`);
                } else if (diff < 0) {

                    const role = await GuildFgrUtilities.fetchRole(guild, quotaInfo.roleId);
                    LOGGER.info(`Reset quota for ${role?.name} in ${guild.name}`);
                    await QuotaManager.resetQuota(guild, quotaInfo.roleId);
                } else {

                    await upsertLeaderboardMessage(quotaInfo.messageId, quotaInfo, guildDoc);
                }
            }
        }

        // If no guild has auto reset configured, stop scheduling.
        if (!hasAutoResetGuild) {
            LOGGER.info("No auto quota resets configured. Auto reset timer cleared.");
            if (quotaTimeoutId) {
                clearTimeout(quotaTimeoutId);
                quotaTimeoutId = null;
            }
            return;
        }

        if (nextReset === DEFAULT_CHECK_RESET) {
            LOGGER.info("Could not find a new time to check for quota resets. Defaulting to 1 day.");
        }

        quotaTimeoutId = setTimeout(checkForReset, nextReset);
    }


}