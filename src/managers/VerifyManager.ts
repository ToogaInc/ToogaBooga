import {DMChannel, GuildMember, TextChannel} from "discord.js";
import {IGuildInfo} from "../definitions/db/IGuildInfo";
import {ISectionInfo} from "../definitions/db/ISectionInfo";
import {InteractionManager} from "./InteractionManager";
import {GuildFgrUtilities} from "../utilities/fetch-get-request/GuildFgrUtilities";
import {MessageUtilities} from "../utilities/MessageUtilities";
import {StringBuilder} from "../utilities/StringBuilder";
import {StringUtil} from "../utilities/StringUtilities";
import {GeneralConstants} from "../constants/GeneralConstants";
import {IVerificationRequirements} from "../definitions/parts/IVerificationRequirements";
import {RealmSharperWrapper} from "../private-api/RealmSharperWrapper";
import {PrivateApiDefinitions} from "../private-api/PrivateApiDefinitions";
import {IPropertyKeyValuePair} from "../definitions/IPropertyKeyValuePair";
import {GlobalFgrUtilities} from "../utilities/fetch-get-request/GlobalFgrUtilities";

export namespace VerifyManager {
    const GUILD_ROLES: string[] = [
        "Founder",
        "Leader",
        "Officer",
        "Member",
        "Initiate"
    ];

    /**
     * The function where verification begins.
     * @param {GuildMember} member The member to verify.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section to verify in.
     */
    export async function verify(member: GuildMember, guildDoc: IGuildInfo, section: ISectionInfo): Promise<void> {
        if (!(await RealmSharperWrapper.isOnline())) {
            await GlobalFgrUtilities.sendMsg(member, {
                embeds: [
                    MessageUtilities.generateBlankEmbed(member, "RED")
                    .setTitle("Verification Unavailable.")
                    .setDescription("Verification is currently unavailable. Please try again later.")
                    .setTimestamp()
                ]
            });
            return;
        }
        // If the person is currently interacting with something, don't let them verify.
        if (InteractionManager.InteractiveMenu.has(member.id))
            return;
        // Check if the verified role exists.
        const verifiedRole = await GuildFgrUtilities.fetchRole(member.guild, section.roles.verifiedRoleId);
        // We need this so we can send the person a message if needed.
        const verificationChannel = GuildFgrUtilities
            .getCachedChannel<TextChannel>(member.guild, section.channels.verification.verificationChannelId);

        // No verification channel = leave.
        if (!verificationChannel)
            return;

        const dmChannel = await GlobalFgrUtilities.tryExecuteAsync<DMChannel>(async () => {
            const dm = await member.createDM();
            if (!dm) return null;
            await dm.send("This is a test message to ensure that I can send messages to your direct messages.");
            return dm;
        });

        // If we can't open a DM, then don't bother.
        if (!dmChannel) {
            await verificationChannel.send(`${member}, I couldn't direct message you. Please make sure anyone can `
                + "direct message you and then try again.").catch();
            return;
        }

        // No verified role = no go. Or, if the person is verified, no need for them to get verified.
        if (!verifiedRole || member.roles.cache.has(verifiedRole.id))
            return;

        // Check if this person is currently being manually verified.
        const manualVerifyEntry = section.properties.manualVerificationEntries
            .find(x => x.userId === member.id);
        // If this is true, then this person is being manually verified.
        if (manualVerifyEntry)
            return;

        // This has to be a verification channel so we don't need to double check.
        InteractionManager.InteractiveMenu.set(member.id, "VERIFICATION");
        if (section.isMainSection) {
            await verifyMain(member, guildDoc, dmChannel);
            return;
        }

        await verifySection(member, section, dmChannel);
    }

    /**
     * Verifies in the main server.
     * @param {GuildMember} member The member.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {DMChannel} dmChannel The DM channel.
     * @private
     */
    async function verifyMain(member: GuildMember, guildDoc: IGuildInfo, dmChannel: DMChannel): Promise<void> {
        // TODO
    }

    async function verifySection(member: GuildMember, section: ISectionInfo, dmChannel: DMChannel): Promise<void> {
        // TODO
    }

    async function handleManualVerification(member: GuildMember): Promise<void> {

    }

    interface IReqCheckResult {
        conclusion: "PASS" | "TRY_AGAIN" | "MANUAL" | "FAIL";
        manualIssues: (IPropertyKeyValuePair<string, string> & { log: string; })[];
        fatalIssues: (IPropertyKeyValuePair<string, string> & { log: string; })[];
        taIssues: (IPropertyKeyValuePair<string, string> & { log: string; })[];
    }

    /**
     * Checks a series of requirements to ensure that they are fulfilled.
     * @param {GuildMember} member The member to check.
     * @param {DMChannel} dmChannel The DM channel.
     * @param {ISectionInfo | IGuildInfo} section The section to check the requirements for.
     * @param {PrivateApiDefinitions.IPlayerData} resp The player's stats.
     * @return {Promise<IReqCheckResult>} The results of this check.
     * @private
     */
    async function checkRequirements(member: GuildMember, dmChannel: DMChannel, section: ISectionInfo | IGuildInfo,
                                     resp: PrivateApiDefinitions.IPlayerData): Promise<IReqCheckResult> {
        const verifReq = section.otherMajorConfig.verificationProperties.verificationRequirements;
        const result: IReqCheckResult = {
            conclusion: "PASS",
            manualIssues: [],
            fatalIssues: [],
            taIssues: []
        };

        // Check requirements.
        // Start with generic requirements.
        if (verifReq.lastSeen.mustBeHidden && resp.lastSeen !== "hidden") {
            result.taIssues.push({
                key: "Last Seen Location is Not Private",
                value: "Your last seen location is not hidden. Please make sure no one can see it and then try again.",
                log: "User's last seen location is public."
            });
        }

        // Check guild. Failure to pass these tests will result in a fail.
        if (verifReq.guild.checkThis) {
            if (verifReq.guild.guildName.checkThis
                && resp.guild.toLowerCase() !== verifReq.guild.guildName.name.toLowerCase()) {
                const guildInDisplay = `**\`${resp.guild}\`**`;
                const guildNeededDisplay = `**\`${verifReq.guild.guildName.name}\`**`;
                result.fatalIssues.push({
                    key: "Not In Correct Guild",
                    value: resp.guild
                        ? `You are in the guild ${guildInDisplay} but must be in the guild ${guildNeededDisplay}.`
                        : `You are not in a guild but must be in the guild ${guildNeededDisplay}.`,
                    log: resp.guild
                        ? `User is in guild ${guildInDisplay} but must be in the guild ${guildNeededDisplay}.`
                        : `User is not in a guild but must be in the guild ${guildNeededDisplay}.`
                });
                result.conclusion = "FAIL";
                return result;
            }

            if (verifReq.guild.guildRank.checkThis
                && !isValidGuildRank(verifReq.guild.guildRank.minRank, resp.guildRank)) {
                const rankHasDisplay = `**\`${resp.rank}\`**`;
                const rankNeedDisplay = `**\`${verifReq.rank}\`**`;
                result.fatalIssues.push({
                    key: "Not In Correct Guild",
                    value: resp.guild
                        ? `You have the rank ${rankHasDisplay} but must have at least rank ${rankNeedDisplay}.`
                        : `You must be in the guild, **\`${verifReq.guild.guildName.name}\`**.`,
                    log: resp.guild
                        ? `User has the rank ${rankHasDisplay} but must have at least rank ${rankNeedDisplay}.`
                        : `User is not in the guild **\`${verifReq.guild.guildName.name}\`**.`
                });
                result.conclusion = "FAIL";
                return result;
            }
        }

        // Check rank.
        if (verifReq.rank.checkThis && resp.rank < verifReq.rank.minRank) {
            result.manualIssues.push({
                key: "Rank Too Low",
                value: `You have **\`${resp.rank}\`** stars out of the ${verifReq.rank.minRank} required stars needed.`,
                log: `User has **\`${resp.rank}\`**/${verifReq.rank.minRank} required stars needed.`
            });
        }

        // Check alive fame.
        if (verifReq.aliveFame.checkThis && resp.fame < verifReq.aliveFame.minFame) {
            result.manualIssues.push({
                key: "Alive Fame Too Low",
                value: `You have **\`${resp.fame}\`** alive fame out of the ${verifReq.aliveFame.minFame} `
                    + "required alive fame.",
                log: `User has **\`${resp.fame}\`**/${verifReq.aliveFame.minFame} required alive fame.`
            });
        }

        const gyHist = await RealmSharperWrapper.getGraveyardSummary(resp.name);
        // Check characters.
        if (verifReq.characters.checkThis) {
            // Clone copy since arrays are passed by reference/values.
            const neededStats: number[] = [];
            for (const stat of verifReq.characters.statsNeeded)
                neededStats.push(stat);

            // If we can check past deaths, let's update the array of neededStats to reflect that.
            if (verifReq.characters.checkPastDeaths && gyHist) {
                const stats = gyHist.statsCharacters.map(x => x.stats);
                for (const statInfo of stats) {
                    for (let i = 0; i < statInfo.length; i++) {
                        if (neededStats[i] > 0) {
                            neededStats[i] -= statInfo[i];
                            continue;
                        }

                        // If the stat in question is already fulfilled, we check if any of the lower stats need to
                        // be checked.
                        for (let j = i - 1; j >= 0; j--) {
                            if (neededStats[j] > 0) {
                                neededStats[j] -= statInfo[i];
                                break;
                            }
                        }
                    }
                }
            }

            // Here, we can check each character's individual stats.
            for (const character of resp.characters.filter(x => x.statsMaxed !== -1)) {
                if (neededStats[character.statsMaxed] > 0) {
                    neededStats[character.statsMaxed]--;
                    continue;
                }

                for (let i = character.statsMaxed - 1; i >= 0; i--) {
                    if (neededStats[i] > 0) {
                        neededStats[i]--;
                        break;
                    }
                }
            }

            if (neededStats.some(x => x > 0)) {
                const missingStats = new StringBuilder();
                for (let i = 0; i < neededStats.length; i++) {
                    if (neededStats[i] <= 0) continue;
                    missingStats.append(`- Need ${neededStats[i]} ${i}/${GeneralConstants.NUMBER_OF_STATS}s`)
                        .appendLine();
                }

                const displayStr = StringUtil.codifyString(missingStats.toString());
                result.manualIssues.push({
                    key: "Stats Requirement Not Fulfilled",
                    value: `You need to fulfill the following stats requirements: ${displayStr}`,
                    log: `User needs to fulfill the following stats requirements: ${displayStr}`
                });
            }
        }

        if (verifReq.graveyardSummary.checkThis) {
            if (!gyHist) {
                result.taIssues.push({
                    key: "Graveyard History Private",
                    value: "I am not able to access your graveyard summary. Make sure your graveyard is set so anyone "
                        + "can see it and then try again.",
                    log: "User's graveyard information is private."
                });
            }
            else {
                const issues: string[] = [];
                const logIssues: string[] = [];
                for (const gyStat of verifReq.graveyardSummary.minimum) {
                    if (!(gyStat.key in GeneralConstants.GY_HIST_ACHIEVEMENTS)) continue;
                    const gyHistKey = GeneralConstants.GY_HIST_ACHIEVEMENTS[gyStat.key];
                    const data = gyHist.properties.find(x => x.achievement === gyHistKey);
                    // Doesn't qualify because dungeon doesn't exist.
                    if (!data) {
                        issues.push(`- You do not have any ${gyStat.key} completions.`);
                        logIssues.push(`- No ${gyStat.key} completions.`);
                        continue;
                    }

                    // Doesn't qualify because not enough
                    if (gyStat.value > data.total) {
                        issues.push(`- You have ${data.total} / ${gyStat.key} total ${gyStat.key} completions needed.`);
                        logIssues.push(`- ${data.total} / ${gyStat.key} total ${gyStat.key} completions.`);
                    }
                }

                if (issues.length > 0) {
                    const normalDisplay = StringUtil.codifyString(issues.join("\n"));
                    const logDisplay = StringUtil.codifyString(logIssues.join("\n"));
                    result.manualIssues.push({
                        key: "Dungeon Completion Requirement Not Fulfilled",
                        value: `You still need to satisfy the following dungeon requirements: ${normalDisplay}`,
                        log: `User has not fulfilled the following dungeon requirements: ${logDisplay}`
                    });
                }
            }
        }

        if (verifReq.exaltations.checkThis) {
            const exaltData = await RealmSharperWrapper.getExaltation(resp.name);
            if (!exaltData) {
                result.taIssues.push({
                    key: "Exaltation Information Private",
                    value: "I am not able to access your exaltation data. Make sure anyone can see your exaltation "
                        + "data and then try again.",
                    log: "User's exaltation information is private."
                });
            }
            else {
                // We use this variable to keep track of each stat and corresponding exaltations needed.
                const neededExalt: { [s: string]: number } = {};
                for (const d of Object.keys(GeneralConstants.SHORT_STAT_TO_LONG))
                    neededExalt[d] = verifReq.exaltations.minimum[d];

                // For each character...
                for (const entry of exaltData.exaltations) {
                    // For each stat...
                    for (const actExaltStat of Object.keys(entry.exaltationStats)) {
                        for (const stat of Object.keys(GeneralConstants.SHORT_STAT_TO_LONG))
                            if (actExaltStat === GeneralConstants.SHORT_STAT_TO_LONG[stat].toLowerCase())
                                neededExalt[stat] -= entry.exaltationStats[actExaltStat];
                    }
                }

                // If we happen to have any stats whose exaltation number is > 0, then we want to show them.
                const notMetExaltations = Object.keys(neededExalt)
                    .filter(x => neededExalt[x] > 0);
                if (notMetExaltations.length > 0) {
                    const issuesExaltations = new StringBuilder();
                    for (const statNotFulfilled of notMetExaltations) {
                        const statName = GeneralConstants.SHORT_STAT_TO_LONG[statNotFulfilled];
                        issuesExaltations.append(`- Need ${neededExalt[statNotFulfilled]} ${statName} Exaltations.`)
                            .appendLine();
                    }

                    const strDisplay = StringUtil.codifyString(issuesExaltations.toString());
                    result.manualIssues.push({
                        key: "Exaltation Requirement Not Satisfied",
                        value: `You did not satisfy one or more exaltation requirements: ${strDisplay}`,
                        log: `User did not satisfy one or more exaltation requirements: ${strDisplay}`
                    });
                }
            }
        }

        // Assess whether this person passed verification requirements.
        result.conclusion = result.fatalIssues.length > 0
            ? "FAIL"
            : result.taIssues.length > 0
                ? "TRY_AGAIN"
                : result.manualIssues.length > 0
                    ? "MANUAL"
                    : "PASS";
        return result;
    }

    /**
     * Checks whether a person has the required guild rank or higher.
     * @param {string} minNeeded The minimum rank needed.
     * @param {string} actual The person's rank.
     * @return {boolean} Whether the rank is good.
     */
    export function isValidGuildRank(minNeeded: string, actual: string): boolean {
        if (minNeeded === actual) return true;
        for (let i = GUILD_ROLES.length - 1; i >= 0; i--) {
            if (GUILD_ROLES[i] !== minNeeded) continue;
            if (GUILD_ROLES[i] === actual) return true;
        }
        return false;
    }

    /**
     * Generates a string containing the verification requirements.
     * @param {IVerificationRequirements} verifyReqs The section verification requirements.
     * @return {string} The resulting string.
     */
    export function getVerificationReqsAsString(verifyReqs: IVerificationRequirements): string {
        const requirementInfo = new StringBuilder();

        if (verifyReqs.lastSeen.mustBeHidden)
            requirementInfo.append("• Hidden Last Seen Location")
                .appendLine();

        if (verifyReqs.rank.checkThis && verifyReqs.rank.minRank >= 0)
            requirementInfo.append(`• At Least ${verifyReqs.rank.minRank} Stars`);

        // Show alive fame requirements.
        if (verifyReqs.aliveFame.checkThis && verifyReqs.aliveFame.minFame > 0)
            requirementInfo.append(`• ${verifyReqs.aliveFame.minFame} Alive Fame`)
                .appendLine();

        // Show character requirements.
        if (verifyReqs.characters.checkThis && verifyReqs.characters.statsNeeded.some(x => x > 0)) {
            for (let i = 0; i < verifyReqs.characters.statsNeeded.length; i++) {
                if (verifyReqs.characters.statsNeeded[i] === 0) continue;
                requirementInfo.append(`• ${verifyReqs.characters.statsNeeded[i]} ${i}/`)
                    .append(`${GeneralConstants.NUMBER_OF_STATS} `);
                if (verifyReqs.characters.checkPastDeaths)
                    requirementInfo.append("(Dead or Alive Characters)");
                else
                    requirementInfo.append("(Alive Characters)");
                requirementInfo.appendLine();
            }
        }

        // Show exaltation requirements.
        if (verifyReqs.exaltations.checkThis) {
            for (const stat of Object.keys(verifyReqs.exaltations.minimum)) {
                if (verifyReqs.exaltations.minimum[stat] <= 0) continue;
                const statName = GeneralConstants.SHORT_STAT_TO_LONG[stat];
                requirementInfo.append(`• ${verifyReqs.exaltations.minimum[stat]} ${statName} Exaltations`)
                    .appendLine();
            }
        }

        // Graveyard summary.
        if (verifyReqs.graveyardSummary.checkThis) {
            for (const gyStat of verifyReqs.graveyardSummary.minimum) {
                if (gyStat.value <= 0) continue;
                if (!(gyStat.key in GeneralConstants.GY_HIST_ACHIEVEMENTS)) continue;
                requirementInfo.append(`• ${gyStat.value} ${gyStat.key} Completed`)
                    .appendLine();
            }
        }

        if (verifyReqs.guild.checkThis) {
            requirementInfo.appendLine();
            if (verifyReqs.guild.guildName.checkThis && verifyReqs.guild.guildName)
                requirementInfo.append(`• In Guild: ${verifyReqs.guild.guildName}`)
                    .appendLine();

            if (verifyReqs.guild.guildRank.checkThis && verifyReqs.guild.guildName && verifyReqs.guild.guildRank)
                requirementInfo.append(`• With Guild Rank: ${verifyReqs.guild.guildRank}`);
        }

        return StringUtil.codifyString(requirementInfo.toString());
    }
}