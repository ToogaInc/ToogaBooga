import {BaseCommand, ICommandContext} from "../BaseCommand";
import {
    Collection,
    Message,
    MessageButton,
    MessageComponentInteraction,
    MessageEmbed, MessageSelectMenu,
    MessageSelectOptionData,
    Role,
    TextChannel
} from "discord.js";
import {Emojis} from "../../constants/Emojis";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {StringBuilder} from "../../utilities/StringBuilder";
import {StringUtil} from "../../utilities/StringUtilities";
import {DB_CONFIG_BUTTONS, sendOrEditBotMsg} from "./common/ConfigCommon";
import {ParseUtilities} from "../../utilities/ParseUtilities";
import {MongoManager} from "../../managers/MongoManager";
import {MiscUtilities} from "../../utilities/MiscUtilities";
import {ISectionInfo} from "../../definitions";
import {GeneralConstants} from "../../constants/GeneralConstants";

// Type that defines the values for the new section
type SectionCreateType = [string | null, Role | null, TextChannel | null, TextChannel | null, TextChannel | null];

// Interface that represents the values to put into the above type.
interface ISectionCreateChoice {
    name: string;
    instructions: string;
    collector: (ctx: ICommandContext, botMsg: Message) => Promise<unknown | MessageComponentInteraction | null>;
}

export class ConfigureSections extends BaseCommand {
    private static readonly CHANNEL_COLLECTOR_FUNC = async (msg: Message) => {
        const channel = ParseUtilities.parseChannel(msg);
        return channel && channel instanceof TextChannel
            ? channel
            : undefined;
        // tslint:disable-next-line:semicolon
    };

    private static readonly COLLECTOR_BASE_OPTIONS = {
        deleteBaseMsgAfterComplete: false,
        acknowledgeImmediately: true,
        deleteResponseMessage: true,
        clearInteractionsAfterComplete: false,
        cancelFlag: "-cancel",
        duration: 45 * 1000
    };

    private static readonly NA: string = "NA";

    private static readonly BACK_QUIT_BUTTONS: MessageButton[] = [
        new MessageButton()
            .setLabel("Go Back")
            .setStyle("PRIMARY")
            .setCustomId("go_back")
            .setEmoji(Emojis.LONG_LEFT_ARROW_EMOJI),
        new MessageButton()
            .setLabel("Quit")
            .setStyle("DANGER")
            .setCustomId("quit")
            .setEmoji(Emojis.X_EMOJI)
    ];

    private static readonly SECTION_CREATE_CHOICES: ISectionCreateChoice[] = [
        {
            name: "Section Name (Required)",
            instructions: "Send a message, between 1 and 30 characters, that you want to set as this section's name.",
            collector: (ctx, botMsg) => {
                return AdvancedCollector.startDoubleCollector<string>({
                    targetChannel: botMsg.channel as TextChannel,
                    targetAuthor: ctx.user,
                    oldMsg: botMsg,
                    ...ConfigureSections.COLLECTOR_BASE_OPTIONS
                }, AdvancedCollector.getStringPrompt(ctx.channel!, {min: 1, max: 30}));
            }
        },
        {
            name: "Section Verified Role (Required)",
            instructions: "Either mention the role or provide a role ID.",
            collector: (ctx, botMsg) => {
                return AdvancedCollector.startDoubleCollector<Role>({
                    targetChannel: botMsg.channel as TextChannel,
                    targetAuthor: ctx.user,
                    oldMsg: botMsg,
                    ...ConfigureSections.COLLECTOR_BASE_OPTIONS
                }, async (msg: Message) => {
                    const role = ParseUtilities.parseRole(msg);
                    return role ?? undefined;
                });
            }
        },
        {
            name: "Section Verification Channel",
            instructions: "Either mention the channel or provide a valid channel ID.",
            collector: (ctx, botMsg) => {
                return AdvancedCollector.startDoubleCollector<TextChannel>({
                    targetChannel: botMsg.channel as TextChannel,
                    targetAuthor: ctx.user,
                    oldMsg: botMsg,
                    ...ConfigureSections.COLLECTOR_BASE_OPTIONS
                }, ConfigureSections.CHANNEL_COLLECTOR_FUNC);
            }
        },
        {
            name: "Section AFK Check Channel",
            instructions: "Either mention the channel or provide a valid channel ID.",
            collector: (ctx, botMsg) => {
                return AdvancedCollector.startDoubleCollector<TextChannel>({
                    targetChannel: botMsg.channel as TextChannel,
                    targetAuthor: ctx.user,
                    oldMsg: botMsg,
                    ...ConfigureSections.COLLECTOR_BASE_OPTIONS
                }, ConfigureSections.CHANNEL_COLLECTOR_FUNC);
            }
        },
        {
            name: "Section Control Panel Channel",
            instructions: "Either mention the channel or provide a valid channel ID.",
            collector: (ctx, botMsg) => {
                return AdvancedCollector.startDoubleCollector<TextChannel>({
                    targetChannel: botMsg.channel as TextChannel,
                    targetAuthor: ctx.user,
                    oldMsg: botMsg,
                    ...ConfigureSections.COLLECTOR_BASE_OPTIONS
                }, ConfigureSections.CHANNEL_COLLECTOR_FUNC);
            }
        }
    ];

    public static readonly MAXIMUM_SECTIONS_ALLOWED: number = 10;

    // All users that are using this command
    // We want at most 1 user per server using this command.
    private static readonly ACTIVE_USERS: Collection<string, Set<string>> = new Collection<string, Set<string>>();

    public constructor() {
        super({
            cmdCode: "CONFIGURE_SECTION_COMMAND",
            formalCommandName: "Configure Section Command",
            botCommandName: "configsections",
            description: "Allows the user to add or remove sections",
            usageGuide: ["configsections"],
            exampleGuide: ["configsections"],
            commandCooldown: 10 * 1000,
            argumentInfo: [],
            generalPermissions: ["MANAGE_GUILD"],
            rolePermissions: ["Officer", "HeadRaidLeader", "Moderator"],
            botPermissions: ["ADD_REACTIONS", "MANAGE_MESSAGES"],
            guildOnly: true,
            botOwnerOnly: false
        });
    }

    /** @inheritDoc */
    public async run(ctx: ICommandContext): Promise<number> {
        if (!(ctx.channel instanceof TextChannel)) return -1;

        if (!ConfigureSections.ACTIVE_USERS.has(ctx.guild!.id)) {
            ConfigureSections.ACTIVE_USERS.set(ctx.guild!.id, new Set<string>());
        }

        if (ConfigureSections.ACTIVE_USERS.get(ctx.guild!.id)!.size >= 1) {
            await ctx.interaction.reply({
                content: "Someone else is using this command right now. Please wait for them to finish!"
            });
            return -1;
        }

        await ctx.interaction.reply({
            content: "A new message should have popped up! Please refer to that message."
        });

        this.mainMenu(ctx, null).then();
        return 0;
    }

    /**
     * The main menu function. This is where the configuration process actually begins.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message, which will be used for interactivity (editing message).
     */
    public async mainMenu(ctx: ICommandContext, botMsg: Message | null): Promise<void> {
        const sectionDisplay = ctx.guildDoc!.guildSections.map(x => {
            const verifiedRole = GuildFgrUtilities.getCachedRole(ctx.guild!, x.roles.verifiedRoleId);
            return verifiedRole ? `- ${x.sectionName} (${verifiedRole.name})` : `- ${x.sectionName} (No Member Role)`;
        }).join("\n");

        const descSb = new StringBuilder();
        if (sectionDisplay.length > 0) {
            descSb.append(`There are currently **${ctx.guildDoc!.guildSections.length}** section(s). They are listed`)
                .append(` below: ${StringUtil.codifyString(sectionDisplay)}`)
                .appendLine(2);
        }

        descSb.append("Please select the appropriate option.");

        const embed: MessageEmbed = new MessageEmbed()
            .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
            .setTitle("Section Manager Command")
            .setDescription(descSb.toString())
            .addField(
                "Exit",
                "Click on the `Exit` button to exit this process."
            );

        const buttons: MessageButton[] = [
            new MessageButton()
                .setLabel("Exit")
                .setStyle("DANGER")
                .setCustomId("exit")
                .setEmoji(Emojis.X_EMOJI)
        ];

        const remainingSecs = ConfigureSections.MAXIMUM_SECTIONS_ALLOWED - ctx.guildDoc!.guildSections.length;
        if (remainingSecs > 0) {
            embed.addField(
                "Create Section",
                `Press the \`Create\` button to create a new server section. You can create ${remainingSecs} more`
                + " sections in this server."
            );

            buttons.push(
                new MessageButton()
                    .setCustomId("create")
                    .setLabel("Create")
                    .setStyle("PRIMARY")
                    .setEmoji(Emojis.PLUS_EMOJI)
            );
        }

        if (ctx.guildDoc!.guildSections.length > 0) {
            embed.addField(
                "Manage Section",
                "Press the \`Manage\` button to manage an existing server section. You will be able to change the"
                + " section's name and delete the section here."
            );

            buttons.push(
                new MessageButton()
                    .setCustomId("manage")
                    .setLabel("Manage")
                    .setStyle("PRIMARY")
                    .setEmoji(Emojis.WASTEBIN_EMOJI)
            );
        }

        embed.addField(
            "Configure Section Channels & Roles",
            "To configure these, please use the associated configuration commands."
        );

        botMsg = await sendOrEditBotMsg(ctx.channel!, botMsg, {
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
            duration: 30 * 1000
        });

        if (!selectedButton) {
            await botMsg.delete().catch();
            return;
        }

        switch (selectedButton.customId) {
            case "exit": {
                this.dispose(ctx, botMsg).catch();
                return;
            }
            case "create": {
                this.createSection(ctx, botMsg).then();
                return;
            }
            case "manage": {
                this.preManageSection(ctx, botMsg).then();
                return;
            }
        }
    }

    /**
     * Disposes this instance. Use this function to clean up any messages that were used.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     */
    public async dispose(ctx: ICommandContext, botMsg: Message | null): Promise<void> {
        if (botMsg && !(await GuildFgrUtilities.hasMessage(botMsg.channel, botMsg.id)))
            return;
        await botMsg?.delete().catch();
        ConfigureSections.ACTIVE_USERS.get(ctx.guild!.id)?.delete(ctx.user.id);
    }

    /**
     * Calls the pre-manage section method. This will ask the user for the section before continuing on.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @private
     */
    private async preManageSection(ctx: ICommandContext, botMsg: Message): Promise<void> {
        const secSelectOpt: MessageSelectOptionData[] = ctx.guildDoc!.guildSections
            .map(x => {
                const role = GuildFgrUtilities.getCachedRole(ctx.guild!, x.roles.verifiedRoleId);
                return {
                    label: x.sectionName,
                    description: role?.name ?? "No Member Role.",
                    value: x.uniqueIdentifier
                };
            });
        
        await botMsg.edit({
            embeds: [
                new MessageEmbed()
                    .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                    .setTitle("Select Section")
                    .setDescription(
                        "Please select a section that you want to manage. If you want to go back, press the **Back**" 
                        + " button. If you want to cancel this process completely, press the **Cancel** button."
                    )
            ],
            components: AdvancedCollector.getActionRowsFromComponents([
                new MessageButton()
                    .setLabel("Back")
                    .setEmoji(Emojis.LONG_LEFT_ARROW_EMOJI)
                    .setCustomId("back_button")
                    .setStyle("PRIMARY"),
                new MessageSelectMenu()
                    .addOptions(...secSelectOpt)
                    .setCustomId("section_selector")
                    .setMinValues(1)
                    .setMaxValues(1),
                new MessageButton()
                    .setLabel("Cancel")
                    .setEmoji(Emojis.X_EMOJI)
                    .setCustomId("cancel_button")
                    .setStyle("DANGER")
            ])
        });

        const result = await AdvancedCollector.startInteractionCollector({
            targetChannel: ctx.channel!,
            targetAuthor: ctx.user,
            acknowledgeImmediately: true,
            deleteBaseMsgAfterComplete: false,
            duration: 60 * 1000,
            oldMsg: botMsg,
            clearInteractionsAfterComplete: false
        });

        if (!result) {
            this.dispose(ctx, botMsg).catch();
            return;
        }

        if (result.isButton()) {
            if (result.customId === "cancel_button")
                this.dispose(ctx, botMsg).catch();
            else
                this.mainMenu(ctx, botMsg).catch();

            return;
        }

        // Should never hit
        if (!result.isSelectMenu())
            return;

        this.manageSection(
            ctx,
            botMsg,
            ctx.guildDoc!.guildSections.find(x => x.uniqueIdentifier === result.values[0])!
        ).then();
    }

    /**
     * Calls the section manager method. Here, the user will be able to delete or rename the section.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {ISectionInfo} section The section.
     * @private
     */
    private async manageSection(ctx: ICommandContext, botMsg: Message, section: ISectionInfo): Promise<void> {
        const buttons: MessageButton[] = [
            new MessageButton()
                .setLabel("Go Back")
                .setStyle("PRIMARY")
                .setCustomId("go_back")
                .setEmoji(Emojis.LONG_LEFT_ARROW_EMOJI),
            new MessageButton()
                .setLabel("Rename Section")
                .setStyle("PRIMARY")
                .setCustomId("rename")
                .setEmoji(Emojis.PENCIL_PAPER_EMOJI),
            new MessageButton()
                .setLabel("Delete Section")
                .setStyle("DANGER")
                .setCustomId("delete")
                .setEmoji(Emojis.WASTEBIN_EMOJI),
            new MessageButton()
                .setLabel("Quit")
                .setStyle("DANGER")
                .setCustomId("quit")
                .setEmoji(Emojis.X_EMOJI)
        ];

        const displayEmbed = new MessageEmbed()
            .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
            .setTitle(`[${section.sectionName}] Section Manager`)
            .setDescription("Please select an option.")
            .setFooter(`ID: ${section.uniqueIdentifier}`)
            .addField(
                "Go Back",
                "Click on the `Go Back` button to go back to the main menu."
            )
            .addField(
                "Rename Section",
                "Click on the `Rename Section` button to rename this section."
            )
            .addField(
                "Delete Section",
                "Click on the `Delete Section` button to delete this section."
            )
            .addField(
                "Quit",
                "Click on the `Quit` button to cancel this process."
            );

        await botMsg.edit({
            components: AdvancedCollector.getActionRowsFromComponents(buttons),
            embeds: [displayEmbed]
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
            this.dispose(ctx, botMsg).then();
            return;
        }

        switch (selectedButton.customId) {
            case "go_back": {
                this.preManageSection(ctx, botMsg).then();
                break;
            }
            case "rename": {
                this.renameSection(ctx, botMsg, section).then();
                break;
            }
            case "delete": {
                this.deleteSection(ctx, botMsg, section).then();
                break;
            }
            case "quit": {
                this.dispose(ctx, botMsg).then();
                return;
            }
        }
    }

    /**
     * Allows the user to rename the section, if needed.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {ISectionInfo} section The section.
     * @private
     */
    private async renameSection(ctx: ICommandContext, botMsg: Message, section: ISectionInfo): Promise<void> {
        const displayEmbed = new MessageEmbed()
            .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
            .setTitle(`[${section.sectionName}] Rename Section`)
            .setDescription("Please send a message containing the new name for this section. This must be at least 1"
                + " character long and at most 30 characters long, and must not conflict with another section's"
                + " name. If you don't want to rename this section at this time, click the **Go Back** button. If"
                + " you want to quit, press the **Quit** button.")
            .setFooter(`ID: ${section.uniqueIdentifier}`);

        await botMsg.edit({
            embeds: [displayEmbed],
            components: AdvancedCollector.getActionRowsFromComponents(ConfigureSections.BACK_QUIT_BUTTONS)
        });

        const res = await AdvancedCollector.startDoubleCollector<string>({
            cancelFlag: "-cancel",
            deleteResponseMessage: true,
            targetChannel: botMsg.channel,
            targetAuthor: ctx.user,
            oldMsg: botMsg,
            acknowledgeImmediately: true,
            clearInteractionsAfterComplete: false,
            deleteBaseMsgAfterComplete: false,
            duration: 60 * 1000
        }, AdvancedCollector.getStringPrompt(ctx.channel!, {max: 30, min: 1}));

        if (!res) {
            this.dispose(ctx, botMsg).catch();
            return;
        }

        if (res instanceof MessageComponentInteraction) {
            if (res.customId === "go_back") {
                this.manageSection(ctx, botMsg, section).then();
                return;
            }

            this.dispose(ctx, botMsg).catch();
            return;
        }

        ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc({
            guildId: ctx.guild!.id,
            "guildSections.uniqueIdentifier": section.uniqueIdentifier
        }, {
            $set: {
                "guildSections.$.sectionName": res
            }
        });

        section.sectionName = res;
        this.manageSection(ctx, botMsg, section).then();
    }

    /**
     * Allows the user to delete the section.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {ISectionInfo} section The section.
     * @private
     */
    private async deleteSection(ctx: ICommandContext, botMsg: Message, section: ISectionInfo): Promise<void> {
        const displayEmbed = new MessageEmbed()
            .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
            .setTitle(`[${section.sectionName}] Delete Section?`)
            .setDescription("Are you sure you want to delete this section? Once completed, you cannot reverse this.")
            .setFooter(`ID: ${section.uniqueIdentifier}`);

        await botMsg.edit({
            embeds: [displayEmbed],
            components: GeneralConstants.YES_NO_ACTION_BUTTONS
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

        if (!selectedButton || selectedButton.customId === "no") {
            this.manageSection(ctx, botMsg, section).then();
            return;
        }

        // delete the section
        ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id,}, {
            $pull: {
                "guildSections": {
                    uniqueIdentifier: section.uniqueIdentifier
                }
            }
        });

        this.mainMenu(ctx, botMsg).then();
    }

    /**
     * Creates a section through a wizard.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @private
     */
    private async createSection(ctx: ICommandContext, botMsg: Message): Promise<void> {
        const baseEmbed: MessageEmbed = new MessageEmbed()
            .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
            .setTitle("**Create Section**")
            .setDescription(
                new StringBuilder()
                    .append("You are currently in the process of creating a section. In order to create a section,")
                    .append(" you must specify the member role and the name of the section. The AFK check and control")
                    .append(" panel channels are optional; you can configure them later via the respective")
                    .append(" configuration commands.")
                    .appendLine(2)
                    .append(`- The ${Emojis.RIGHT_TRIANGLE_EMOJI} emoji will point to the **currently** selected`)
                    .append(" option.")
                    .appendLine()
                    .append("- To move up or down the list of options, simply **press** the UP/DOWN buttons.")
                    .appendLine()
                    .append("- To edit the option, simply **send** the appropriate input. Look at the **embed")
                    .append(" footer** for the appropriate input types. To __clear__ the option (i.e. reset")
                    .append(" the option to nothing), press the `Reset` button.")
                    .appendLine()
                    .append("- Once you are done, press the `Save` button. If you decide that you do not want to")
                    .append(" create a section, press the `Back` or `Quit` button.")
                    .toString()
            );

        const saveButton = new MessageButton()
            .setLabel("Save")
            .setCustomId("save")
            .setStyle("SUCCESS")
            .setDisabled(true);

        const buttons: MessageButton[] = [
            ...DB_CONFIG_BUTTONS,
            saveButton
        ];

        const newSectionInfo: SectionCreateType = [null, null, null, null, null];
        let selectedIdx = 0;

        mainLoop: while (true) {
            saveButton.setDisabled(!newSectionInfo[0] || !newSectionInfo[1]);
            baseEmbed.fields = [];
            for (let i = 0; i < newSectionInfo.length; i++) {
                baseEmbed.addField(
                    i === selectedIdx
                        ? `${Emojis.RIGHT_TRIANGLE_EMOJI} ${ConfigureSections.SECTION_CREATE_CHOICES[i].name}`
                        : ConfigureSections.SECTION_CREATE_CHOICES[i].name,
                    `Current Value: ${newSectionInfo[i] ?? ConfigureSections.NA}`
                );
            }

            await botMsg.edit({
                embeds: [baseEmbed],
                components: AdvancedCollector.getActionRowsFromComponents(buttons)
            });

            const selected = await ConfigureSections.SECTION_CREATE_CHOICES[selectedIdx].collector(ctx, botMsg);

            // String = Must be first option
            if (typeof selected === "string" && selectedIdx === 0) {
                newSectionInfo[selectedIdx] = selected;
                continue;
            }

            // Role = Must be second option
            if (selected instanceof Role && selectedIdx === 1) {
                newSectionInfo[selectedIdx] = selected;
                continue;
            }

            // Channel = Remaining options
            if (selected instanceof TextChannel) {
                newSectionInfo[selectedIdx] = selected;
                continue;
            }

            // Interaction = Button options, deal w/ accordingly
            if (selected instanceof MessageComponentInteraction) {
                switch (selected.customId) {
                    case "back": {
                        this.mainMenu(ctx, botMsg).then();
                        return;
                    }
                    case "up": {
                        selectedIdx = (selectedIdx + newSectionInfo.length - 1) % newSectionInfo.length;
                        break;
                    }
                    case "down": {
                        selectedIdx++;
                        selectedIdx %= newSectionInfo.length;
                        break;
                    }
                    case "reset": {
                        newSectionInfo[selectedIdx] = null;
                        break;
                    }
                    case "quit": {
                        this.dispose(ctx, botMsg).catch();
                        return;
                    }
                    case "save": {
                        // Break out and save there
                        break mainLoop;
                    }
                }

                continue;
            }

            this.dispose(ctx, botMsg).catch();
            return;
        }

        // Make sure we aren't going above limit
        const guildDoc = await MongoManager.getOrCreateGuildDoc(ctx.guild!, true);
        if (guildDoc.guildSections.length + 1 > ConfigureSections.MAXIMUM_SECTIONS_ALLOWED) {
            await botMsg.edit({
                embeds: [],
                content: `You already have ${ConfigureSections.MAXIMUM_SECTIONS_ALLOWED} or more sections! In order `
                    + "to create a new section, please remove a section."
            });
            await MiscUtilities.stopFor(5 * 1000);
            this.dispose(ctx, botMsg).catch();
            return;
        }

        const [name, role, verify, afk, control] = newSectionInfo;
        if (!name || !role) {
            await botMsg.edit({
                embeds: [],
                content: "An unknown error occurred when trying to create this section. Please try again later."
            });
            await MiscUtilities.stopFor(5 * 1000);
            this.dispose(ctx, botMsg).catch();
            return;
        }

        const sectionObj = MongoManager.getDefaultSectionObj(name, role.id);
        sectionObj.channels.raids.afkCheckChannelId = afk?.id ?? "";
        sectionObj.channels.raids.controlPanelChannelId = control?.id ?? "";
        sectionObj.channels.verification.verificationChannelId = verify?.id ?? "";

        ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
            $push: {
                guildSections: sectionObj
            }
        });

        this.mainMenu(ctx, botMsg).then();
    }
}