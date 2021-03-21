import {DMChannel, Emoji, EmojiResolvable, GuildMember, MessageReaction, TextChannel, User} from "discord.js";
import {IGuildInfo} from "../definitions/major/IGuildInfo";
import {ISectionInfo} from "../definitions/major/ISectionInfo";
import {InteractionManager} from "./InteractionManager";
import {FetchRequestUtilities} from "../utilities/FetchRequestUtilities";
import {MongoManager} from "./MongoManager";
import {MessageUtilities} from "../utilities/MessageUtilities";
import {StringBuilder} from "../utilities/StringBuilder";
import {Emojis} from "../constants/Emojis";
import {AdvancedCollector} from "../utilities/collectors/AdvancedCollector";
import {UserManager} from "./UserManager";
import {StringUtil} from "../utilities/StringUtilities";
import {GeneralConstants} from "../constants/GeneralConstants";
import {IVerificationRequirements} from "../definitions/major/parts/IVerificationRequirements";
import {GeneralCollectorBuilder} from "../utilities/collectors/GeneralCollectorBuilder";

export namespace VerifyManager {

    export async function verify(member: GuildMember, guildDoc: IGuildInfo, section: ISectionInfo): Promise<void> {
        // If the person is currently interacting with something, don't let them verify.
        if (InteractionManager.InteractiveMenu.has(member.id))
            return;
        // Check if the verified role exists.
        const verifiedRole = await FetchRequestUtilities.fetchRole(member.guild, section.roles.verifiedRoleId);
        // We need this so we can send the person a message if needed.
        const verificationChannel = member.guild.channels.cache
            .get(section.channels.verification.verificationChannelId);

        // No verification channel = leave.
        if (!verificationChannel || !(verificationChannel instanceof TextChannel))
            return;

        const dmChannel = await FetchRequestUtilities.tryExecuteAsync<DMChannel>(async () => {
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

        // Get relevant channels.
        const verificationAttemptsChannel = member.guild.channels.cache
            .get(section.channels.verification.verificationLogsChannelId);
        const verificationSuccessChannel = member.guild.channels.cache
            .get(section.channels.verification.verificationSuccessChannelId);
        const manualVerificationChannel = member.guild.channels.cache
            .get(section.channels.verification.manualVerificationChannelId);

        // Check if this person is currently being manually verified.
        const manualVerifyEntry = section.properties.manualVerificationEntries
            .find(x => x.userId === member.id);
        // If this is true, then this person is being manually verified.
        if (manualVerifyEntry)
            return;

        // This has to be a verification channel so we don't need to double check.
        if (section.isMainSection) {
            await verifyMain(member, guildDoc, dmChannel);
            return;
        }
        else await verifySection(member, guildDoc, section);
    }

    /**
     * Verifies in the main server.
     * @param {GuildMember} member The member.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {DMChannel} dmChannel The DM channel.
     * @private
     */
    async function verifyMain(member: GuildMember, guildDoc: IGuildInfo, dmChannel: DMChannel): Promise<void> {
        let nameToUse: string | null = null;
        const entry = await MongoManager.getIdNameInfo(member.id);
        // See if we want to use a previously registered name.
        if (entry.length !== 0) {
            const descOldNameSb = new StringBuilder()
                .append("You have verified at least one in-game name with this bot. Would you like to verify ")
                .append("with one of the names shown below?")
                .appendLine()
                .appendLine()
                .append("If you do __not__ want to verify with one of the names shown below, react to the ")
                .append(`${Emojis.X_EMOJI} emoji or type "cancel." Otherwise, Otherwise, react to the emoji `)
                .append("corresponding to the name that you want to use.");
            const useOldNameEmbed = MessageUtilities.generateBlankEmbed(member, "GREEN")
                .setTitle("Verification: Old Name(s) Found")
                .setDescription(descOldNameSb.toString())
                .setFooter(`Verifying in: ${member.guild.name}`)
                .setTimestamp();
            // We assume that the person doesn't have 10 alts. If they do, well, screw them.
            let emoteIdx = 0;
            const emojisToUse: EmojiResolvable[] = [];
            for (const name of entry[0].rotmgNames.slice(0, 10)) {
                const num = emoteIdx++;
                emojisToUse.push(Emojis.NUMERICAL_EMOJIS[num]);
                const nameChoiceSb = new StringBuilder()
                    .append(`React to the ${Emojis.NUMERICAL_EMOJIS[num]} emoji, or type the number **\`${num}\`**, `)
                    .append("if you want to use this name");
                useOldNameEmbed.addField(`Name: **${name.ign}**`, nameChoiceSb.toString());
            }
            emojisToUse.push(Emojis.X_EMOJI);

            const colRes = await new AdvancedCollector(dmChannel, member, 1, "M")
                .startDoubleCollector<number>({
                    embed: useOldNameEmbed
                }, AdvancedCollector.getNumberPrompt(dmChannel, {min: 1, max: emojisToUse.length + 1}), {
                    reactions: emojisToUse,
                    reactToMsg: true,
                    deleteBaseMsgAfterComplete: true,
                    cancelFlag: "cancel",
                    removeAllReactionAfterReact: false
                });
            // No response or cancel.
            if (colRes === null) return;
            // Got an emoji
            if (colRes instanceof Emoji) {
                const selectedIdx = emojisToUse.findIndex(x => x === colRes.name);
                // Cancel is last element.
                if (selectedIdx === -1 || selectedIdx === emojisToUse.length - 1)
                    return;
                // Otherwise, get right element.
                nameToUse = entry[0].rotmgNames[selectedIdx].ign;
            }
            else nameToUse = entry[0].rotmgNames[colRes - 1].ign;
        }

        // A name wasn't selected, so we ask them.
        if (!nameToUse) {
            const askNameEmbed = MessageUtilities.generateBlankEmbed(member, "GREEN")
                .setTitle("Name to Use?")
                .setDescription("What name do you want to verify with?")
                .addField("Cancel", `To cancel this process, react to the ${Emojis.X_EMOJI} emoji.`)
                .setFooter(`Verifying in: ${member.guild.name}`);
            const invalidNameEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                .setTitle("Invalid Name")
                .setDescription("The name you selected is invalid. Your name must be 14 characters or under and must" +
                    " only contain letters.")
                .setFooter(`Verifying in: ${member.guild.name}`);
            // TODO add contact support or something here.
            const nameInUseEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                .setTitle("Name In Use")
                .setDescription("The name you selected has already been registered with someone else.")
                .setFooter(`Verifying in: ${member.guild.name}`);
            // Wait for a valid response.
            const selected: string | Emoji | null = await new AdvancedCollector(dmChannel, member, 5, "M")
                .startDoubleCollector<string>({embed: askNameEmbed}, async (m) => {
                    m.content = m.content.trim();
                    if (!UserManager.isValidRealmName(m.content)) {
                        await MessageUtilities.sendThenDelete({embed: invalidNameEmbed}, dmChannel);
                        return;
                    }

                    // Check to see if the name is used by anyone else.
                    // If we have results and ALL results do not have this member's ID, then we stop the person from
                    // using this name.
                    const dbResults = await MongoManager.findNameInIdNameCollection(m.content);
                    if (dbResults.length > 0 && dbResults.every(x => x.discordUserId !== member.id)) {
                        await MessageUtilities.sendThenDelete({embed: nameInUseEmbed}, dmChannel);
                        return;
                    }

                    return m.content;
                }, {
                    reactions: [Emojis.X_EMOJI],
                    reactToMsg: true,
                    deleteBaseMsgAfterComplete: true,
                    cancelFlag: "cancel",
                    removeAllReactionAfterReact: false
                });

            // null or Emoji (which is the X) means cancel
            if (!selected || selected instanceof Emoji)
                return;
            nameToUse = selected;
        }

        // No name selected, should never happen.
        if (!nameToUse)
            return;

        // Verification officially begins.
        // Generate a description for the embed.
        const verifReq = guildDoc.otherMajorConfig.verificationProperties.verificationRequirements;
        const verifIntroDesc = new StringBuilder()
            .append(`You have selected the in-game name: **\`${nameToUse}**\`. To access your RealmEye profile, `)
            .append(`click [here](https://www.realmeye.com/player/${nameToUse}). If you need a password to log into `)
            .append("your RealmEye account, follow the directions outlined in the first question ")
            .append(`[here](https://www.realmeye.com/q-and-a).`)
            .appendLine()
            .appendLine()
            .append("For your convenience, the requirements to gain membership to this server are ")
            .append(`shown below: ${getVerificationReqsAsString(verifReq)}`)
            .appendLine()
            .appendLine()
            .append("You are almost done; however, you have a few more things that you need to do.")
            .append(`To cancel the verification process, react to the ${Emojis.X_EMOJI} emoji.`);

        const currDateTime = Date.now();
        const verificationCode = StringUtil.generateRandomString(15);
        const verificationIntroEmbed = MessageUtilities.generateBlankEmbed(member, "RANDOM")
            .setTitle(`${Emojis.HOURGLASS_EMOJI} Verifying For: **${member.guild.name}**`)
            .setDescription(verifIntroDesc.toString())
            .addField("1. Verification Code", new StringBuilder().append("Your verification code is:")
                .append(StringUtil.codifyString(verificationCode))
                .append("Put this verification code in your RealmEye profile's **description**. Any line will work.")
                .toString())
            .addField("2. Check Profile Settings", new StringBuilder().append("Please make sure your profile ")
                .append("is set so everyone can see the above listed requirements. You may view your profile's ")
                .append(`settings page [here](https://www.realmeye.com/settings-of/${nameToUse}).`))
            .addField("3. Wait", new StringBuilder("RealmEye may take upwards of 30 seconds to fully ")
                .append("update. Please wait for at least 30 seconds before you move to the next step."))
            .addField("4. Confirm", new StringBuilder().append(`React to the ${Emojis.GREEN_CHECK_MARK_EMOJI} `)
                .append("emoji to begin the verification check. If you have already reacted, please un-react and ")
                .append("then react again."))
            .setFooter("Verification Session Ends At:")
            .setTimestamp(currDateTime + 15 * 60 * 1000);
        const reactions: EmojiResolvable[] = [Emojis.GREEN_CHECK_MARK_EMOJI, Emojis.X_EMOJI];
        const verificationMsg = await dmChannel.send(verificationIntroEmbed);
        AdvancedCollector.reactFaster(verificationMsg, reactions);
        // Start the reaction collectors.
        const collector = new GeneralCollectorBuilder()
            .setMessage(verificationMsg)
            .setTime(15 * 60 * 1000)
            .setReactionFilter((r, u) => reactions.includes(r.emoji) && u.id === member.id)
            .addReactionHandler(Emojis.GREEN_CHECK_MARK_EMOJI, (user, instance) => {

            })
            .addReactionHandler(Emojis.X_EMOJI, (user, instance) => {
                instance.stop("CANCEL_PROCESS");
            })
            .setEndOfCollectorFunc(r => {
                if (r === "time") {

                    return;
                }

                if (r === "CANCEL_PROCESS") {

                    return;
                }
            })
            .build();
        collector.start();
    }

    async function verifySection(member: GuildMember, guildDoc: IGuildInfo, section: ISectionInfo): Promise<void> {

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
            for (const stat in verifyReqs.exaltations.minimum) {
                if (verifyReqs.exaltations.minimum[stat] <= 0) continue;
                const statName = GeneralConstants.SHORT_STAT_TO_LONG[stat];
                requirementInfo.append(`• ${verifyReqs.exaltations.minimum[stat]} ${statName} Exaltations`)
                    .appendLine();
            }
        }

        // Graveyard summary.
        if (verifyReqs.graveyardSummary.checkThis) {
            for (const gyStat in verifyReqs.graveyardSummary.minimum) {
                if (verifyReqs.graveyardSummary.minimum[gyStat] <= 0) continue;
                const dungeonName = GeneralConstants.GY_HIST_DUNGEON_MAP[gyStat];
                requirementInfo.append(`• ${verifyReqs.graveyardSummary.minimum[gyStat]} ${dungeonName}`)
                    .appendLine();
            }
        }

        if (verifyReqs.guild.checkThis) {
            requirementInfo.appendLine();
            if (verifyReqs.guild.guildName)
                requirementInfo.append(`• In Guild: ${verifyReqs.guild.guildName}`)
                    .appendLine();

            if (verifyReqs.guild.guildName && verifyReqs.guild.guildRank)
                requirementInfo.append(`• With Guild Rank: ${verifyReqs.guild.guildRank}`);
        }

        return StringUtil.codifyString(requirementInfo.toString());
    }
}