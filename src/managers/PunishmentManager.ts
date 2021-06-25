import {Collection, Guild, Role, TextChannel} from "discord.js";
import {MongoManager} from "./MongoManager";
import {MessageUtilities} from "../utilities/MessageUtilities";
import {StringBuilder} from "../utilities/StringBuilder";
import {MiscUtilities} from "../utilities/MiscUtilities";
import {Queue} from "../utilities/Queue";
import {ISuspendedUser} from "../definitions/ISuspendedUser";
import {ISectionInfo} from "../definitions/db/ISectionInfo";
import {FetchGetRequestUtilities} from "../utilities/FetchGetRequestUtilities";

// TODO read through this to make sure it works conceptually.
export namespace PunishmentManager {
    interface ISuspendedBase {
        nickname: string;
        reason: string;
        endsAt: number;
        guild: string;
    }

    interface ISuspendedDetails extends ISuspendedBase {
        roles: string[];
    }

    interface ISectionSuspendedDetails extends ISuspendedBase {
        sectionId: string;
    }

    // Note: string is in the format "<ID>_<random numbers>"
    const SuspendedPeople = new Collection<string, ISuspendedDetails>();
    const SectionSuspendedPeople = new Collection<string, ISectionSuspendedDetails>();

    // If true, then we are just going to keep running the checker method.
    let isRunning = false;

    /**
     * Starts the punishment checker.
     */
    export function startChecker(): void {
        if (isRunning) return;
        isRunning = true;
        // Use .then() to suppress warning about promise not being acknowledged.
        checker().then();
    }

    /**
     * Stops the punishment checker.
     */
    export function stopChecker(): void {
        if (!isRunning) return;
        isRunning = false;
    }

    /**
     * The checker service. This should only be called by the `startChecker` function.
     * @private
     */
    async function checker(): Promise<void> {
        while (isRunning) {
            // string => the ID
            // boolean => Whether to remove from database.
            const idsToRemove = new Queue<[string, boolean]>();

            // Check each section suspended person.
            for await (const [id, details] of SectionSuspendedPeople) {
                const guild = await FetchGetRequestUtilities.fetchGuild(details.guild);
                // If the guild couldn't be found, that's a problem.
                if (!guild) continue;

                // Get the member.
                const suspendedMember = await FetchGetRequestUtilities.fetchGuildMember(guild, id.split("_")[0]);
                if (!suspendedMember) {
                    idsToRemove.enqueue([id, false]);
                    continue;
                }

                const currentDateTime = new Date();
                // If this is greater than 0, the person still needs to serve time.
                if (details.endsAt - currentDateTime.getTime() > 0) continue;

                const guildDbArr = await MongoManager.getGuildCollection().find({guildId: guild.id})
                    .toArray();
                // This should never hit.
                if (guildDbArr.length === 0) {
                    idsToRemove.enqueue([id, false]);
                    continue;
                }
                const guildDb = guildDbArr[0];
                const section = guildDb.guildSections.find(x => x.uniqueIdentifier === details.sectionId);
                // If the section isn't found, it must have been deleted.
                // In that case, we can "unsuspend" the person.
                if (!section) {
                    // No point in removing this entry from the db if the section doesn't exist.
                    idsToRemove.enqueue([id, false]);
                    continue;
                }
                const sectionRole = FetchGetRequestUtilities.getCachedRole(guild, section.roles.verifiedRoleId);
                if (!sectionRole)
                    continue;

                // if the member has the section verification role, then we don't need to handle this person.
                if (suspendedMember.roles.cache.has(sectionRole.id)) {
                    idsToRemove.enqueue([id, true]);
                    continue;
                }

                try {
                    await suspendedMember.roles.add(sectionRole);
                    idsToRemove.enqueue([id, true]);
                    // This is probably not needed.
                    if (!suspendedMember.nickname)
                        await suspendedMember.setNickname(details.nickname);

                    // Send a message to the logging channel and to the applicable person.
                    const suspendLogChannel = FetchGetRequestUtilities.getCachedChannel<TextChannel>(
                        guild,
                        guildDb.channels.logging.suspensionLoggingChannelId
                    );
                    if (suspendLogChannel) {
                        const logSb = new StringBuilder()
                            .append(`⇒ **Unsuspended Member:** ${suspendedMember} (${suspendedMember.id})`)
                            .appendLine()
                            .append("⇒ **Unsuspended By:** Automatic")
                            .appendLine()
                            .append("⇒ **Reason:** Automatic.")
                            .appendLine()
                            .append(`⇒ **Time:** ${MiscUtilities.getTime()}`);

                        const logEmbed = MessageUtilities.generateBlankEmbed(suspendedMember, "GREEN")
                            .setTitle(`Section Unsuspended: **${section.sectionName}**`)
                            .setDescription(logSb.toString())
                            .setTimestamp();
                        await suspendLogChannel.send({embeds: [logEmbed]}).catch();
                    }

                    const descSb = new StringBuilder()
                        .append("You have automatically been unsuspended from the section, ")
                        .append(`**\`${section.sectionName}\`**, in the server, **\`${guild.name}\`**. `)
                        .append("Please make sure you read through any applicable section and server rules. ")
                        .append("For context, your original suspension reason has been provided below.");
                    const sectionUnsuspendEmbed = MessageUtilities.generateBlankEmbed(guild, "GREEN")
                        .setTitle(`Unsuspended From ${guild.name} ⇒ ${section.sectionName}`)
                        .setDescription(descSb.toString())
                        .addField("Original Suspension Reason", details.reason)
                        .setTimestamp();
                    // DM the member, notifying him/her that he/she has been unsuspended.
                    await FetchGetRequestUtilities.sendMsg(suspendedMember, {embeds: [sectionUnsuspendEmbed]});
                } catch (e) {
                    // If the role couldn't be added, then don't remove the person from the list of suspended
                    // people since we want to give the role back.
                }
            } // End while

            // Remove any entries that we no longer need to check.
            while (idsToRemove.size() !== 0) {
                const [id, shouldRemove] = idsToRemove.dequeue();
                if (shouldRemove) {
                    const data = SectionSuspendedPeople.get(id) as ISectionSuspendedDetails;
                    await MongoManager.getGuildCollection().findOneAndUpdate({
                        guildId: data.guild, "guildSections.uniqueIdentifier": data.sectionId
                    }, {
                        $pull: {
                            "guildSections.$.properties.sectionSuspended": {
                                discordId: id.split("_")[0]
                            }
                        }
                    });
                }

                SectionSuspendedPeople.delete(id);
            }

            // Now, we will be checking the regular suspended people.
            for await (const [id, details] of SuspendedPeople) {
                const actualId = id.split("_")[0];
                const guild = await FetchGetRequestUtilities.fetchGuild(details.guild);

                // If the guild couldn't be found, that's a problem.
                if (!guild) continue;

                // Get the member. I think the fetch method throws an error if the member isn't found so try/catch.
                const suspendedMember = await FetchGetRequestUtilities.fetchGuildMember(guild, actualId);
               if (!suspendedMember) {
                    idsToRemove.enqueue([id, false]);
                    continue;
                }

                // If this is greater than 0, the person still needs to serve time.
                if (details.endsAt - Date.now() > 0) continue;

                const guildDbArr = await MongoManager.getGuildCollection().find({guildId: guild.id})
                    .toArray();
                if (guildDbArr.length === 0) {
                    idsToRemove.enqueue([id, false]);
                    continue;
                }
                const guildDb = guildDbArr[0];
                // Get every role that we owe back
                const allPossRoles = details.roles
                    .map(x => FetchGetRequestUtilities.getCachedRole(guild, x))
                    .filter(x => x !== null) as Role[];
                // And add those roles back to the person.
                try {
                    await suspendedMember.roles.set(allPossRoles);
                    idsToRemove.enqueue([id, true]);
                    if (!suspendedMember.nickname)
                        await suspendedMember.setNickname(details.nickname);

                    // Send a message to the logging channel and to the applicable person.
                    const suspendLogChannel = FetchGetRequestUtilities.getCachedChannel<TextChannel>(
                        guild,
                        guildDb.channels.logging.suspensionLoggingChannelId
                    );
                    if (suspendLogChannel && suspendLogChannel.isText()) {
                        const logSb = new StringBuilder()
                            .append(`⇒ **Unsuspended Member:** ${suspendedMember} (${suspendedMember.id})`)
                            .appendLine()
                            .append("⇒ **Unsuspended By:** Automatic")
                            .appendLine()
                            .append("⇒ **Reason:** Automatic.")
                            .appendLine()
                            .append(`⇒ **Time:** ${MiscUtilities.getTime()}`);

                        const logEmbed = MessageUtilities.generateBlankEmbed(suspendedMember, "GREEN")
                            .setTitle("Unsuspended From Server")
                            .setDescription(logSb.toString())
                            .setTimestamp();
                        await suspendLogChannel.send({embeds: [logEmbed]}).catch();
                    }

                    const descSb = new StringBuilder()
                        .append(`You have automatically been unsuspended from the server, **\`${guild.name}\`**. `)
                        .append("Please make sure you read through any applicable server rules. For context, your ")
                        .append("suspension reason has been provided below.");
                    const serverUnsuspendEmbed = MessageUtilities.generateBlankEmbed(guild, "GREEN")
                        .setTitle(`Unsuspended From ${guild.name}`)
                        .setDescription(descSb.toString())
                        .addField("Original Suspension Reason", details.reason)
                        .setTimestamp();
                    // DM the member, notifying him/her that he/she has been unsuspended.
                    await FetchGetRequestUtilities.sendMsg(suspendedMember, {embeds: [serverUnsuspendEmbed]});
                } catch (e) {
                    // If the role couldn't be added, then don't remove the person from the list of suspended
                    // people since we want to give the role back.
                }
            }

            // Remove any entries that we no longer need to check.
            while (idsToRemove.size() !== 0) {
                const [id, shouldRemove] = idsToRemove.dequeue();
                if (shouldRemove) {
                    const data = SuspendedPeople.get(id) as ISuspendedDetails;
                    await MongoManager.getGuildCollection().findOneAndUpdate({guildId: data.guild}, {
                        $pull: {
                            "guildSections.moderation.suspendedUsers": {
                                discordId: id.split("_")[0]
                            }
                        }
                    });
                }

                SuspendedPeople.delete(id);
            }

            // Wait a minute and then run again.
            await MiscUtilities.stopFor(60 * 1000);
        }
    }

    /**
     * Adds a member to the section suspension timer system. Every minute, a function will check to see if the
     * person can be unsuspended; if so, then the program will handle the unsuspension completely. You are
     * responsible for adding the person to the suspension database.
     * @param {ISuspendedUser} details The suspension details.
     * @param {Guild} guild The guild where this section suspension occurred.
     * @param {ISectionInfo} section The section where this person is suspended from.
     * @return {boolean} Whether the person was added to the section suspension timer.
     */
    export function addToSectionSuspensionTimer(details: ISuspendedUser, guild: Guild,
                                                section: ISectionInfo): boolean {
        // We don't want to add two of the same entries!
        for (const entry of SectionSuspendedPeople.filter(x => x.sectionId === section.uniqueIdentifier)) {
            if (entry[0].split("_")[0] === details.discordId)
                return false;
        }

        SectionSuspendedPeople.set(`${details.discordId}_${Math.round(Math.random() * 100000000000)}`, {
            guild: guild.id,
            sectionId: section.uniqueIdentifier,
            nickname: details.nickname,
            reason: details.reason,
            endsAt: details.dateTimeEnd
        });

        return true;
    }

    /**
     * Adds a member to the suspension timer system. Every minute, a function will check to see if the person can be
     * unsuspended; if so, then the program will handle the unsuspension completely. You are responsible for adding
     * the person to the suspension database.
     * @param {ISuspendedUser} details The suspension details.
     * @param {Guild} guild The guild where this section suspension occurred.
     * @param {string[]} oldRoles The roles that this person once had before being suspended.
     * @return {boolean} Whether the person was added to the suspension timer.
     */
    export function addToSuspensionTimer(details: ISuspendedUser, guild: Guild, oldRoles: string[]): boolean {
        for (const entry of SuspendedPeople.filter(x => x.guild === guild.id)) {
            if (entry[0].split("_")[0] === details.discordId)
                return false;
        }

        SuspendedPeople.set(`${details.discordId}_${Math.round(Math.random() * 100000000000)}`, {
            guild: guild.id,
            nickname: details.reason,
            endsAt: details.dateTimeEnd,
            roles: oldRoles,
            reason: details.reason
        });

        return true;
    }

    /**
     * Removes the person from the section suspension timer system. The bot will no longer handle the unsuspension of
     * this person; you are responsible for doing this.
     * @param {string} userToRemove The user to remove from the system.
     * @param {ISectionInfo} section The section where the person should no longer be checked.
     * @return {boolean} Whether the person was removed successfully.
     */
    export function removeFromSectionSuspensionTimer(userToRemove: string, section: ISectionInfo): boolean {
        let identifier = "";
        for (const entry of SectionSuspendedPeople.filter(x => x.sectionId === section.uniqueIdentifier)) {
            if (entry[0].split("_")[0] === userToRemove) {
                identifier = entry[0];
                break;
            }
        }

        return SectionSuspendedPeople.delete(identifier);
    }

    /**
     * Removes the person from the suspension timer system. The bot will no longer handle the unsuspension of this
     * person; you are responsible for doing this.
     * @param {string} userToRemove The user to remove from the system.
     * @param {Guild} guild The guild where the person should no longer be checked.
     * @return {boolean} Whether the person was removed successfully.
     */
    export function removeFromSuspensionTimer(userToRemove: string, guild: Guild): boolean {
        let identifier = "";
        for (const entry of SuspendedPeople.filter(x => x.guild === guild.id)) {
            if (entry[0].split("_")[0] === userToRemove) {
                identifier = entry[0];
                break;
            }
        }

        return SuspendedPeople.delete(identifier);
    }

    /**
     * Checks to see if the person is in the section suspension timer system.
     * @param {string} userToCheck The user to check.
     * @param {ISectionInfo} section The section to check.
     * @return {boolean} Whether the person is currently in the section suspension timer system.
     */
    export function isInSectionSuspensionTimer(userToCheck: string, section: ISectionInfo): boolean {
        for (const entry of SectionSuspendedPeople.filter(x => x.sectionId === section.uniqueIdentifier)) {
            if (entry[0].split("_")[0] === userToCheck)
                return true;
        }

        return false;
    }

    /**
     * Checks to see if the person is in the suspension timer system.
     * @param {string} userToCheck The user to check.
     * @param {Guild} guild The guild to check.
     * @return {boolean} Whether the person is currently in the suspension timer system.
     */
    export function isInSuspensionTimer(userToCheck: string, guild: Guild): boolean {
        for (const entry of SuspendedPeople.filter(x => x.guild === guild.id)) {
            if (entry[0].split("_")[0] === userToCheck)
                return true;
        }

        return false;
    }
}