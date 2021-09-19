import {BaseCommand, ICommandContext} from "../BaseCommand";
import {
    Message,
    MessageButton,
    MessageComponentInteraction,
    MessageEmbed,
    MessageOptions, Role,
    TextChannel
} from "discord.js";
import {Emojis} from "../../constants/Emojis";
import {IPropertyKeyValuePair, IQuotaInfo} from "../../definitions";
import {DUNGEON_DATA} from "../../constants/DungeonData";
import {StringBuilder} from "../../utilities/StringBuilder";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {DB_CONFIG_ACTION_ROW} from "./common/ConfigCommon";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {MiscUtilities} from "../../utilities/MiscUtilities";
import {ParseUtilities} from "../../utilities/ParseUtilities";
import {MongoManager} from "../../managers/MongoManager";
import {QuotaLogType} from "../../definitions/Types";
import {ArrayUtilities} from "../../utilities/ArrayUtilities";
import {DungeonUtilities} from "../../utilities/DungeonUtilities";
import {GeneralConstants} from "../../constants/GeneralConstants";

export class ConfigureQuotas extends BaseCommand {
    public static MAX_QUOTAS_ALLOWED: number = 10;

    public static ALL_QUOTAS_KV: { [key: string]: string } = {
        "Parse": "Parse",
        "ManualVerify": "Manual Verify",
        "PunishmentIssued": "Punishment Issued",
        "RunComplete": "Run Complete",
        "RunAssist": "Run Assist",
        "RunFailed": "Run Failed"
    };

    // Update this when `pointValue` is updated.
    public static ALL_QUOTA_RECOGNIZED: { key: QuotaLogType; name: string; }[] = [
        {
            name: "Parse Run",
            key: "Parse"
        },
        {
            name: "Manual Verify Member",
            key: "ManualVerify"
        },
        {
            name: "Punishment Issued",
            key: "PunishmentIssued"
        },
        {
            name: "Run Completed",
            key: "RunComplete"
        },
        {
            name: "Run Assist",
            key: "RunAssist"
        },
        {
            name: "Run Failed",
            key: "RunFailed"
        }
    ];

    public constructor() {
        super({
            cmdCode: "CONFIGURE_QUOTAS",
            formalCommandName: "Configure Quotas Command",
            botCommandName: "configquotas",
            description: "Allows you to configure quotas for one or more roles.",
            rolePermissions: ["Officer", "HeadRaidLeader", "Moderator"],
            botPermissions: ["ADD_REACTIONS", "MANAGE_MESSAGES"],
            generalPermissions: [],
            commandCooldown: 3 * 1000,
            usageGuide: ["configquotas"],
            exampleGuide: ["configquotas"],
            guildOnly: false,
            botOwnerOnly: false
        });
    }

    /** @inheritDoc */
    public async run(ctx: ICommandContext): Promise<number> {
        await ctx.interaction.reply({
            content: "A new message should have popped up! Please refer to that message."
        });

        if (!(ctx.channel instanceof TextChannel)) return -1;
        this.mainMenu(ctx, null).then();
        return 0;
    }

    /**
     * The main menu function. This is where the configuration process actually begins.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message, which will be used for interactivity (editing message).
     */
    public async mainMenu(ctx: ICommandContext, botMsg: Message | null): Promise<void> {
        const buttons: MessageButton[] = [
            new MessageButton()
                .setLabel("Exit")
                .setCustomId("exit")
                .setStyle("DANGER")
                .setEmoji(Emojis.X_EMOJI),
            new MessageButton()
                .setLabel("Set Reset Time")
                .setCustomId("reset_time")
                .setStyle("PRIMARY")
                .setEmoji(Emojis.CLOCK_EMOJI)
        ];

        const embed: MessageEmbed = new MessageEmbed()
            .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
            .setTitle("Quota Configuration Command")
            .setDescription(
                "Here, you will be able to configure quotas for one or more roles. Select the appropriate option to"
                + " begin."
            ).addField(
                "Exit",
                "Click on the `Exit` button to exit this process."
            ).addField(
                "Set Reset Time",
                "Click on the `Set Reset Time` button to set the time when all quotas will reset."
            );

        if (ctx.guildDoc!.quotas.quotaInfo.length + 1 < ConfigureQuotas.MAX_QUOTAS_ALLOWED) {
            buttons.push(
                new MessageButton()
                    .setLabel("Add Quota Configuration")
                    .setCustomId("add")
                    .setEmoji(Emojis.PLUS_EMOJI)
                    .setStyle("PRIMARY")
            );

            embed.addField(
                "Add Quota Configuration",
                "Click on the `Add Quota Configuration` button to add a new quota."
            );
        }

        if (ctx.guildDoc!.quotas.quotaInfo.length > 0) {
            buttons.push(
                new MessageButton()
                    .setLabel("Edit Quota Configuration")
                    .setCustomId("edit")
                    .setEmoji(Emojis.PENCIL_EMOJI)
                    .setStyle("PRIMARY"),
                new MessageButton()
                    .setLabel("Remove Quota Configuration")
                    .setCustomId("remove")
                    .setEmoji(Emojis.WASTEBIN_EMOJI)
                    .setStyle("DANGER"),
                new MessageButton()
                    .setLabel("Reset Quotas")
                    .setCustomId("reset_quotas")
                    .setStyle("DANGER")
            );

            embed.addField(
                "Edit Quota Configuration",
                "Click on the `Edit Quota Configuration` button to edit an existing quota."
            ).addField(
                "Remove Quota Configuration",
                "Click on the `Remove Quota Configuration` button to remove an existing quota."
            ).addField(
                "Reset Quotas",
                "Click on the `Reset Quotas` button to reset one or more quotas."
            );
        }


    }


    private async addOrEditQuota(ctx: ICommandContext, botMsg: Message, quotaInfo?: IQuotaInfo): Promise<void> {
        const allActiveDungeonIds = new Set<string>(
            DUNGEON_DATA.map(x => x.codeName).concat(ctx.guildDoc!.properties.customDungeons.map(x => x.codeName))
        );

        const quotaToEdit: IQuotaInfo = quotaInfo ?? {
            roleId: "",
            lastReset: Date.now(),
            quotaLog: [],
            channel: "",
            messageId: "",
            pointsNeeded: 10,
            pointValue: []
        };

        quotaToEdit.pointValue = quotaToEdit.pointValue.filter(x => {
            if (!x.key.includes(":"))
                return true;
            return allActiveDungeonIds.has(x.key.split(":")[1]);
        });

        const embed = new MessageEmbed()
            .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
            .setTitle("Quota Configuration")
            .setDescription(
                new StringBuilder()
                    .append("- To set the role for this quota, press the **Set Role** button.").appendLine()
                    .append("- To set the channel where the leaderboard should be posted, press the **Set Channel**")
                    .append(" button.").appendLine()
                    .append("- To set the minimum number of points needed to complete this quota, press the **Set")
                    .append(" Minimum Points** button.").appendLine()
                    .append("- To configure what actions give points, press the **Configure Points** button.")
                    .appendLine()
                    .append("- To save your changes to the database, press the **Save** button. Otherwise, press the")
                    .append(" **Quit** or **Back** button.")
                    .toString()
            );

        const saveButton = new MessageButton()
            .setLabel("Save")
            .setCustomId("save")
            .setStyle("SUCCESS");

        const buttons: MessageButton[] = [
            new MessageButton()
                .setLabel("Back")
                .setCustomId("back")
                .setStyle("DANGER"),
            new MessageButton()
                .setLabel("Set Role")
                .setCustomId("set_role")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Set Channel")
                .setCustomId("set_channel")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Set Minimum Points")
                .setCustomId("set_min_pts")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Configure Points")
                .setCustomId("config_pts")
                .setStyle("PRIMARY"),
            saveButton,
            new MessageButton()
                .setLabel("Quit")
                .setCustomId("quit")
                .setStyle("DANGER")
        ];

        while (true) {
            const role = await GuildFgrUtilities.fetchRole(ctx.guild!, quotaToEdit.roleId);
            saveButton.setDisabled(!role);

            const channel = GuildFgrUtilities.getCachedChannel(ctx.guild!, quotaToEdit.channel);
            embed.fields = [];
            embed.addField(
                "Current Role",
                role?.toString() ?? "Not Set.",
                true
            ).addField(
                "Current Channel",
                channel?.toString() ?? "Not Set.",
                true
            ).addField(
                "Minimum Points Needed",
                `${quotaToEdit.pointsNeeded} Points Needed`,
                true
            ).addField(
                "Point Rules Set",
                `${quotaToEdit.pointValue.length} Values Set`
            );

            await botMsg.edit({
                embeds: [embed],
                components: DB_CONFIG_ACTION_ROW
            });

            const selectedButton = await AdvancedCollector.startInteractionCollector({
                targetChannel: botMsg.channel as TextChannel,
                targetAuthor: botMsg.author,
                oldMsg: botMsg,
                acknowledgeImmediately: true,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                duration: 2 * 60 * 1000
            });

            if (!selectedButton) {
                this.dispose(ctx, botMsg).catch();
                return;
            }

            switch (selectedButton.customId) {
                case "back": {
                    this.mainMenu(ctx, botMsg).then();
                    return;
                }
                case "quit": {
                    this.dispose(ctx, botMsg).then();
                    return;
                }
                case "set_role": {
                    const r = await this.askInput<Role>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                                    .setTitle("Set Role for Quota")
                                    .setDescription(
                                        `Current Role: ${role ?? "Not Set"}\n\nPlease mention, or type the ID of, the`
                                        + " the role that you want to link with this quota. This role must __not__ be"
                                        + " used for other quotas; specifying an already used role will result in an"
                                        + " error. If you don't want to set a role at this time, press the **Back**"
                                        + " button."
                                    )
                            ]
                        },
                        m => {
                            const roleToUse = ParseUtilities.parseRole(m);
                            if (!roleToUse)
                                return null;
                            return ctx.guildDoc!.quotas.quotaInfo.some(x => x.roleId === roleToUse.id)
                                ? null
                                : roleToUse;
                        }
                    );

                    if (typeof r === "undefined") {
                        this.dispose(ctx, botMsg).catch();
                        return;
                    }

                    if (!r) {
                        break;
                    }

                    quotaToEdit.roleId = r.id;
                    break;
                }
                case "set_channel": {
                    const c = await this.askInput<TextChannel>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                                    .setTitle("Set Channel for Quota")
                                    .setDescription(
                                        `Current Channel: ${channel ?? "Not Set"}\n\nPlease mention, or type the ID of,`
                                        + " the __text channel__ that you want to link with this quota. This channel"
                                        + " will be used for the quota leaderboard. If you decide that you don't"
                                        + " want to set a channel up, press the **Back** button."
                                    )
                            ]
                        },
                        m => {
                            const channelToUse = ParseUtilities.parseChannel(m);
                            if (!channelToUse || !(channelToUse instanceof TextChannel))
                                return null;
                            return channelToUse;
                        }
                    );

                    if (typeof c === "undefined") {
                        this.dispose(ctx, botMsg).catch();
                        return;
                    }

                    if (!c) {
                        break;
                    }

                    quotaToEdit.channel = c.id;
                    break;
                }
                case "set_min_pts": {
                    const n = await this.askInput<number>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                                    .setTitle("Set Minimum Points Needed for Quota")
                                    .setDescription(
                                        `Current Minimum Points: ${quotaToEdit.pointValue}\n\nType a positive number`
                                        + " that you want to make the minimum number of points needed to pass the"
                                        + " weekly quota. If you don't want to set this up, press the **Back** button."
                                    )
                            ]
                        },
                        m => {
                            const num = Number.parseInt(m.content, 10);
                            return Number.isNaN(num) || num <= 0 ? null : num;
                        }
                    );

                    if (typeof n === "undefined") {
                        this.dispose(ctx, botMsg).catch();
                        return;
                    }

                    if (!n) {
                        break;
                    }

                    quotaToEdit.pointsNeeded = n;
                    break;
                }
                case "config_pts": {

                }
                case "save": {
                    if (quotaInfo) {
                        await MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
                            $pull: {
                                "quotas.quotaInfo": {
                                    roleId: quotaInfo.roleId
                                }
                            }
                        });
                    }

                    ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
                        $push: {
                            "quotas.quotaInfo": quotaToEdit
                        }
                    });

                    this.mainMenu(ctx, botMsg).then();
                    return;
                }
            }
        } // end while
    }

    private async editQuotaPointConfig(
        ctx: ICommandContext,
        botMsg: Message,
        pts: IPropertyKeyValuePair<string, number>[]
    ): Promise<IPropertyKeyValuePair<string, number>[] | null> {
        const ptsToUse = pts.slice().filter(x => {
            if (!x.key.startsWith("Run"))
                return true;

            const logAndId = x.key.split(":");
            if (logAndId.length === 1)
                return true;
            return DungeonUtilities.isCustomDungeon(logAndId[1])
                ? ctx.guildDoc!.properties.customDungeons.some(dgn => dgn.codeName === logAndId[1])
                : DUNGEON_DATA.some(dgn => dgn.codeName === logAndId[1]);
        });


        const embed = new MessageEmbed()
            .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
            .setTitle("Modify Point Values")
            .setDescription(
                new StringBuilder()
                    .append("Here, you can configure how many points specific actions are worth.")
                    .appendLine(2)
                    .append(`The ${Emojis.RIGHT_TRIANGLE_EMOJI} emoji will point to the currently selected`)
                    .append(" point rule.")
                    .appendLine()
                    .append("- You can move this arrow up or down by either pressing the Up/Down button, or by using")
                    .append(" the jump (`j`) command. For example, to move the arrow down 2, send `j 2`. To move the")
                    .append(" arrow up 4, send `j -4`.")
                    .appendLine()
                    .append("- If you want to remove the selected rule, press the **Remove** button.")
                    .appendLine()
                    .append("- If you want to modify how many points the selected rule is worth, simply type a non-")
                    .append(" negative __whole__ number.")
                    .appendLine()
                    .append("- If needed, you can add a new rule; to do so, press the **Add** button.")
                    .appendLine()
                    .append("- Once you're done, press the **Save** button to save your changes.")
                    .appendLine()
                    .append("- Alternatively, you can either press **Back** if you want to go back to the previous")
                    .append(" option or press the **Quit** button to quit this entire process. In either case, your")
                    .append(" changes will definitely not be saved.")
                    .toString()
            );

        const upButton = new MessageButton()
            .setLabel("Up")
            .setEmoji(Emojis.UP_TRIANGLE_EMOJI)
            .setCustomId("up")
            .setStyle("PRIMARY");
        const saveButton = new MessageButton()
            .setLabel("Save")
            .setEmoji(Emojis.GREEN_CHECK_EMOJI)
            .setCustomId("save")
            .setStyle("SUCCESS");
        const addButton = new MessageButton()
            .setLabel("Add")
            .setEmoji(Emojis.PLUS_EMOJI)
            .setCustomId("add")
            .setStyle("PRIMARY");
        const downButton = new MessageButton()
            .setLabel("Down")
            .setEmoji(Emojis.DOWN_TRIANGLE_EMOJI)
            .setCustomId("down")
            .setStyle("PRIMARY");
        const removeButton = new MessageButton()
            .setLabel("Remove")
            .setEmoji(Emojis.WASTEBIN_EMOJI)
            .setCustomId("remove")
            .setStyle("PRIMARY");

        const buttons: MessageButton[] = [
            new MessageButton()
                .setLabel("Back")
                .setEmoji(Emojis.LONG_LEFT_ARROW_EMOJI)
                .setCustomId("back")
                .setStyle("PRIMARY"),
            addButton,
            upButton,
            downButton,
            removeButton,
            new MessageButton()
                .setLabel("Quit")
                .setEmoji(Emojis.X_EMOJI)
                .setCustomId("quit")
                .setStyle("PRIMARY"),
            saveButton
        ];

        let currIdx = 0;
        while (true) {
            embed.fields = [];
            const fields = ArrayUtilities.arrayToStringFields(ptsToUse, (i, elem) => {
                if (elem.key.startsWith("Run")) {
                    const logTypeAndDgnId = elem.key.split(":");
                    if (logTypeAndDgnId.length === 1) {
                        return `${ConfigureQuotas.ALL_QUOTAS_KV[elem.key]} (All): \`${elem.value}\` Points`;
                    }

                    const dungeonId = logTypeAndDgnId[1];
                    const dungeonName = DungeonUtilities.isCustomDungeon(dungeonId)
                        ? ctx.guildDoc!.properties.customDungeons.find(x => x.codeName === dungeonId)!
                        : DUNGEON_DATA.find(x => x.codeName === dungeonId)!;
                    return `${ConfigureQuotas.ALL_QUOTAS_KV[elem.key]} (${dungeonName}): \`${elem.value}\` Points`;
                }

                return `${ConfigureQuotas.ALL_QUOTAS_KV[elem.key]}: \`${elem.value}\` Points`;
            });

            for (const field of fields) {
                embed.addField(GeneralConstants.ZERO_WIDTH_SPACE, field);
            }

            await botMsg.edit({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents(buttons)
            });
        }
    }

    /**
     * Asks for the user's input.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {MessageOptions} msgOptions The message options. This should display the directions.
     * @param {Function} validator The validation function.
     * @returns {Promise<T | null | undefined>} The parsed result, if any. `null` if the user specifically chose not
     * to provide any information (for example, by pressing the Back button) and `undefined` if timed out.
     * @private
     */
    private async askInput<T>(ctx: ICommandContext, botMsg: Message, msgOptions: Omit<MessageOptions, "components">,
                              validator: (m: Message) => T | null | Promise<T | null>): Promise<T | null | undefined> {
        await botMsg.edit({
            ...msgOptions,
            components: AdvancedCollector.getActionRowsFromComponents([
                new MessageButton()
                    .setLabel("Back")
                    .setStyle("DANGER")
                    .setCustomId("back")
                    .setEmoji(Emojis.LONG_LEFT_ARROW_EMOJI)
            ])
        });

        while (true) {
            const selectedValue = await AdvancedCollector.startDoubleCollector<T>({
                acknowledgeImmediately: true,
                cancelFlag: null,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                deleteResponseMessage: true,
                duration: 60 * 1000,
                targetAuthor: ctx.user,
                targetChannel: botMsg.channel,
                oldMsg: botMsg
            }, async m => {
                const v = await validator(m);
                return v ? v : undefined;
            });

            if (!selectedValue) {
                return;
            }

            if (selectedValue instanceof MessageComponentInteraction) {
                return null;
            }

            // Is of type T
            if (selectedValue)
                return selectedValue;

            // Failed = loop back to beginning and ask again
            ctx.channel.send({
                content: "Your input was invalid. Please refer to the directions above and try again."
            }).then(async m => {
                await MiscUtilities.stopFor(5 * 1000);
                m.delete().catch();
            });
        }
    }

    /**
     * Disposes this instance. Use this function to clean up any messages that were used.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     */
    public async dispose(ctx: ICommandContext, botMsg: Message | null): Promise<void> {
        await botMsg?.delete().catch();
    }
}