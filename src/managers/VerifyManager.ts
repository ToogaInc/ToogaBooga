import {DMChannel, Emoji, EmojiResolvable, GuildMember, MessageEmbed, TextChannel} from "discord.js";
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
import {RealmSharperWrapper} from "../private-api/RealmSharperWrapper";
import {PrivateApiDefinitions} from "../private-api/PrivateApiDefinitions";
import {IPropertyKeyValuePair} from "../definitions/IPropertyKeyValuePair";
import {MiscUtilities} from "../utilities/MiscUtilities";

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

                const logEmbed = new MessageEmbed()
                    .setAuthor(member.user.username, member.user.displayAvatarURL())
                    .addField("Basic Information", new StringBuilder()
                        .append(`- IGN: **\`${nameToUse}\`**`)
                        .appendLine()
                        .append(`- Discord: ${member} (${member.id})`))
                    .setFooter("Section: Main")
                    .setTimestamp();

                const statusEmbed = MessageUtilities.generateBlankEmbed(member, "GREEN")
                    .setTitle(`${Emojis.HOURGLASS_EMOJI} Checking Your RealmEye`)
                    .setDescription("I am currently checking your RealmEye. This may take up to 30 seconds.")
                    .setFooter(`Verifying In: ${member.guild.name}`)
                    .setTimestamp();
                const statusMessage = await dmChannel.send(statusEmbed);
                await MiscUtilities.stopFor(2 * 1000);

                // Make initial request to RealmEye.
                const resp = await RealmSharperWrapper.getPlayerInfo(nameToUse!);
                if (!resp) {
                    const errorMsg = new StringBuilder().append("I couldn't fetch your RealmEye profile. Make ")
                        .append("sure your profile is public. If you typed your name incorrectly, please restart ")
                        .append("the verification process.");
                    const noPlayerDataEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                        .setTitle(`${Emojis.WARNING_EMOJI} Verification Failed.`)
                        .setDescription("You failed to meet one or more requirements. Please acknowledge these issues "
                            + "and then try again.")
                        .addField("Profile Not Found", errorMsg.toString())
                        .setFooter(`Verifying In: ${member.guild.name}`);
                    statusMessage.edit(noPlayerDataEmbed).then(x => x.delete({timeout: 10 * 1000}));

                    logEmbed.setTitle("[Main] Profile Not Found.")
                        .setDescription(`${member}'s profile could not be found. Is his or her profile private?`)
                        .setColor("DARK_RED")
                        .setTimestamp();
                    veriAttemptsChannel?.send(logEmbed);
                    return;
                }

                // Search description for valid verification code.
                if (!resp.description.some(x => x.includes(verificationCode))) {
                    const errorMsg = new StringBuilder().append("I couldn't find the verification code in your ")
                        .append("description. Please update your description so it contains this verification ")
                        .append("code:")
                        .append(StringUtil.codifyString(verificationCode));
                    const codeNotFoundEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                        .setTitle(`${Emojis.WARNING_EMOJI} Verification Failed.`)
                        .setDescription("You failed to meet one or more requirements. Please acknowledge these issues "
                            + "and then try again.")
                        .addField("Verification Code Not Found", errorMsg.toString())
                        .setFooter(`Verifying In: ${member.guild.name}`);
                    statusMessage.edit(codeNotFoundEmbed).then(x => x.delete({timeout: 10 * 1000}));

                    logEmbed.setTitle("[Main] Verification Code Not Found.")
                        .setDescription(new StringBuilder().append(`${Emojis.HOURGLASS_EMOJI} **\`[Main]\`** `)
                            .append(`${member} (**\`${resp.name}\`**) does not have the verification code in his or `)
                            .append(`her description. The verification code is: **\`${verificationCode}\`**.`)
                            .toString())
                        .setColor("DARK_RED")
                        .setTimestamp();
                    veriAttemptsChannel?.send(logEmbed);
                    return;
                }

                // Check all requirements.
                const res = await checkRequirements(member, dmChannel, guildDoc, resp);

                // And then validate the results.
                if (res.conclusion === "PASS") {
                    const welcomeMsg = guildDoc.otherMajorConfig.verificationProperties.verificationSuccessMessage
                        ? new StringBuilder()
                            .append(guildDoc.otherMajorConfig.verificationProperties.verificationSuccessMessage)
                        : new StringBuilder()
                            .append(`You have successfully been verified at: **\`${member.guild.name}\`**. Please `)
                            .append("make sure you read all rules and guidelines. Good luck and have fun.");
                    const passEmbed = MessageUtilities.generateBlankEmbed(member, "GREEN")
                        .setTitle(`${Emojis.GREEN_CHECK_EMOJI} Successful Verification: **${member.guild.name}**.`)
                        .setDescription(welcomeMsg.toString())
                        .setFooter(`Verifying In: ${member.guild.name}`);
                    await statusMessage.delete().catch();
                    MessageUtilities.sendThenDelete({embed: passEmbed}, dmChannel);
                    await verificationMsg.edit(passEmbed).catch();

                    logEmbed.setTitle("[Main] Successful Verification.")
                        .setDescription(new StringBuilder().append(`${Emojis.HOURGLASS_EMOJI} **\`[Main]\`** `)
                            .append(`${member} has successfully verified.`)
                            .toString())
                        .setColor("DARK_GREEN")
                        .setTimestamp();
                    veriSuccessChannel?.send(logEmbed);

                    nameToUse = resp.name;
                    instance.stop("PASSED_ALL");
                    return;
                }

                // This line is way too long so putting into a variable for ease of readability.
                const hasManualVerify = member.guild.channels.cache
                    .has(guildDoc.channels.verificationChannels.manualVerificationChannelId);

                let originallyManual = false;
                if (!hasManualVerify && res.conclusion === "MANUAL") {
                    res.conclusion = "FAIL";
                    originallyManual = true;
                }

                const failEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                    .setTitle(`${Emojis.X_EMOJI} Unsuccessful Verification: **${member.guild.name}**`)
                    .setFooter(`Verifying In: ${member.guild.name}`)
                    .setTimestamp();

                logEmbed.setTitle("[Main] Unsuccessful Verification.")
                    .setColor("DARK_RED");
                if (res.conclusion === "FAIL") {
                    failEmbed.setDescription("You have failed one or more major verification requirements and cannot "
                        + "be verified at this time. Please review the below issues.");

                    logEmbed.setDescription("The user has failed one or more major verification requirements and" +
                        " cannot be verified at this time. If you believe this person should be verified, please" +
                        " manually verify this person.");

                    for (const fatalIssue of res.fatalIssues) {
                        failEmbed.addField(fatalIssue.key, fatalIssue.value);
                        logEmbed.addField(fatalIssue.key, fatalIssue.log);
                    }

                    if (originallyManual) {
                        for (const manualIssue of res.manualIssues) {
                            failEmbed.addField(manualIssue.key, manualIssue.value);
                            logEmbed.addField(manualIssue.key, manualIssue.log);
                        }
                    }

                    statusMessage.edit(failEmbed).then(x => x.delete({timeout: 20 * 1000}));
                    await verificationMsg.edit(failEmbed).catch();
                    await veriAttemptsChannel?.send(logEmbed);

                    instance.stop("FAIL");
                    return;
                }

                if (res.conclusion === "MANUAL") {
                    failEmbed.setDescription("You have failed one or more major verification requirements. However," +
                        " we will manually verify your verification application. Do not attempt to verify until we" +
                        " have fully inspected your profile. Once we look through your profile, we will" +
                        " send you a message indicating whether you have been manually verified or not.");

                    logEmbed.setDescription("The user has failed one or more major verification requirements and has" +
                        " been sent to manual verification for manual inspection.");

                    for (const manualIssue of res.manualIssues) {
                        failEmbed.addField(manualIssue.key, manualIssue.value);
                        logEmbed.addField(manualIssue.key, manualIssue.log);
                    }

                    statusMessage.edit(failEmbed).then(x => x.delete({timeout: 20 * 1000}));
                    await verificationMsg.edit(failEmbed).catch();
                    await veriAttemptsChannel?.send(logEmbed);

                    instance.stop("MANUAL");
                    return;
                }

                if (res.conclusion === "TRY_AGAIN") {
                    failEmbed.setDescription("Your profile has one or more sections that we either could not" +
                        " definitively check or need to be fixed. In this case, please fix the following issues and" +
                        " then un-react and re-react to the check emoji above.");

                    logEmbed.setDescription("The user has one or more sections in his or her profile that either" +
                        " could not be checked or has minor issues that can be resolved quickly.");

                    for (const taIssue of res.taIssues) {
                        failEmbed.addField(taIssue.key, taIssue.value);
                        logEmbed.addField(taIssue.key, taIssue.log);
                    }

                    statusMessage.edit(failEmbed).then(x => x.delete({timeout: 20 * 1000}));
                    await verificationMsg.edit(failEmbed).catch();
                    await veriAttemptsChannel?.send(logEmbed);
                }
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
                    await member.setNickname(member.user.username === nameToUse
                        ? `${nameToUse!}.`
                        : nameToUse!).catch();
                    await member.roles.add(guildDoc.roles.verifiedRoleId).catch();
                }
            })
            .build();
        collector.start();
    }

    async function verifySection(member: GuildMember, section: ISectionInfo, dmChannel: DMChannel): Promise<void> {
        const veriAttemptsChannel = member.guild.channels.cache
            .get(section.channels.verification.verificationLogsChannelId) as TextChannel | undefined;
        const veriSuccessChannel = member.guild.channels.cache
            .get(section.channels.verification.verificationSuccessChannelId) as TextChannel | undefined;

        const logEmbed = new MessageEmbed()
            .setAuthor(member.user.username, member.user.displayAvatarURL())
            .addField("Basic Information", new StringBuilder()
                .append(`- Discord: ${member} (${member.id})`))
            .setFooter(`Section: ${section.sectionName}`)
            .setTimestamp();

        const entry = await MongoManager.findIdInIdNameCollection(member.id);
        const names = UserManager.getAllNames(member.displayName);
        const nameToUse = entry.length === 0
            ? names.length === 0
                ? null
                : names[0]
            : entry[0].rotmgNames[0].ign;

        if (!nameToUse) {
            const failEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                .setTitle(`${Emojis.WARNING_EMOJI} Verification Failed.`)
                .setDescription("You do not have a valid in-game name on file. You might need to re-verify with the" +
                    " bot perform this action.")
                .setFooter("Verification Failed.")
                .setTimestamp();
            await FetchRequestUtilities.sendMsg(dmChannel, {embed: failEmbed});


            logEmbed.setTitle(`[${section.sectionName}] Unable to Find Valid Name`)
                .setDescription("The user does not have a well-defined name. That is, this user's ID could not be" +
                    " found in the database and, additionally, their nickname does not have a valid name.");
            await veriAttemptsChannel?.send(logEmbed);

            return;
        }


        // Make initial request to RealmEye.
        const resp = await RealmSharperWrapper.getPlayerInfo(nameToUse);
        if (!resp) {
            const errorMsg = new StringBuilder().append("I couldn't fetch your RealmEye profile. Make ")
                .append("sure your profile is public. If you typed your name incorrectly, please restart ")
                .append("the verification process.");
            const noPlayerDataEmbed = MessageUtilities.generateBlankEmbed(member, "RED")
                .setTitle(`${Emojis.WARNING_EMOJI} Verification Failed.`)
                .setDescription("You failed to meet one or more requirements. Please acknowledge these issues "
                    + "and then try again.")
                .addField("Profile Not Found", errorMsg.toString())
                .setFooter(`Verifying In: ${member.guild.name}`);
            await FetchRequestUtilities.sendMsg(dmChannel, {embed: noPlayerDataEmbed});

            logEmbed.setTitle(`[${section.sectionName}] Profile Not Found.`)
                .setDescription(`${member}'s profile could not be found. Is his or her profile private?`)
                .setColor("DARK_RED")
                .addField("Name Used", StringUtil.codifyString(nameToUse));
            veriAttemptsChannel?.send(logEmbed);
            return;
        }

        const res = await checkRequirements(member, dmChannel, section, resp);

        // Passed just fine.
        if (res.conclusion === "PASS") {

        }
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