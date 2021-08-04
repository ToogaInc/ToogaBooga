import {Collection, Guild, GuildMember, MessageEmbed, Role, TextChannel} from "discord.js";
import {IGuildInfo, IPunishmentHistoryEntry, ISectionInfo, ISuspendedUser, IUserInfo} from "../definitions";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {Queue} from "../utilities/Queue";
import {GlobalFgrUtilities} from "../utilities/fetch-get-request/GlobalFgrUtilities";
import {MongoManager} from "./MongoManager";
import {StringUtil} from "../utilities/StringUtilities";
import {StringBuilder} from "../utilities/StringBuilder";
import {MiscUtilities} from "../utilities/MiscUtilities";
import {AllModLogType, MainOnlyModLogType, SectionModLogType} from "../definitions/Types";
import {FilterQuery} from "mongodb";

// TODO have this inherit from IBasePunishment?
interface IPunishmentDetails {
    /**
     * The nickname of the person that will receive this punishment (or have the punishment removed).
     *
     * @type {string}
     */
    nickname: string;

    /**
     * The reason for the punishment (or removal of said punishment).
     *
     * @type {string}
     */
    reason: string;

    /**
     * The duration of the punishment, in minutes. This is not used in any computations, only for logging.
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
     * The action ID to resolve. This must be specified if you're going to resolve a punishment.
     *
     * @type {string}
     */
    actionIdToResolve?: string;

    /**
     * The action ID to use. If this isn't specified, then an ID will be created.
     *
     * @type {string}
     */
    actionIdToUse?: string;
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
     * @returns {Promise<boolean>} Whether the action is completed.
     */
    export async function logPunishment(
        member: GuildMember | { name: string; },
        punishmentType: AllModLogType,
        details: IPunishmentDetails
    ): Promise<boolean> {
        let logChannel: TextChannel | null;
        let resolvedModType: MainOnlyModLogType | SectionModLogType | null;

        const isAddingPunishment = punishmentType.includes("Un");
        // If we're resolving a punishment AND the action ID to resolve is not specified, then we can't do anything.
        if (!isAddingPunishment && !details.actionIdToResolve)
            return false;

        const actionId = details.actionIdToUse ?? StringUtil.generateRandomString(40);
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
            return false;

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
            actionId: actionId
        };

        const modStr = new StringBuilder()
            .append(`- Moderator Mention: ${details.moderator ?? AUTOMATIC} (${details.moderator?.id ?? "N/A"})`)
            .appendLine()
            .append(`- Moderator Tag: ${details.moderator?.user.tag ?? "N/A"}`)
            .appendLine()
            .append(`- Moderator Name: ${details.moderator?.displayName ?? "N/A"}`)
            .toString();

        const durationStr = new StringBuilder()
            .append(`- Duration: ${entry.duration === -1 ? "Indefinite." : `${entry.duration} Minutes`}`)
            .appendLine()
            .append(`- Ends At: ${entry.expiresAt === -1 ? "N/A" : `${MiscUtilities.getTime(entry.expiresAt)} UTC`}`)
            .toString();

        const logToChanEmbed = new MessageEmbed()
            .setColor(isAddingPunishment ? "RED" : "GREEN")
            .addField("Moderator", modStr)
            .addField("Reason", entry.reason)
            .setTimestamp()
            .setFooter(`Mod. ID: ${entry.actionId}`);

        const toSendToUserEmbed = new MessageEmbed()
            .setColor(isAddingPunishment ? "RED" : "GREEN")
            .addField("Moderator", modStr)
            .addField("Reason", entry.reason)
            .setTimestamp()
            .setFooter(`Mod. ID: ${entry.actionId}`);

        if (!isAddingPunishment) {
            logToChanEmbed.addField("Resolving Moderation ID", details.actionIdToResolve ?? "N/A");
            toSendToUserEmbed.addField("Resolving Moderation ID", details.actionIdToResolve ?? "N/A");
        }

        switch (punishmentType) {
            case "Blacklist": {
                // Logging
                const descSb = new StringBuilder()
                    .append(`⇒ **Blacklisted Name:** ${entry.affectedUser.name}`)
                    .appendLine();
                if (member instanceof GuildMember) {
                    descSb.append(`⇒ **Member:** ${member} (${member.id})`)
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
                        .append(`⇒ **Unblacklisted Name:** ${entry.affectedUser.name}`)
                        .toString());

                break;
            }
            case "Suspend": {
                if (!("id" in member))
                    return false;

                // Logging
                logToChanEmbed
                    .setTitle("__Server__ Suspended.")
                    .setDescription(new StringBuilder()
                        .append(`⇒ **Member Suspended:** ${entry.affectedUser.name}`)
                        .appendLine()
                        .append(`⇒ **Member Mention:** ${member} (${member.id})`)
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
                    return false;

                // Logging
                logToChanEmbed
                    .setTitle("__Server__ Suspension Removed.")
                    .setDescription(new StringBuilder()
                        .append(`⇒ **Member Unsuspended:** ${entry.affectedUser.name}`)
                        .appendLine()
                        .append(`⇒ **Member Mention:** ${member} (${member.id})`)
                        .toString());

                // To send to member
                toSendToUserEmbed
                    .setTitle("Server Suspension Removed.")
                    .setDescription(`You have been unsuspended from **${details.guild.name}**.`);
                break;
            }
            case "SectionSuspend": {
                if (!("id" in member))
                    return false;

                // Logging
                logToChanEmbed
                    .setTitle(`${details.section.sectionName}: __Section__ Suspended.`)
                    .setDescription(new StringBuilder()
                        .append(`⇒ **Member Suspended:** ${entry.affectedUser.name}`)
                        .appendLine()
                        .append(`⇒ **Member Mention:** ${member} (${member.id})`)
                        .appendLine()
                        .append(`⇒ **Suspended From:** ${details.section.sectionName}`)
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
                    return false;

                // Logging
                logToChanEmbed
                    .setTitle("__Section__ Suspension Removed.")
                    .setDescription(new StringBuilder()
                        .append(`⇒ **Member Unsuspended:** ${entry.affectedUser.name}`)
                        .appendLine()
                        .append(`⇒ **Member Mention:** ${member} (${member.id})`)
                        .appendLine()
                        .append(`⇒ **Unsuspended From:** ${details.section.sectionName}`)
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
                    return false;

                // Logging
                logToChanEmbed
                    .setTitle(`Modmail Blacklisted.`)
                    .setDescription(`⇒ **Modmail Blacklisted:** ${member} (${member.id})`);

                // To send to member
                toSendToUserEmbed
                    .setTitle("Modmail Blacklisted.")
                    .setDescription(`You have been blacklisted from sending modmail in **${details.guild.name}**.`);
                break;
            }
            case "ModmailUnblacklist": {
                if (!("id" in member))
                    return false;

                // Logging
                logToChanEmbed
                    .setTitle(`Modmail Blacklisted Removed.`)
                    .setDescription(`⇒ **Modmail Unblacklisted:** ${member} (${member.id})`);

                // To send to member
                toSendToUserEmbed
                    .setTitle("Modmail Blacklist Removed.")
                    .setDescription(`Your modmail blacklist in **${details.guild.name}** has been removed.`);
                break;
            }
            case "Mute": {
                if (!("id" in member))
                    return false;

                // Logging
                logToChanEmbed
                    .setTitle(`Server Muted.`)
                    .setDescription(`⇒ **Member Muted:** ${member} (${member.id})`)
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
                    return false;

                // Logging
                logToChanEmbed
                    .setTitle(`Server Mute Removed.`)
                    .setDescription(`⇒ **Member Unmuted:** ${member} (${member.id})`);

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

        // These must have a description or else the default arm was reached.
        if (details.sendNoticeToAffectedUser && toSendToUserEmbed.description && member instanceof GuildMember) {
            await GlobalFgrUtilities.sendMsg(member, {embeds: [toSendToUserEmbed]}).catch();
        }

        // Do we really need to check if there is a description here specifically?
        if (logChannel && logToChanEmbed.description) {
            await logChannel.send({embeds: [logToChanEmbed]}).catch();
        }

        // Update the user database if possible.
        if (isAddingPunishment) {
            const filterQuery: FilterQuery<IUserInfo> = {
                $or: []
            };
            if ("name" in member) {
                const nameRes = await MongoManager.findNameInIdNameCollection(member.name);
                if (nameRes.length > 0) {
                    filterQuery.$or?.push({
                        discordId: nameRes[0].currentDiscordId
                    });

                    // For logging purposes
                    if (nameRes.length > 1)
                        console.log(`${member.name} has multiple documents in IDName Collection.`);
                }
            }
            else {
                filterQuery.$or?.push({
                    discordId: member.id
                });
            }

            // This should only hit when the person has NEVER verified with this bot.
            // TODO what to do when a person is blacklisted when he or she never verified with the bot?
            if ((filterQuery.$or?.length ?? 0) === 0)
                return false;

            const queryResult = await MongoManager.getUserCollection().updateOne(filterQuery, {
                $push: {
                    "details.moderationHistory": entry
                }
            });

            return queryResult.modifiedCount > 0;
        }
        else {
            delete entry.expiresAt;
            delete entry.duration;
            const queryResult = await MongoManager.getUserCollection().updateOne({
                "details.moderationHistory.$.actionId": details.actionIdToResolve
            }, {
                $set: {
                    "details.moderationHistory.$.resolved": entry
                }
            });

            return queryResult.modifiedCount > 0;
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
    // key = guild ID
    // value = collection of member IDs, suspension info
    const SuspendedMembers = new Collection<string, Collection<string, ISuspendedUser>>();
    const SectionSuspendedMembers = new Collection<string, Collection<string, ISuspendedUser & {secId: string;}>>();

    let IsRunning = false;

    /**
     * Starts the SuspensionManager checker.
     * @param {IGuildInfo[]} [documents] The guild documents. If this is specified, then all previous suspensions
     * will be loaded. This is ideal when the bot just started up (say, from a restart).
     */
    export async function startChecker(documents: IGuildInfo[] = []): Promise<void> {
        if (IsRunning) return;
        IsRunning = true;

        if (documents.length > 0) {
            for await (const guildDoc of documents) {
                const serverSus = new Collection<string, ISuspendedUser>();
                const guild = await GlobalFgrUtilities.fetchGuild(guildDoc.guildId);
                if (!guild) continue;

                for await (const suspendedUser of guildDoc.moderation.suspendedUsers) {
                    if (suspendedUser.timeEnd === -1)
                        continue;

                    serverSus.set(suspendedUser.affectedUser.id, suspendedUser);
                }

                const sectionSus = new Collection<string, ISuspendedUser & {secId: string;}>();
                for (const section of guildDoc.guildSections) {
                    for await (const secSusUser of section.moderation.sectionSuspended) {
                        if (secSusUser.timeEnd === -1)
                            continue;

                        sectionSus.set(secSusUser.affectedUser.id, {...secSusUser, secId: section.uniqueIdentifier});
                    }
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
        if (!IsRunning) return;
        IsRunning = false;
    }

    /**
     * The SuspensionManager checker service. This should only be called by the `startChecker` function.
     * @private
     */
    async function suspensionChecker(): Promise<void> {
        if (!IsRunning) return;

        const idsToRemove = new Queue<{ guildId: string; memberId: string; removeFromDb: boolean; secId: string; }>();

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

            const secSuspendedPpl = SectionSuspendedMembers.get(guild.id)!;

            // Go through all section suspended members for this guild
            // TODO might want to use Promise.all to speed process up
            for await (const [memberId, details] of secSuspendedPpl) {
                const suspendedMember = await GuildFgrUtilities.fetchGuildMember(guild, memberId);
                // If no member is found, we can remove the member from the checker but NOT from the database.
                if (!suspendedMember) {
                    idsToRemove.enqueue({
                        guildId: guild.id,
                        memberId: memberId,
                        removeFromDb: false,
                        secId: details.secId
                    });
                    continue;
                }

                // Check if this person still needs to serve time.
                if (Date.now() - details.timeEnd >= 0)
                    continue;

                // If no section is found, then remove this person from section suspension list
                // Since the section doesn't exist, then it follows that we cannot really "unsuspend" this person
                // since there isn't said section
                const section = guildDoc.guildSections.find(x => x.uniqueIdentifier === details.secId);
                if (!section) {
                    idsToRemove.enqueue({
                        guildId: guild.id,
                        memberId: memberId,
                        removeFromDb: false,
                        secId: details.secId
                    });
                    continue;
                }

                const secVerifRole = await GuildFgrUtilities.fetchRole(guild, section.roles.verifiedRoleId);
                if (!secVerifRole) {
                    idsToRemove.enqueue({
                        guildId: guild.id,
                        memberId: memberId,
                        removeFromDb: true,
                        secId: details.secId
                    });
                    continue;
                }

                // At this point, we can unsuspend this person.
                if (section.properties.giveVerifiedRoleUponUnsuspend)
                    await suspendedMember.roles.add(secVerifRole).catch();

                idsToRemove.enqueue({
                    guildId: guild.id,
                    memberId: memberId,
                    removeFromDb: true,
                    secId: details.secId
                });

                PunishmentManager.logPunishment(
                    suspendedMember,
                    "SectionUnsuspend",
                    {
                        nickname: details.affectedUser.name,
                        reason: details.reason,
                        moderator: null,
                        issuedTime: details.issuedAt,
                        guildDoc: guildDoc,
                        section: section,
                        guild: guild,
                        sendNoticeToAffectedUser: true
                    }
                ).then();
            }
        }

        // Okay, now look into removing any entries from the collections.
        const queries: Promise<IGuildInfo>[] = [];
        while (idsToRemove.size() > 0) {
            const {guildId, memberId, removeFromDb, secId} = idsToRemove.dequeue();

            if (removeFromDb) {
                queries.push(MongoManager.updateAndFetchGuildDoc({
                    guildId: guildId, "guildSections.uniqueIdentifier": secId
                }, {
                    $pull: {
                        "guildSections.$.properties.sectionSuspended": {
                            discordId: memberId
                        }
                    }
                }));
            }

            SectionSuspendedMembers.get(guildId)!.delete(memberId);
        }
        // And finally, update the database.
        await Promise.all(queries);

        // Repeat the step for regular suspensions.
        idsToRemove.clear();
        // Reset the array to nothing.
        // TODO check that this works.
        queries.length = 0;

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
                if (!suspendedMember) {
                    idsToRemove.enqueue({
                        guildId: guild.id,
                        memberId: memberId,
                        removeFromDb: false,
                        secId: "MAIN"
                    });
                    continue;
                }

                if (Date.now() - details.timeEnd >= 0)
                    continue;

                // Give back all valid roles
                const rolesToGiveBack = details.oldRoles
                    .map(x => GuildFgrUtilities.getCachedRole(guild, x))
                    .filter(x => x !== null) as Role[];

                try {
                    await suspendedMember.roles.set(rolesToGiveBack);
                    if (suspendedMember.nickname)
                        await suspendedMember.setNickname(details.affectedUser.name).catch();

                    idsToRemove.enqueue({
                        guildId: guild.id,
                        memberId: suspendedMember.id,
                        removeFromDb: true,
                        secId: "MAIN"
                    });

                    PunishmentManager.logPunishment(
                        suspendedMember,
                        "Unsuspend",
                        {
                            nickname: details.affectedUser.name,
                            reason: details.reason,
                            moderator: null,
                            issuedTime: details.issuedAt,
                            guildDoc: guildDoc,
                            section: mainSection,
                            guild: guild,
                            sendNoticeToAffectedUser: true
                        }
                    ).then();
                } catch (_) {
                    // If the role couldn't be added, then don't remove the person from the list of suspended
                    // people since we want to give the role back.
                }
            }
        }

        // Remove relevant entries from normal suspensions.
        while (idsToRemove.size() > 0) {
            const {guildId, memberId, removeFromDb} = idsToRemove.dequeue();

            if (removeFromDb) {
                queries.push(MongoManager.updateAndFetchGuildDoc({
                    guildId: guildId
                }, {
                    $pull: {
                        "guildSections.moderation.suspendedUsers": {
                            discordId: memberId
                        }
                    }
                }));
            }

            SuspendedMembers.get(guildId)!.delete(memberId);
        }

        await Promise.all(queries);

        // Now, wait one minute before trying again.
        setTimeout(suspensionChecker, 60 * 1000);
    }

    /**
     * Adds a server suspension. This will suspend the specified `member` from the server and log the event in the
     * database.
     * @param {GuildMember} member The member to suspend.
     * @param {GuildMember | null} mod The moderator responsible for this suspension.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {number} duration The duration, in milliseconds. If this is a permanent suspension, use `-1`.
     * @param {string} reason The reason.
     * @returns {Promise<boolean>} Whether the suspension was successful.
     */
    export async function addSuspension(member: GuildMember, mod: GuildMember | null, guildDoc: IGuildInfo,
                                        duration: number, reason: string): Promise<boolean> {
        const timeStarted = Date.now();
        const suspendedUserObj: ISuspendedUser = {
            issuedAt: timeStarted,
            timeEnd: duration === -1 ? -1 : timeStarted + duration,
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
            reason: reason,
            actionId: StringUtil.generateRandomString(40)
        };

        const queryRes = await MongoManager.getGuildCollection().updateOne({
            guildId: member.guild.id
        }, {
            $push: {
                "moderation.suspendedUsers": suspendedUserObj
            }
        });

        // If nothing was modified, then don't add to database and tell user that suspension failed.
        if (queryRes.modifiedCount === 0)
            return false;

        await member.roles.set(
            GuildFgrUtilities.hasCachedRole(member.guild, guildDoc.roles.suspendedRoleId)
                ? [guildDoc.roles.suspendedRoleId]
                : []
        ).catch();

        const logInfo: IPunishmentDetails = {
            nickname: member.displayName,
            reason: reason,
            duration: duration / 60000,
            issuedTime: Date.now(),
            expiresAt: 0,
            moderator: mod,
            guildDoc: guildDoc,
            section: MongoManager.getMainSection(guildDoc),
            guild: member.guild,
            sendNoticeToAffectedUser: true,
            actionIdToResolve: suspendedUserObj.actionId
        };

        if (duration === -1) {
            logInfo.expiresAt = undefined;
            logInfo.duration = undefined;
        }

        // Now, add it to the suspension timer.
        if (!SuspendedMembers.has(member.guild.id))
            SuspendedMembers.set(member.guild.id, new Collection<string, ISuspendedUser>());
        SuspendedMembers.get(member.guild.id)!.set(member.id, suspendedUserObj);

        return await PunishmentManager.logPunishment(member, "Suspend", logInfo);
    }

    /**
     * Removes a server suspension. This will unsuspend the specified `member` and log the event in the database.
     * @param {GuildMember} member The member to unsuspend.
     * @param {GuildMember | null} mod The moderator responsible for this suspension.
     * @param {string} reason The reason.
     * @returns {Promise<boolean>} Whether the unsuspension was successful.
     */
    export async function removeSuspension(member: GuildMember, mod: GuildMember | null,
                                           reason: string): Promise<boolean> {

        return true;
    }
}

export namespace MuteManager {
}