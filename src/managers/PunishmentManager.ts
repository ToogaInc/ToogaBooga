import {Collection, Guild, GuildMember, MessageEmbed, Role, TextChannel} from "discord.js";
import {GeneralConstants} from "../constants/GeneralConstants";
import {IGuildInfo, IPunishmentHistoryEntry, ISectionInfo} from "../definitions";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {Queue} from "../utilities/Queue";
import {GlobalFgrUtilities} from "../utilities/fetch-get-request/GlobalFgrUtilities";
import {MongoManager} from "./MongoManager";
import {StringUtil} from "../utilities/StringUtilities";
import {StringBuilder} from "../utilities/StringBuilder";
import {MiscUtilities} from "../utilities/MiscUtilities";

export namespace PunishmentManager {
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
         * The guild ID.
         *
         * @type {string}
         */
        guildId: string;

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
    }

    /**
     * Acknowledges a punishment. Sends the appropriate log message to the logging channel, sends a message to the
     * user, and saves the punishment information into the user's document. You will need to handle the punishment
     * information for the guild document.
     * @param {GuildMember | object} member The member who is receiving a punishment or getting a punishment
     * removed. For blacklists, simply provide the `name` in an object.
     * @param {GeneralConstants.ModLogType} punishmentType The punishment type.
     * @param {PunishmentManager.IPunishmentDetails} details The details.
     * @returns {Promise<boolean>} Whether the action is completed.
     */
    export async function logPunishment(
        member: GuildMember | { name: string; },
        punishmentType: GeneralConstants.ModLogType,
        details: IPunishmentDetails
    ): Promise<boolean> {
        let logChannel: TextChannel | null;
        const isAddingPunishment = punishmentType.includes("Un");
        const actionId = StringUtil.generateRandomString(40);

        // Find the appropriate logging channel.
        switch (punishmentType) {
            case "Blacklist":
            case "Unblacklist":
                logChannel = getLoggingChannel(details.guild, details.guildDoc, details.section, "Blacklist");
                break;
            case "ModmailBlacklist":
            case "ModmailUnblacklist":
                logChannel = getLoggingChannel(details.guild, details.guildDoc, details.section, "ModmailBlacklist");
                break;
            case "SectionSuspend":
            case "SectionUnsuspend":
                logChannel = getLoggingChannel(details.guild, details.guildDoc, details.section, "SectionSuspend");
                break;
            case "Mute":
            case "Unmute":
                logChannel = getLoggingChannel(details.guild, details.guildDoc, details.section, "Mute");
                break;
            case "Suspend":
            case "Unsuspend":
                logChannel = getLoggingChannel(details.guild, details.guildDoc, details.section, "Suspend");
                break;
            default:
                logChannel = null;
                break;
        }

        const entry: IPunishmentHistoryEntry = {
            guildId: details.guildId,
            moderationType: punishmentType,
            affectedUser: {
                name: "name" in member ? member.name : member.displayName,
                id: "id" in member ? member.id : "",
                tag: "user" in member ? member.user.tag : ""
            },
            moderator: {
                id: details.moderator?.id ?? "",
                tag: details.moderator?.user.tag ?? "",
                name: details.moderator?.displayName ?? "Automatic"
            },
            issuedAt: details.issuedTime,
            expiresAt: details.expiresAt ?? -1,
            duration: details.duration ?? -1,
            reason: details.reason,
            actionId: actionId
        };

        const modStr = new StringBuilder()
            .append(`- Moderator Mention: ${details.moderator ?? "Automatic"} (${details.moderator?.id ?? "N/A"})`)
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

        // Update the database.

        return true;
    }

    /**
     * Gets the appropriate logging channel.
     * @param {Guild} guild The guild.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section.
     * @param {GeneralConstants.BasicModLogType} punishmentType The punishment type.
     * @returns {TextChannel | null} The channel, if any.
     * @private
     */
    function getLoggingChannel(guild: Guild, guildDoc: IGuildInfo, section: ISectionInfo,
                               punishmentType: GeneralConstants.BasicModLogType): TextChannel | null {
        const id = section.isMainSection
            ? guildDoc.channels.loggingChannels.find(x => x.key === punishmentType)
            : section.channels.loggingChannels.find(x => x.key === punishmentType);
        if (!id) return null;
        return GuildFgrUtilities.getCachedChannel<TextChannel>(guild, id.value);
    }
}

export namespace SuspensionManager {
    interface ISuspendedBase {
        nickname: string;
        reason: string;
        endsAt: number;
        duration: number;
        issuedTime: number;
        moderator: GuildMember | null;
        guildId: string;
    }

    interface ISuspendedDetails extends ISuspendedBase {
        roles: string[];
    }

    interface ISectionSuspendedDetails extends ISuspendedBase {
        sectionId: string;
    }

    // key = guild ID
    // value = collection of member IDs, suspension info
    const SuspendedMembers = new Collection<string, Collection<string, ISuspendedDetails>>();
    const SectionSuspendedMembers = new Collection<string, Collection<string, ISectionSuspendedDetails>>();

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
                const serverSus = new Collection<string, ISuspendedDetails>();
                const sectionSus = new Collection<string, ISectionSuspendedDetails>();

                const guild = await GlobalFgrUtilities.fetchGuild(guildDoc.guildId);
                if (!guild) continue;

                for await (const suspendedUser of guildDoc.moderation.suspendedUsers) {
                    serverSus.set(suspendedUser.affectedUser.id, {
                        nickname: suspendedUser.affectedUser.name,
                        reason: suspendedUser.reason,
                        endsAt: suspendedUser.timeEnd,
                        duration: (suspendedUser.timeEnd - suspendedUser.timeIssued) / 60000,
                        issuedTime: suspendedUser.timeIssued,
                        guildId: guild.id,
                        moderator: await GuildFgrUtilities.fetchGuildMember(guild, suspendedUser.moderator.id),
                        roles: suspendedUser.oldRoles
                    });
                }

                for (const section of guildDoc.guildSections) {
                    for await (const secSusUser of section.moderation.sectionSuspended) {
                        sectionSus.set(secSusUser.affectedUser.id, {
                            nickname: secSusUser.affectedUser.name,
                            reason: secSusUser.reason,
                            endsAt: secSusUser.timeEnd,
                            duration: (secSusUser.timeEnd - secSusUser.timeIssued) / 60000,
                            issuedTime: secSusUser.timeIssued,
                            guildId: guild.id,
                            moderator: await GuildFgrUtilities.fetchGuildMember(guild, secSusUser.moderator.id),
                            sectionId: section.uniqueIdentifier
                        });
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
                        secId: details.sectionId
                    });
                    continue;
                }

                // Check if this person still needs to serve time.
                if (Date.now() - details.endsAt >= 0)
                    continue;

                // If no section is found, then remove this person from section suspension list
                // Since the section doesn't exist, then it follows that we cannot really "unsuspend" this person
                // since there isn't said section
                const section = guildDoc.guildSections.find(x => x.uniqueIdentifier === details.sectionId);
                if (!section) {
                    idsToRemove.enqueue({
                        guildId: guild.id,
                        memberId: memberId,
                        removeFromDb: false,
                        secId: details.sectionId
                    });
                    continue;
                }

                const secVerifRole = await GuildFgrUtilities.fetchRole(guild, section.roles.verifiedRoleId);
                if (!secVerifRole) {
                    idsToRemove.enqueue({
                        guildId: guild.id,
                        memberId: memberId,
                        removeFromDb: true,
                        secId: details.sectionId
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
                    secId: details.sectionId
                });

                PunishmentManager.logPunishment(
                    suspendedMember,
                    "SectionUnsuspend",
                    {
                        nickname: details.nickname,
                        reason: details.reason,
                        duration: details.duration,
                        moderator: null,
                        issuedTime: details.issuedTime,
                        guildId: guild.id,
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

                if (Date.now() - details.endsAt >= 0)
                    continue;

                // Give back all valid roles
                const rolesToGiveBack = details.roles
                    .map(x => GuildFgrUtilities.getCachedRole(guild, x))
                    .filter(x => x !== null) as Role[];

                try {
                    await suspendedMember.roles.set(rolesToGiveBack);
                    if (suspendedMember.nickname)
                        await suspendedMember.setNickname(details.nickname).catch();

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
                            nickname: details.nickname,
                            reason: details.reason,
                            duration: details.duration,
                            moderator: null,
                            issuedTime: details.issuedTime,
                            guildId: guild.id,
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
     * @param {number} duration The duration, in milliseconds.
     * @param {string} reason The reason.
     * @returns {Promise<boolean>} Whether the suspension was successful.
     */
    export async function addSuspension(member: GuildMember, mod: GuildMember | null, duration: number,
                                        reason: string): Promise<boolean> {
        const timeStarted = Date.now();
        const timeEnd = Date.now() + duration;

        return true;
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