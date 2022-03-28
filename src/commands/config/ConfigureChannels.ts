import {
    ConfigType,
    DATABASE_CONFIG_DESCRIPTION,
    DB_CONFIG_ACTION_ROW,
    entryFunction,
    getInstructions,
    IBaseDatabaseEntryInfo,
    IConfigCommand
} from "./common/ConfigCommon";
import {Guild, Message, MessageButton, MessageEmbed, TextChannel} from "discord.js";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {StringBuilder} from "../../utilities/StringBuilder";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {BaseCommand, ICommandContext} from "../BaseCommand";
import {ParseUtilities} from "../../utilities/ParseUtilities";
import {Filter} from "mongodb";
import {MongoManager} from "../../managers/MongoManager";
import {IGuildInfo, ISectionInfo} from "../../definitions";
import {EmojiConstants} from "../../constants/EmojiConstants";
import {MainLogType, SectionLogType} from "../../definitions/Types";
import {ButtonConstants} from "../../constants/ButtonConstants";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import getCachedChannel = GuildFgrUtilities.getCachedChannel;

enum ChannelCategoryType {
    Raiding,
    Verification,
    Modmail,
    Logging,
    Other
}

enum DisplayFilter {
    Raids = (1 << 0),
    Verification = (1 << 1),
    Modmail = (1 << 2),
    Other = (1 << 3)
}

interface IChannelMongo extends IBaseDatabaseEntryInfo {
    channelType: ChannelCategoryType;
}

export class ConfigureChannels extends BaseCommand implements IConfigCommand {
    private static readonly SECTION_LOGGING_IDS: SectionLogType[] = [
        "SectionSuspend",
        "VerifyFail",
        "VerifySuccess",
        "VerifyStep",
        "VerifyStart",
        "ManualVerifyAccepted",
        "ManualVerifyDenied",
        "ManualVerifyRequest"
    ];

    private static readonly MAIN_LOGGING_IDS: MainLogType[] = [
        "Suspend",
        "Mute",
        "Blacklist",
        "ModmailBlacklist",
        "Warn",
        "VerifyFail",
        "VerifySuccess",
        "VerifyStep",
        "VerifyStart",
        "SectionSuspend",
        "ManualVerifyAccepted",
        "ManualVerifyDenied",
        "ManualVerifyRequest",
        "ModmailReceived",
        "ModmailThreadCreated",
        "ModmailThreadRemoved",
        "ModmailSent"
    ];

    private static readonly NA: string = "N/A";

    private static readonly CHANNEL_MONGO: IChannelMongo[] = [
        {
            name: "Get Verified Channel",
            description: "This is the channel where users will be able to verify, via RealmEye, to gain entry into"
                + " your server or section. Conventionally, this channel is known as `#get-verified` or"
                + " `#verify-here`.",
            guildDocPath: "channels.verification.verificationChannelId",
            sectionPath: "guildSections.$.channels.verification.verificationChannelId",
            channelType: ChannelCategoryType.Verification,
            configTypeOrInstructions: ConfigType.Channel,
            getCurrentValue: (guildDoc, section) => {
                return section.isMainSection
                    ? guildDoc.channels.verification.verificationChannelId
                    : section.channels.verification.verificationChannelId;
            }
        },
        {
            name: "Manual Verification Channel",
            description: "This is the channel where manual verification requests will go. By default, these are"
                + " handled directly by the bot. If you want to manually verify someone, do it in a different channel.",
            guildDocPath: "channels.verification.manualVerificationChannelId",
            sectionPath: "guildSections.$.channels.verification.manualVerificationChannelId",
            channelType: ChannelCategoryType.Verification,
            configTypeOrInstructions: ConfigType.Channel,
            getCurrentValue: (guildDoc, section) => {
                return section.isMainSection
                    ? guildDoc.channels.verification.manualVerificationChannelId
                    : section.channels.verification.manualVerificationChannelId;
            }
        },
        {
            name: "AFK Check Channel",
            description: "This is the channel where AFK checks will occur. Conventionally, this channel is known as"
                + " `#raid-status-announcements` or `#afk-check`.",
            guildDocPath: "channels.raids.afkCheckChannelId",
            sectionPath: "guildSections.$.channels.raids.afkCheckChannelId",
            channelType: ChannelCategoryType.Raiding,
            configTypeOrInstructions: ConfigType.Channel,
            getCurrentValue: (guildDoc, section) => {
                return section.isMainSection
                    ? guildDoc.channels.raids.afkCheckChannelId
                    : section.channels.raids.afkCheckChannelId;
            }
        },
        {
            name: "Control Panel Channel",
            description: "This is the channel where the raid leader will be able to execute commands such as ending"
                + " AFK checks and raids, editing the location, and more. These commands will be displayed as buttons"
                + " on an embed message. You can either set this channel to a new channel or a private bot channel.",
            guildDocPath: "channels.raids.controlPanelChannelId",
            sectionPath: "guildSections.$.channels.raids.controlPanelChannelId",
            channelType: ChannelCategoryType.Raiding,
            configTypeOrInstructions: ConfigType.Channel,
            getCurrentValue: (guildDoc, section) => {
                return section.isMainSection
                    ? guildDoc.channels.raids.controlPanelChannelId
                    : section.channels.raids.controlPanelChannelId;
            }
        },
        {
            name: "Elite Location Channel",
            description: "This is the channel where the bot will send locations of raids once the VC is opened."
                + " Locations will only send for sections that have populated this channel. Simply leave empty to"
                + " prevent locations being sent.  Locations will be sent at the AFK-check phase, not the "
                + " PRE-AFK check phase.",
            guildDocPath: "channels.eliteLocChannelId",
            sectionPath: "guildSections.$.channels.eliteLocChannelId",
            channelType: ChannelCategoryType.Raiding,
            configTypeOrInstructions: ConfigType.Channel,
            getCurrentValue: (guildDoc, section) => {
                return section.isMainSection
                    ? guildDoc.channels.eliteLocChannelId
                    : section.channels.eliteLocChannelId;
            }
        },
        {
            name: "Leader Feedback Channel",
            description: "This is the *base* channel where raiders can rate a leader's performance. When a new AFK"
                + " check starts, the bot will create a new feedback channel (in the same category as this"
                + " channel) where raiders can leave feedback. Once the raid is over, this channel will be deleted"
                + " removed in 1 minute.",
            guildDocPath: "channels.raids.leaderFeedbackChannelId",
            sectionPath: "",
            channelType: ChannelCategoryType.Raiding,
            configTypeOrInstructions: ConfigType.Channel,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection)
                    throw new Error("leader feedback is not section chan");
                return guildDoc.channels.raids.leaderFeedbackChannelId;
            }
        },
        {
            name: "Raid History Storage Channel",
            description: "This is the channel where raid history is stored. This channel should be made **private**"
                + " (only staff members should see this channel).",
            guildDocPath: "channels.raids.raidHistChannelId",
            sectionPath: "",
            channelType: ChannelCategoryType.Raiding,
            configTypeOrInstructions: ConfigType.Channel,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection)
                    throw new Error("leader feedback is not section chan");
                return guildDoc.channels.raids.raidHistChannelId;
            }
        },
        {
            name: "Modmail Channel",
            description: "This is the channel where new modmail messages will be forwarded to. __Additionally__, in"
                + " the case a modmail *thread* text channel needs to be created, the channel will be created in the"
                + " same __category__ as the modmail channel's category.",
            guildDocPath: "channels.modmailChannelId",
            sectionPath: "",
            channelType: ChannelCategoryType.Modmail,
            configTypeOrInstructions: ConfigType.Channel,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection) throw new Error("modmail is a main-only feature.");
                return guildDoc.channels.modmailChannelId;
            }
        },
        {
            name: "Bot Updates Channel",
            description: "This is the channel where updates and messages from the bot's developers will be forwarded"
                + " to. This is the best way to receive announcements from us.",
            guildDocPath: "channels.botUpdatesChannelId",
            sectionPath: "",
            channelType: ChannelCategoryType.Other,
            configTypeOrInstructions: ConfigType.Channel,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection) throw new Error("bot updates is a main-only feature.");
                return guildDoc.channels.botUpdatesChannelId;
            }
        },
        {
            name: "Configure Logging Channel",
            description: "Here, you can add, modify, or remove logging channels. Various actions taken in the entire"
                + " guild (including sections) can be logged.",
            guildDocPath: "channels.loggingChannels",
            sectionPath: "",
            channelType: ChannelCategoryType.Logging,
            configTypeOrInstructions: ConfigType.Channel,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection) throw new Error("bot updates is a main-only feature.");
                return guildDoc.channels.loggingChannels;
            }
        },
        {
            name: "Storage Channel",
            description: "This channel is where any files will be stored. Files may include images, text files, and"
                + " more. If this is not set, the bot will use a private server's storage channel.",
            guildDocPath: "channels.storageChannelId",
            sectionPath: "",
            channelType: ChannelCategoryType.Other,
            configTypeOrInstructions: ConfigType.Channel,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection) throw new Error("storage channel is main-only.");
                return guildDoc.channels.storageChannelId;
            }
        }
    ];

    public constructor() {
        super({
            cmdCode: "CONFIGURE_CHANNEL_COMMAND",
            formalCommandName: "Configure Channel Command",
            botCommandName: "configchannels",
            description: "Allows the user to configure channels for the entire server or for a specific section",
            commandCooldown: 10 * 1000,
            generalPermissions: ["MANAGE_GUILD"],
            argumentInfo: [],
            rolePermissions: ["Officer", "HeadRaidLeader", "Moderator"],
            botPermissions: ["ADD_REACTIONS", "MANAGE_MESSAGES"],
            guildOnly: true,
            botOwnerOnly: false,
            guildConcurrencyLimit: 1,
            allowMultipleExecutionByUser: false
        });
    }

    /**
     * A function that can be used for the collector.
     * @param {Message} msg The message.
     * @returns {number | TextChannel | undefined} Either an index difference, channel to use, or nothing.
     * @private
     */
    private static msgOrNumberCollectorFunc(msg: Message): number | TextChannel | undefined {
        // Parse for channel first.
        const channel = ParseUtilities.parseChannel<TextChannel>(msg);
        // noinspection DuplicatedCode
        if (channel) return channel;
        // Parse for number.
        const contentArr = msg.content.split(" ");
        if (contentArr.length <= 1) return;
        if (contentArr[0].toLowerCase() !== "j") return;
        const num = Number.parseInt(contentArr[1], 10);
        if (Number.isNaN(num) || num === 0) return;
        return num;
    }

    /** @inheritDoc */
    public async run(ctx: ICommandContext): Promise<number> {
        if (!(ctx.channel instanceof TextChannel)) return -1;

        await ctx.interaction.reply({
            content: "A new message should have popped up! Please refer to that message."
        });

        await this.entry(ctx, null);
        return 0;
    }

    /** @inheritDoc */
    public async entry(ctx: ICommandContext, botMsg: Message | null): Promise<void> {
        const entryRes = await entryFunction(ctx, botMsg);

        if (!entryRes) {
            await this.dispose(ctx, botMsg);
            return;
        }

        await this.mainMenu(ctx, entryRes[0], entryRes[1]);
    }

    /** @inheritDoc */
    public async mainMenu(ctx: ICommandContext, section: ISectionInfo, botMsg: Message): Promise<void> {
        const guild = ctx.guild!;
        // Both main section + individual section will have their own AFK check + verification channel config.
        const currentConfiguration = this.getCurrentConfiguration(
            guild,
            ctx.guildDoc!,
            section,
            DisplayFilter.Verification | DisplayFilter.Raids | DisplayFilter.Other | DisplayFilter.Modmail
        );

        const buttons: MessageButton[] = [
            ButtonConstants.BACK_BUTTON,
            new MessageButton()
                .setLabel("Edit Base Channels")
                .setStyle("PRIMARY")
                .setCustomId("base")
                .setEmoji(EmojiConstants.HASH_EMOJI),
            new MessageButton()
                .setLabel("Edit Logging Channels")
                .setStyle("PRIMARY")
                .setCustomId("logging")
                .setEmoji(EmojiConstants.CLIPBOARD_EMOJI)
        ];

        const displayEmbed = new MessageEmbed()
            .setAuthor({name: guild.name, iconURL: guild.iconURL() ?? undefined})
            .setTitle(`[${section.sectionName}] **Channel** Configuration Main Menu`)
            .setDescription(`Please select the appropriate option.\n\n${currentConfiguration}`)
            .setFooter({text: `ID: ${section.uniqueIdentifier}`})
            .addField(
                "Go Back",
                "Click on the `Back` button to go back to the section selection embed. You can choose a new"
                + " section to modify."
            ).addField(
                "Edit Base Channels",
                "Click on the `Edit Base Channels` button to configure modmail, raid, and verification channels."
            ).addField(
                "Edit Logging Channels",
                "Click on the `Edit Logging Channels` button to configure logging channels."
            );

        if (section.isMainSection) {
            displayEmbed.addField(
                "Edit Other Channels",
                "Click on the `Edit Other Channels` button to edit other channels that may not otherwise belong to"
                + " the above categories."
            );
            buttons.push(new MessageButton()
                .setLabel("Edit Other Channels")
                .setStyle("PRIMARY")
                .setCustomId("other")
                .setEmoji(EmojiConstants.HASH_EMOJI));
        }

        displayEmbed.addField(
            "Quit",
            "Click on the `Quit` button to exit this process."
        );

        buttons.push(ButtonConstants.QUIT_BUTTON);

        // Edit the bot message and then wait for button press.
        await botMsg.edit({
            embeds: [displayEmbed],
            components: AdvancedCollector.getActionRowsFromComponents(buttons)
        });

        const selectedButton = await AdvancedCollector.startInteractionCollector({
            targetChannel: botMsg.channel as TextChannel,
            targetAuthor: ctx.user,
            oldMsg: botMsg,
            acknowledgeImmediately: true,
            clearInteractionsAfterComplete: false,
            deleteBaseMsgAfterComplete: false,
            duration: 30 * 1000
        });

        if (!selectedButton) {
            await this.dispose(ctx, botMsg);
            return;
        }

        switch (selectedButton.customId) {
            case ButtonConstants.BACK_ID: {
                await this.entry(ctx, botMsg);
                return;
            }
            case "base": {
                await this.doBaseChannels(ctx, section, botMsg);
                return;
            }
            case "logging": {
                await this.doLoggingChannels(ctx, section, botMsg);
                return;
            }
            case "other": {
                await this.editDatabaseSettings(
                    ctx,
                    section,
                    botMsg,
                    ConfigureChannels.CHANNEL_MONGO.filter(x => x.channelType === ChannelCategoryType.Other),
                    "Others"
                );
                return;
            }
            case ButtonConstants.QUIT_ID: {
                await this.dispose(ctx, botMsg);
                return;
            }
        }
    }

    /** @inheritDoc */
    public async dispose(ctx: ICommandContext, botMsg: Message | null, ...args: any[]): Promise<void> {
        if (botMsg) {
            await MessageUtilities.tryDelete(botMsg);
        }
    }

    /** @inheritDoc */
    public getCurrentConfiguration(guild: Guild, guildDoc: IGuildInfo, section: ISectionInfo,
                                   displayFilter: number): string {
        const currentConfiguration = new StringBuilder();
        if (displayFilter & DisplayFilter.Raids) {
            const raidChannelObj = section.channels.raids;
            const afkCheckChannel = getCachedChannel<TextChannel>(guild, raidChannelObj.afkCheckChannelId);
            const contPanelChannel = getCachedChannel<TextChannel>(guild, raidChannelObj.controlPanelChannelId);
            const eliteLocChannel = getCachedChannel<TextChannel>(guild, section.channels.eliteLocChannelId);

            currentConfiguration.append("__**Raid Channels**__").appendLine()
                .append(`⇒ AFK Check Channel: ${afkCheckChannel ?? ConfigureChannels.NA}`).appendLine()
                .append(`⇒ Control Panel Channel: ${contPanelChannel ?? ConfigureChannels.NA}`).appendLine()
                .append(`⇒ Elite Location Channel: ${eliteLocChannel ?? ConfigureChannels.NA}`).appendLine();

            if (section.isMainSection) {
                const rateLeaderChannel = getCachedChannel<TextChannel>(
                    guild,
                    guildDoc.channels.raids.leaderFeedbackChannelId
                );

                const raidStorageChannel = getCachedChannel<TextChannel>(
                    guild,
                    guildDoc.channels.raids.raidHistChannelId
                );


                currentConfiguration
                    .append(`⇒ Base Rate Leader Channel: ${rateLeaderChannel ?? ConfigureChannels.NA}`).appendLine()
                    .append(`⇒ Raid Storage Channel: ${raidStorageChannel ?? ConfigureChannels.NA}`).appendLine();
            }

            currentConfiguration.appendLine();
        }

        if (displayFilter & DisplayFilter.Verification) {
            const verifChannelObj = section.channels.verification;
            const verifChannel = getCachedChannel<TextChannel>(guild, verifChannelObj.verificationChannelId);
            const manVerifChannel = getCachedChannel<TextChannel>(guild, verifChannelObj.manualVerificationChannelId);

            currentConfiguration.append("__**Verification Channels**__").appendLine()
                .append(`⇒ Verification Channel: ${verifChannel ?? ConfigureChannels.NA}`).appendLine()
                .append(`⇒ Manual Verification Channel: ${manVerifChannel ?? ConfigureChannels.NA}`).appendLine()
                .appendLine();
        }


        if (section.isMainSection) {
            if (displayFilter & DisplayFilter.Modmail) {
                const mmChannel = getCachedChannel<TextChannel>(guild, guildDoc.channels.modmailChannelId);

                currentConfiguration.append("__**Modmail Channels**__").appendLine()
                    .append(`⇒ Modmail Channel: ${mmChannel ?? ConfigureChannels.NA}`).appendLine()
                    .appendLine();
            }

            if (displayFilter & DisplayFilter.Other) {
                const botUpdatesChan = getCachedChannel<TextChannel>(guild, guildDoc.channels.botUpdatesChannelId);
                currentConfiguration.append("__**Other Channels**__").appendLine()
                    .append(`⇒ Bot Updates Channel: ${botUpdatesChan ?? ConfigureChannels.NA}`).appendLine();
            }
        }

        return currentConfiguration.toString().trim();
    }

    /**
     * A function that lets the user choose to configure the various logging channels.
     * @param {ICommandContext} ctx The command context.
     * @param {ISectionInfo} section The section to edit.
     * @param {Message} botMsg The bot message.
     * @private
     */
    private async doLoggingChannels(ctx: ICommandContext, section: ISectionInfo, botMsg: Message): Promise<void> {
        const logIds = section.isMainSection
            ? ConfigureChannels.MAIN_LOGGING_IDS
            : ConfigureChannels.SECTION_LOGGING_IDS;

        let selectedIdx = 0;
        const embedToDisplay = new MessageEmbed()
            .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
            .setTitle(`[${section.sectionName}] **Logging** Configuration`)
            .setDescription(DATABASE_CONFIG_DESCRIPTION);
        while (true) {
            embedToDisplay.fields = [];
            embedToDisplay.setFooter({text: "Either mention the channel or provide a valid channel ID."});
            for (let i = 0; i < logIds.length; i++) {
                const channelId = (
                    section.isMainSection
                        ? ctx.guildDoc!.channels.loggingChannels
                        : section.channels.loggingChannels
                ).find(x => x.key === logIds[i]);
                const currSet: TextChannel | null = channelId && channelId.value
                    ? GuildFgrUtilities.getCachedChannel<TextChannel>(
                        ctx.guild!,
                        channelId.value
                    )
                    : null;
                embedToDisplay.addField(
                    i === selectedIdx ? `${EmojiConstants.RIGHT_TRIANGLE_EMOJI} ${logIds[i]}` : logIds[i],
                    `Current Value: ${currSet ?? "N/A"}`
                );
            }

            await botMsg.edit({
                embeds: [embedToDisplay],
                components: DB_CONFIG_ACTION_ROW
            });

            const result = await AdvancedCollector.startDoubleCollector<number | TextChannel>({
                targetChannel: botMsg.channel as TextChannel,
                targetAuthor: ctx.user,
                duration: 30 * 1000,
                deleteBaseMsgAfterComplete: false,
                acknowledgeImmediately: true,
                deleteResponseMessage: true,
                oldMsg: botMsg,
                clearInteractionsAfterComplete: false,
                cancelFlag: "-cancel"
            }, ConfigureChannels.msgOrNumberCollectorFunc);

            // Case 0: Nothing
            if (!result) {
                await this.dispose(ctx, botMsg);
                return;
            }

            // Case 1: Number
            if (typeof result === "number") {
                selectedIdx += result;
                selectedIdx %= logIds.length;
                continue;
            }

            // Case 2: Channel
            const query: Filter<IGuildInfo> = section.isMainSection
                ? {guildId: ctx.guild!.id}
                : {guildId: ctx.guild!.id, "guildSections.uniqueIdentifier": section.uniqueIdentifier};
            const keySetter = section.isMainSection
                ? "channels.loggingChannels"
                : "guildSections.$.channels.loggingChannels";
            const newArr = section.isMainSection
                ? ctx.guildDoc!.channels.loggingChannels
                : section.channels.loggingChannels;

            if (result instanceof TextChannel) {
                const arrIdx = newArr.findIndex(x => x.key === logIds[selectedIdx]);
                if (arrIdx === -1) {
                    newArr.push({
                        key: logIds[selectedIdx],
                        value: result.id
                    });
                }
                else {
                    newArr[arrIdx].value = result.id;
                }

                ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc(query, {
                    $set: {
                        [keySetter]: newArr
                    }
                });
                section = MongoManager.getAllSections(ctx.guildDoc!)
                    .find(x => x.uniqueIdentifier === section.uniqueIdentifier)!;
                continue;
            }

            // Case 3: Button
            switch (result.customId) {
                case ButtonConstants.BACK_ID: {
                    await this.mainMenu(ctx, section, botMsg);
                    return;
                }
                case ButtonConstants.UP_ID: {
                    selectedIdx = (selectedIdx + logIds.length - 1) % logIds.length;
                    break;
                }
                case ButtonConstants.DOWN_ID: {
                    selectedIdx++;
                    selectedIdx %= logIds.length;
                    break;
                }
                case ButtonConstants.RESET_ID: {
                    const arrIdx = newArr.findIndex(x => x.key === logIds[selectedIdx]);
                    if (arrIdx === -1) {
                        // Nothing to save
                        break;
                    }
                    else {
                        newArr.splice(arrIdx, 1);
                    }

                    ctx.guildDoc = (await MongoManager.updateAndFetchGuildDoc(query, {
                        $set: {
                            "channels.loggingChannels": newArr
                        }
                    }))!;
                    section = MongoManager.getAllSections(ctx.guildDoc!)
                        .find(x => x.uniqueIdentifier === section.uniqueIdentifier)!;
                    break;
                }
                case ButtonConstants.QUIT_ID: {
                    await this.dispose(ctx, botMsg);
                    return;
                }
            }
        }
    }

    /**
     * A function that lets the user choose to configure either AFK check channels or verification channels.
     * @param {ICommandContext} ctx The command context.
     * @param {ISectionInfo} section The section to edit.
     * @param {Message} botMsg The bot message.
     * @private
     */
    private async doBaseChannels(ctx: ICommandContext, section: ISectionInfo, botMsg: Message): Promise<void> {
        const guild = ctx.guild!;
        const curConf = this.getCurrentConfiguration(
            ctx.guild!,
            ctx.guildDoc!,
            section,
            DisplayFilter.Verification | DisplayFilter.Raids | DisplayFilter.Modmail
        );

        // Corresponding buttons to display.
        const buttons: MessageButton[] = [
            ButtonConstants.BACK_BUTTON,
            new MessageButton()
                .setLabel("Raids")
                .setStyle("PRIMARY")
                .setCustomId("raids")
                .setEmoji(EmojiConstants.HASH_EMOJI),
            new MessageButton()
                .setLabel("Verification")
                .setStyle("PRIMARY")
                .setCustomId("verification")
                .setEmoji(EmojiConstants.HASH_EMOJI),
        ];


        const displayEmbed = new MessageEmbed()
            .setAuthor({name: guild.name, iconURL: guild.iconURL() ?? undefined})
            .setTitle(`[${section.sectionName}] **Channel** Configuration ⇒ Base Channels`)
            .setDescription(`Select the button corresponding to the channel group you want to edit.\n\n${curConf}`)
            .setFooter({text: `ID: ${section.uniqueIdentifier}`})
            .addField(
                "Back",
                "Click on the `Back` button to go back to the main menu."
            )
            .addField(
                "Edit Raid Channels",
                "Click on the `Raids` button to configure the raids channels (this includes channels like the AFK"
                + " Check, Control Panel, and other channels)."
            )
            .addField(
                "Edit Verification Channels",
                "Click on the `Verification` button to configure the verification channels (this includes channels"
                + " like the Get Verified and Manual Verification channels)."
            );

        if (section.isMainSection) {
            displayEmbed.addField(
                "Edit Modmail Channels",
                "Click on the `Modmail` button to configure the modmail channels."
            );

            buttons.push(
                new MessageButton()
                    .setLabel("Modmail")
                    .setStyle("PRIMARY")
                    .setCustomId("modmail")
                    .setEmoji(EmojiConstants.HASH_EMOJI)
            );
        }

        displayEmbed.addField(
            "Quit",
            "Click on the `Quit` button to exit this process."
        );

        buttons.push(ButtonConstants.QUIT_BUTTON);

        // Edit the bot message and then wait for button press.
        await botMsg.edit({
            embeds: [displayEmbed],
            components: AdvancedCollector.getActionRowsFromComponents(buttons)
        });

        const selectedButton = await AdvancedCollector.startInteractionCollector({
            targetChannel: botMsg.channel,
            targetAuthor: ctx.user,
            oldMsg: botMsg,
            acknowledgeImmediately: true,
            clearInteractionsAfterComplete: false,
            deleteBaseMsgAfterComplete: false,
            duration: 60 * 1000
        });

        if (!selectedButton) {
            await this.dispose(ctx, botMsg);
            return;
        }

        switch (selectedButton.customId) {
            case ButtonConstants.BACK_ID: {
                await this.mainMenu(ctx, section, botMsg);
                break;
            }
            case "raids": {
                await this.editDatabaseSettings(
                    ctx,
                    section,
                    botMsg,
                    ConfigureChannels.CHANNEL_MONGO.filter(x => x.channelType === ChannelCategoryType.Raiding
                    && section.isMainSection ? true : !!x.sectionPath),
                    "Raids"
                );
                break;
            }
            case "verification": {
                await this.editDatabaseSettings(
                    ctx,
                    section,
                    botMsg,
                    ConfigureChannels.CHANNEL_MONGO
                        .filter(x => x.channelType === ChannelCategoryType.Verification
                        && section.isMainSection ? true : !!x.sectionPath),
                    "Verification"
                );
                break;
            }
            // This should only hit if it's the guild doc (not a section)
            case "modmail": {
                await this.editDatabaseSettings(
                    ctx,
                    section,
                    botMsg,
                    ConfigureChannels.CHANNEL_MONGO.filter(x => x.channelType === ChannelCategoryType.Modmail),
                    "Modmail"
                );
                break;
            }
            case ButtonConstants.QUIT_ID: {
                await this.dispose(ctx, botMsg);
                return;
            }
        }
    }

    /**
     * Edits the database entries. This is the function that is responsible for editing the database.
     * @param {ICommandContext} ctx The command context.
     * @param {ISectionInfo} section The section to edit.
     * @param {Message} botMsg The bot message.
     * @param {IChannelMongo[]} entries The entries to manipulate.
     * @param {string} group The group name.
     * @private
     */
    private async editDatabaseSettings(ctx: ICommandContext, section: ISectionInfo,
                                       botMsg: Message, entries: IChannelMongo[], group: string): Promise<void> {
        const guild = ctx.guild!;

        let selected = 0;
        const embedToDisplay = new MessageEmbed()
            .setAuthor({name: guild.name, iconURL: guild.iconURL() ?? undefined})
            .setTitle(`[${section.sectionName}] **Channel** Configuration ⇒ Base Channels ⇒ ${group}`)
            .setDescription(DATABASE_CONFIG_DESCRIPTION);

        while (true) {
            embedToDisplay.fields = [];
            embedToDisplay.setFooter({text: getInstructions(entries[selected].configTypeOrInstructions)});
            for (let i = 0; i < entries.length; i++) {
                const currSet: TextChannel | null = GuildFgrUtilities.getCachedChannel<TextChannel>(
                    guild,
                    entries[i].getCurrentValue(ctx.guildDoc!, section) as string
                );
                embedToDisplay.addField(
                    i === selected ? `${EmojiConstants.RIGHT_TRIANGLE_EMOJI} ${entries[i].name}` : entries[i].name,
                    `Current Value: ${currSet ?? ConfigureChannels.NA}`
                );
            }

            await botMsg.edit({
                embeds: [embedToDisplay],
                components: DB_CONFIG_ACTION_ROW
            });

            const result = await AdvancedCollector.startDoubleCollector<number | TextChannel>({
                targetChannel: botMsg.channel as TextChannel,
                targetAuthor: ctx.user,
                duration: 60 * 1000,
                deleteBaseMsgAfterComplete: false,
                acknowledgeImmediately: true,
                deleteResponseMessage: true,
                oldMsg: botMsg,
                clearInteractionsAfterComplete: false,
                cancelFlag: "-cancel"
            }, ConfigureChannels.msgOrNumberCollectorFunc);

            // Case 0: Nothing
            // noinspection DuplicatedCode
            if (!result) {
                await this.dispose(ctx, botMsg);
                return;
            }

            // Case 1: Number
            if (typeof result === "number") {
                selected += result;
                selected %= entries.length;
                continue;
            }

            // Case 2: Channel
            const query: Filter<IGuildInfo> = section.isMainSection
                ? {guildId: guild.id}
                : {guildId: guild.id, "guildSections.uniqueIdentifier": section.uniqueIdentifier};
            const keySetter = section.isMainSection
                ? entries[selected].guildDocPath
                : entries[selected].sectionPath;

            if (result instanceof TextChannel) {
                ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc(query, {
                    $set: {
                        [keySetter]: result.id
                    }
                });
                section = MongoManager.getAllSections(ctx.guildDoc!)
                    .find(x => x.uniqueIdentifier === section.uniqueIdentifier)!;
                continue;
            }

            // Case 3: Button
            switch (result.customId) {
                case ButtonConstants.BACK_ID: {
                    await this.mainMenu(ctx, section, botMsg);
                    return;
                }
                case ButtonConstants.UP_ID: {
                    selected = (selected + entries.length - 1) % entries.length;
                    break;
                }
                case ButtonConstants.DOWN_ID: {
                    selected++;
                    selected %= entries.length;
                    break;
                }
                case ButtonConstants.RESET_ID: {
                    ctx.guildDoc = (await MongoManager.updateAndFetchGuildDoc(query, {
                        $set: {
                            [keySetter]: ""
                        }
                    }))!;
                    section = MongoManager.getAllSections(ctx.guildDoc!)
                        .find(x => x.uniqueIdentifier === section.uniqueIdentifier)!;
                    break;
                }
                case ButtonConstants.QUIT_ID: {
                    await this.dispose(ctx, botMsg);
                    return;
                }
            }
        }
    }
}