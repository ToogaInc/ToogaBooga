// QuotaManager does NOT support the use of placeholder role values (for example, "RaidLeader").
// It only supports role IDs.

import {
    Collection,
    DMChannel,
    Guild,
    GuildMember,
    Message,
    MessageAttachment,
    MessageSelectMenu,
    TextChannel
} from "discord.js";
import {QuotaLogType} from "../definitions/Types";
import {MongoManager} from "./MongoManager";
import {StringBuilder} from "../utilities/StringBuilder";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {GlobalFgrUtilities} from "../utilities/fetch-get-request/GlobalFgrUtilities";
import {MessageUtilities} from "../utilities/MessageUtilities";
import {MiscUtilities} from "../utilities/MiscUtilities";
import {ArrayUtilities} from "../utilities/ArrayUtilities";
import {AdvancedCollector} from "../utilities/collectors/AdvancedCollector";
import {IGuildInfo} from "../definitions";
import {DUNGEON_DATA} from "../constants/DungeonData";

export namespace QuotaManager {
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
        const quotaMsg = await GuildFgrUtilities.fetchMessage(quotaChannel, oldQuotas.messageId);
        // Only care about quota actions worth points
        const quotaLogMap = new Collection<string, number>();
        for (const {key, value} of oldQuotas.pointValue) {
            if (value === 0) continue;
            quotaLogMap.set(key, value);
        }

        // Sort all data into a map for easier use
        // key = user ID
        const quotaPointMap = new Collection<string, {
            points: number;
            quotaBreakdown: {
                [quotaType: string]: number;
            };
        }>();

        for (const logInfo of oldQuotas.quotaLog) {
            if (!quotaLogMap.has(logInfo.logType)) continue;

            const points = quotaLogMap.get(logInfo.logType)!;
            const pointLogEntry = quotaPointMap.get(logInfo.userId);

            if (pointLogEntry) {
                pointLogEntry.points += points;
                if (!pointLogEntry.quotaBreakdown[logInfo.logType]) {
                    pointLogEntry.quotaBreakdown[logInfo.logType] = 1;
                    continue;
                }

                pointLogEntry.quotaBreakdown[logInfo.logType]++;
                continue;
            }

            quotaPointMap.set(logInfo.userId, {
                points: points,
                quotaBreakdown: {
                    [logInfo.logType]: 1
                }
            });
        }

        // Process it so it can be put in a text file
        const arrStrArr: string[] = [];
        const memberIds = Array.from(quotaPointMap.keys());
        const members = await Promise.all(memberIds.map(async x => await GuildFgrUtilities.fetchGuildMember(guild, x)));
        for (let i = 0; i < members.length; i++) {
            const logInfo = quotaPointMap.get(memberIds[i])!;
            const memberDisplay = members[i]?.displayName ?? memberIds[i];
            const status = logInfo.points >= oldQuotas.pointsNeeded
                ? "Complete   "
                : logInfo.points > 0
                    ? "Incomplete "
                    : "Not Started";
            const sb = new StringBuilder()
                .append(`- [${status}] ${memberDisplay}: ${logInfo.points}/${oldQuotas.pointsNeeded}`)
                .appendLine()
                .append(`\tUser Tag (ID): ${members[i]?.user.tag ?? "N/A"} (${memberIds[i]})`)
                .appendLine()
                .append(`\tRoles: ${members[i]?.roles.cache.map(x => x.name).join(", ") ?? "N/A"}`)
                .appendLine()
                .append(`\tBreakdown:`);
            const entries = Object.entries(logInfo.quotaBreakdown);
            if (entries.length === 0) {
                sb.append("\t\t- None Available.")
                    .appendLine();
            }
            else {
                for (const [quotaType, num] of entries) {
                    // Need to look into quota types like `RunComplete:DUNGEON_ID` or `Parse`.
                    const logArr = quotaType.split(":");
                    if (logArr.length === 2) {
                        // We assume the second element is the dungeon ID.
                        // Get the dungeon name
                        let dungeonName: string = logArr[1];
                        // Begin by looking for any custom dungeons.
                        const overrideDgn = guildDoc.properties.customDungeons.find(x => x.codeName === logArr[1]);
                        if (overrideDgn)
                            dungeonName = overrideDgn.dungeonName;
                        else {
                            // Next, look for the general dungeon
                            const dgnData = DUNGEON_DATA.find(x => x.codeName === logArr[1]);
                            if (dgnData)
                                dungeonName = dgnData.dungeonName;
                        }

                        sb.append(`\t\t- ${logArr[0]} (${dungeonName}): ${num}`)
                            .appendLine();
                        continue;
                    }

                    sb.append(`\t\t- ${quotaType}: ${num}`)
                        .appendLine();
                }
            }

            arrStrArr.push(sb.toString().trim());
        }

        const storageChannel = await MongoManager.getStorageChannel(guild);
        const channelToUse = storageChannel ? storageChannel : quotaChannel;
        let urlToFile: string | null = null;
        if (channelToUse) {
            const storageMsg = await GlobalFgrUtilities.sendMsg(
                channelToUse,
                {
                    files: [
                        new MessageAttachment(Buffer.from(arrStrArr.join("\n"), "utf8"),
                            `quota_${guild.id}_${roleId}_${Date.now()}.txt`)
                    ]
                }
            ).catch();

            if (storageMsg)
                urlToFile = storageMsg.attachments.first()!.url;
        }

        const descSb = new StringBuilder()
            .append(`- Start Time: ${MiscUtilities.getTime(oldQuotas.lastReset)} UTC`).appendLine()
            .append(`- End Time: ${MiscUtilities.getTime(Date.now())} UTC`).appendLine()
            .append(`- Members w/ Role: ${role?.members.size ?? "N/A"}`).appendLine();
        if (!role) {
            descSb.append("- Warning: This role was not found; it might have been deleted. This role has been ")
                .append("removed from the quota system.");
        }

        const summaryEmbed = MessageUtilities.generateBlankEmbed(guild, "RANDOM")
            .setTitle(`Quota Summary: **${role?.name ?? "ID " + roleId}**`)
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
            ).slice(24);
            for (const field of fields) {
                summaryEmbed.addField("", field);
            }
        }

        if (quotaMsg)
            await quotaMsg.edit({embeds: [summaryEmbed]});
        else
            await quotaChannel.send({embeds: [summaryEmbed]});

        if (role) {
            const newMsg: Message = await quotaChannel.send({
                embeds: [
                    MessageUtilities.generateBlankEmbed(guild, "RANDOM")
                        .setTitle(`Quota: ${role.name}`)
                        .setDescription(descSb.toString())
                        .setTimestamp()
                        .setFooter("Last Updated:")
                ]
            });

            await MongoManager.updateAndFetchGuildDoc({
                guildId: guild.id,
                "quotas.quotaInfo.roleId": roleId
            }, {
                $set: {
                    "quotas.quotaInfo.$.quotaLog": [],
                    "quotas.quotaInfo.$.lastReset": Date.now(),
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
            // Inefficient, might need to find better way to do this
            ptsEarned += quotaInfo.pointValue.find(x => x.key === l.logType)?.value ?? 0;
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

            return (x.pointValue.find(y => y.key === resolvedLogType)?.value ?? 0) > 0
                && member.roles.cache.has(role?.id ?? "");
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
                const ptsCanEarn = choice.pointValue.find(x => x.key === resolvedLogType);
                if (!ptsCanEarn)
                    continue;

                const ptsEarned = calcTotalQuotaPtsForMember(member.id, choice.roleId, doc);

                selectMenu.addOptions({
                    label: role.name,
                    description: `${ptsEarned}/${choice.pointValue} PTS. Possible PTS: ${ptsCanEarn.value * amt}.`,
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
}

// Service that updates quota leaderboards every 5 minutes
export namespace QuotaService {

}