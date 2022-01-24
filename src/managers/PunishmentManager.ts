import {Collection, Guild, GuildChannel, GuildMember, TextChannel} from "discord.js";
import {IGuildInfo, IMutedUser, IPunishmentHistoryEntry, ISectionInfo, ISuspendedUser, IUserInfo} from "../definitions";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {GlobalFgrUtilities} from "../utilities/fetch-get-request/GlobalFgrUtilities";
import {MongoManager} from "./MongoManager";
import {StringUtil} from "../utilities/StringUtilities";
import {StringBuilder} from "../utilities/StringBuilder";
import {AllModLogType, MainOnlyModLogType, SectionModLogType} from "../definitions/Types";
import {Filter} from "mongodb";
import {Queue} from "../utilities/Queue";
import {TimeUtilities} from "../utilities/TimeUtilities";
import {MessageUtilities} from "../utilities/MessageUtilities";

interface IPunishmentCommandResult {
    /**
     * Whether the punishment was either added (for example, suspended role added + logged in guild database) or removed
     * (for example, suspended role removed + removed from guild database).
     *
     * @type {boolean}
     */
    punishmentResolved: boolean;

    /**
     * Whether the punishment was logged successfully in the user's database document.
     *
     * @type {boolean}
     */
    punishmentLogged: boolean;

    /**
     * The moderation ID associated with this action. This will be `null` if `punishmentLogged` is `null`.
     *
     * @type {string | null}
     */
    moderationId: string | null;
}

interface IPunishmentDetails {
    /**
     * The reason for the punishment (or removal of said punishment).
     *
     * @type {string}
     */
    reason: string;

    /**
     * The duration of the punishment, in milliseconds.
     *
     * @type {number}
     */
    duration?: number;

    /**
     * The time this punishment (or removal of it) was issued.
     *
     * @type {number}
     */
    issuedTime: number;

    /**
     * The time this punishment will expire.
     *
     * @type {number}
     */
    expiresAt?: number;

    /**
     * The moderator responsible for this punishment (or removal of it). `null` means automatic.
     *
     * @type {GuildMember | null}
     */
    moderator: GuildMember | null;

    /**
     * The guild document.
     *
     * @type {IGuildInfo}
     */
    guildDoc: IGuildInfo;

    /**
     * The section information.
     *
     * @type {ISectionInfo}
     */
    section: ISectionInfo;

    /**
     * The guild object.
     *
     * @type {Guild}
     */
    guild: Guild;

    /**
     * Whether to send a notice to the user. If this is `false`, the user won't be notified of the punishment.
     *
     * @type {boolean}
     */
    sendNoticeToAffectedUser: boolean;

    /**
     * Whether to send a log message indicating that a punishment (or removal of) was done.
     *
     * @type {boolean}
     */
    sendLogInfo: boolean;

    /**
     * The action ID to resolve. The corresponding punishment entry in the user document will be edited to show that
     * the punishment has been resolved. This must be specified if you're going to resolve a punishment.
     *
     *
     * @type {string}
     */
    actionIdToResolve?: string;

    /**
     * The action ID to use. This must be specified if you're logging a punishment but don't want a new action ID to be
     * created. If this isn't specified, then an ID will be created.
     *
     * @type {string}
     */
    actionIdToUse?: string;

    /**
     * The evidence for this punishment.
     *
     * @type {string[]}
     */
    evidence: string[];
}

interface IAdditionalPunishmentParams {
    /**
     * The duration, in milliseconds.
     *
     * @type {number}
     */
    duration: number;

    /**
     * The guild document.
     *
     * @type {IGuildInfo}
     */
    guildDoc: IGuildInfo;

    /**
     * The section where this punishment will occur.
     *
     * @type {ISectionInfo}
     */
    section: ISectionInfo;

    /**
     * The reason for this punishment.
     *
     * @type {string}
     */
    reason: string;

    /**
     * The action ID to look up.
     *
     * @type {string}
     */
    actionId?: string;

    /**
     * Whether to notify the user. If not specified, this defaults to `true`.
     *
     * @type {boolean}
     */
    notifyUser?: boolean;

    /**
     * Whether to send a log message. If not specified, this defaults to `true`.
     *
     * @type {boolean}
     */
    sendLogMsg?: boolean;

    /**
     * The evidence.
     *
     * @type {string}
     */
    evidence: string[];
}

const AUTOMATIC: string = "Automatic";

export namespace PunishmentManager {
    /**
     * Acknowledges a punishment. Sends the appropriate log message to the logging channel, sends a message to the
     * user, and saves the punishment information into the user's document. You will need to handle the punishment
     * information for the guild document.
     * @param {GuildMember | object} member The member who is receiving a punishment or getting a punishment
     * removed. For blacklists, simply provide the `name` in an object.
     * @param {AllModLogType} punishmentType The punishment type.
     * @param {IPunishmentDetails} details The details.
     * @returns {Promise<string | null>} The moderation ID associated with this punishment, if any.
     */
    export async function logPunishment(
        member: GuildMember | { name: string; },
        punishmentType: AllModLogType,
        details: IPunishmentDetails
    ): Promise<string | null> {
        let logChannel: TextChannel | null;
        let resolvedModType: MainOnlyModLogType | SectionModLogType | null;

        const isAddingPunishment = !punishmentType.includes("Un");
        // If we're resolving a punishment AND the action ID to resolve is not specified, then we can't do anything.
        if (!isAddingPunishment && !details.actionIdToResolve)
            return null;

        let actionId = details.actionIdToUse;
        if (!actionId) {
            actionId = `${punishmentType}_${Date.now()}_${StringUtil.generateRandomString(15)}`;
        }

        const mainSection = MongoManager.getMainSection(details.guildDoc);

        // Find the appropriate logging channel.
        // Note that SectionSuspend/SectionUnsuspend is the only log type that can be customized on a per-section basis.
        switch (punishmentType) {
            case "Blacklist":
            case "Unblacklist":
                logChannel = getLoggingChannel(details.guild, details.guildDoc, mainSection, "Blacklist");
                resolvedModType = "Blacklist";
                break;
            case "ModmailBlacklist":
            case "ModmailUnblacklist":
                logChannel = getLoggingChannel(details.guild, details.guildDoc, mainSection, "ModmailBlacklist");
                resolvedModType = "ModmailBlacklist";
                break;
            case "SectionSuspend":
            case "SectionUnsuspend":
                logChannel = getLoggingChannel(details.guild, details.guildDoc, details.section, "SectionSuspend");
                resolvedModType = "SectionSuspend";
                break;
            case "Mute":
            case "Unmute":
                logChannel = getLoggingChannel(details.guild, details.guildDoc, mainSection, "Mute");
                resolvedModType = "Mute";
                break;
            case "Suspend":
            case "Unsuspend":
                logChannel = getLoggingChannel(details.guild, details.guildDoc, mainSection, "Suspend");
                resolvedModType = "Suspend";
                break;
            case "Warn":
            case "Unwarn":
                logChannel = getLoggingChannel(details.guild, details.guildDoc, mainSection, "Warn");
                resolvedModType = "Warn";
                break;
            default:
                logChannel = null;
                resolvedModType = null;
                break;
        }

        if (!resolvedModType)
            return null;

        // Now prepare logging message and database entry
        const entry: IPunishmentHistoryEntry = {
            guildId: details.guild.id,
            moderationType: resolvedModType,
            affectedUser: {
                name: "name" in member ? member.name : member.displayName,
                id: "id" in member ? member.id : "",
                tag: "user" in member ? member.user.tag : ""
            },
            moderator: {
                id: details.moderator?.id ?? AUTOMATIC,
                tag: details.moderator?.user.tag ?? "",
                name: details.moderator?.displayName ?? ""
            },
            issuedAt: details.issuedTime,
            expiresAt: details.expiresAt ?? -1,
            duration: details.duration ?? -1,
            reason: details.reason,
            actionId: actionId,
            evidence: details.evidence
        };

        const modStr = new StringBuilder()
            .append(`- Moderator Mention: ${details.moderator ?? AUTOMATIC} (${details.moderator?.id ?? "N/A"})`)
            .appendLine()
            .append(`- Moderator Tag: ${details.moderator?.user.tag ?? "N/A"}`)
            .appendLine()
            .append(`- Moderator Name: ${details.moderator?.displayName ?? "N/A"}`)
            .toString();

        const durationStr = new StringBuilder()
            .append(`- Duration: ${entry.duration! === -1 ? "N/A" : TimeUtilities.formatDuration(entry.duration!)}`)
            .appendLine()
            .append(`- Ends At: ${entry.expiresAt! === -1 ? "N/A" : `${TimeUtilities.getDateTime(entry.expiresAt!)} GMT`}`)
            .toString();

        const logToChanEmbed = MessageUtilities.generateBlankEmbed(details.guild, isAddingPunishment ? "RED" : "GREEN")
            .addField("Moderator", modStr)
            .addField("Reason", StringUtil.codifyString(entry.reason))
            .setTimestamp()
            .setFooter({
                text: `Mod. ID: ${entry.actionId}`
            });

        const toSendToUserEmbed = MessageUtilities.generateBlankEmbed(details.guild, isAddingPunishment ? "RED" : "GREEN")
            .addField("Moderator", modStr)
            .addField("Reason", StringUtil.codifyString(entry.reason))
            .setTimestamp()
            .setFooter({
                text: `Mod. ID: ${entry.actionId}`
            });

        if (!isAddingPunishment) {
            logToChanEmbed.addField(
                "Resolving Moderation ID",
                StringUtil.codifyString(details.actionIdToResolve ?? "N/A")
            );
            toSendToUserEmbed.addField(
                "Resolving Moderation ID",
                StringUtil.codifyString(details.actionIdToResolve ?? "N/A")
            );
        }

        switch (punishmentType) {
            case "Warn": {
                if (!("id" in member))
                    return null;

                // Logging
                logToChanEmbed
                    .setTitle("Warning Issued.")
                    .setDescription(new StringBuilder()
                        .append(`⇒ Member Warned: ${entry.affectedUser.name}`)
                        .appendLine()
                        .append(`⇒ Member Mention: ${member} (${member.id})`)
                        .toString());

                // To send to member
                toSendToUserEmbed
                    .setTitle("Warning.")
                    .setDescription(`You have been warned in **${details.guild.name}**.`);
                break;
            }
            case "Unwarn": {
                if (!("id" in member))
                    return null;

                // Logging
                logToChanEmbed
                    .setTitle("Warning Removed.")
                    .setDescription(new StringBuilder()
                        .append(`⇒ Member Affected: ${entry.affectedUser.name}`)
                        .appendLine()
                        .append(`⇒ Member Mention: ${member} (${member.id})`)
                        .toString());
                break;
            }
            case "Blacklist": {
                // Logging
                const descSb = new StringBuilder()
                    .append(`⇒ Blacklisted Name: \`${entry.affectedUser.name}\``)
                    .appendLine();
                if (member instanceof GuildMember) {
                    descSb.append(`⇒ Member: ${member} (${member.id})`)
                        .appendLine();
                }

                logToChanEmbed.setTitle("__Server__ Blacklisted.")
                    .setDescription(descSb.toString());

                // To send to member
                toSendToUserEmbed
                    .setTitle("Server Blacklisted.")
                    .setDescription(`You have been blacklisted from **${details.guild.name}**.`);

                break;
            }
            case "Unblacklist": {
                // Logging
                logToChanEmbed.setTitle("__Server__ Blacklist Removed.")
                    .setDescription(new StringBuilder()
                        .append(`⇒ Unblacklisted Name: ${entry.affectedUser.name}`)
                        .toString());

                break;
            }
            case "Suspend": {
                if (!("id" in member))
                    return null;

                // Logging
                logToChanEmbed
                    .setTitle("__Server__ Suspended.")
                    .setDescription(new StringBuilder()
                        .append(`⇒ Member Suspended: ${entry.affectedUser.name}`)
                        .appendLine()
                        .append(`⇒ Member Mention: ${member} (${member.id})`)
                        .toString())
                    .addField("Suspension Time", durationStr);

                // To send to member
                toSendToUserEmbed
                    .setTitle("Suspended.")
                    .setDescription(`You have been suspended from **${details.guild.name}**.`)
                    .addField("Suspension Time", durationStr);
                break;
            }
            case "Unsuspend": {
                if (!("id" in member))
                    return null;

                // Logging
                logToChanEmbed
                    .setTitle("__Server__ Suspension Removed.")
                    .setDescription(new StringBuilder()
                        .append(`⇒ Member Unsuspended: ${entry.affectedUser.name}`)
                        .appendLine()
                        .append(`⇒ Member Mention: ${member} (${member.id})`)
                        .toString());

                // To send to member
                toSendToUserEmbed
                    .setTitle("Server Suspension Removed.")
                    .setDescription(`You have been unsuspended from **${details.guild.name}**.`);
                break;
            }
            case "SectionSuspend": {
                if (!("id" in member))
                    return null;

                // Logging
                logToChanEmbed
                    .setTitle(`${details.section.sectionName}: __Section__ Suspended.`)
                    .setDescription(new StringBuilder()
                        .append(`⇒ Member Suspended: ${entry.affectedUser.name}`)
                        .appendLine()
                        .append(`⇒ Member Mention: ${member} (${member.id})`)
                        .appendLine()
                        .append(`⇒ Suspended From: ${details.section.sectionName}`)
                        .toString())
                    .addField("Suspension Time", durationStr);

                // To send to member
                toSendToUserEmbed
                    .setTitle("Section Suspended.")
                    .setDescription(new StringBuilder()
                        .append(`You have been suspended from the **${details.section.sectionName}** section in the `)
                        .append(`server, **${details.guild.name}**.`)
                        .toString())
                    .addField("Suspension Time", durationStr);
                break;
            }
            case "SectionUnsuspend": {
                if (!("id" in member))
                    return null;

                // Logging
                logToChanEmbed
                    .setTitle("__Section__ Suspension Removed.")
                    .setDescription(new StringBuilder()
                        .append(`⇒ Member Unsuspended: ${entry.affectedUser.name}`)
                        .appendLine()
                        .append(`⇒ Member Mention: ${member} (${member.id})`)
                        .appendLine()
                        .append(`⇒ Unsuspended From: ${details.section.sectionName}`)
                        .toString());

                // To send to member
                toSendToUserEmbed
                    .setTitle("Section Suspension Removed.")
                    .setDescription(new StringBuilder()
                        .append(`You have been unsuspended from the **${details.section.sectionName}** section in the `)
                        .append(`server, **${details.guild.name}**.`)
                        .toString());
                break;
            }
            case "ModmailBlacklist": {
                if (!("id" in member))
                    return null;

                // Logging
                logToChanEmbed
                    .setTitle(`Modmail Blacklisted.`)
                    .setDescription(`⇒ Modmail Blacklisted: ${member} (${member.id})`);

                // To send to member
                toSendToUserEmbed
                    .setTitle("Modmail Blacklisted.")
                    .setDescription(`You have been blacklisted from sending modmail in **${details.guild.name}**.`);
                break;
            }
            case "ModmailUnblacklist": {
                if (!("id" in member))
                    return null;

                // Logging
                logToChanEmbed
                    .setTitle(`Modmail Blacklisted Removed.`)
                    .setDescription(`⇒ Modmail Unblacklisted: ${member} (${member.id})`);

                // To send to member
                toSendToUserEmbed
                    .setTitle("Modmail Blacklist Removed.")
                    .setDescription(`Your modmail blacklist in **${details.guild.name}** has been removed.`);
                break;
            }
            case "Mute": {
                if (!("id" in member))
                    return null;

                // Logging
                logToChanEmbed
                    .setTitle(`Server Muted.`)
                    .setDescription(`⇒ Member Muted: ${member} (${member.id})`)
                    .addField("Mute Time", durationStr);

                // To send to member
                toSendToUserEmbed
                    .setTitle("Server Muted.")
                    .setDescription(`You have been server muted in **${details.guild.name}**.`)
                    .addField("Mute Time", durationStr);
                break;
            }
            case "Unmute": {
                if (!("id" in member))
                    return null;

                // Logging
                logToChanEmbed
                    .setTitle(`Server Mute Removed.`)
                    .setDescription(`⇒ Member Unmuted: ${member} (${member.id})`);

                // To send to member
                toSendToUserEmbed
                    .setTitle("Server Mute Removed.")
                    .setDescription(`You have been server unmuted in **${details.guild.name}**.`);
                break;
            }
            default: {
                break;
            }
        }

        async function sendLoggingAndNoticeMsg(): Promise<void> {
            // Do we really need to check if there is a description here specifically?
            if (details.sendLogInfo && logChannel && logToChanEmbed.description) {
                await logChannel.send({embeds: [logToChanEmbed]}).catch();
            }

            // These must have a description or else the default arm was reached.
            if (details.sendNoticeToAffectedUser && toSendToUserEmbed.description && member instanceof GuildMember) {
                await GlobalFgrUtilities.sendMsg(member, {embeds: [toSendToUserEmbed]}).catch();
            }
        }

        // Update the user database if possible.
        let idToResolve: string;
        if (isAddingPunishment) {
            const filterQuery: Filter<IUserInfo> = {
                $or: []
            };

            // This is only true for blacklists or unblacklists. Everything else is expected to have the member object.
            if ("name" in member) {
                const nameRes = await MongoManager.findNameInIdNameCollection(member.name);
                if (nameRes.length === 0)
                    return null;

                filterQuery.$or?.push({
                    discordId: nameRes[0].currentDiscordId
                });

                idToResolve = nameRes[0].currentDiscordId;

                // For logging purposes
                if (nameRes.length > 1)
                    console.info(`[name] ${member.name} has multiple documents in IDName Collection.`);
            }
            else {
                const idRes = await MongoManager.findIdInIdNameCollection(member.id);
                if (idRes.length === 0) {
                    const t = await MongoManager.addIdNameToIdNameCollection(member);
                    if (!t) return null;
                }

                if (idRes.length > 1)
                    console.info(`[id] ${member.id} has multiple documents in IDName Collection.`);

                filterQuery.$or?.push({
                    discordId: member.id
                });

                idToResolve = member.id;
            }

            if ((filterQuery.$or?.length ?? 0) === 0)
                return null;

            await MongoManager.getOrCreateUserDoc(idToResolve);
            const queryResult = await MongoManager.getUserCollection().updateOne(filterQuery, {
                $push: {
                    "details.moderationHistory": entry
                }
            });

            if (queryResult.modifiedCount > 0) {
                await sendLoggingAndNoticeMsg();
                return entry.actionId;
            }

            // If no modifications were made, then we assume that this person has never verified w/ bot.
            // This should only hit when the person has NEVER verified with this bot.
            if (punishmentType !== "Blacklist")
                return null;

            const addRes = await MongoManager.getUnclaimedBlacklistCollection().insertOne(entry);

            const doc = await MongoManager.getUnclaimedBlacklistCollection().findOne({_id: addRes.insertedId});
            if (doc) {
                await sendLoggingAndNoticeMsg();
                return doc.actionId;
            }

            return null;
        }
        else {
            delete entry.expiresAt;
            delete entry.duration;
            const queryResult = await MongoManager.getUserCollection().updateOne({
                "details.moderationHistory.actionId": details.actionIdToResolve
            }, {
                $set: {
                    "details.moderationHistory.$.resolved": entry
                }
            });

            if (queryResult.modifiedCount > 0) {
                await sendLoggingAndNoticeMsg();
                return entry.actionId;
            }

            if (punishmentType !== "Unblacklist")
                return null;

            // This should only hit when the person has NEVER verified with this bot.
            const res = await MongoManager.getUnclaimedBlacklistCollection().updateOne({
                actionId: details.actionIdToResolve
            }, {
                $set: {
                    resolved: entry
                }
            });

            if (res.modifiedCount > 0) {
                await sendLoggingAndNoticeMsg();
                return entry.actionId;
            }

            return null;
        }
    }

    /**
     * Gets the appropriate logging channel.
     * @param {Guild} guild The guild.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section.
     * @param {MainOnlyModLogType | SectionModLogType} punishmentType The punishment type.
     * @returns {TextChannel | null} The channel, if any.
     * @private
     */
    function getLoggingChannel(guild: Guild, guildDoc: IGuildInfo, section: ISectionInfo,
                               punishmentType: MainOnlyModLogType | SectionModLogType): TextChannel | null {
        const id = section.isMainSection
            ? guildDoc.channels.loggingChannels.find(x => x.key === punishmentType)
            : section.channels.loggingChannels.find(x => x.key === punishmentType);
        if (!id) return null;
        return GuildFgrUtilities.getCachedChannel<TextChannel>(guild, id.value);
    }
}

export namespace SuspensionManager {
    // key = guild ID, value = collection of member IDs, suspension info
    export const SuspendedMembers = new Collection<string, Collection<string, ISuspendedUser>>();
    // key = Guild ID, value = collection | key = Section ID, value = Array of all suspended people.
    export const SectionSuspendedMembers = new Collection<string, Collection<string, ISuspendedUser[]>>();

    // For deletion purposes. Instead of removing the elements in a for... of loop, we queue the following entries
    // for removal. The next time the `startChecker` function is called, we can immediately remove the entries.
    const _queuedDelSuspendedMembers = new Queue<ISuspendedUser & { guildId: string; }>();
    const _queuedDelSectionSuspendedMembers = new Queue<ISuspendedUser & { guildId: string; sectionId: string; }>();
    const _queuedDelSectionIds = new Queue<{ guildId: string; sectionId: string; }>();


    let _isRunning = false;

    /**
     * Starts the SuspensionManager checker.
     * @param {IGuildInfo[]} [documents] The guild documents. If this is specified, then all previous suspensions
     * will be loaded. This is ideal when the bot just started up (say, from a restart).
     */
    export async function startChecker(documents: IGuildInfo[] = []): Promise<void> {
        if (_isRunning) return;
        _isRunning = true;

        if (documents.length > 0) {
            for await (const guildDoc of documents) {
                const serverSus = new Collection<string, ISuspendedUser>();
                const guild = await GlobalFgrUtilities.fetchGuild(guildDoc.guildId);
                if (!guild) continue;

                // GUILD SUSPENSIONS
                for await (const suspendedUser of guildDoc.moderation.suspendedUsers) {
                    if (suspendedUser.timeEnd === -1)
                        continue;

                    serverSus.set(suspendedUser.affectedUser.id, suspendedUser);
                }

                // SECTION SUSPENSIONS
                const sectionSus = new Collection<string, ISuspendedUser[]>();
                for (const section of guildDoc.guildSections) {
                    sectionSus.set(
                        section.uniqueIdentifier,
                        section.moderation.sectionSuspended
                            .filter(x => x.timeEnd !== -1)
                    );
                }

                SectionSuspendedMembers.set(guild.id, sectionSus);
                SuspendedMembers.set(guild.id, serverSus);
            } // End of loop
        }

        suspensionChecker().then();
    }

    /**
     * Stops the SuspensionManager checker.
     */
    export function stopChecker(): void {
        if (!_isRunning) return;
        _isRunning = false;
    }

    /**
     * The SuspensionManager checker service. This should only be called by the `startChecker` function.
     * @private
     */
    async function suspensionChecker(): Promise<void> {
        if (!_isRunning) return;

        // Remove all elements before checking.
        while (_queuedDelSuspendedMembers.size() > 0) {
            const dequeuedElem = _queuedDelSuspendedMembers.dequeue();
            SuspendedMembers.get(dequeuedElem.guildId)?.delete(dequeuedElem.affectedUser.id);
        }

        while (_queuedDelSectionSuspendedMembers.size() > 0) {
            const dequeuedElem = _queuedDelSectionSuspendedMembers.dequeue();
            const allSusUsersInSec = SectionSuspendedMembers.get(dequeuedElem.guildId)?.get(dequeuedElem.sectionId);
            if (!allSusUsersInSec)
                continue;

            for (const susSecInfo of allSusUsersInSec) {
                allSusUsersInSec.splice(
                    allSusUsersInSec.findIndex(x => x.actionId === susSecInfo.actionId),
                    1
                );
            }
        }

        while (_queuedDelSectionIds.size() > 0) {
            const {guildId, sectionId} = _queuedDelSectionIds.dequeue();
            SectionSuspendedMembers.get(guildId)?.delete(sectionId);
        }

        // Section suspended
        // Go through every guild that we need to process
        const allGuildsSecSus = await Promise.all(
            Array.from(SectionSuspendedMembers.keys()).map(async x => await GlobalFgrUtilities.fetchGuild(x))
        );

        for await (const guild of allGuildsSecSus) {
            // Make sure guild + guild document exists.
            if (!guild) continue;

            const guildDoc = MongoManager.CachedGuildCollection.get(guild.id);
            if (!guildDoc) continue;

            const sectionSuspensions = SectionSuspendedMembers.get(guild.id)!;

            for await (const [sectionId, suspendedPplArr] of sectionSuspensions) {
                // If no section is found, then queue the section for removal
                // Since the section doesn't exist, then it follows that we cannot really "unsuspend" this person
                // since there isn't said section
                const section = guildDoc.guildSections.find(x => x.uniqueIdentifier === sectionId);
                if (!section) {
                    _queuedDelSectionIds.enqueue({guildId: guild.id, sectionId: sectionId});
                    break;
                }

                const members = await Promise.all(
                    suspendedPplArr.map(async x => GuildFgrUtilities.fetchGuildMember(guild, x.affectedUser.id))
                );

                for (let i = 0; i < members.length; i++) {
                    const member = members[i];

                    if (!member)
                        continue;

                    const details = suspendedPplArr[i];
                    if (member.id !== details.affectedUser.id) {
                        console.info(`[INFO] ${guild.name}/${sectionId}/${member.id} incorrect entry given.`);
                        continue;
                    }

                    // Check if this person still needs to serve time.
                    if (details.timeEnd - Date.now() >= 0)
                        continue;

                    removeSectionSuspension(
                        member,
                        null,
                        {
                            guildDoc: guildDoc,
                            section: section,
                            reason: "The user has served the duration of the section suspension.",
                            actionId: details.actionId,
                            evidence: []
                        }
                    ).then();
                }
            }
        }

        // Regular suspensions
        const allGuildsSuspend = await Promise.all(
            Array.from(SuspendedMembers.keys()).map(async x => await GlobalFgrUtilities.fetchGuild(x))
        );

        for await (const guild of allGuildsSuspend) {
            if (!guild) continue;

            const guildDoc = MongoManager.CachedGuildCollection.get(guild.id);
            if (!guildDoc) continue;

            const suspendedPpl = SuspendedMembers.get(guild.id)!;
            const mainSection = MongoManager.getMainSection(guildDoc);

            for await (const [memberId, details] of suspendedPpl) {
                const suspendedMember = await GuildFgrUtilities.fetchGuildMember(guild, memberId);
                if (!suspendedMember)
                    continue;

                if (details.timeEnd - Date.now() >= 0)
                    continue;

                // Don't need to wait for this to resolve
                removeSuspension(
                    suspendedMember,
                    null,
                    {
                        guildDoc: guildDoc,
                        reason: "The user has served the entirety of his or her time.",
                        actionId: details.actionId,
                        evidence: []
                    }
                ).then();
            }
        }

        // Now, wait one minute before trying again.
        setTimeout(suspensionChecker, 60 * 1000);
    }

    /**
     * Attempts to add a server suspension. This will suspend the specified `member` from the server and log the event
     * in the guild database. This will fail if the member is already suspended.
     * @param {GuildMember} member The member to suspend.
     * @param {GuildMember | null} mod The moderator responsible for this suspension.
     * @param {IAdditionalPunishmentParams} info Any additional suspension information.
     * @returns {IPunishmentCommandResult} Information regarding the result of the execution of this function
     * (whether it succeeded or failed).
     */
    export async function tryAddSuspension(
        member: GuildMember,
        mod: GuildMember | null,
        info: Omit<IAdditionalPunishmentParams, "actionId" | "section">
    ): Promise<IPunishmentCommandResult> {
        // If the person was already suspended, then we don't need to re-suspend the person.
        if (GuildFgrUtilities.memberHasCachedRole(member, info.guildDoc.roles.suspendedRoleId)
            || info.guildDoc.moderation.suspendedUsers.some(x => x.affectedUser.id === member.id))
            return {punishmentResolved: false, punishmentLogged: false, moderationId: null};

        const timeStarted = Date.now();
        const suspendedUserObj: ISuspendedUser = {
            issuedAt: timeStarted,
            timeEnd: info.duration === -1 ? -1 : timeStarted + info.duration,
            oldRoles: member.roles.cache.map(x => x.id),
            affectedUser: {
                id: member.id,
                tag: member.user.tag,
                name: member.displayName
            },
            moderator: {
                id: mod?.id ?? AUTOMATIC,
                tag: mod?.user.tag ?? "",
                name: mod?.displayName ?? ""
            },
            reason: info.reason,
            actionId: `Suspend_${timeStarted}_${StringUtil.generateRandomString(15)}`,
            evidence: info.evidence
        };

        await MongoManager.updateAndFetchGuildDoc({
            guildId: member.guild.id
        }, {
            $push: {
                "moderation.suspendedUsers": suspendedUserObj
            }
        });

        // Now, add it to the suspension timer.
        if (info.duration !== -1) {
            if (!SuspendedMembers.has(member.guild.id))
                SuspendedMembers.set(member.guild.id, new Collection<string, ISuspendedUser>());
            SuspendedMembers.get(member.guild.id)!.set(member.id, suspendedUserObj);
        }

        // Remove roles and log it
        const initPass = await GlobalFgrUtilities.tryExecuteAsync(() => {
            return member.roles.set(
                GuildFgrUtilities.hasCachedRole(member.guild, info.guildDoc.roles.suspendedRoleId)
                    ? [info.guildDoc.roles.suspendedRoleId]
                    : []
            );
        });

        if (!initPass) {
            await Promise.all(
                member.roles.cache.map(x => {
                    return GlobalFgrUtilities.tryExecuteAsync(() => {
                        return member.roles.remove(x);
                    });
                })
            );

            await member.roles.add(info.guildDoc.roles.suspendedRoleId);
        }

        const r = await PunishmentManager.logPunishment(member, "Suspend", {
            reason: info.reason,
            duration: info.duration === -1 ? undefined : info.duration,
            issuedTime: Date.now(),
            expiresAt: info.duration === -1 ? undefined : suspendedUserObj.timeEnd,
            moderator: mod,
            guildDoc: info.guildDoc,
            section: MongoManager.getMainSection(info.guildDoc),
            guild: member.guild,
            sendNoticeToAffectedUser: info.notifyUser ?? true,
            sendLogInfo: info.sendLogMsg ?? true,
            actionIdToUse: suspendedUserObj.actionId,
            evidence: info.evidence
        });

        return {punishmentResolved: true, punishmentLogged: !!r, moderationId: r};
    }

    /**
     * Removes a server suspension. This will unsuspend the specified `member` and log the event in the database.
     * @param {GuildMember} member The member to unsuspend.
     * @param {GuildMember | null} mod The moderator responsible for this suspension.
     * @param {IAdditionalPunishmentParams} info Any additional information for this removal of suspension.
     * @returns {IPunishmentCommandResult} Information regarding the result of the execution of this function
     * (whether it succeeded or failed).
     */
    export async function removeSuspension(
        member: GuildMember,
        mod: GuildMember | null,
        info: Omit<IAdditionalPunishmentParams, "section" | "duration">
    ): Promise<IPunishmentCommandResult> {
        // Find suspension info.
        const memberLookup: ISuspendedUser | null = info.actionId
            ? lookupSuspension(info.guildDoc, null, {actionId: info.actionId})
            : lookupSuspension(info.guildDoc, null, {memberId: member.id});

        if (!memberLookup)
            return {punishmentResolved: false, punishmentLogged: false, moderationId: null};

        // And remove it from guild suspension list.
        await MongoManager.updateAndFetchGuildDoc({guildId: member.guild.id}, {
            $pull: {
                "moderation.suspendedUsers": {
                    actionId: memberLookup.actionId
                }
            }
        });

        // Might be inefficient in the long term.
        const data = SuspendedMembers.get(member.guild.id)?.get(member.id);
        if (data) {
            _queuedDelSuspendedMembers.enqueue({...data, guildId: member.guild.id});
        }

        const initPass = await GlobalFgrUtilities.tryExecuteAsync(() => {
            return member.roles.set(memberLookup.oldRoles);
        });

        if (!initPass) {
            await Promise.all(
                member.roles.cache.map(x => {
                    return GlobalFgrUtilities.tryExecuteAsync(() => {
                        return member.roles.remove(x);
                    });
                })
            );

            await Promise.all(
                memberLookup.oldRoles.map(x => {
                    return GlobalFgrUtilities.tryExecuteAsync(() => {
                        return member.roles.add(x);
                    });
                })
            );
        }

        const r = await PunishmentManager.logPunishment(member, "Unsuspend", {
            reason: info.reason,
            issuedTime: Date.now(),
            moderator: mod,
            guildDoc: info.guildDoc,
            section: MongoManager.getMainSection(info.guildDoc),
            guild: member.guild,
            sendNoticeToAffectedUser: info.notifyUser ?? true,
            sendLogInfo: info.sendLogMsg ?? true,
            actionIdToResolve: memberLookup.actionId,
            evidence: info.evidence
        });

        return {punishmentResolved: true, punishmentLogged: !!r, moderationId: r};
    }

    /**
     * Tries to add a server section suspension. This will suspend the specified `member` from the section and log the
     * event in the database. This will fail if the member is already suspended.
     * @param {GuildMember} member The member to suspend.
     * @param {GuildMember | null} mod The moderator responsible for this suspension.
     * @param {IAdditionalPunishmentParams} info The additional information for this section suspension.
     * @returns {IPunishmentCommandResult} Information regarding the result of the execution of this function
     * (whether it succeeded or failed).
     */
    export async function tryAddSectionSuspension(
        member: GuildMember,
        mod: GuildMember | null,
        info: IAdditionalPunishmentParams
    ): Promise<IPunishmentCommandResult> {
        // If the person was already suspended, then we don't need to re-suspend the person.
        if (info.section.moderation.sectionSuspended.some(x => x.affectedUser.id === member.id))
            return {punishmentResolved: false, punishmentLogged: false, moderationId: null};

        const timeStarted = Date.now();
        const suspendedUserObj: ISuspendedUser = {
            issuedAt: timeStarted,
            timeEnd: info.duration === -1 ? -1 : timeStarted + info.duration,
            oldRoles: [],
            affectedUser: {
                id: member.id,
                tag: member.user.tag,
                name: member.displayName
            },
            moderator: {
                id: mod?.id ?? AUTOMATIC,
                tag: mod?.user.tag ?? "",
                name: mod?.displayName ?? ""
            },
            reason: info.reason,
            actionId: `SecSuspend_${timeStarted}_${StringUtil.generateRandomString(15)}`,
            evidence: info.evidence
        };

        await MongoManager.updateAndFetchGuildDoc({
            guildId: member.guild.id,
            "guildSections.uniqueIdentifier": info.section.uniqueIdentifier
        }, {
            $push: {
                "guildSections.$.moderation.sectionSuspended": suspendedUserObj
            }
        });

        // Now, add it to the suspension timer.
        if (info.duration !== -1) {
            if (!SectionSuspendedMembers.has(member.guild.id))
                SectionSuspendedMembers.set(member.guild.id, new Collection<string, ISuspendedUser[]>());
            if (!SectionSuspendedMembers.get(member.guild.id)!.has(info.section.uniqueIdentifier))
                SectionSuspendedMembers.get(member.guild.id)!.set(info.section.uniqueIdentifier, []);
            SectionSuspendedMembers.get(member.guild.id)!.get(info.section.uniqueIdentifier)!.push(suspendedUserObj);
        }

        // Remove roles and log it
        await member.roles.remove(info.section.roles.verifiedRoleId).catch();
        const r = await PunishmentManager.logPunishment(member, "SectionSuspend", {
            reason: info.reason,
            duration: info.duration === -1 ? undefined : info.duration,
            issuedTime: Date.now(),
            expiresAt: info.duration === -1 ? undefined : suspendedUserObj.timeEnd,
            moderator: mod,
            guildDoc: info.guildDoc,
            section: info.section,
            guild: member.guild,
            sendNoticeToAffectedUser: info.notifyUser ?? true,
            sendLogInfo: info.sendLogMsg ?? true,
            actionIdToUse: suspendedUserObj.actionId,
            evidence: info.evidence
        });

        return {punishmentResolved: true, punishmentLogged: !!r, moderationId: r};
    }

    /**
     * Removes a server section suspension. This will "unsuspend" the specified `member` from the section and log the
     * event in the database.
     * @param {GuildMember} member The member to unsuspend.
     * @param {GuildMember | null} mod The moderator responsible for this unsuspension.
     * @param {IAdditionalPunishmentParams} info Information regarding this unsuspension.
     * @returns {IPunishmentCommandResult} Information regarding the result of the execution of this function
     * (whether it succeeded or failed).
     */
    export async function removeSectionSuspension(
        member: GuildMember,
        mod: GuildMember | null,
        info: Omit<IAdditionalPunishmentParams, "duration">
    ): Promise<IPunishmentCommandResult> {
        // Find suspension info.
        const memberLookup: ISuspendedUser | null = info.actionId
            ? lookupSuspension(info.guildDoc, info.section, {actionId: info.actionId})
            : lookupSuspension(info.guildDoc, info.section, {memberId: member.id});

        if (!memberLookup)
            return {punishmentResolved: false, punishmentLogged: false, moderationId: null};

        // And remove it from guild suspension list.
        await MongoManager.updateAndFetchGuildDoc({
            guildId: member.guild.id,
            "guildSections.uniqueIdentifier": info.section.uniqueIdentifier
        }, {
            $pull: {
                "guildSections.$.moderation.sectionSuspended": {
                    actionId: memberLookup.actionId
                }
            }
        });

        // Might be inefficient in the long term.
        const arrSuspendedPpl = SectionSuspendedMembers.get(member.guild.id)?.get(info.section.uniqueIdentifier);
        const entry = arrSuspendedPpl?.findIndex(x => x.actionId === memberLookup.actionId) ?? -1;
        if (arrSuspendedPpl && entry >= 0) {
            _queuedDelSectionSuspendedMembers.enqueue({
                ...arrSuspendedPpl[entry],
                sectionId: info.section.uniqueIdentifier,
                guildId: member.guild.id
            });
        }

        if (info.section.properties.giveVerifiedRoleUponUnsuspend
            && GuildFgrUtilities.hasCachedRole(member.guild, info.section.roles.verifiedRoleId)) {
            await member.roles.add(info.section.roles.verifiedRoleId).catch();
        }

        const r = await PunishmentManager.logPunishment(member, "SectionUnsuspend", {
            reason: info.reason,
            issuedTime: Date.now(),
            moderator: mod,
            guildDoc: info.guildDoc,
            section: info.section,
            guild: member.guild,
            sendNoticeToAffectedUser: info.notifyUser ?? true,
            sendLogInfo: info.sendLogMsg ?? true,
            actionIdToResolve: memberLookup.actionId,
            evidence: info.evidence
        });

        return {punishmentResolved: true, punishmentLogged: !!r, moderationId: r};
    }

    /**
     * Looks up a suspension based on either the action ID or member ID,
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo | null} section The section. If `null`, then this checks the main section.
     * @param {object} lookupType The lookup type. Can be either member or action ID.
     * @returns {ISuspendedUser | null} The suspension information, if any.
     * @private
     */
    function lookupSuspension(guildDoc: IGuildInfo, section: ISectionInfo | null, lookupType: {
        memberId?: string;
        actionId?: string;
    }): ISuspendedUser | null {
        if (!lookupType.memberId && !lookupType.actionId)
            return null;

        if (lookupType.memberId) {
            return !section || section.isMainSection
                ? guildDoc.moderation.suspendedUsers.find(x => x.affectedUser.id === lookupType.memberId) ?? null
                : section.moderation.sectionSuspended.find(x => x.affectedUser.id === lookupType.memberId) ?? null;
        }

        return !section || section.isMainSection
            ? guildDoc.moderation.suspendedUsers.find(x => x.actionId === lookupType.actionId) ?? null
            : section.moderation.sectionSuspended.find(x => x.actionId === lookupType.actionId) ?? null;
    }


    /**
     * Gets the roles that can suspend users in the specified section.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section.
     * @returns {ISectionInfo[]} The roles that can suspend members in the specified section.
     */
    export function sectionsToManage(guildDoc: IGuildInfo, section: ISectionInfo): string[] {
        return [
            guildDoc.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId,
            guildDoc.roles.staffRoles.universalLeaderRoleIds.vetLeaderRoleId,
            guildDoc.roles.staffRoles.universalLeaderRoleIds.leaderRoleId,
            guildDoc.roles.staffRoles.moderation.officerRoleId,
            guildDoc.roles.staffRoles.moderation.securityRoleId,
            guildDoc.roles.staffRoles.moderation.moderatorRoleId,
            section.roles.leaders.sectionVetLeaderRoleId,
            section.roles.leaders.sectionLeaderRoleId
        ];
    }
}

export namespace MuteManager {
    export const MutedMembers = new Collection<string, IMutedUser[]>();
    const _queuedDelMutedUsers = new Queue<IMutedUser & { guildId: string; }>();

    let _isRunning = false;

    /**
     * Starts the MuteManager checker.
     * @param {IGuildInfo[]} [documents] The guild documents. If this is specified, then all previous mute records
     * will be loaded. This is ideal when the bot just started up (say, from a restart).
     */
    export async function startChecker(documents: IGuildInfo[] = []): Promise<void> {
        if (_isRunning) return;
        _isRunning = true;

        if (documents.length > 0) {
            for await (const guildDoc of documents) {
                const serverSus = new Collection<string, IMutedUser[]>();
                const guild = await GlobalFgrUtilities.fetchGuild(guildDoc.guildId);
                if (!guild) continue;
                MutedMembers.set(
                    guild.id,
                    guildDoc.moderation.mutedUsers.filter(x => x.timeEnd !== -1)
                );
            } // End of loop
        }

        muteChecker().then();
    }

    /**
     * Stops the MuteManager checker.
     */
    export function stopChecker(): void {
        if (!_isRunning) return;
        _isRunning = false;
    }

    /**
     * The MuteManager checker service. This should only be called by the `startChecker` function.
     * @private
     */
    async function muteChecker(): Promise<void> {
        if (!_isRunning) return;
        // Remove all users that were already queued for unmuting from checker
        while (_queuedDelMutedUsers.size() > 0) {
            const dequeuedElem = _queuedDelMutedUsers.dequeue();
            const mutedTimedUsers = MutedMembers.get(dequeuedElem.guildId);
            if (!mutedTimedUsers)
                continue;
            mutedTimedUsers.splice(
                mutedTimedUsers.findIndex(x => x.actionId === dequeuedElem.actionId),
                1
            );
        }

        const allGuildsSecSus = await Promise.all(
            Array.from(MutedMembers.keys()).map(async x => await GlobalFgrUtilities.fetchGuild(x))
        );

        for (const guild of allGuildsSecSus) {
            if (!guild) continue;

            const guildDoc = MongoManager.CachedGuildCollection.get(guild.id);
            if (!guildDoc) continue;

            const allMutedInfo = MutedMembers.get(guild.id);
            if (!allMutedInfo) continue;

            for (const mutedInfo of allMutedInfo) {
                const mutedMember = await GuildFgrUtilities.fetchGuildMember(guild, mutedInfo.affectedUser.id);
                if (!mutedMember)
                    continue;

                if (mutedInfo.timeEnd === -1)
                    continue;

                if (mutedInfo.timeEnd - Date.now() >= 0)
                    continue;

                // Handle unmuting.
                await removeMute(mutedMember, null, {
                    guildDoc: guildDoc,
                    reason: "The user has served the entirety of his or her time.",
                    actionId: mutedInfo.actionId,
                    evidence: []
                });
            }
        }

        setTimeout(muteChecker, 60 * 1000);
    }

    /**
     * Adds a server mute. This will mute the specified `member` from the server and log the event in the
     * database.
     * @param {GuildMember} member The member to suspend.
     * @param {GuildMember | null} mod The moderator responsible for this mute.
     * @param {IAdditionalPunishmentParams} info Any additional mute information.
     * @returns {IPunishmentCommandResult} Information regarding the result of the execution of this function
     * (whether it succeeded or failed).
     */
    export async function addMute(
        member: GuildMember,
        mod: GuildMember | null,
        info: Omit<IAdditionalPunishmentParams, "actionId" | "section">
    ): Promise<IPunishmentCommandResult> {
        // Create the role if it doesn't already exist.
        let mutedRole = await GuildFgrUtilities.fetchRole(member.guild, info.guildDoc.roles.mutedRoleId);
        if (!mutedRole) {
            mutedRole = await member.guild.roles.create({
                name: "Muted",
                permissions: []
            });

            const promisesToResolve: Promise<GuildChannel>[] = [];
            for (const [id, channel] of member.guild.channels.cache) {
                if (channel.isThread() || !channel.isText())
                    continue;

                promisesToResolve.push(channel.permissionOverwrites.edit(mutedRole.id, {
                    "SEND_MESSAGES": false,
                    "USE_PUBLIC_THREADS": false,
                    "USE_PRIVATE_THREADS": false,
                    "SPEAK": false
                }).catch());
            }

            await Promise.all(promisesToResolve);

            info.guildDoc = (await MongoManager.updateAndFetchGuildDoc({guildId: member.guild.id}, {
                $set: {
                    "roles.mutedRoleId": mutedRole.id
                }
            }))!;
        }

        // If the person was already muted, then we don't need to mute the person again.
        if (GuildFgrUtilities.memberHasCachedRole(member, info.guildDoc.roles.mutedRoleId)
            || info.guildDoc.moderation.mutedUsers.some(x => x.affectedUser.id === member.id))
            return {punishmentResolved: false, punishmentLogged: false, moderationId: null};

        const timeStarted = Date.now();
        const mutedUserObj: IMutedUser = {
            issuedAt: timeStarted,
            timeEnd: info.duration === -1 ? -1 : timeStarted + info.duration,
            affectedUser: {
                id: member.id,
                tag: member.user.tag,
                name: member.displayName
            },
            moderator: {
                id: mod?.id ?? AUTOMATIC,
                tag: mod?.user.tag ?? "",
                name: mod?.displayName ?? ""
            },
            reason: info.reason,
            actionId: `Mute_${timeStarted}_${StringUtil.generateRandomString(15)}`,
            evidence: info.evidence
        };

        await MongoManager.updateAndFetchGuildDoc({
            guildId: member.guild.id
        }, {
            $push: {
                "moderation.mutedUsers": mutedUserObj
            }
        });

        // Now, add it to the timer.
        if (info.duration !== -1) {
            if (!MutedMembers.has(member.guild.id))
                MutedMembers.set(member.guild.id, []);
            MutedMembers.get(member.guild.id)!.push(mutedUserObj);
        }

        await member.roles.add(mutedRole).catch();

        const r = await PunishmentManager.logPunishment(member, "Mute", {
            reason: info.reason,
            duration: info.duration === -1 ? undefined : info.duration,
            issuedTime: Date.now(),
            moderator: mod,
            expiresAt: info.duration === -1 ? undefined : mutedUserObj.timeEnd,
            guildDoc: info.guildDoc,
            section: MongoManager.getMainSection(info.guildDoc),
            guild: member.guild,
            sendNoticeToAffectedUser: info.notifyUser ?? true,
            sendLogInfo: info.sendLogMsg ?? true,
            actionIdToUse: mutedUserObj.actionId,
            evidence: info.evidence
        });

        return {punishmentResolved: true, punishmentLogged: !!r, moderationId: r};
    }

    /**
     * Removes a mute. This will unmute the specified `member` and log the event in the database.
     * @param {GuildMember} member The member to unmute.
     * @param {GuildMember | null} mod The moderator responsible for this unmute.
     * @param {IAdditionalPunishmentParams} info Any additional information for this unmute.
     * @returns {IPunishmentCommandResult} Information regarding the result of the execution of this function
     * (whether it succeeded or failed).
     */
    export async function removeMute(
        member: GuildMember,
        mod: GuildMember | null,
        info: Omit<IAdditionalPunishmentParams, "section" | "duration">
    ): Promise<IPunishmentCommandResult> {
        if (!GuildFgrUtilities.hasCachedRole(member.guild, info.guildDoc.roles.mutedRoleId))
            return {punishmentResolved: false, punishmentLogged: false, moderationId: null};

        // Find mute info.
        const memberLookup: IMutedUser | null = info.actionId
            ? lookupMute(info.guildDoc, {actionId: info.actionId})
            : lookupMute(info.guildDoc, {memberId: member.id});

        if (!memberLookup)
            return {punishmentResolved: false, punishmentLogged: false, moderationId: null};

        // And remove it from guild suspension list.
        await MongoManager.updateAndFetchGuildDoc({guildId: member.guild.id}, {
            $pull: {
                "moderation.mutedUsers": {
                    actionId: memberLookup.actionId
                }
            }
        });

        // Might be inefficient in the long term.
        const data = MutedMembers.get(member.guild.id)?.find(x => x.actionId === memberLookup.actionId);
        if (data) {
            _queuedDelMutedUsers.enqueue({...data, guildId: member.guild.id});
        }

        await member.roles.remove(info.guildDoc.roles.mutedRoleId).catch();
        const r = await PunishmentManager.logPunishment(member, "Unmute", {
            reason: info.reason,
            issuedTime: Date.now(),
            moderator: mod,
            guildDoc: info.guildDoc,
            section: MongoManager.getMainSection(info.guildDoc),
            guild: member.guild,
            sendNoticeToAffectedUser: info.notifyUser ?? true,
            sendLogInfo: info.sendLogMsg ?? true,
            actionIdToResolve: memberLookup.actionId,
            evidence: info.evidence
        });

        return {punishmentResolved: true, punishmentLogged: !!r, moderationId: r};
    }

    /**
     * Removes all muted users from a particular guild from the checker. This is useful if the muted role was
     * deleted for some reason.
     * @param {Guild} guild The guild.
     * @param {GuildMember | null} mod The moderator.
     * @param {string} [reason] The reason, if any.
     * @returns {Promise<boolean>} Whether the function executed successfully.
     */
    export async function removeAllMuteInGuild(guild: Guild, mod: GuildMember | null,
                                               reason?: string): Promise<boolean> {
        MutedMembers.get(guild.id)?.forEach(x => {
            _queuedDelMutedUsers.enqueue({...x, guildId: guild.id});
        });

        const guildDoc = MongoManager.CachedGuildCollection.get(guild.id)!;
        const membersToUnmute = guildDoc.moderation.mutedUsers.map(async info => {
            const memberToUnmute = await GuildFgrUtilities.fetchGuildMember(guild, info.affectedUser.id);
            if (!memberToUnmute)
                return;

            return PunishmentManager.logPunishment(memberToUnmute, "Unmute", {
                reason: reason ?? "The Muted role was deleted while the person was muted.",
                issuedTime: Date.now(),
                moderator: mod,
                guildDoc: guildDoc,
                section: MongoManager.getMainSection(guildDoc),
                guild: memberToUnmute.guild,
                sendNoticeToAffectedUser: false,
                sendLogInfo: true,
                actionIdToResolve: info.actionId,
                evidence: []
            });
        });

        await MongoManager.updateAndFetchGuildDoc({guildId: guild.id}, {
            $set: {
                "moderation.mutedUsers": []
            }
        });

        await Promise.all(membersToUnmute);
        return true;
    }

    /**
     * Looks up a mute based on either the action ID or member ID,
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {object} lookupType The lookup type. Can be either member or action ID.
     * @returns {ISuspendedUser | null} The mute information, if any.
     * @private
     */
    function lookupMute(guildDoc: IGuildInfo, lookupType: {
        memberId?: string;
        actionId?: string;
    }): IMutedUser | null {
        if (!lookupType.memberId && !lookupType.actionId)
            return null;

        return lookupType.memberId
            ? guildDoc.moderation.mutedUsers.find(x => x.affectedUser.id === lookupType.memberId) ?? null
            : guildDoc.moderation.mutedUsers.find(x => x.actionId === lookupType.actionId) ?? null;
    }
}