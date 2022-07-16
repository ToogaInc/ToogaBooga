import {
    Collection,
    DMChannel,
    EmbedFieldData,
    GuildMember, InteractionCollector,
    Message, MessageButton, MessageComponentInteraction,
    MessageEmbed, MessageSelectMenu,
    Role,
    TextBasedChannel,
    TextChannel
} from "discord.js";
import { IGuildInfo, IIdNameInfo, IPropertyKeyValuePair, ISectionInfo } from "../definitions";
import { GuildFgrUtilities } from "../utilities/fetch-get-request/GuildFgrUtilities";
import { GlobalFgrUtilities } from "../utilities/fetch-get-request/GlobalFgrUtilities";
import { MessageUtilities } from "../utilities/MessageUtilities";
import { MongoManager } from "./MongoManager";
import { AdvancedCollector } from "../utilities/collectors/AdvancedCollector";
import { ButtonConstants } from "../constants/ButtonConstants";
import { InteractivityManager } from "./InteractivityManager";
import { CommonRegex } from "../constants/CommonRegex";
import { StringUtil } from "../utilities/StringUtilities";
import { StringBuilder } from "../utilities/StringBuilder";
import { RealmSharperWrapper } from "../private-api/RealmSharperWrapper";
import { EmojiConstants } from "../constants/EmojiConstants";
import { PrivateApiDefinitions as PAD } from "../private-api/PrivateApiDefinitions";
import { LoggerManager } from "./LoggerManager";
import { DungeonUtilities } from "../utilities/DungeonUtilities";
import { TimeUtilities } from "../utilities/TimeUtilities";

export namespace VerifyManager {
    export const NUMBER_OF_STATS: number = 8;

    export const SHORT_STAT_TO_LONG: { [s: string]: [string, string] } = {
        "att": ["attack", "Attack"],
        "def": ["defense", "Defense"],
        "spd": ["speed", "Speed"],
        "dex": ["dexterity", "Dexterity"],
        "vit": ["vitality", "Vitality"],
        "wis": ["wisdom", "Wisdom"],
        "hp": ["health", "Health"],
        "mp": ["magic", "Magic"]
    };

    export const LONG_STAT_TO_SHORT: { [s: string]: string } = {
        "attack": "att",
        "defense": "def",
        "speed": "spd",
        "dexterity": "dex",
        "vitality": "vit",
        "wisdom": "wis",
        "health": "hp",
        "magic": "mp"
    };

    // Buttons
    const CHECK_PROFILE_ID: string = "check_profile";
    const CHECK_PROFILE_BUTTON = new MessageButton()
        .setLabel("Check Profile")
        .setCustomId(CHECK_PROFILE_ID)
        .setStyle("PRIMARY");

    // Other constants.
    const GUILD_ROLES: string[] = [
        "Founder",
        "Leader",
        "Officer",
        "Member",
        "Initiate"
    ];
    // For approving or denying manual verification applications
    export const MANUAL_VERIFY_ACCEPT_ID: string = "accept_manual";
    export const MANUAL_VERIFY_DENY_ID: string = "reject_manual";

    // An interface that represents all channels that will be used.
    interface IVerificationInstance {
        manualVerifyChannel: TextChannel | null;
        verifyChannel: TextChannel | null;
        verifySuccessChannel: TextChannel | null;
        verifyFailChannel: TextChannel | null;
        verifyStepChannel: TextChannel | null;
        verifyStartChannel: TextChannel | null;
        member: GuildMember;
        guildDoc: IGuildInfo;
        section: ISectionInfo;
        desiredRole: Role;
    }

    /**
     * Runs through the verification prompt. This is the main entrypoint of the verification process.
     *
     * @param {MessageComponentInteraction} i The interaction. This should not be deferred.
     * @param {IGuildInfo} guildDoc The guild document.
     * @param {ISectionInfo} section The section where verification should occur.
     */
    export async function verify(i: MessageComponentInteraction, guildDoc: IGuildInfo, section: ISectionInfo): Promise<void> {
        // If they're in the process of verification, don't let them start.
        if (InteractivityManager.IN_VERIFICATION.has(i.user.id)) {
            await i.reply({
                content: "You're currently in the process of getting verified. Please refer to your direct messages."
            });

            return;
        }

        // We want to ensure they can't start the verification process in another server.
        InteractivityManager.IN_VERIFICATION.add(i.user.id);

        if (!(await RealmSharperWrapper.isOnline())) {
            await i.reply({
                content: "Verification is currently unavailable. Please try again later. If this issue persists,"
                    + " please contact a staff member."
            });

            InteractivityManager.IN_VERIFICATION.delete(i.user.id);
            return;
        }

        if (!i.isButton() || !i.guild) {
            InteractivityManager.IN_VERIFICATION.delete(i.user.id);
            return;
        }

        // Defer the reply so they can't spam the current verification button.
        // After this line is executed, they should not be able to start a new verification process anywhere.
        await i.deferReply({ ephemeral: true });

        // Get the guild member.
        const member = await GuildFgrUtilities.fetchGuildMember(i.guild, i.user.id);
        if (!member) {
            await i.editReply({
                content: "An unknown error occurred."
            });
            InteractivityManager.IN_VERIFICATION.delete(i.user.id);
            return;
        }

        // Get verified role
        const verifiedRole = await GuildFgrUtilities.fetchRole(i.guild, section.roles.verifiedRoleId);
        if (!verifiedRole || GuildFgrUtilities.memberHasCachedRole(member, verifiedRole.id)) {
            await i.editReply({
                content: "The verified member role for this section does not exist."
            });
            InteractivityManager.IN_VERIFICATION.delete(i.user.id);
            return;
        }

        // Get logging channels
        const loggingChannels = section.isMainSection
            ? guildDoc.channels.loggingChannels
            : section.channels.loggingChannels;

        const verifyStartChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            member.guild,
            loggingChannels.find(x => x.key === "VerifyStart")?.value ?? ""
        );

        const verifyFailChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            member.guild,
            loggingChannels.find(x => x.key === "VerifyFail")?.value ?? ""
        );

        const verifyChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            member.guild,
            section.channels.verification.verificationChannelId
        );

        const manualVerifyChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            member.guild,
            section.channels.verification.manualVerificationChannelId
        );

        const verifyStepChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            member.guild,
            loggingChannels.find(x => x.key === "VerifyStep")?.value ?? ""
        );

        const verifySuccessChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            member.guild,
            loggingChannels.find(x => x.key === "VerifySuccess")?.value ?? ""
        );

        const verifInstance: Readonly<IVerificationInstance> = {
            desiredRole: verifiedRole,
            guildDoc,
            member,
            section,
            verifyChannel,
            verifyFailChannel,
            verifyStartChannel,
            verifyStepChannel,
            verifySuccessChannel,
            manualVerifyChannel
        };

        if (section.isMainSection) {
            verifyMain(i, verifInstance).catch();
        }
    }

    /**
     * Runs through the verification process for the main section.
     * @param {MessageComponentInteraction} i The interaction, which has been deferred.
     * @param {IVerificationInstance} instance The verification instance.
     * @private
     */
    async function verifyMain(i: MessageComponentInteraction, instance: IVerificationInstance): Promise<void> {
        // First, we need to see if the person can be DMed.
        const msgDmResp = await dmMember(instance.member);
        if (!msgDmResp) {
            await i.editReply({
                content: "I am not able to directly message you. Please make sure anyone in this server can DM you."
            });

            InteractivityManager.IN_VERIFICATION.delete(i.user.id);
            return;
        }

        await i.editReply({
            content: "Please check your direct messages for further instructions."
        });

        // Okay, that person can be DMed. Let's begin the process.
        const [msg, dmChan] = msgDmResp;
        const baseEmbed = MessageUtilities.generateBlankEmbed(instance.member.user, "RED")
            .setTitle(`**${instance.member.guild.name}**: Guild Verification`);

        // First, let's get the IGN to verify with.
        let nameToVerify: string | null = null;
        let userDoc: IIdNameInfo | null = null;

        // See if they have any saved names
        const userDocs = await MongoManager.findIdInIdNameCollection(instance.member.id);
        if (userDocs.length > 0) {
            const possNames = userDocs[0].rotmgNames.map(x => x.ign);

            const r = await MessageUtilities.tryEdit(msg, {
                content: null,
                embeds: [
                    new MessageEmbed(baseEmbed)
                        .setDescription(
                            "You have one or more name(s) associated with this Discord account. If you'd like,"
                            + " select a name that you want to use to verify. If you want to use a name that isn't"
                            + " listed here, press the **Skip** button."
                        )
                        .setFooter({ text: "This process will expire by" })
                        .setTimestamp(Date.now() + 2 * 60 * 1000)
                ],
                components: AdvancedCollector.getActionRowsFromComponents([
                    new MessageSelectMenu()
                        .setMaxValues(1)
                        .setMinValues(1)
                        .addOptions(possNames.map(x => {
                            return { label: x, value: x };
                        }))
                        .setCustomId("select"),
                    new MessageButton()
                        .setStyle("DANGER")
                        .setLabel("Skip")
                        .setCustomId("skip"),
                    ButtonConstants.CANCEL_BUTTON
                ])
            });

            if (!r) {
                instance.verifyFailChannel?.send({
                    content: `\`[Main]\` ${instance.member} was asked to select a name previously associated with `
                        + "their Discord account, something went wrong when trying to edit the base embed message."
                });

                InteractivityManager.IN_VERIFICATION.delete(instance.member.id);
                return;
            }

            const selected = await AdvancedCollector.startInteractionCollector({
                oldMsg: msg,
                acknowledgeImmediately: true,
                duration: 2 * 60 * 1000,
                clearInteractionsAfterComplete: true,
                deleteBaseMsgAfterComplete: false,
                targetAuthor: instance.member,
                targetChannel: dmChan
            });

            // If we get no response, then we can just quit.
            if (!selected) {
                instance.verifyFailChannel?.send({
                    content: `\`[Main]\` ${instance.member} was asked to select a name previously associated with `
                        + "their Discord account, but they did not select a name within the specified time."
                });

                InteractivityManager.IN_VERIFICATION.delete(instance.member.id);
                msg.delete().catch();
                return;
            }

            if (selected.isSelectMenu()) {
                nameToVerify = selected.values[0];
                userDoc = userDocs[0];
            }
            // At this point, these have to be buttons. We only care about the cancel button.
            else if (selected.customId === ButtonConstants.CANCEL_ID) {
                instance.verifyFailChannel?.send({
                    content: `\`[Main]\` ${instance.member} has stopped the verification process. This occurred when `
                        + "the person was asked to either use an existing name or provide a new name."
                });

                InteractivityManager.IN_VERIFICATION.delete(instance.member.id);
                msg.delete().catch();
                return;
            }
        }

        // If the user didn't select a name, then we need to ask them for a name.
        if (!nameToVerify) {
            const r = await MessageUtilities.tryEdit(msg, {
                content: null,
                embeds: [
                    new MessageEmbed(baseEmbed)
                        .setDescription(
                            "Please type the name that you want to verify with. Make sure you have access to the"
                            + " **RealmEye** profile associated with the name you want to use, as you will be using"
                            + " it shortly."
                        )
                        .setFooter({ text: "This process will expire by" })
                        .setTimestamp(Date.now() + 2 * 60 * 1000)
                ],
                components: AdvancedCollector.getActionRowsFromComponents([
                    ButtonConstants.CANCEL_BUTTON
                ])
            });

            if (!r) {
                instance.verifyFailChannel?.send({
                    content: `\`[Main]\` ${instance.member} was asked to select for a name to verify with, but `
                        + "something went wrong when trying to edit the base embed message."
                });

                InteractivityManager.IN_VERIFICATION.delete(instance.member.id);
                msg.delete().catch();
                return;
            }

            const selected = await AdvancedCollector.startDoubleCollector({
                cancelFlag: "-cancel",
                oldMsg: msg,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                deleteResponseMessage: false,
                acknowledgeImmediately: false,
                duration: 0,
                targetAuthor: instance.member,
                targetChannel: dmChan
            }, AdvancedCollector.getStringPrompt(instance.member, {
                min: 1,
                max: 15,
                regexFilter: {
                    regex: CommonRegex.ONLY_LETTERS,
                    withErrorMsg: "Your name can only have letters."
                }
            }));

            // Once again, if we get no response, then we can just quit.
            if (!selected) {
                instance.verifyFailChannel?.send({
                    content: `\`[Main]\` ${instance.member} was asked for a name, but they did not respond in time.`
                });

                InteractivityManager.IN_VERIFICATION.delete(instance.member.id);
                msg.delete().catch();
                return;
            }

            // Did they press the CANCEL button?
            if (selected instanceof MessageComponentInteraction) {
                instance.verifyFailChannel?.send({
                    content: `\`[Main]\` ${instance.member} has stopped the verification process when asked to type`
                        + " their name."
                });

                InteractivityManager.IN_VERIFICATION.delete(instance.member.id);
                msg.delete().catch();
                return;
            }

            // Check if the name they picked has already been claimed by someone else.
            let invalid = 0;
            const matchedUserDocs = await MongoManager.findNameInIdNameCollection(selected);
            for (const doc of matchedUserDocs) {
                if (doc.currentDiscordId === instance.member.id) {
                    userDoc = doc;
                    break;
                }

                invalid++;
            }

            // If the user document wasn't found *and* the invalid count is > 0, then that means someone else
            // claimed this name. Note that if the user document was found, then theoretically invalid should be
            // 0, so we shouldn't need to worry about conflicts.
            if (!userDoc && invalid > 0) {
                const idsRegistered = matchedUserDocs.map(x => x.currentDiscordId).join(", ");
                instance.verifyFailChannel?.send({
                    content: `\`[Main]\` ${instance.member} tried to verify with the name, **\`${selected}\`**, `
                        + `but this name has already been registered by the following Discord ID(s): ${idsRegistered}.`
                });

                await MessageUtilities.tryEdit(msg, {
                    content: null,
                    embeds: [
                        new MessageEmbed(baseEmbed)
                            .setTitle(`**${instance.member.guild.name}**: Guild Verification __**Failed**__`)
                            .setDescription(
                                `The name you selected, \`${selected}\`, has already been registered by another user.`
                                + " Please resolve this issue by messaging a staff member for assistance. If you want"
                                + " to verify with another in-game name, please restart the verification process."
                            )
                            .setFooter({ text: "This process will expire by" })
                            .setTimestamp(Date.now() + 2 * 60 * 1000)
                    ],
                    components: []
                });

                InteractivityManager.IN_VERIFICATION.delete(instance.member.id);
                return;
            }

            // Otherwise, we have a valid name, so we can use it in the next step.
            nameToVerify = selected;
        }

        // We have a name now. This is where we tell them to put a code into their RealmEye description and
        // all of that.
        const verificationCode = StringUtil.generateRandomString(20);
        instance.verifyStepChannel?.send({
            content: `\`[Main]\` ${instance.member} will be trying to verify as **\`${nameToVerify}\`**. Their`
                + ` verification code is **\`${verificationCode}\`**.`
        }).catch();

        const timeStarted = Date.now();
        const components = AdvancedCollector.getActionRowsFromComponents([
            CHECK_PROFILE_BUTTON,
            ButtonConstants.CANCEL_BUTTON
        ]);
        await msg.edit({
            content: null,
            embeds: [
                getVerificationEmbed(instance.member, nameToVerify, verificationCode)
                    .setFooter({ text: "This process will expire by" })
                    .setTimestamp(timeStarted + 2 * 60 * 1000)
            ],
            components
        });

        const collector = msg.createMessageComponentCollector({
            filter: i => i.user.id === instance.member.id,
            time: 20 * 60 * 1000
        });

        collector.on("end", () => {
            InteractivityManager.IN_VERIFICATION.delete(instance.member.id);
        });

        collector.on("collect", async i => {
            // This should block the buttons out, meaning they can't press anything until after we reply.
            await i.deferReply();

            // If they pressed the cancel button, then we just stop the process here.
            if (i.customId === ButtonConstants.CANCEL_ID) {
                await MessageUtilities.tryEdit(msg, {
                    content: null,
                    embeds: [
                        new MessageEmbed(baseEmbed)
                            .setTitle(`**${instance.member.guild.name}**: Guild Verification Canceled.`)
                            .setDescription(
                                "You have canceled this verification process. To verify again, restart the"
                                + " verification process."
                            )
                            .setFooter({ text: "Verification Expired" })
                            .setTimestamp()
                    ],
                    components: []
                });

                await instance.verifyFailChannel?.send({
                    content: `\`[Main]\` ${instance.member} has canceled the verification process.`
                });

                collector.stop("canceled");
                return;
            }

            // At this point, they're ready for their profile to be checked.
            await MessageUtilities.tryEdit(msg, {
                embeds: [
                    new MessageEmbed(baseEmbed)
                        .setTitle(`**${instance.member.guild.name}**: Guild Verification Checking.`)
                        .setDescription(
                            "Please wait, your profile is currently being reviewed. Once your profile has been"
                            + " checked, this message will be edited and a new message will be sent to you. This"
                            + " should take no more than one minute."
                        )
                ]
            });

            await instance.verifyStepChannel?.send({
                content: `\`[Main]\` ${instance.member} is now waiting for the bot to finish checking their IGN,`
                    + ` \`${nameToVerify}\`.`
            });

            // Request general profile data.
            const generalData = await GlobalFgrUtilities.tryExecuteAsync(async () => {
                return RealmSharperWrapper.getPlayerInfo(nameToVerify!);
            });

            // Is the data inaccessible?
            if (!generalData) {
                await MessageUtilities.tryEdit(msg, {
                    content: null,
                    embeds: [
                        new MessageEmbed(baseEmbed)
                            .setTitle(`**${instance.member.guild.name}**: Guild Verification Error.`)
                            .setDescription(
                                "Oops, an error occurred when trying to reach your RealmEye profile's basis data."
                                + " This error is usually caused by one of several things."
                            )
                            .addField(
                                "__Private Profile__",
                                "Make sure anyone can view your profile. To confirm that this is the case, use your"
                                + " browser's private browsing feature to check your profile."
                            )
                            .addField(
                                "__RealmEye API Error__",
                                "It's possible that the API that the bot uses to check RealmEye is currently down."
                                + " Think of an API as the bot's way of checking your profile easily."
                            )
                            .addField(
                                "Now What?",
                                "The verification process has been stopped. You will need to restart the"
                                + " verification process. If this issue persists, please ask a staff member for"
                                + " assistance."
                            )
                            .setTimestamp()
                    ],
                    components: []
                });

                await instance.verifyFailChannel?.send({
                    content: `\`[Main]\` ${instance.member} tried to verify as **\`${nameToVerify}\`**, but their profile`
                        + " is either private or the API is not available."
                });

                await GlobalFgrUtilities.sendMsg(instance.member, {
                    content: "An error occurred while trying to get basic data from your profile. Please see the above"
                        + " embed."
                });

                collector.stop("error");
                return;
            }

            // Is the verification code in their profile?
            if (!generalData.description.some(x => x.includes(verificationCode))) {
                await MessageUtilities.tryEdit(msg, {
                    embeds: [
                        getVerificationEmbed(instance.member, nameToVerify!, verificationCode)
                            .setFooter({ text: "This process will expire by" })
                            .setTimestamp(timeStarted + 2 * 60 * 1000)
                            .addField(
                                `${EmojiConstants.WARNING_EMOJI} Verification Issue`,
                                "Your verification code was not found in your RealmEye profile's description."
                            )
                    ],
                    components
                });

                const r = await GlobalFgrUtilities.sendMsg(instance.member, {
                    content: "An error occurred while reviewing your profile. Please see the above embed."
                });

                instance.verifyFailChannel?.send({
                    content: `[Main] ${instance.member} tried to verify as **\`${nameToVerify}\`**, but the`
                        + ` verification code, \`${verificationCode}\`, was not found in their description.`
                });

                // If we can't tell them that there's an issue with the verification process, then we just
                // terminate the process right there.
                if (!r) {
                    await cancelOnFailSend(collector, msg, instance, nameToVerify!);
                }

                return;
            }

            // Get name history for this user.
            const nameHistory = await GlobalFgrUtilities.tryExecuteAsync(async () => {
                return RealmSharperWrapper.getNameHistory(nameToVerify!);
            });

            // If we can't get their name history, give them the opportunity to make it public
            if (!nameHistory) {
                await MessageUtilities.tryEdit(msg, {
                    embeds: [
                        getVerificationEmbed(instance.member, nameToVerify!, verificationCode)
                            .setFooter({ text: "This process will expire by" })
                            .setTimestamp(timeStarted + 2 * 60 * 1000)
                            .addField(
                                `${EmojiConstants.WARNING_EMOJI} Verification Issue`,
                                "Your profile's name history is not accessible. Make sure anyone can see your name"
                                + " history."
                            )
                    ],
                    components
                });

                const r = await GlobalFgrUtilities.sendMsg(instance.member, {
                    content: "An error occurred while trying to get your name history. Please see the above embed."
                });

                instance.verifyFailChannel?.send({
                    content: `[Main] ${instance.member} tried to verify as **\`${nameToVerify}\`**, but an unknown error `
                        + "occurred when trying to reach their profile's **name history**."
                });

                if (!r) {
                    await cancelOnFailSend(collector, msg, instance, nameToVerify!);
                }

                return;
            }

            // Check if any names in the name history, or in the person's profile, are blacklisted.
            const allBlackListedNames = new Collection<string, string>();
            allBlackListedNames.set(generalData.name.toLowerCase(), generalData.name);
            nameHistory.nameHistory.forEach(({ name }) => {
                allBlackListedNames.set(name.toLowerCase(), name);
            });

            if (userDoc) {
                userDoc.rotmgNames.forEach(x => {
                    allBlackListedNames.set(x.lowercaseIgn, x.ign);
                });

                userDoc.pastRealmNames.forEach(x => {
                    allBlackListedNames.set(x.lowercaseIgn, x.ign);
                });
            }

            const blInfo = instance.guildDoc.moderation.blacklistedUsers
                .find(x => allBlackListedNames.has(x.realmName.lowercaseIgn));

            // If we have a blacklisted entry, that means they cannot verify in this server.
            if (blInfo) {
                await MessageUtilities.tryEdit(msg, {
                    content: null,
                    embeds: [
                        new MessageEmbed(baseEmbed)
                            .setTitle(`**${instance.member.guild.name}**: Guild Verification Error.`)
                            .setDescription("You, or an account associated with this account, are blacklisted from"
                                + " this server.")
                            .addField("Blacklist Reason", blInfo.reason)
                            .addField("Moderation ID", StringUtil.codifyString(blInfo.actionId))
                            .addField(
                                "Now What?",
                                "You are not able to verify with this server right now. You can try to appeal your"
                                + " blacklist with the server staff. When doing so, please give them the moderation"
                                + " ID associated with your blacklist (shown above)."
                            )
                            .setTimestamp()
                    ],
                    components: []
                });

                await instance.verifyFailChannel?.send({
                    content: `[Main] ${instance.member} tried to verify as **\`${nameToVerify}\`**, but they are`
                        + ` blacklisted from this server under the name: \`${blInfo.realmName.ign}\`. The`
                        + ` corresponding Moderation ID is \`${blInfo.actionId}\`.`
                });

                await GlobalFgrUtilities.sendMsg(instance.member, {
                    content: "You are blacklisted and cannot verify in this server at this time. Please see the"
                        + " above embed."
                });

                collector.stop("error");
                return;
            }

            // Check requirements
            const checkRes = await checkRequirements(instance, generalData);

            // If this is a fail, then let them know and stop verification
            if (checkRes.conclusion === "FAIL") {
                const failedReqs = checkRes.fatalIssues.concat(checkRes.manualIssues);

                const fields: EmbedFieldData[] = failedReqs.map(x => {
                    return {
                        name: x.key,
                        value: x.value
                    };
                });

                await MessageUtilities.tryEdit(msg, {
                    content: null,
                    embeds: [
                        new MessageEmbed(baseEmbed)
                            .setTitle(`**${instance.member.guild.name}**: Guild Verification Error.`)
                            .setDescription(
                                "You do not meet the requirements to be verified in this server. For assistance,"
                                + " please contact a staff member. The requirements that you failed to meet are"
                                + " listed below."
                            )
                            .addFields(fields)
                            .setTimestamp()
                    ],
                    components: []
                });

                await instance.verifyFailChannel?.send({
                    content: `\`[Main]\` ${instance.member} tried to verify as **\`${nameToVerify}\`**, but they failed`
                        + " to meet one or more major requirements. The requirements are:\n"
                        + failedReqs.map(x => `- ${x.log}`).join("\n")
                });

                await GlobalFgrUtilities.sendMsg(instance.member, {
                    content: "You did not meet the requirements defined by this server."
                });

                collector.stop("error");
                return;
            }

            // If they can manually verify, then let them know.
            if (checkRes.conclusion === "MANUAL") {
                await msg.delete();
                await handleManualVerification(instance, checkRes, dmChan);
                collector.stop("done");
                return;
            }

            if (checkRes.conclusion === "TRY_AGAIN") {
                await MessageUtilities.tryEdit(msg, {
                    embeds: [
                        getVerificationEmbed(instance.member, nameToVerify!, verificationCode)
                            .setFooter({ text: "This process will expire by" })
                            .setTimestamp(timeStarted + 2 * 60 * 1000)
                            .addField(
                                `${EmojiConstants.WARNING_EMOJI} Verification Issue`,
                                "Something went wrong when fully reviewing your profile. Please resolve these issues"
                                + " and try again.\n"
                                + checkRes.taIssues.map(x => `- ${x.value}`).join("\n")
                            )
                    ],
                    components
                });

                const r = await GlobalFgrUtilities.sendMsg(instance.member, {
                    content: "An error occurred while reviewing your profile. Please see the above embed."
                });

                instance.verifyFailChannel?.send({
                    content: `\`[Main]\` ${instance.member} tried to verify as **\`${nameToVerify}\`**, but something`
                        + " went wrong when fully checking their profile.\n"
                        + checkRes.taIssues.map(x => `- ${x.log}`).join("\n")
                });

                if (!r) {
                    await cancelOnFailSend(collector, msg, instance, nameToVerify!);
                }

                return;
            }

            // Otherwise, they must have passed.
            await Promise.all([
                MongoManager.addIdNameToIdNameCollection(instance.member, generalData.name),
                GlobalFgrUtilities.tryExecuteAsync(async () => {
                    await instance.member.roles.add(instance.guildDoc.roles.verifiedRoleId);
                }),
                GlobalFgrUtilities.tryExecuteAsync(async () => {
                    await instance.member.setNickname(generalData.name, "Verified in the main section successfully.");
                })
            ]);

            // Let them know that it's done
            const successEmbed = MessageUtilities.generateBlankEmbed(instance.member.guild, "GREEN")
                .setTitle(`**${instance.member.guild.name}**: Guild Verification Successful`)
                .setFooter({ text: "Verification Completed At" })
                .setTimestamp();
            if (instance.guildDoc.otherMajorConfig.verificationProperties.verificationSuccessMessage) {
                successEmbed.setDescription(
                    instance.guildDoc.otherMajorConfig.verificationProperties.verificationSuccessMessage
                );
            }
            else {
                successEmbed.setDescription(
                    "You have successfully been verified in this server. Please make sure to read any applicable"
                    + " rules/guidelines. If you have any questions, please message a staff member. Thanks!"
                );
            }

            await Promise.all([
                msg.edit({ embeds: [successEmbed] }),
                GlobalFgrUtilities.sendMsg(instance.member, {
                    content: "Your verification was succssful."
                }),
                instance.verifySuccessChannel?.send({
                    content: `[Main] ${instance.member} has successfully verified as **\`${nameToVerify}\`**.`
                })
            ]);

            InteractivityManager.IN_VERIFICATION.delete(instance.member.id);
            collector.stop("done");
        });
    }



    /**
     * Handles the case when manual verification is needed.
     * @param instance The verification instance.
     * @param checkRes The original results of checking the person's profile for requirements.
     * @param from The channel where this manual verification request is occurring, or the interaction where
     * this event is occurring from. If this is an interaction, then the interaction should have been responded
     * to already.
     * @private
     */
    async function handleManualVerification(instance: IVerificationInstance, checkRes: IReqCheckResult,
                                            from: TextBasedChannel | MessageComponentInteraction): Promise<void> {
        const guild = instance.member.guild;
        const section = instance.section;
        const logStr = checkRes.manualIssues.map(x => `- [${x.key}] ${x.log}`).join("\n");
        const embedTitle = instance.section.isMainSection
            ? `**${guild.name}**: Guild Verification Failed`
            : `${guild.name} ⇨ **${section.sectionName}**: Section Verification Failed`;

        const id = StringUtil.generateRandomString(15);
        const yesId = id + ButtonConstants.YES_ID;
        const noId = id + ButtonConstants.NO_ID;
        const yesButton = AdvancedCollector.cloneButton(ButtonConstants.YES_BUTTON);
        yesButton.setCustomId(yesId);
        const noButton = AdvancedCollector.cloneButton(ButtonConstants.YES_BUTTON);
        noButton.setCustomId(noId);

        const errEmbed = MessageUtilities.generateBlankEmbed(instance.member.guild, "RED")
            .setTitle(embedTitle)
            .setDescription(
                "You have failed to meet one or more requirements needed to get verified in this server or section."
                + " However, you can request that your profile be manually verified by a staff member. If you want to"
                + " have your profile be manually verified, press the **Yes** button. During the manual verification"
                + " process, you will not be able to verify in this server or section until your results come back."
                + " You will not be able to stop this process. If you do not want to be manually verified, press the"
                + " **No** button.\n\nBelow, you will find the requirements that you failed to meet."
            )
            .addFields(checkRes.manualIssues.map(x => {
                return {
                    name: x.key,
                    value: x.value
                };
            }));

        const components = AdvancedCollector.getActionRowsFromComponents([
            ButtonConstants.YES_BUTTON,
            ButtonConstants.NO_BUTTON
        ]);

        let m: MessageComponentInteraction | Message | null;
        if ("customId" in from) {
            await from.editReply({
                embeds: [errEmbed],
                content: "Do **not** dismiss this message.",
                components
            });
            m = from;
        }
        else {
            m = await GlobalFgrUtilities.sendMsg(instance.member, {
                embeds: [errEmbed],
                components
            });
        }

        const secGuildDisplayLog = instance.section.isMainSection ? "[Main]" : `[${instance.section.sectionName}]`;
        if (!m) {
            instance.verifyFailChannel?.send({
                content: `${secGuildDisplayLog} ${instance.member} tried to verify as **\`${checkRes.name}\`**, but failed the`
                    + " requirements. The manual verification request could not be sent to the user due to an issue on the"
                    + " user's side."
            });

            return;
        }

        instance.verifyStepChannel?.send({
            content: `${secGuildDisplayLog} ${instance.member} tried to verify as **\`${checkRes.name}\`**, but there were several `
                + "minor issues with the person's profile. The user is currently being asked if they want"
                + " to get manually verified. The outstanding issues are listed below:\n" + logStr
        });

        const selected = await AdvancedCollector.startInteractionEphemeralCollector({
            acknowledgeImmediately: true,
            duration: 3 * 60 * 1000,
            targetAuthor: instance.member,
            targetChannel: m.channel!
        }, id);

        if (!selected) {
            instance.verifyFailChannel?.send({
                content: `${secGuildDisplayLog} ${instance.member} tried to verify as **\`${checkRes.name}\`**, and was in the process`
                    + " of accepting/denying manual verification, but did not respond in time to the question."
            });

            if (m instanceof Message) {
                m.delete().catch();
            }
            else {
                m.editReply({
                    content: "Feel free to dismiss this message."
                });
            }

            return;
        }

        if (selected.customId === noId) {
            instance.verifyFailChannel?.send({
                content: `${secGuildDisplayLog} ${instance.member} tried to verify as **\`${checkRes.name}\`**, was in the process`
                    + " of accepting/denying manual verification, and chose to **deny** manual verification."
            });

            const rejectEmbed = MessageUtilities.generateBlankEmbed(instance.member.guild, "RED")
                .setTitle(embedTitle)
                .setDescription(
                    "You have chosen to reject getting manually verified. No further action is required from you. Feel"
                    + " free to verify again later."
                );

            if (m instanceof Message) {
                await MessageUtilities.tryEdit(m, {
                    embeds: [rejectEmbed],
                    components: []
                });

                return;
            }

            await m.editReply({
                embeds: [rejectEmbed],
                content: "Feel free to dismiss this message.",
                components: []
            });

            return;
        }

        // Otherwise, yes.
        instance.verifyStepChannel?.send({
            content: `${secGuildDisplayLog} ${instance.member} tried to verify as **\`${checkRes.name}\`**, was in the process`
                + " of accepting/denying manual verification, and chose to **accept** manual verification. Please review their"
                + " manual verification request."
        });

        const okEmbed = MessageUtilities.generateBlankEmbed(instance.member.guild, "RED")
            .setTitle(
                instance.section.isMainSection
                    ? `**${guild.name}**: Guild Verification Failed`
                    : `${guild.name} ⇨ **${instance.section.sectionName}**: Section Verification Failed`
            )
            .setDescription(
                "You have chosen to accept getting manually verified. No further action is required from you. Please do not"
                + " message server staff about the status of your manual verification application."
            );

        if (m instanceof Message) {
            await m.edit({
                embeds: [okEmbed],
                components: []
            });
        }
        else {
            await m.editReply({
                content: "You can dismiss this message now.",
                embeds: [okEmbed],
                components: []
            });
        }

        const descSb = new StringBuilder()
            .append(`The following user tried to verify in the section: **\`${section.sectionName}\`**.`).appendLine()
            .appendLine()
            .append("__**Discord Account**__").appendLine()
            .append(`- Discord Mention: ${instance.member} (${instance.member.id})`).appendLine()
            .append(`- Discord Tag: ${instance.member.user.tag}`).appendLine()
            .append(`- Discord Created: ${TimeUtilities.getDateTime(instance.member.user.createdAt)} GMT`).appendLine()
            .appendLine()
            .append("__**RotMG Account**__").appendLine()
            .append(`- Account IGN: **\`${checkRes.orig.name}\`**`).appendLine()
            .append(`- RealmEye Link: [Here](https://www.realmeye.com/player/${checkRes.orig.name}).`).appendLine()
            .append(`- Rank: **\`${checkRes.orig.rank}\`**`).appendLine()
            .append(`- Alive Fame: **\`${checkRes.orig.fame}\`**`).appendLine();
        if (checkRes.orig.created) {
            descSb.append(`- Account Created: **\`${checkRes.orig.created}\`**`).appendLine();
        }
        else if (checkRes.orig.firstSeen) {
            descSb.append(`- First Seen: **\`${checkRes.orig.firstSeen}\`**`).appendLine();
        }
        else {
            descSb.append("- Account Created: **`N/A`**").appendLine();
        }

        descSb.append(`- Last Seen: **\`${checkRes.orig.lastSeen}\`**`).appendLine();

        if (checkRes.orig.guild) {
            descSb.append(`- Guild: **\`${checkRes.orig.guild}\`**`).appendLine()
                .append(`- Guild Rank: **\`${checkRes.orig.guildRank}\`**`).appendLine();
        }

        descSb.append(`- RealmEye Description: ${StringUtil.codifyString(checkRes.orig.description.join("\n"))}`);

        const embed = MessageUtilities.generateBlankEmbed(instance.member, "RED")
            .setTitle(`[${section.sectionName}] Manual Verification: **${checkRes.name}**`)
            .setDescription(descSb.toString())
            .addField(
                "Reason(s) for Manual Verification",
                checkRes.manualIssues.map(x => `- **${x.key}**: ${x.log}`).join("\n")
            );

        // manualVerifyChannel exists because we asserted this in the checkRequirements function.
        const manualVerifMsg = await instance.manualVerifyChannel!.send({
            embeds: [embed],
            components: AdvancedCollector.getActionRowsFromComponents([
                new MessageButton()
                    .setLabel("Accept")
                    .setCustomId(MANUAL_VERIFY_ACCEPT_ID)
                    .setStyle("SUCCESS"),
                new MessageButton()
                    .setLabel("Deny")
                    .setCustomId(MANUAL_VERIFY_DENY_ID)
                    .setStyle("DANGER")
            ])
        });

        await MongoManager.updateAndFetchGuildDoc({ guildId: guild.id }, {
            $push: {
                manualVerificationEntries: {
                    userId: instance.member.id,
                    ign: checkRes.name,
                    manualVerifyMsgId: manualVerifMsg.id,
                    manualVerifyChannelId: instance.manualVerifyChannel!.id,
                    sectionId: section.uniqueIdentifier
                }
            }
        });
    }




    interface IReqCheckResult {
        name: string;
        conclusion: "PASS" | "TRY_AGAIN" | "MANUAL" | "FAIL";
        manualIssues: (IPropertyKeyValuePair<string, string> & { log: string; })[];
        fatalIssues: (IPropertyKeyValuePair<string, string> & { log: string; })[];
        taIssues: (IPropertyKeyValuePair<string, string> & { log: string; })[];
        orig: PAD.IPlayerData;
    }

    /**
     * Checks a series of requirements to ensure that the player has fulfilled them.
     * @param {VerifyManager.IVerificationInstance} instance The verification instance.
     * @param {PrivateApiDefinitions.IPlayerData} resp The player's stats.
     * @private
     */
    async function checkRequirements(instance: IVerificationInstance, resp: PAD.IPlayerData) {
        const doc = instance.section.isMainSection
            ? instance.guildDoc
            : instance.section;

        const member = instance.member;
        const verifReq = doc.otherMajorConfig.verificationProperties.verifReq;
        const result: IReqCheckResult = {
            name: resp.name,
            conclusion: "PASS",
            manualIssues: [],
            fatalIssues: [],
            taIssues: [],
            orig: resp
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

            if (verifReq.guild.guildRank.checkThis) {
                const rankHasDisplay = `**\`${resp.guildRank}\`**`;
                const rankNeedDisplay = `**\`${verifReq.guild.guildRank.minRank}\`**`;

                if (verifReq.guild.guildRank.exact) {
                    if (verifReq.guild.guildRank.minRank !== resp.guildRank) {
                        result.fatalIssues.push({
                            key: "Not In Correct Guild",
                            value: resp.guild
                                ? `You have the rank ${rankHasDisplay} but must have the rank ${rankNeedDisplay}.`
                                : `You must be in the guild, **\`${verifReq.guild.guildName.name}\`**.`,
                            log: resp.guild
                                ? `User has the rank ${rankHasDisplay} but must have the rank ${rankNeedDisplay}.`
                                : `User is not in the guild **\`${verifReq.guild.guildName.name}\`**.`
                        });
                        result.conclusion = "FAIL";
                        return result;
                    }
                }
                else if (!isValidGuildRank(verifReq.guild.guildRank.minRank, resp.guildRank)) {
                    result.fatalIssues.push({
                        key: "Invalid Guild Rank",
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

        const gyHist = await GlobalFgrUtilities.tryExecuteAsync(async () => {
            return RealmSharperWrapper.getGraveyardSummary(resp.name);
        });

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
                    missingStats.append(`- Need ${neededStats[i]} ${i}/${NUMBER_OF_STATS}s`)
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

        if (verifReq.graveyardSummary.checkThis && verifReq.graveyardSummary.useBotCompletions) {
            const issues: string[] = [];
            const logIssues: string[] = [];
            const completionsNeeded = new Collection<string, number>(
                verifReq.graveyardSummary.botCompletions.map(x => [x.key, x.value])
            );
            const userDoc = await MongoManager.getUserDoc(resp.name);
            const loggedInfo = userDoc.length === 0
                ? new Collection<string, number>()
                : LoggerManager.getCompletedDungeons(userDoc[0], member.guild.id);

            let allPassed = true;
            for (const [dgnId, amt] of loggedInfo) {
                const dgnInfo = DungeonUtilities.getDungeonInfo(dgnId, instance.guildDoc);
                if (!dgnInfo)
                    continue;

                if (completionsNeeded.has(dgnId)) {
                    const newAmt = completionsNeeded.get(dgnId)! - amt;
                    if (newAmt <= 0) {
                        completionsNeeded.delete(dgnId);
                        continue;
                    }

                    allPassed = false;
                    issues.push(
                        `- ${newAmt}/${completionsNeeded.get(dgnId)!} ${dgnInfo.dungeonName} Completions Logged.`
                    );
                    logIssues.push(
                        `- ${newAmt}/${completionsNeeded.get(dgnId)!} ${dgnInfo.dungeonName} Completions Logged.`
                    );
                }
            }

            if (!allPassed) {
                const normalDisplay = StringUtil.codifyString(issues.join("\n"));
                const logDisplay = StringUtil.codifyString(logIssues.join("\n"));
                result.manualIssues.push({
                    key: "Dungeon Completion Requirement Not Fulfilled",
                    value: `You still need to satisfy the following dungeon requirements: ${normalDisplay}`,
                    log: `User has not fulfilled the following dungeon requirements: ${logDisplay}`
                });
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
                // neededExalt will have keys "att" "spd" "hp" etc
                const neededExalt: { [s: string]: number } = {};
                for (const d of Object.keys(SHORT_STAT_TO_LONG))
                    neededExalt[d] = verifReq.exaltations.minimum[d];

                if (verifReq.exaltations.onOneChar) {
                    for (const entry of exaltData.exaltations) {
                        let passed = true;
                        // exaltationStats will have keys like "attack" "speed" "health" etc
                        for (const longStat in entry.exaltationStats) {
                            if (!entry.exaltationStats.hasOwnProperty(longStat))
                                continue;

                            const shortenedStat = LONG_STAT_TO_SHORT[longStat];
                            if (neededExalt[shortenedStat] - entry.exaltationStats[longStat] > 0) {
                                passed = false;
                                break;
                            }
                        }

                        // If passed, then set neededExalts to 0. Otherwise, try again
                        if (passed) {
                            for (const k in neededExalt) {
                                if (!neededExalt.hasOwnProperty(k))
                                    continue;

                                neededExalt[k] = 0;
                            }
                            break;
                        }
                    }
                }
                else {
                    for (const entry of exaltData.exaltations) {
                        for (const longStat in entry.exaltationStats) {
                            if (!entry.exaltationStats.hasOwnProperty(longStat))
                                continue;

                            const shortenedStat = LONG_STAT_TO_SHORT[longStat];
                            neededExalt[shortenedStat] -= entry.exaltationStats[longStat];
                        }
                    }
                }

                // If we happen to have any stats whose exaltation number is > 0, then we want to show them.
                const notMetExaltations = Object.keys(neededExalt)
                    .filter(x => neededExalt[x] > 0);

                if (notMetExaltations.length > 0) {
                    const issuesExaltations = new StringBuilder();
                    if (verifReq.exaltations.onOneChar) {
                        issuesExaltations.append(
                            "- You do not have one character that meets all exaltation requirements."
                        ).appendLine();
                    }
                    else {
                        for (const statNotFulfilled of notMetExaltations) {
                            const statName = SHORT_STAT_TO_LONG[statNotFulfilled];
                            issuesExaltations.append(`- Need ${neededExalt[statNotFulfilled]} ${statName[1]}`)
                                .append(" Exaltations.")
                                .appendLine();
                        }
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
        if (result.fatalIssues.length > 0) {
            result.conclusion = "FAIL";
        }
        else if (result.taIssues.length > 0) {
            result.conclusion = "TRY_AGAIN";
        }
        else if (result.manualIssues.length > 0) {
            result.conclusion = "MANUAL";
        }
        else {
            result.conclusion = "PASS";
        }

        if (result.conclusion === "MANUAL" && !instance.manualVerifyChannel) {
            result.conclusion = "FAIL";
        }

        return result;
    }

    /**
     * Cancels the collector and deletes the verification message. This should be called when an error occurs.
     * @param {InteractionCollector<MessageComponentInteraction>} collector The collector.
     * @param {Message} msg The message.
     * @param {VerifyManager.IVerificationInstance} instance THe verification instance.
     * @param {string} nameToVerify The name to verify with.
     * @private
     */
    async function cancelOnFailSend(collector: InteractionCollector<MessageComponentInteraction>, msg: Message,
                                    instance: IVerificationInstance, nameToVerify: string) {
        collector.stop("error");
        await MessageUtilities.tryDelete(msg);
        instance.verifyFailChannel?.send({
            content: `[Main] ${instance.member} tried to verify as **\`${nameToVerify}\`**, but something`
                + " went wrong when trying to message the user. Verification has been canceled."
        });
    }

    /**
     * Checks whether a person has the required guild rank or higher.
     * @param {string} minNeeded The minimum rank needed.
     * @param {string} actual The person's rank.
     * @return {boolean} Whether the rank is good.
     */
    export function isValidGuildRank(minNeeded: string, actual: string): boolean {
        if (minNeeded === actual) return true;
        const idx = GUILD_ROLES.indexOf(minNeeded);
        if (idx === -1)
            return false;

        for (let i = idx; i >= 0; i--) {
            if (GUILD_ROLES[i] === actual)
                return true;
        }

        return false;
    }


    /**
     * Direct messages a member with a test message, returning the message instance if it succeeds. This is useful
     * if you need to check if a member can be DMed.
     * @param {GuildMember} member The member to DM.
     * @returns {Promise<[Message, DMChannel] | null>} The message object, if the message was successfully sent.
     * Otherwise, `null`.
     * @private
     */
    async function dmMember(member: GuildMember): Promise<[Message, DMChannel] | null> {
        return GlobalFgrUtilities.tryExecuteAsync(async () => {
            const dm = await member.createDM();
            return [await dm.send({
                embeds: [
                    new MessageEmbed()
                        .setDescription("This is a test message to see if the bot can directly message you.")
                        .setColor("RANDOM")
                ]
            }), dm];
        });
    }

    /**
     * Gets the verification embed that the user can see. This should only be used for the main section.
     * @param {GuildMember} member The member.
     * @param {string} ign The in-game name of this member to verify as.
     * @param {string} code The verification code.
     * @returns {MessageEmbed} The message embed to show to the user.
     * @private
     */
    function getVerificationEmbed(member: GuildMember, ign: string, code: string): MessageEmbed {
        return MessageUtilities.generateBlankEmbed(member.guild)
            .setTitle(`**${member.guild.name}**: Guild Verification`)
            .setDescription(
                new StringBuilder()
                    .append(`Hello! You have selected the name **\`${ign}\`** to verify with. In order to get`)
                    .append(" verified in this server, you will need to complete a few steps. These steps involve")
                    .append(` your [RealmEye profile](https://www.realmeye.com/player/${ign}). Note that you will`)
                    .append(" need a password to access to your profile. If you don't have one, or forgot it, you can")
                    .append(" learn how to get one [here](https://www.realmeye.com/mreyeball#password).")
                    .appendLine(2)
                    .append("If you do not want to complete verification at this time, please press the **Cancel**")
                    .append(" button.")
                    .toString()
            )
            .addField(
                "1. Verification Code",
                new StringBuilder()
                    .append("Your verification code is ")
                    .append(StringUtil.codifyString(code))
                    .append("Put this verification code somewhere in your RealmEye profile's **description.**")
                    .toString()
            )
            .addField(
                "2. Check Profile Settings.",
                new StringBuilder()
                    .append("Make sure anyone can see your general profile and name history. If the server's")
                    .append(" requirement(s) expect more part(s) of your profile to be public (e.g., exaltations,")
                    .append(" graveyard, etc.), please make sure this is the case. To access your profile settings,")
                    .append(` click [here](https://www.realmeye.com/settings-of/${ign}). Note that you must be logged`)
                    .append(" in to see this page.")
                    .toString()
            )
            .addField(
                "3. Wait.",
                "RealmEye may take up to a minute to fully refresh your profile. This is *especially* the case if"
                + " you just tried to verify and failed. In any case, please wait at least 30 seconds before continuing.",
            )
            .addField(
                "4. Confirm",
                "Press the **Check Profile** button to begin the verification process. If something goes wrong while"
                + " this process is going on, you will be notified."
            );
    }
}