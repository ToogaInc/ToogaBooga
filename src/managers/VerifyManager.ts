import {DMChannel, Emoji, EmojiResolvable, GuildMember, TextChannel} from "discord.js";
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
import {RealmSharperWrapper} from "../private_api/RealmSharperWrapper";
import {PrivateApiDefinitions} from "../private_api/PrivateApiDefinitions";

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
            await FetchRequestUtilities.sendMsg(member, {
                embed: MessageUtilities.generateBlankEmbed(member, "RED")
                    .setTitle("Verification Unavailable.")
                    .setDescription("Verification is currently unavailable. Please try again later.")
                    .setTimestamp()
            });
            return;
        }
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
        else await verifySection(member, section, dmChannel);
    }

    /**
     * Verifies in the main server.
     * @param {GuildMember} member The member.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {DMChannel} dmChannel The DM channel.
     * @private
     */
    async function verifyMain(member: GuildMember, guildDoc: IGuildInfo, dmChannel: DMChannel): Promise<void> {
        // Make note of the verification logs channel.
        const veriAttemptsChannel = member.guild.channels.cache
            .get(guildDoc.channels.verificationChannels.verificationLogsChannelId) as TextChannel | undefined;
        const veriSuccessChannel = member.guild.channels.cache
            .get(guildDoc.channels.verificationChannels.verificationSuccessChannelId) as TextChannel | undefined;

        veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.HOURGLASS_EMOJI} **\`[Main]\`** `)
            .append(`${member} has started the verification process.`).toString());
        let nameToUse: string | null = null;
        const entry = await MongoManager.findIdInIdNameCollection(member.id);
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
            if (colRes === null) {
                veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.X_EMOJI} **\`[Main]\`** `)
                    .append(`${member} has canceled the verification process.`).toString());
                return;
            }
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
                    if (dbResults.length > 0 && dbResults.every(x => x.discordId !== member.id)) {
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
            if (!selected || selected instanceof Emoji) {
                veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.X_EMOJI} **\`[Main]\`** `)
                    .append(`${member} has canceled the verification process.`).toString());
                return;
            }
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

        veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.HOURGLASS_EMOJI} **\`[Main]\`** `)
            .append(`${member} has selected the name: **\`${nameToUse}\`**. This person's verification code is `)
            .append(`**\`${verificationCode}\`**.`).toString());

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
            .addField("4. Confirm", new StringBuilder().append(`React to the ${Emojis.GREEN_CHECK_EMOJI} `)
                .append("emoji to begin the verification check. If you have already reacted, please un-react and ")
                .append("then react again."))
            .setFooter("Verification Session Ends At:")
            .setTimestamp(currDateTime + 15 * 60 * 1000);
        const reactions: EmojiResolvable[] = [Emojis.GREEN_CHECK_EMOJI, Emojis.X_EMOJI];
        const verificationMsg = await dmChannel.send(verificationIntroEmbed);
        AdvancedCollector.reactFaster(verificationMsg, reactions);

        // Start the reaction collectors.
        let lastChecked = 0;
        const collector = new GeneralCollectorBuilder()
            .setMessage(verificationMsg)
            .setTime(15 * 60 * 1000)
            .setReactionFilter((r, u) => reactions.includes(r.emoji) && u.id === member.id)
            .addReactionHandler(Emojis.GREEN_CHECK_EMOJI, async (user, instance) => {
                const timeDiff = Date.now() - lastChecked;
                if (timeDiff < 30 * 1000) {
                    const timeLeft = 30 - Math.round(timeDiff / 1000);
                    const needToWaitEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                        .setTitle("Need To Wait.")
                        .setDescription(new StringBuilder().append("Slow down! You need to wait at least ")
                            .append(`${timeLeft} seconds before you can try again.`))
                        .setFooter(`Verifying In: ${member.guild.name}`);
                    MessageUtilities.sendThenDelete({embed: needToWaitEmbed}, dmChannel);

                    veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.HOURGLASS_EMOJI} **\`[Main]\`** `)
                        .append(`${member} still needs to wait ${timeLeft} seconds until he or she can attempt to `)
                        .append("verify again.").toString());
                    return;
                }

                lastChecked = Date.now();
                if (!(await RealmSharperWrapper.isOnline())) {
                    instance.stop("NOT_CONNECTED");
                    return;
                }

                // Make initial request to RealmEye.
                const resp = await RealmSharperWrapper.getPlayerInfo(nameToUse!);
                if (!resp) {
                    const noPlayerDataEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                        .setTitle("Unable to Fetch RealmEye Profile")
                        .setDescription(new StringBuilder().append("I couldn't fetch your RealmEye profile. Make ")
                            .append("sure your profile is public. If you typed your name incorrectly, please restart ")
                            .append("the verification process."))
                        .setFooter("Profile Not Found.");
                    MessageUtilities.sendThenDelete({embed: noPlayerDataEmbed}, dmChannel);

                    veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.HOURGLASS_EMOJI} **\`[Main]\`** `)
                        .append(`${member}'s profile could not be found.`).toString());
                    return;
                }

                // Search description for valid verification code.
                if (!resp.description.some(x => x.includes(verificationCode))) {
                    const codeNotFoundEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                        .setTitle("Description Not Found")
                        .setDescription(new StringBuilder().append("I couldn't find the verification code in your ")
                            .append("description. Please update your description so it contains this verification ")
                            .append("code:")
                            .append(StringUtil.codifyString(verificationCode)))
                        .setFooter("Verification Code Not Found.");
                    MessageUtilities.sendThenDelete({embed: codeNotFoundEmbed}, dmChannel);

                    veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.HOURGLASS_EMOJI} **\`[Main]\`** `)
                        .append(`${member} (**\`${resp.name}\`**) does not have the verification code in his or her `)
                        .append(`description. The verification code is: **\`${verificationCode}\`**.`).toString());
                    return;
                }

                // Check all requirements.
                const res = await checkRequirements(member, dmChannel, guildDoc, resp);
                if (!res) return;

                nameToUse = resp.name;
                instance.stop("PASSED_ALL");
            })
            .addReactionHandler(Emojis.X_EMOJI, async (user, instance) => {
                instance.stop("CANCEL_PROCESS");
            })
            .setEndOfCollectorFunc(async r => {
                if (r === "MANUAL") {
                    await handleManualVerification(member);
                    return;
                }

                // Default timed out
                if (r === "time") {
                    const timedOutEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                        .setTitle("Verification Timed Out")
                        .setDescription(new StringBuilder().append("Your verification process has timed out. Please ")
                            .append("restart the verification process."))
                        .setFooter("Verification Timed Out.");
                    MessageUtilities.sendThenDelete({embed: timedOutEmbed}, dmChannel);

                    veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.X_EMOJI} **\`[Main]\`** `)
                        .append(`${member}'s verification process has been timed out. He or she will need to restart `)
                        .append("the verification process.").toString());
                    return;
                }

                // Process canceled by the user.
                if (r === "CANCEL_PROCESS") {
                    await verificationMsg.delete().catch();
                    veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.X_EMOJI} **\`[Main]\`** `)
                        .append(`${member}'s verification process has been canceled.`).toString());
                    return;
                }

                // RealmSharper not connected.
                if (r === "NOT_CONNECTED") {
                    const notConnectedEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                        .setTitle("Unable to Reach RealmSharper API Service")
                        .setDescription(new StringBuilder().append("I am currently unable to reach the RealmEye API. ")
                            .append("Verification has been canceled. Please try verifying at a later time."))
                        .setFooter("Verification Terminated.");
                    MessageUtilities.sendThenDelete({embed: notConnectedEmbed}, dmChannel);
                    await verificationMsg.edit(notConnectedEmbed).catch();

                    veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.X_EMOJI} **\`[Main]\`** `)
                        .append(`${member} tried to verify, but there was a problem trying to reach the RealmEye API.`)
                        .toString());
                    return;
                }

                // Passed all!
                if (r === "PASSED_ALL") {
                    await verificationMsg.delete().catch();
                    await member.setNickname(member.user.username === nameToUse
                        ? `${nameToUse!}.`
                        : nameToUse!).catch();
                    await member.roles.add(guildDoc.roles.verifiedRoleId).catch();

                    veriSuccessChannel?.send(new StringBuilder().append(`${Emojis.GREEN_CHECK_EMOJI} **\`[Main]\`** `)
                        .append(`${member} (**\`${nameToUse!}\`**) has successfully verified.`).toString());
                }
            })
            .build();
        collector.start();
    }

    async function verifySection(member: GuildMember, section: ISectionInfo, dmChannel: DMChannel): Promise<void> {

    }

    async function handleManualVerification(member: GuildMember): Promise<void> {

    }


    /**
     * Checks a series of requirements to ensure that they are fulfilled.
     * @param {GuildMember} member The member to check.
     * @param {DMChannel} dmChannel The DM channel.
     * @param {ISectionInfo | IGuildInfo} section The section to check the requirements for.
     * @param {PrivateApiDefinitions.IPlayerData} resp The player's stats.
     * @return {Promise<boolean>} Whether the person passes all verification requirements.
     * @private
     */
    async function checkRequirements(member: GuildMember, dmChannel: DMChannel, section: ISectionInfo | IGuildInfo,
                                     resp: PrivateApiDefinitions.IPlayerData): Promise<boolean> {
        const verifReq = section.otherMajorConfig.verificationProperties.verificationRequirements;
        const veriAttemptsChannel = member.guild.channels.cache
            .get("guildSections" in section
                ? section.channels.verificationChannels.verificationLogsChannelId
                : section.channels.verification.verificationLogsChannelId) as TextChannel | undefined;
        const secName = "guildSections" in section ? "Main" : section.sectionName;

        // Check requirements.
        // Start with generic requirements.
        if (verifReq.lastSeen.mustBeHidden && resp.lastSeen !== "hidden") {
            const codeNotFoundEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                .setTitle("Last Seen Location Not Hidden")
                .setDescription(new StringBuilder().append("Your last seen location is not hidden. Please ")
                    .append("make sure it is hidden and then try again."))
                .setFooter("Verification Code Not Found.");
            MessageUtilities.sendThenDelete({embed: codeNotFoundEmbed}, dmChannel);

            veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.HOURGLASS_EMOJI} **\`[${secName}]\`** `)
                .append(`${member}'s (**\`${resp.name}\`**) last seen location is not hidden.`).toString());
            return false;
        }

        if (verifReq.guild.checkThis) {
            if (verifReq.guild.guildName.checkThis
                && resp.guild.toLowerCase() !== verifReq.guild.guildName.name.toLowerCase()) {
                const notInRightGuildEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                    .setTitle("Invalid Guild")
                    .setDescription(new StringBuilder().append("You are currently in the guild:")
                        .append(StringUtil.codifyString(resp.guild))
                        .append("However, in order to gain access to this section, you must be in the guild: ")
                        .append(StringUtil.codifyString(verifReq.guild.guildName)))
                    .setFooter("Incorrect Guild.");
                MessageUtilities.sendThenDelete({embed: notInRightGuildEmbed}, dmChannel);

                const logMsg = new StringBuilder(`${Emojis.HOURGLASS_EMOJI} **\`[${secName}]\`** `);
                if (resp.guild) logMsg.append(`${member} (**\`${resp.name}\`**) is in guild **\`${resp.guild}\`** `)
                    .append(`but is expected to be in guild **\`${verifReq.guild.guildName.name}\`**.`);
                else logMsg.append(`${member} (**\`${resp.name}\`**) is not in a guild but is expected to be in `)
                    .append(`guild **\`${verifReq.guild.guildName.name}\`**.`);
                veriAttemptsChannel?.send(logMsg.toString());
                return false;
            }

            if (verifReq.guild.guildRank.checkThis
                && !isValidGuildRank(verifReq.guild.guildRank.minRank, resp.guildRank)) {
                const notValidRankEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                    .setTitle("Invalid Guild Rank")
                    .setDescription(new StringBuilder().append("You currently have the following guild rank: ")
                        .append(StringUtil.codifyString(resp.guildRank))
                        .append("However, you need to have the following rank or higher:")
                        .append(StringUtil.codifyString(verifReq.guild.guildRank.minRank)))
                    .setFooter("Incorrect Guild Rank.");
                MessageUtilities.sendThenDelete({embed: notValidRankEmbed}, dmChannel);

                const logMsg = new StringBuilder(`${Emojis.HOURGLASS_EMOJI} **\`[${secName}]\`** `);
                if (resp.guild) logMsg.append(`${member} (**\`${resp.name}\`**) has rank **\`${resp.guildRank}\`** `)
                    .append(`but must have at least the **\`${verifReq.guild.guildRank.minRank}\`** rank.`);
                else logMsg.append(`${member} (**\`${resp.name}\`**) is not in a guild so he/she doesn't have a rank.`);
                veriAttemptsChannel?.send(logMsg.toString());
                return false;
            }
        }

        if (verifReq.rank.checkThis && resp.rank < verifReq.rank.minRank) {
            const tooLowRankEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                .setTitle("Rank Too Low")
                .setDescription(new StringBuilder().append(`You currently have **\`${resp.rank}\`** stars, `)
                    .append("which is lower than what is required."))
                .setFooter("Rank Too Low.");
            MessageUtilities.sendThenDelete({embed: tooLowRankEmbed}, dmChannel);

            veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.HOURGLASS_EMOJI} **\`[${secName}]\`** `)
                .append(`${member} (**\`${resp.name}\`**) has **\`${resp.rank}\`** stars but must have at least `)
                .append(`${verifReq.rank.minRank} stars to verify.`).toString());
            return false;
        }

        if (verifReq.aliveFame.checkThis && resp.fame < verifReq.aliveFame.minFame) {
            const tooLowAliveFameEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                .setTitle("Alive Fame Too Low")
                .setDescription(new StringBuilder().append(`You currently have **\`${resp.fame}\`** alive fame, `)
                    .append("which is lower than what is required."))
                .setFooter("Alive Fame Too Low.");
            MessageUtilities.sendThenDelete({embed: tooLowAliveFameEmbed}, dmChannel);

            veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.HOURGLASS_EMOJI} **\`[${secName}]\`** `)
                .append(`${member} (**\`${resp.name}\`**) has **\`${resp.fame}\`** alive fame but must have at least `)
                .append(`${verifReq.aliveFame.minFame} alive fame to verify.`).toString());
            return false;
        }

        const gyHist = await RealmSharperWrapper.getGraveyardSummary(resp.name);
        if (verifReq.characters.checkThis) {
            // Clone copy since arrays are passed by reference/values.
            const neededStats: number[] = [];
            for (const stat of verifReq.characters.statsNeeded)
                neededStats.push(stat);

            // If we can check past deaths, let's update the array of neededStats to reflect that.
            if (verifReq.characters.checkPastDeaths) {
                if (gyHist) {
                    const stats = gyHist.statsCharacters.map(x => x.stats);
                    for (const statInfo of stats)
                        for (let i = 0; i < statInfo.length; i++)
                            neededStats[i] -= statInfo[i];
                }
            }

            // Here, we can check each character's stats.
            for (const character of resp.characters.filter(x => x.statsMaxed !== -1))
                neededStats[character.statsMaxed]--;

            if (neededStats.some(x => x > 0)) {
                const descSB = new StringBuilder().append("You did not meet the minimum stats requirement needed to ")
                    .append("verify in this section. You are missing the following:");
                const missingStats = new StringBuilder();
                for (let i = 0; i < neededStats.length; i++) {
                    if (neededStats[i] <= 0) continue;
                    missingStats.append(`- Need ${neededStats[i]} ${i}/${GeneralConstants.NUMBER_OF_STATS}s`)
                        .appendLine();
                }
                descSB.append(StringUtil.codifyString(neededStats.toString()));
                if (verifReq.characters.checkPastDeaths)
                    descSB.append("For this section, you are allowed to use your past dead characters to fulfill ")
                        .append("your stats requirements. If you haven't already, make sure to make your graveyard ")
                        .append("public.");

                const statsNotMetEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                    .setTitle("Stats Requirement Not Met")
                    .setDescription(descSB.toString())
                    .setFooter("Stats Requirement Not Met.");
                MessageUtilities.sendThenDelete({embed: statsNotMetEmbed}, dmChannel);

                veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.HOURGLASS_EMOJI} **\`[${secName}]\`** `)
                    .append(`${member} (**\`${resp.name}\`**) did not meet the minimum stats requirement. This `)
                    .append("person needs the following stats to pass this requirement:")
                    .append(StringUtil.codifyString(neededStats.toString())).toString());
                return false;
            }
        }

        if (verifReq.graveyardSummary.checkThis) {
            if (!gyHist) {
                const noGySummaryEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                    .setTitle("Unable to Get Graveyard Summary")
                    .setDescription(new StringBuilder().append("I was unable to access your graveyard summary. ")
                        .append("Please make sure your graveyard is set so anyone can see it."))
                    .setFooter("Graveyard Summary Inaccessible.");
                MessageUtilities.sendThenDelete({embed: noGySummaryEmbed}, dmChannel);

                veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.HOURGLASS_EMOJI} **\`[${secName}]\`** `)
                    .append(`${member} (**\`${resp.name}\`**) does not have his or her graveyard summary set to `)
                    .append("public.").toString());
                return false;
            }

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
                const dgnHistoryLowEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                    .setTitle("Dungeon Completions Not Satisfied.")
                    .setDescription(new StringBuilder().append("You haven't completed enough of one or more of the ")
                        .append("following dungeons.")
                        .append(StringUtil.codifyString(issues.join("\n"))))
                    .setFooter("Graveyard Summary Not Satisfied.");
                MessageUtilities.sendThenDelete({embed: dgnHistoryLowEmbed}, dmChannel);

                veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.HOURGLASS_EMOJI} **\`[${secName}]\`** `)
                    .append(`${member} (**\`${resp.name}\`**) did not satisfy the dungeon completion requirement `)
                    .append("as shown in graveyard summary. The following list represents what is not satisfied:")
                    .append(StringUtil.codifyString(logIssues.join("\n"))).toString());
                return false;
            }
        }

        if (verifReq.exaltations.checkThis) {
            const exaltData = await RealmSharperWrapper.getExaltation(resp.name);
            if (!exaltData) {
                const noGySummaryEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                    .setTitle("Unable to Get Exaltation Data")
                    .setDescription(new StringBuilder().append("I was unable to access your exaltation data. ")
                        .append("Please make sure your exaltation data is set so anyone can see it."))
                    .setFooter("Exaltation Data Inaccessible.");
                MessageUtilities.sendThenDelete({embed: noGySummaryEmbed}, dmChannel);

                veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.HOURGLASS_EMOJI} **\`[${secName}]\`** `)
                    .append(`${member} (**\`${resp.name}\`**) does not have his or her exaltation data set to `)
                    .append("public.").toString());
                return false;
            }

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

                const dgnHistoryLowEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                    .setTitle("Exaltation Requirement Not Satisfied.")
                    .setDescription(new StringBuilder().append("You haven't fulfilled one or more of the following ")
                        .append("exaltation requirements.")
                        .append(StringUtil.codifyString(issuesExaltations.toString())))
                    .setFooter("Exaltation Requirement Not Satisfied.");
                MessageUtilities.sendThenDelete({embed: dgnHistoryLowEmbed}, dmChannel);

                veriAttemptsChannel?.send(new StringBuilder().append(`${Emojis.HOURGLASS_EMOJI} **\`[${secName}]\`** `)
                    .append(`${member} (**\`${resp.name}\`**) did not satisfy the dungeon completion requirement `)
                    .append("as shown in graveyard summary. The following list represents what is not satisfied:")
                    .append(StringUtil.codifyString(issuesExaltations.toString())).toString());
                return false;
            }
        }

        return true;
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