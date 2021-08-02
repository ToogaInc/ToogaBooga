import {Collection, Guild, GuildMember, MessageEmbed, Role, TextChannel} from "discord.js";
import {GeneralConstants} from "../constants/GeneralConstants";
import {IGuildInfo, ISectionInfo} from "../definitions";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {Queue} from "../utilities/Queue";
import {GlobalFgrUtilities} from "../utilities/fetch-get-request/GlobalFgrUtilities";
import {MongoManager} from "./MongoManager";

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
        duration: number;

        /**
         * The time this punishment (or removal of it) was issued.
         *
         * @type {number}
         */
        issuedTime: number;

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
    }

    /**
     * Acknowledges a punishment. This will issue the appropriate punishment and send a log message.
     * @param {GuildMember} member The member who is receiving a punishment or getting a punishment removed.
     * @param {GeneralConstants.ModLogType} punishmentType The punishment type.
     * @param {PunishmentManager.IPunishmentDetails} details The details.
     * @returns {Promise<boolean>} Whether the action is completed.
     */
    export async function acknowledgePunishment(
        member: GuildMember,
        punishmentType: GeneralConstants.ModLogType,
        details: IPunishmentDetails
    ): Promise<boolean> {
        let logChannel: TextChannel | null;
        const isAddingPunishment = punishmentType.includes("Un");

        // Find the appropriate logging channel.
        switch (punishmentType) {
            case "Blacklist":
            case "Unblacklist":
                logChannel = getLoggingChannel(member.guild, details.guildDoc, details.section, "Blacklist");
                break;
            case "ModmailBlacklist":
            case "ModmailUnblacklist":
                logChannel = getLoggingChannel(member.guild, details.guildDoc, details.section, "ModmailBlacklist");
                break;
            case "SectionSuspend":
            case "SectionUnsuspend":
                logChannel = getLoggingChannel(member.guild, details.guildDoc, details.section, "SectionSuspend");
                break;
            case "Mute":
            case "Unmute":
                logChannel = getLoggingChannel(member.guild, details.guildDoc, details.section, "Mute");
                break;
            case "Suspend":
            case "Unsuspend":
                logChannel = getLoggingChannel(member.guild, details.guildDoc, details.section, "Suspend");
                break;
            default:
                logChannel = null;
                break;
        }

        const logToChanEmbed = new MessageEmbed()
            .setColor(isAddingPunishment ? "RED" : "GREEN");
        const toSendToUserEmbed = new MessageEmbed()
            .setColor(isAddingPunishment ? "RED" : "GREEN");


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
        guild: string;
        moderator: GuildMember;
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
     */
    export function startChecker(): void {
        if (IsRunning) return;
        IsRunning = true;

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
        const idsToRemove = new Queue<{ guildId: string; memberId: string; removeFromDb: boolean; secId: string; }>();

        // Section suspended
        // Go through every guild that we need to process
        for await (const [guildId, secSuspendedPpl] of SectionSuspendedMembers) {
            // Make sure guild + guild document exists.
            const guild = await GlobalFgrUtilities.fetchGuild(guildId);
            if (!guild) continue;

            const guildDoc = MongoManager.CachedGuildCollection.get(guildId);
            if (!guildDoc) continue;

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

                PunishmentManager.acknowledgePunishment(
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
                        section: section
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

        for await (const [guildId, suspendedPpl] of SuspendedMembers) {
            const guild = await GlobalFgrUtilities.fetchGuild(guildId);
            if (!guild) continue;

            const guildDoc = MongoManager.CachedGuildCollection.get(guildId);
            if (!guildDoc) continue;

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

                    PunishmentManager.acknowledgePunishment(
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
                            section: mainSection
                        }
                    ).then();
                }
                catch (_) {
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
}

export namespace MuteManager {
}