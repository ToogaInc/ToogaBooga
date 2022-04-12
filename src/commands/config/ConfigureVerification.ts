import {BaseCommand, ICommandContext} from "../BaseCommand";
import {
    Message,
    MessageButton,
    MessageComponentInteraction,
    MessageEmbed,
    MessageSelectMenu,
    TextChannel
} from "discord.js";
import {askInput, sendOrEditBotMsg} from "./common/ConfigCommon";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {MongoManager} from "../../managers/MongoManager";
import {EmojiConstants} from "../../constants/EmojiConstants";
import {
    ICharacterReq,
    IDungeonReq,
    IExaltationReq,
    IGuildInfo,
    ISectionInfo,
    IVerificationProperties,
    IVerificationRequirements
} from "../../definitions";
import {StringBuilder} from "../../utilities/StringBuilder";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {StringUtil} from "../../utilities/StringUtilities";
import {Filter, UpdateFilter} from "mongodb";
import {TimedResult, TimedStatus} from "../../definitions/Types";
import {GeneralConstants} from "../../constants/GeneralConstants";
import {DungeonUtilities} from "../../utilities/DungeonUtilities";
import {ArrayUtilities} from "../../utilities/ArrayUtilities";
import {DUNGEON_DATA} from "../../constants/dungeons/DungeonData";
import {VerifyManager} from "../../managers/VerifyManager";
import {ButtonConstants} from "../../constants/ButtonConstants";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import SHORT_STAT_TO_LONG = VerifyManager.SHORT_STAT_TO_LONG;

export class ConfigureVerification extends BaseCommand {
    public static GUILD_RANKS: string[] = [
        "Initiate",
        "Member",
        "Officer",
        "Leader"
    ];

    public static MAX_DUNGEON_REQS: number = 8;

    public constructor() {
        super({
            cmdCode: "CONFIG_VERIFICATION",
            formalCommandName: "Configure Verification",
            botCommandName: "configverification",
            description: "Allows the user to configure verification requirements for a section.",
            rolePermissions: ["Officer", "HeadRaidLeader", "Moderator"],
            botPermissions: ["ADD_REACTIONS", "MANAGE_MESSAGES"],
            generalPermissions: [],
            commandCooldown: 3 * 1000,
            argumentInfo: [],
            guildOnly: true,
            botOwnerOnly: false,
            guildConcurrencyLimit: 1,
            allowMultipleExecutionByUser: false
        });
    }

    /**
     * Gets all buttons for controlling various interfaces.
     * @param {MessageButton} buttons The buttons to add.
     * @return {MessageButton[]} The new buttons array.
     * @private
     */
    private static getButtons(...buttons: MessageButton[]): MessageButton[] {
        return [
            AdvancedCollector.cloneButton(ButtonConstants.BACK_BUTTON),
            AdvancedCollector.cloneButton(ButtonConstants.UP_BUTTON),
            AdvancedCollector.cloneButton(ButtonConstants.DOWN_BUTTON),
            ...buttons,
            AdvancedCollector.cloneButton(ButtonConstants.SAVE_BUTTON)
        ];
    }

    /** @inheritDoc */
    public async run(ctx: ICommandContext): Promise<number> {
        if (!(ctx.channel instanceof TextChannel)) return -1;

        await ctx.interaction.reply({
            content: "A new message should have popped up! Please refer to that message."
        });

        await this.mainMenu(ctx, null);
        return 0;
    }

    /**
     * The main menu function. This is where the configuration process actually begins.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message, which will be used for interactivity (editing message).
     */
    public async mainMenu(ctx: ICommandContext, botMsg: Message | null): Promise<void> {
        // Ask for section first
        const allSections = MongoManager.getAllSections(ctx.guildDoc!);

        botMsg = await sendOrEditBotMsg(ctx.channel, botMsg, {
            embeds: [
                new MessageEmbed()
                    .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                    .setTitle("Select Section")
                    .setDescription(
                        "Please select the section that you want to configure verification for. If you don't want to"
                        + " configure verification right now, you may press the **Cancel** button."
                    )
            ],
            components: AdvancedCollector.getActionRowsFromComponents([
                new MessageSelectMenu()
                    .setCustomId("select")
                    .setMaxValues(1)
                    .setMinValues(1)
                    .addOptions(allSections.map(x => {
                        return {
                            value: x.uniqueIdentifier,
                            label: x.sectionName
                        };
                    })),
                ButtonConstants.CANCEL_BUTTON
            ])
        });

        const selected = await AdvancedCollector.startInteractionCollector({
            targetChannel: botMsg.channel,
            targetAuthor: ctx.user,
            oldMsg: botMsg,
            acknowledgeImmediately: true,
            clearInteractionsAfterComplete: false,
            deleteBaseMsgAfterComplete: false,
            duration: 60 * 1000
        });

        if (!selected || !selected.isSelectMenu()) {
            await this.dispose(ctx, botMsg);
            return;
        }

        await this.configVerification(ctx, botMsg, allSections.find(x => x.uniqueIdentifier === selected.values[0])!)
        ;
    }

    /**
     * Configures verification requirements and other related things for a section.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {ISectionInfo} section The section.
     */
    public async configVerification(ctx: ICommandContext, botMsg: Message, section: ISectionInfo): Promise<void> {
        const verifConfig: IVerificationProperties = {
            checkRequirements: section.otherMajorConfig.verificationProperties.checkRequirements,
            autoManualVerify: {...section.otherMajorConfig.verificationProperties.autoManualVerify},
            verifReq: {...section.otherMajorConfig.verificationProperties.verifReq},
            verificationSuccessMessage: section.otherMajorConfig.verificationProperties.verificationSuccessMessage,
            additionalVerificationInfo: section.otherMajorConfig.verificationProperties.additionalVerificationInfo
        };

        const toggleCheckReqButton = new MessageButton()
            .setStyle("PRIMARY")
            .setCustomId("check_reqs")
            .setDisabled(section.isMainSection);

        const configVerifButton = new MessageButton()
            .setStyle("PRIMARY")
            .setLabel("Configure Requirements")
            .setCustomId("config_req");

        const buttons: MessageButton[] = [
            toggleCheckReqButton,
            configVerifButton,
            new MessageButton()
                .setStyle("PRIMARY")
                .setLabel("Set Verification Embed Message")
                .setCustomId("set_verif_msg"),
            new MessageButton()
                .setStyle("PRIMARY")
                .setLabel("Set Verification Success Message")
                .setCustomId("set_verif_success_msg"),
            ButtonConstants.SAVE_BUTTON,
            ButtonConstants.BACK_BUTTON,
            ButtonConstants.QUIT_BUTTON,
            new MessageButton()
                .setStyle("PRIMARY")
                .setLabel("Send Verification Embed")
                .setCustomId("send")
                .setDisabled(
                    !GuildFgrUtilities.hasCachedChannel(ctx.guild!, section.channels.verification.verificationChannelId)
                )
        ];

        const embed = new MessageEmbed()
            .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
            .setTitle(`Configure Verification: **${section.sectionName}**`)
            .setDescription(
                new StringBuilder()
                    .append("Here, you can configure verification for this section. To do so, please press the button")
                    .append(" that best corresponds to the action that you want to perform.")
                    .appendLine()
                    .append("- Press the **Check Requirements** button if you want to enable or disable the checking")
                    .append(" of requirements for this section.").appendLine()
                    .append("- Press the **Configure Verification** button if you want to set verification")
                    .append(" requirements for this section.").appendLine()
                    .append("- Press the **Set Verification Embed Message** button if you want to specify a message")
                    .append(" that will be displayed on the verification embed (where people will start the")
                    .append(" verification process).").appendLine()
                    .append("- Press the **Set Verification Success Message** button if you want to specify a message")
                    .append(" that will be displayed to the user upon successful verification.")
                    .appendLine()
                    .append("- Press the **Save** button if you want to save this configuration.")
                    .appendLine()
                    .append("- Press the **Cancel & Go Back** button if you don't want to save your changes, but want")
                    .append(" to change something else. Otherwise, to quit, press the **Cancel & Quit** button.")
                    .appendLine()
                    .append("- Press the **Send Verification Embed** button if you are ready to make verification")
                    .append(" available for this section. This will send the verification embed to the configured")
                    .append(" verification channel.")
                    .toString()
            );

        while (true) {
            configVerifButton.setDisabled(!verifConfig.checkRequirements);
            toggleCheckReqButton.setLabel(
                verifConfig.checkRequirements
                    ? "Disable Check Requirements"
                    : "Enable Check Requirements"
            );

            embed.fields = [];
            embed.addField(
                "Checking Requirements?",
                StringUtil.codifyString(verifConfig.checkRequirements ? "Yes" : "No")
            ).addField(
                "Verification Success Message",
                StringUtil.codifyString(
                    verifConfig.verificationSuccessMessage.length === 0
                        ? "Not Set."
                        : verifConfig.verificationSuccessMessage.length > 1000
                            ? verifConfig.verificationSuccessMessage.slice(0, 1000) + "..."
                            : verifConfig.verificationSuccessMessage
                )
            ).addField(
                "Verification Embed Message",
                StringUtil.codifyString(
                    verifConfig.additionalVerificationInfo.length === 0
                        ? "Not Set."
                        : verifConfig.additionalVerificationInfo.length > 1000
                            ? verifConfig.additionalVerificationInfo.slice(0, 1000) + "..."
                            : verifConfig.additionalVerificationInfo
                )
            );

            await botMsg.edit({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents(buttons)
            });

            const selectedButton = await AdvancedCollector.startInteractionCollector({
                targetChannel: botMsg.channel as TextChannel,
                targetAuthor: ctx.user,
                oldMsg: botMsg,
                acknowledgeImmediately: true,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                duration: 2 * 60 * 1000
            });

            if (!selectedButton) {
                await this.dispose(ctx, botMsg);
                return;
            }

            switch (selectedButton.customId) {
                case "config_req": {
                    const cr = await this.configVerifReqs(ctx, botMsg, verifConfig.verifReq);
                    if (cr.status === TimedStatus.TIMED_OUT) {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (cr.status === TimedStatus.CANCELED)
                        break;

                    verifConfig.verifReq = cr.value!;
                    break;
                }
                case "check_reqs": {
                    verifConfig.checkRequirements = !verifConfig.checkRequirements;
                    break;
                }
                case "set_verif_msg": {
                    const verifMsg = await askInput<string>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                                    .setTitle("Set Additional Verification Info Message")
                                    .setDescription("Please type the message that you want people to see when they"
                                        + " try to verify. Your message can be up to 1010 characters in length. When"
                                        + " you send the verification embed, the message that you specify here will"
                                        + " be displayed on that embed. If you decide that you don't want to"
                                        + " configure this right now, press the **Back** button.")
                            ]
                        },
                        m => m.content && m.content.length <= 1010 ? m.content : null
                    );

                    if (typeof verifMsg === "undefined") {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (!verifMsg)
                        break;

                    verifConfig.additionalVerificationInfo = verifMsg;
                    break;
                }
                case "set_verif_success_msg": {
                    const verifSuccessMsg = await askInput<string>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                                    .setTitle("Set Verification Success Info Message")
                                    .setDescription("Please type the message that you want people to see when they"
                                        + " successfully verify. You can use this to tell raiders how the server"
                                        + " works and whatnot. Your message can be up to 1010 characters in length."
                                        + " If you decide that you don't want to specify this right now, press the"
                                        + " **Back** button.")
                            ]
                        },
                        m => m.content && m.content.length <= 1010 ? m.content : null
                    );

                    if (typeof verifSuccessMsg === "undefined") {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (!verifSuccessMsg)
                        break;

                    verifConfig.verificationSuccessMessage = verifSuccessMsg;
                    break;
                }
                case ButtonConstants.SAVE_ID: {
                    const filterQuery: Filter<IGuildInfo> = section.isMainSection
                        ? {guildId: ctx.guild!.id}
                        : {guildId: ctx.guild!.id, "guildSections.uniqueIdentifier": section.uniqueIdentifier};
                    const updateQuery: UpdateFilter<IGuildInfo> = section.isMainSection
                        ? {$set: {"otherMajorConfig.verificationProperties": verifConfig}}
                        : {$set: {"guildSections.$.otherMajorConfig.verificationProperties": verifConfig}};
                    ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc(filterQuery, updateQuery);
                    await this.mainMenu(ctx, botMsg);
                    return;
                }
                case ButtonConstants.BACK_ID: {
                    await this.mainMenu(ctx, botMsg);
                    return;
                }
                case ButtonConstants.QUIT_ID: {
                    await this.dispose(ctx, botMsg);
                    return;
                }
                case "send": {
                    const filterQuery: Filter<IGuildInfo> = section.isMainSection
                        ? {guildId: ctx.guild!.id}
                        : {guildId: ctx.guild!.id, "guildSections.uniqueIdentifier": section.uniqueIdentifier};
                    const updateQuery: UpdateFilter<IGuildInfo> = section.isMainSection
                        ? {$set: {"otherMajorConfig.verificationProperties": verifConfig}}
                        : {$set: {"guildSections.$.otherMajorConfig.verificationProperties": verifConfig}};
                    ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc(filterQuery, updateQuery);

                    const c = GuildFgrUtilities.getCachedChannel<TextChannel>(
                        ctx.guild!,
                        section.channels.verification.verificationChannelId
                    );

                    if (!c) {
                        await selectedButton.reply({
                            content: "No verification channel set.",
                            ephemeral: true
                        });
                        break;
                    }

                    const verifEmbed = new MessageEmbed()
                        .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                        .setTitle(
                            section.isMainSection
                                ? `Server Verification: **${ctx.guild!.name}**`
                                : `Section Verification: **${section.sectionName}**`
                        ).setFooter({text: section.isMainSection ? "Server Verification" : "Section Verification"});

                    const requirements = VerifyManager.getVerificationRequirements(ctx.guildDoc!, verifConfig);
                    const descSb = new StringBuilder();
                    if (section.isMainSection) {
                        descSb.append(`Welcome to **\`${ctx.guild!.name}\`**. `)
                            .append("In order to get access to the server, you will need to verify your identity with")
                            .append(" the bot and meet the following requirements (if any):")
                            .append(StringUtil.codifyString(requirements))
                            .appendLine()
                            .append("If you meet the requirements posted above, please press the **Verify Me** button.")
                            .append(" __Make sure anyone can direct message you.__");
                    }
                    else {
                        descSb.append(`Welcome to the **\`${section.sectionName}\`** section. `)
                            .append("In order to get access to the section, you will need to meet the following")
                            .append(" requirements (if any):")
                            .append(StringUtil.codifyString(requirements))
                            .appendLine()
                            .append("If you meet the requirements posted above, please press the **Verify Me** button.")
                            .append(" __Make sure anyone can direct message you.__");
                    }

                    verifEmbed.setDescription(descSb.toString());
                    if (verifConfig.additionalVerificationInfo) {
                        verifEmbed.addField(
                            "Additional Information by Staff",
                            verifConfig.additionalVerificationInfo
                        );
                    }

                    const newMsg = await c.send({
                        embeds: [verifEmbed],
                        components: AdvancedCollector.getActionRowsFromComponents([
                            new MessageButton()
                                .setLabel("Verify Me")
                                .setStyle("PRIMARY")
                                .setCustomId("verify_me")
                        ])
                    });
                    await newMsg.pin();
                    break;
                }
            }
        }
    }

    /**
     * Configures verification requirements for this section.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {IVerificationRequirements} verifReqs The verification requirements.
     * @return {Promise<TimedResult<IVerificationRequirements>>} The new requirements, if any.
     */
    public async configVerifReqs(
        ctx: ICommandContext,
        botMsg: Message,
        verifReqs: IVerificationRequirements
    ): Promise<TimedResult<IVerificationRequirements>> {
        const newVerifReqs: IVerificationRequirements = {
            characters: {...verifReqs.characters},
            exaltations: {...verifReqs.exaltations},
            graveyardSummary: {...verifReqs.graveyardSummary},
            guild: {...verifReqs.guild},
            lastSeen: {...verifReqs.lastSeen},
            rank: {...verifReqs.rank},
            aliveFame: {...verifReqs.aliveFame}
        };

        const embed = new MessageEmbed()
            .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
            .setTitle("Configuring Verification Requirements")
            .setDescription(
                new StringBuilder()
                    .append("Here, you will be able to configure verification requirements for this section. Please")
                    .append(" refer to the directions below:").appendLine()
                    .append("- To go back (without saving your changes), press the **Back** button.").appendLine()
                    .append("- To change the minimum number of stars needed, press the **Rank** button.").appendLine()
                    .append("- To toggle whether the last seen location should be checked, press the **Last Seen")
                    .append(" Location** button.").appendLine()
                    .append("- To change the minimum number of alive fame needed, press the **Alive Fame** button.")
                    .appendLine()
                    .append("- To change whether the last-seen location is needed, press the **Last Seen** button.")
                    .appendLine()
                    .append("- To change the guild needed, press the **Guild** button.").appendLine()
                    .append("- To change the minimum guild rank needed, press the **Guild Rank** button. This requires")
                    .append(" that the guild is set.").appendLine()
                    .append("- To change the number of maxed characters needed, press the **Maxed Characters** button.")
                    .appendLine()
                    .append("- To change the exaltations needed, press the **Exaltations** button.").appendLine()
                    .append("- To change the minimum number of dungeon completions, either logged by the bot or via")
                    .append(" RealmEye, press the **Dungeon Completions** button.").appendLine()
                    .append("- To save your changes, press the **Save** button.")
                    .toString()
            );

        const guildRankButton = new MessageButton()
            .setLabel("Guild Rank")
            .setStyle("PRIMARY")
            .setCustomId("guild_rank");
        const buttons: MessageButton[] = [
            ButtonConstants.BACK_BUTTON,
            new MessageButton()
                .setLabel("Rank")
                .setStyle("PRIMARY")
                .setCustomId("rank"),
            new MessageButton()
                .setLabel("Last Seen Location")
                .setStyle("PRIMARY")
                .setCustomId("last_seen"),
            new MessageButton()
                .setLabel("Alive Fame")
                .setStyle("PRIMARY")
                .setCustomId("fame"),
            new MessageButton()
                .setLabel("Guild")
                .setStyle("PRIMARY")
                .setCustomId("guild"),
            guildRankButton,
            new MessageButton()
                .setLabel("Maxed Characters")
                .setStyle("PRIMARY")
                .setCustomId("chars"),
            new MessageButton()
                .setLabel("Exaltations")
                .setStyle("PRIMARY")
                .setCustomId("exaltations"),
            new MessageButton()
                .setLabel("Dungeon Completions")
                .setStyle("PRIMARY")
                .setCustomId("dungeon_completions"),
            ButtonConstants.SAVE_BUTTON
        ];

        while (true) {
            guildRankButton.setDisabled(!newVerifReqs.guild.checkThis && !newVerifReqs.guild.guildName.checkThis);
            embed.fields = [];
            embed.addField(
                "Minimum Rank",
                StringUtil.codifyString(
                    newVerifReqs.rank.checkThis
                        ? newVerifReqs.rank.minRank
                        : "Not Checking."
                ),
                true
            ).addField(
                "Minimum Alive Fame",
                StringUtil.codifyString(
                    newVerifReqs.aliveFame.checkThis
                        ? newVerifReqs.aliveFame.minFame
                        : "Not Checking."
                ),
                true
            ).addField(
                "Last Seen Location",
                StringUtil.codifyString(
                    newVerifReqs.lastSeen.mustBeHidden
                        ? "Hidden."
                        : "Not Checking."
                ),
                true
            ).addField(
                "Guild Needed",
                StringUtil.codifyString(
                    newVerifReqs.guild.checkThis && newVerifReqs.guild.guildName.checkThis
                        ? newVerifReqs.guild.guildName.name
                        : "Not Checking."
                ),
                true
            ).addField(
                "Guild Rank Needed",
                StringUtil.codifyString(
                    newVerifReqs.guild.checkThis && newVerifReqs.guild.guildRank.checkThis
                        ? newVerifReqs.guild.guildRank.exact
                            ? `Exactly: ${newVerifReqs.guild.guildRank.minRank}`
                            : `At Least: ${newVerifReqs.guild.guildRank.minRank}`
                        : "Not Checking."
                )
            ).addField(
                "Maxed Characters",
                StringUtil.codifyString(
                    newVerifReqs.characters.checkThis && newVerifReqs.characters.statsNeeded.some(x => x > 0)
                        ? newVerifReqs.characters.statsNeeded
                            .map((num, idx) => `- ${idx}/8: ${num}`)
                            .filter(x => !x.endsWith("0"))
                            .join("\n")
                        : "Not Checking."
                )
            ).addField(
                "Exaltations",
                StringUtil.codifyString(
                    newVerifReqs.exaltations.checkThis
                        ? Object.keys(newVerifReqs.exaltations.minimum)
                            .filter(x => newVerifReqs.exaltations.minimum[x] > 0)
                            .map(x => `- ${x.toUpperCase()}: ${newVerifReqs.exaltations.minimum[x]}/5`)
                            .join("\n")
                        : "Not Checking."
                )
            );

            await botMsg.edit({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents(buttons)
            });

            const selectedButton = await AdvancedCollector.startInteractionCollector({
                targetChannel: botMsg.channel as TextChannel,
                targetAuthor: ctx.user,
                oldMsg: botMsg,
                acknowledgeImmediately: true,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                duration: 2 * 60 * 1000
            });

            if (!selectedButton)
                return {value: null, status: TimedStatus.TIMED_OUT};

            switch (selectedButton.customId) {
                case ButtonConstants.BACK_ID: {
                    return {value: verifReqs, status: TimedStatus.SUCCESS};
                }
                case "last_seen": {
                    newVerifReqs.lastSeen.mustBeHidden = !newVerifReqs.lastSeen.mustBeHidden;
                    break;
                }
                case "guild_rank": {
                    await botMsg.edit({
                        embeds: [
                            new MessageEmbed()
                                .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                                .setTitle("Set Guild Rank")
                                .setDescription(
                                    "Please select the minimum guild rank needed to verify in this section by"
                                    + " selecting a rank from the select menu. If you don't want to configure this"
                                    + " right now, press the **Back** button. If you want to reset this option,"
                                    + " press the **Reset** button."
                                )
                        ],
                        components: AdvancedCollector.getActionRowsFromComponents([
                            new MessageButton()
                                .setLabel("Back")
                                .setStyle("DANGER")
                                .setCustomId(ButtonConstants.BACK_ID),
                            new MessageButton()
                                .setLabel("Reset")
                                .setStyle("DANGER")
                                .setCustomId("reset"),
                            new MessageSelectMenu()
                                .setCustomId("guild_rank")
                                .setMinValues(1)
                                .setMaxValues(1)
                                .addOptions(ConfigureVerification.GUILD_RANKS.map(x => {
                                    return {
                                        label: x,
                                        value: x
                                    };
                                }))
                        ])
                    });

                    const gRankPrompt = await AdvancedCollector.startInteractionCollector({
                        targetChannel: botMsg.channel as TextChannel,
                        targetAuthor: ctx.user,
                        oldMsg: botMsg,
                        acknowledgeImmediately: true,
                        clearInteractionsAfterComplete: false,
                        deleteBaseMsgAfterComplete: false,
                        duration: 2 * 60 * 1000
                    });

                    if (!gRankPrompt)
                        return {value: null, status: TimedStatus.TIMED_OUT};
                    if (gRankPrompt.customId === ButtonConstants.BACK_ID)
                        break;

                    let guildRank: string | null = null;
                    let guildRestriction: string | null = null;

                    if (gRankPrompt.isSelectMenu())
                        guildRank = gRankPrompt.values[0];

                    if (guildRank) {
                        await botMsg.edit({
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                                    .setTitle("Specify Guild Rank Restriction")
                                    .setDescription(
                                        "Please specify the restriction that should be made with the rank that you just"
                                        + " selected. You can either choose **Exact**, which means that the person must"
                                        + " have this specific rank (and not a higher one); or, you may choose"
                                        + " **Minimum**, which means that the person can have this rank or a higher "
                                        + " rank (remember that Initiate < Member < Officer < Leader). If you don't"
                                        + " want to set this, press the **Back to Config** button."
                                    )
                            ],
                            components: AdvancedCollector.getActionRowsFromComponents([
                                new MessageButton()
                                    .setLabel("Exact")
                                    .setStyle("PRIMARY")
                                    .setCustomId("exact"),
                                new MessageButton()
                                    .setLabel("Minimum")
                                    .setStyle("PRIMARY")
                                    .setCustomId("min"),
                                new MessageButton()
                                    .setLabel("Back to Config")
                                    .setStyle("PRIMARY")
                                    .setCustomId(ButtonConstants.BACK_ID)
                            ])
                        });

                        const gRankRestrictPrompt = await AdvancedCollector.startInteractionCollector({
                            targetChannel: botMsg.channel as TextChannel,
                            targetAuthor: ctx.user,
                            oldMsg: botMsg,
                            acknowledgeImmediately: true,
                            clearInteractionsAfterComplete: false,
                            deleteBaseMsgAfterComplete: false,
                            duration: 2 * 60 * 1000
                        });

                        if (!gRankRestrictPrompt)
                            return {value: null, status: TimedStatus.TIMED_OUT};
                        if (gRankRestrictPrompt.customId === ButtonConstants.BACK_ID)
                            break;
                        guildRestriction = gRankRestrictPrompt.customId;
                    }

                    newVerifReqs.guild.guildRank.checkThis = !!guildRank;
                    newVerifReqs.guild.guildRank.minRank = guildRank ?? "";
                    newVerifReqs.guild.guildRank.exact = guildRestriction === "exact";
                    break;
                }
                case "rank": {
                    const r = await askInput<number>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                                    .setTitle("Set Minimum Rank")
                                    .setDescription("Please type a number between 0 and 85. If you don't want to set"
                                        + " a rank, press the **Back** button.")
                            ]
                        },
                        m => {
                            const rankToTest = Number.parseInt(m.content, 10);
                            return Number.isNaN(rankToTest)
                                ? null
                                : Math.min(85, Math.max(rankToTest, 0));
                        }
                    );

                    if (typeof r === "undefined")
                        return {value: null, status: TimedStatus.TIMED_OUT};
                    if (!r)
                        break;
                    newVerifReqs.rank.checkThis = r > 0;
                    newVerifReqs.rank.minRank = r;
                    break;
                }
                case "fame": {
                    const f = await askInput<number>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                                    .setTitle("Set Minimum Alive Fame")
                                    .setDescription("Please type a number that is at least 0. If you don't want to"
                                        + " set the amount of alive fame for this requirement, press the **Back**"
                                        + " button.")
                            ]
                        },
                        m => {
                            const fameToTest = Number.parseInt(m.content, 10);
                            return Number.isNaN(fameToTest)
                                ? null
                                : Math.max(fameToTest, 0);
                        }
                    );

                    if (typeof f === "undefined")
                        return {value: null, status: TimedStatus.TIMED_OUT};
                    if (!f)
                        break;
                    newVerifReqs.aliveFame.checkThis = f > 0;
                    newVerifReqs.aliveFame.minFame = f;
                    break;
                }
                case "guild": {
                    await botMsg.edit({
                        embeds: [
                            new MessageEmbed()
                                .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                                .setTitle("Set Guild Name")
                                .setDescription(
                                    "Please type the guild that the person must be in to get verified in this"
                                    + " section. Keep in mind that the guild name **must** be typed out **exactly**"
                                    + " as displayed in-game (i.e. it is case-sensitive). If you want to disable"
                                    + " this requirement, press the **Reset** button. If you don't want to change"
                                    + " this right now, press the **Back** button."
                                )
                        ],
                        components: AdvancedCollector.getActionRowsFromComponents([
                            new MessageButton()
                                .setLabel("Back")
                                .setStyle("DANGER")
                                .setCustomId(ButtonConstants.BACK_ID),
                            new MessageButton()
                                .setLabel("Reset")
                                .setStyle("DANGER")
                                .setCustomId("reset")
                        ])
                    });

                    const gNamePrompt = await AdvancedCollector.startDoubleCollector<string>({
                        targetChannel: botMsg.channel as TextChannel,
                        targetAuthor: ctx.user,
                        oldMsg: botMsg,
                        acknowledgeImmediately: true,
                        deleteResponseMessage: true,
                        clearInteractionsAfterComplete: false,
                        deleteBaseMsgAfterComplete: false,
                        duration: 2 * 60 * 1000,
                        cancelFlag: null
                    }, m => m.content.length > 0 && m.content.length < 20 ? m.content : undefined);

                    if (!gNamePrompt)
                        return {value: null, status: TimedStatus.TIMED_OUT};

                    if (gNamePrompt instanceof MessageComponentInteraction) {
                        if (gNamePrompt.customId === "reset") {
                            newVerifReqs.guild.guildName.name = "";
                            newVerifReqs.guild.guildName.checkThis = false;
                            newVerifReqs.guild.checkThis = false;
                        }

                        break;
                    }

                    newVerifReqs.guild.guildName.name = gNamePrompt;
                    newVerifReqs.guild.guildName.checkThis = true;
                    newVerifReqs.guild.checkThis = true;
                    break;
                }
                case "chars": {
                    const c = await this.configCharacters(ctx, botMsg, newVerifReqs.characters);
                    if (c.status === TimedStatus.TIMED_OUT)
                        return {value: null, status: TimedStatus.TIMED_OUT};
                    if (c.status === TimedStatus.CANCELED)
                        return {value: null, status: TimedStatus.CANCELED};
                    newVerifReqs.characters = c.value!;
                    break;
                }
                case "exaltations": {
                    const e = await this.configExaltations(ctx, botMsg, newVerifReqs.exaltations);
                    if (e.status === TimedStatus.TIMED_OUT)
                        return {value: null, status: TimedStatus.TIMED_OUT};
                    if (e.status === TimedStatus.CANCELED)
                        return {value: null, status: TimedStatus.CANCELED};
                    newVerifReqs.exaltations = e.value!;
                    break;
                }
                case "dungeon_completions": {
                    const c = await this.configDungeonReq(ctx, botMsg, newVerifReqs.graveyardSummary);
                    if (c.status === TimedStatus.TIMED_OUT)
                        return {value: null, status: TimedStatus.TIMED_OUT};
                    if (c.status === TimedStatus.CANCELED)
                        return {value: null, status: TimedStatus.CANCELED};
                    newVerifReqs.graveyardSummary = c.value!;
                    break;
                }
                case ButtonConstants.SAVE_ID: {
                    return {value: newVerifReqs, status: TimedStatus.SUCCESS};
                }
            }
        }
    }

    /**
     * Allows the user to configure exaltation requirements.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {IExaltationReq} exaltationInfo The exaltation requirements.
     * @return {Promise<TimedResult<IExaltationReq>>} The new exaltation requirements, if any.
     */
    public async configExaltations(ctx: ICommandContext, botMsg: Message,
                                   exaltationInfo: IExaltationReq): Promise<TimedResult<IExaltationReq>> {
        const newExaltationInfo: IExaltationReq = {
            checkThis: exaltationInfo.checkThis,
            minimum: {...exaltationInfo.minimum},
            onOneChar: exaltationInfo.onOneChar
        };

        const oneCharButton = new MessageButton()
            .setStyle("PRIMARY")
            .setCustomId("one_char");

        const buttons: MessageButton[] = ConfigureVerification.getButtons(oneCharButton);
        const embed = new MessageEmbed()
            .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
            .setTitle("Configure Exaltation Requirement")
            .setDescription(
                new StringBuilder()
                    .append("Here, you will be able to configure the specific exaltation requirements needed to verify")
                    .append(" in this server. Do keep in mind that RealmEye updates exaltations infrequently, so it")
                    .append(" might be best to find a different method for validating exaltations. Nonetheless, the")
                    .append(" instructions are as follows:").appendLine()
                    .append(`- The ${EmojiConstants.RIGHT_TRIANGLE_EMOJI} emoji will point to the currently selected stat.`)
                    .append(" You can press the **Up**/**Down** buttons to navigate between stats.")
                    .appendLine()
                    .append("- Once you select the appropriate stat, type a number between 0 and 5, where `0`")
                    .append(" indicates no exaltation of this stat is needed and `5` indicates that the user must be")
                    .append(" fully exalted in the specified stat.").appendLine()
                    .append("- Regardless of what stat you select, you can press the **Allow Multiple Characters** or")
                    .append(" **Only Allow One Character** buttons to specify that the exaltation requirement can be")
                    .append(" met on all characters *or* must be met on one character only, respectively.").appendLine()
                    .append("- Once you are done, press the **Save** button to save your changes, or the **Back**")
                    .append(" button to go back without saving your changes.")
                    .toString()
            );

        let selectedIdx = 0;
        while (true) {
            oneCharButton.setLabel(
                newExaltationInfo.onOneChar
                    ? "Allow Multiple Characters"
                    : "Only Allow One Character"
            );

            embed.setFooter({
                text: newExaltationInfo.onOneChar
                    ? "Only Allowing One Character"
                    : "Allow Multiple Characters"
            });

            embed.fields = [];
            const entries = Object.entries(newExaltationInfo.minimum);
            for (let i = 0; i < entries.length; i++) {
                const [stat, amt] = entries[i];
                if (i === selectedIdx) {
                    embed.addField(
                        `${EmojiConstants.RIGHT_TRIANGLE_EMOJI} ${SHORT_STAT_TO_LONG[stat][1]} (${stat.toUpperCase()})`,
                        StringUtil.codifyString(`Minimum Needed: ${amt}/5`)
                    );
                    continue;
                }

                embed.addField(
                    `${SHORT_STAT_TO_LONG[stat][1]} (${stat.toUpperCase()})`,
                    StringUtil.codifyString(`Minimum Needed: ${amt}/5`)
                );
            }

            await botMsg.edit({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents(buttons)
            });

            const selectedChoice = await AdvancedCollector.startDoubleCollector<number>({
                acknowledgeImmediately: true,
                cancelFlag: null,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                deleteResponseMessage: true,
                duration: 60 * 1000,
                oldMsg: botMsg,
                targetAuthor: ctx.user,
                targetChannel: ctx.channel
            }, m => {
                const num = Number.parseInt(m.content, 10);
                return Number.isNaN(num)
                    ? undefined
                    : Math.min(5, Math.max(0, num));
            });

            // Explicit null check since `selectedChoice` can be 0
            if (selectedChoice === null)
                return {value: null, status: TimedStatus.TIMED_OUT};

            if (typeof selectedChoice === "number") {
                newExaltationInfo.minimum[entries[selectedIdx][0]] = selectedChoice;
                continue;
            }

            switch (selectedChoice.customId) {
                case "one_char": {
                    newExaltationInfo.onOneChar = !newExaltationInfo.onOneChar;
                    break;
                }
                case ButtonConstants.BACK_ID: {
                    return {value: exaltationInfo, status: TimedStatus.SUCCESS};
                }
                case ButtonConstants.UP_ID: {
                    selectedIdx = (selectedIdx + 8 - 1) % 8;
                    break;
                }
                case ButtonConstants.DOWN_ID: {
                    selectedIdx++;
                    selectedIdx %= 8;
                    break;
                }
                case ButtonConstants.SAVE_ID: {
                    newExaltationInfo.checkThis = Object.values(newExaltationInfo.minimum).some(x => x > 0);
                    return {value: newExaltationInfo, status: TimedStatus.SUCCESS};
                }
            }
        }
    }

    /**
     * Allows the user to configure character requirements.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {ICharacterReq} charInfo The character requirements.
     * @return {Promise<TimedResult<IExaltationReq>>} The new character requirements, if any.
     */
    public async configCharacters(ctx: ICommandContext, botMsg: Message,
                                  charInfo: ICharacterReq): Promise<TimedResult<ICharacterReq>> {
        const newCharRequirements: ICharacterReq = {
            checkThis: charInfo.checkThis,
            statsNeeded: charInfo.statsNeeded.slice() as [
                number,
                number,
                number,
                number,
                number,
                number,
                number,
                number,
                number
            ],
            checkPastDeaths: charInfo.checkPastDeaths
        };

        const checkPastDeathsButton = new MessageButton()
            .setStyle("PRIMARY")
            .setCustomId("past_deaths");

        const buttons: MessageButton[] = ConfigureVerification.getButtons(checkPastDeathsButton);
        const embed = new MessageEmbed()
            .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
            .setTitle("Configure Character Requirement")
            .setDescription(
                new StringBuilder()
                    .append("Here, you will be able to configure the specific character requirements needed to verify")
                    .append(" in this server. As a fair warning, keep in mind that RealmEye does not currently have")
                    .append(" character stats updated. It is, thus, recommended that you check past deaths or find")
                    .append(" a different way to validate the person's maxed characters. Here are the instructions:")
                    .appendLine()
                    .append(`- The ${EmojiConstants.RIGHT_TRIANGLE_EMOJI} emoji will point to the currently selected number`)
                    .append(" of maxed stats. You can press the **Up**/**Down** buttons to navigate between this.")
                    .appendLine()
                    .append("- Once you select the appropriate number of maxed stats, type a non-negative integer.")
                    .appendLine()
                    .append("- Regardless of what you select, you can press the **(Don't) Check Past Deaths** button")
                    .append(" to either check the graveyard history, or not to. It is strongly recommended that you")
                    .append(" keep this on.").appendLine()
                    .append("- Once you are done, press the **Save** button to save your changes, or the **Back**")
                    .append(" button to go back without saving your changes.")
                    .toString()
            );

        let selectedIdx = 0;
        while (true) {
            checkPastDeathsButton.setLabel(
                newCharRequirements.checkPastDeaths
                    ? "Don't Check Past Deaths"
                    : "Check Past Deaths"
            );

            embed.setFooter({
                text: newCharRequirements.checkPastDeaths
                    ? "Checking Past Deaths"
                    : "Only Checking Active Characters"
            });

            embed.fields = [];
            for (let i = 0; i < newCharRequirements.statsNeeded.length; i++) {
                const numOfThis = newCharRequirements.statsNeeded[i];
                if (i === selectedIdx) {
                    embed.addField(
                        `${EmojiConstants.RIGHT_TRIANGLE_EMOJI} ${i}/8 Characters`,
                        StringUtil.codifyString(`Minimum Needed: ${numOfThis}`)
                    );
                    continue;
                }

                embed.addField(
                    `${i}/8 Characters`,
                    StringUtil.codifyString(`Minimum Needed: ${numOfThis}`)
                );
            }

            await botMsg.edit({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents(buttons)
            });

            const selectedChoice = await AdvancedCollector.startDoubleCollector<number>({
                acknowledgeImmediately: true,
                cancelFlag: null,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                deleteResponseMessage: true,
                duration: 60 * 1000,
                oldMsg: botMsg,
                targetAuthor: ctx.user,
                targetChannel: ctx.channel
            }, m => {
                const num = Number.parseInt(m.content, 10);
                return Number.isNaN(num)
                    ? undefined
                    : Math.max(0, num);
            });

            if (selectedChoice === null)
                return {value: null, status: TimedStatus.TIMED_OUT};

            if (typeof selectedChoice === "number") {
                newCharRequirements.statsNeeded[selectedIdx] = selectedChoice;
                continue;
            }

            switch (selectedChoice.customId) {
                case "past_deaths": {
                    newCharRequirements.checkPastDeaths = !newCharRequirements.checkPastDeaths;
                    break;
                }
                case ButtonConstants.BACK_ID: {
                    return {value: charInfo, status: TimedStatus.SUCCESS};
                }
                case ButtonConstants.UP_ID: {
                    selectedIdx = (selectedIdx + newCharRequirements.statsNeeded.length
                        - 1) % newCharRequirements.statsNeeded.length;
                    break;
                }
                case ButtonConstants.DOWN_ID: {
                    selectedIdx++;
                    selectedIdx %= newCharRequirements.statsNeeded.length;
                    break;
                }
                case ButtonConstants.SAVE_ID: {
                    newCharRequirements.checkThis = newCharRequirements.statsNeeded.some(x => x > 0);
                    return {value: newCharRequirements, status: TimedStatus.SUCCESS};
                }
            }
        }
    }

    /**
     * Disposes this instance. Use this function to clean up any messages that were used.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     */
    public async dispose(ctx: ICommandContext, botMsg: Message | null): Promise<void> {
        if (botMsg) {
            await MessageUtilities.tryDelete(botMsg);
        }
    }

    /**
     * Configures the dungeon requirements for this section.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {IDungeonReq} dungeonReq The dungeon requirement.
     * @return {Promise<TimedResult<IDungeonReq>>} The new requirements, if any.
     * @private
     */
    private async configDungeonReq(ctx: ICommandContext, botMsg: Message,
                                   dungeonReq: IDungeonReq): Promise<TimedResult<IDungeonReq>> {
        const newDungeonReq: IDungeonReq = {
            botCompletions: dungeonReq.botCompletions
                .filter(x => !!DungeonUtilities.getDungeonInfo(x.key, ctx.guildDoc!))
                .map(x => {
                    return {...x};
                }),
            checkThis: dungeonReq.checkThis,
            // DISREGARD THIS
            realmEyeCompletions: dungeonReq.realmEyeCompletions.map(x => {
                return {...x};
            }),
            // MUST BE TRUE
            useBotCompletions: dungeonReq.useBotCompletions
        };

        const [backBtn, upBtn, downButton, addBtn, removeBtn, saveBtn] = ConfigureVerification.getButtons(
            AdvancedCollector.cloneButton(ButtonConstants.ADD_BUTTON),
            AdvancedCollector.cloneButton(ButtonConstants.REMOVE_BUTTON)
        );

        const buttons = [
            backBtn,
            upBtn,
            downButton,
            addBtn,
            removeBtn,
            saveBtn
        ];

        const embed = new MessageEmbed()
            .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
            .setTitle("Configure Dungeon Requirements")
            .setDescription(
                new StringBuilder()
                    .append("Here, you will be able to configure what dungeons the user must have completed in this")
                    .append(" server before they can verify in this section. Here's how this works.").appendLine()
                    .append(`- The ${EmojiConstants.RIGHT_TRIANGLE_EMOJI} emoji will point to the currently selected dungeon.`)
                    .appendLine()
                    .append("- You can move this emoji up/down by pressing the respective **Up** or **Down** buttons.")
                    .appendLine()
                    .append("- Once you select the dungeon of your choice, you can type any __positive__ number to")
                    .append(" change how many of that dungeon completion needs to be logged by the bot in order to")
                    .append(" get verified.")
                    .appendLine()
                    .append("- You can also add a new dungeon requirement by pressing the **Add** button. If needed,")
                    .append(" you can press the **Remove** button to remove this dungeon requirement.")
                    .appendLine()
                    .append("- Once you are done, press the **Save** button to save your changes. Or, you can press")
                    .append(" the **Back** button to go back to the previous page without saving your changes.")
                    .toString()
            );

        let selectedIdx = 0;
        while (true) {
            upBtn.setDisabled(newDungeonReq.botCompletions.length <= 1);
            downButton.setDisabled(newDungeonReq.botCompletions.length <= 1);
            removeBtn.setDisabled(newDungeonReq.botCompletions.length === 0);
            addBtn.setDisabled(newDungeonReq.botCompletions.length + 1 > ConfigureVerification.MAX_DUNGEON_REQS);

            embed.fields = [];
            const fields = ArrayUtilities.arrayToStringFields(
                newDungeonReq.botCompletions,
                (i, elem) => {
                    const dgn = DungeonUtilities.getDungeonInfo(newDungeonReq.botCompletions[i].key, ctx.guildDoc!)!;
                    return i === selectedIdx
                        ? `${EmojiConstants.RIGHT_TRIANGLE_EMOJI} ${dgn.dungeonName}: \`${elem.value}\`\n`
                        : `${dgn.dungeonName}: \`${elem.value}\`\n`;
                }
            );

            for (const field of fields)
                embed.addField(GeneralConstants.ZERO_WIDTH_SPACE, field);

            await botMsg.edit({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents(buttons)
            });

            const selectedChoice = await AdvancedCollector.startDoubleCollector<number>({
                acknowledgeImmediately: true,
                cancelFlag: null,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                deleteResponseMessage: true,
                duration: 45 * 1000,
                oldMsg: botMsg,
                targetAuthor: ctx.user,
                targetChannel: ctx.channel
            }, m => {
                const num = Number.parseInt(m.content, 10);
                return Number.isNaN(num)
                    ? undefined
                    : Math.max(0, num);
            });

            if (selectedChoice === null)
                return {value: null, status: TimedStatus.TIMED_OUT};

            if (typeof selectedChoice === "number") {
                if (selectedChoice === 0) {
                    newDungeonReq.botCompletions.splice(selectedIdx, 1);
                    if (newDungeonReq.botCompletions.length === 0)
                        continue;
                    selectedIdx %= newDungeonReq.botCompletions.length;
                    continue;
                }

                if (selectedIdx >= newDungeonReq.botCompletions.length) {
                    continue;
                }

                newDungeonReq.botCompletions[selectedIdx].value = selectedChoice;
                continue;
            }

            switch (selectedChoice.customId) {
                case ButtonConstants.BACK_ID: {
                    return {value: dungeonReq, status: TimedStatus.SUCCESS};
                }
                case ButtonConstants.ADD_ID: {
                    const possDungeons = DUNGEON_DATA.concat(ctx.guildDoc!.properties.customDungeons)
                        .filter(x => newDungeonReq.botCompletions.every(y => y.key !== x.codeName));

                    if (possDungeons.length === 0)
                        break;

                    const selectMenus: MessageSelectMenu[] = [];
                    for (const subset of ArrayUtilities.breakArrayIntoSubsets(possDungeons, 25)) {
                        selectMenus.push(
                            new MessageSelectMenu()
                                .setCustomId(StringUtil.generateRandomString(40))
                                .setMaxValues(1)
                                .setMinValues(1)
                                .addOptions(subset.map(x => {
                                    return {
                                        emoji: x.portalEmojiId,
                                        value: x.codeName,
                                        label: x.dungeonName,
                                        description: x.isBuiltIn ? "Built-In Dungeon" : "Custom Dungeon"
                                    };
                                }))
                        );
                    }

                    await botMsg.edit({
                        embeds: [
                            new MessageEmbed()
                                .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
                                .setTitle("Add Dungeon Requirement")
                                .setDescription(
                                    "Please select a dungeon that you want to add to the list of dungeon"
                                    + " requirements for this section. If you don't want to add one at this time,"
                                    + " press the **Back** button."
                                )
                        ],
                        components: AdvancedCollector.getActionRowsFromComponents([
                            ...selectMenus,
                            ButtonConstants.BACK_BUTTON
                        ])
                    });

                    const selectedInteraction = await AdvancedCollector.startInteractionCollector({
                        acknowledgeImmediately: true,
                        clearInteractionsAfterComplete: false,
                        deleteBaseMsgAfterComplete: false,
                        duration: 45 * 1000,
                        oldMsg: botMsg,
                        targetAuthor: ctx.user,
                        targetChannel: ctx.channel
                    });

                    if (!selectedInteraction)
                        return {value: null, status: TimedStatus.TIMED_OUT};

                    if (!selectedInteraction.isSelectMenu())
                        break;

                    newDungeonReq.botCompletions.push({key: selectedInteraction.values[0], value: 1});
                    break;
                }
                case ButtonConstants.REMOVE_ID: {
                    newDungeonReq.botCompletions.splice(selectedIdx, 1);
                    if (newDungeonReq.botCompletions.length === 0)
                        break;
                    selectedIdx %= newDungeonReq.botCompletions.length;
                    break;
                }
                case ButtonConstants.UP_ID: {
                    selectedIdx = (selectedIdx + newDungeonReq.botCompletions.length - 1)
                        % newDungeonReq.botCompletions.length;
                    selectedIdx %= newDungeonReq.botCompletions.length;
                    break;
                }
                case ButtonConstants.DOWN_ID: {
                    selectedIdx++;
                    selectedIdx %= newDungeonReq.botCompletions.length;
                    break;
                }
                case ButtonConstants.SAVE_ID: {
                    newDungeonReq.checkThis = newDungeonReq.botCompletions.some(x => x.value > 0);
                    return {value: newDungeonReq, status: TimedStatus.SUCCESS};
                }
            }
        }
    }
}