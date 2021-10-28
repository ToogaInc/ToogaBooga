// noinspection DuplicatedCode

import {BaseCommand, ICommandContext} from "../BaseCommand";
import {
    Message,
    MessageButton,
    MessageComponentInteraction,
    MessageEmbed,
    MessageSelectMenu,
    PermissionResolvable,
    Role,
    TextChannel
} from "discord.js";
import {MongoManager} from "../../managers/MongoManager";
import {askInput, sendOrEditBotMsg} from "./common/ConfigCommon";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {Emojis} from "../../constants/Emojis";
import {IAfkCheckProperties, IGuildInfo, IPermAllowDeny, IPropertyKeyValuePair, ISectionInfo} from "../../definitions";
import {StringBuilder} from "../../utilities/StringBuilder";
import {MiscUtilities} from "../../utilities/MiscUtilities";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {TimedResult, TimedStatus} from "../../definitions/Types";
import {GeneralConstants} from "../../constants/GeneralConstants";
import {ParseUtilities} from "../../utilities/ParseUtilities";
import {StringUtil} from "../../utilities/StringUtilities";
import {TimeUtilities} from "../../utilities/TimeUtilities";
import {FilterQuery, UpdateQuery} from "mongodb";

export class ConfigureAfkCheck extends BaseCommand {
    public static readonly MAX_PERMS_SET: number = 15;
    private static readonly VC_PERMISSIONS: [string, PermissionResolvable][] = [
        ["View Channel", "VIEW_CHANNEL"],
        ["Connect", "CONNECT"],
        ["Speak", "SPEAK"],
        ["Share Screen (Stream)", "STREAM"],
        ["Use Voice Activity", "USE_VAD"],
        ["Priority Speaker", "PRIORITY_SPEAKER"],
        ["Mute Members", "MUTE_MEMBERS"],
        ["Deafen Members", "DEAFEN_MEMBERS"],
        ["Move Members", "MOVE_MEMBERS"]
    ];

    public constructor() {
        super({
            cmdCode: "CONFIG_AFK_CHECK",
            formalCommandName: "Configure AFK Check",
            botCommandName: "configafkcheck",
            description: "Allows the user to configure some aspects of the AFK check system.",
            rolePermissions: ["Officer", "HeadRaidLeader", "Moderator"],
            botPermissions: ["ADD_REACTIONS", "MANAGE_MESSAGES"],
            generalPermissions: [],
            commandCooldown: 3 * 1000,
            argumentInfo: [],
            usageGuide: ["configafkcheck"],
            exampleGuide: ["configafkcheck"],
            guildOnly: true,
            botOwnerOnly: false,
            guildConcurrencyLimit: 1,
            allowMultipleExecutionByUser: false
        });
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
                    .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                    .setTitle("Select Section")
                    .setDescription(
                        "Please select the section that you want to configure the AFK check system for. If you don't"
                        + " want to configure verification right now, you may press the **Cancel** button."
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
                new MessageButton()
                    .setLabel("Cancel")
                    .setCustomId("cancel")
                    .setEmoji(Emojis.X_EMOJI)
                    .setStyle("DANGER")
            ])
        });

        const selected = await AdvancedCollector.startInteractionCollector({
            targetChannel: botMsg.channel,
            targetAuthor: ctx.user,
            oldMsg: botMsg,
            acknowledgeImmediately: true,
            clearInteractionsAfterComplete: false,
            deleteBaseMsgAfterComplete: false,
            duration: 45 * 1000
        });

        if (!selected || !selected.isSelectMenu()) {
            this.dispose(ctx, botMsg).catch();
            return;
        }

        await this.configAfkChecks(ctx, botMsg, allSections.find(x => x.uniqueIdentifier === selected.values[0])!);
    }

    /**
     * Configures the AFK check for this particular section.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {ISectionInfo} section The section.
     */
    public async configAfkChecks(ctx: ICommandContext, botMsg: Message, section: ISectionInfo): Promise<void> {
        const newAfkCheckProps: IAfkCheckProperties = {
            afkCheckPermissions: section.otherMajorConfig.afkCheckProperties.afkCheckPermissions
                .map(x => {
                    return {...x};
                }),
            afkCheckTimeout: section.otherMajorConfig.afkCheckProperties.afkCheckTimeout,
            allowedDungeons: section.otherMajorConfig.afkCheckProperties.allowedDungeons.slice(),
            createLogChannel: section.otherMajorConfig.afkCheckProperties.createLogChannel,
            customMsg: {...section.otherMajorConfig.afkCheckProperties.customMsg},
            nitroEarlyLocationLimit: section.otherMajorConfig.afkCheckProperties.nitroEarlyLocationLimit,
            pointUserLimit: section.otherMajorConfig.afkCheckProperties.pointUserLimit,
            prePostAfkCheckPermissions: section.otherMajorConfig.afkCheckProperties.prePostAfkCheckPermissions
                .map(x => {
                    return {...x};
                }),
            vcLimit: section.otherMajorConfig.afkCheckProperties.vcLimit
        };

        const logChannelButton = new MessageButton()
            .setCustomId("create_log_chan")
            .setStyle("PRIMARY");

        const buttons: MessageButton[] = [
            new MessageButton()
                .setLabel("Go Back")
                .setCustomId("back")
                .setStyle("DANGER"),
            new MessageButton()
                .setLabel("Set Section VC Limit")
                .setCustomId("vc_lim")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Set Section Point Limit")
                .setCustomId("sec_pt_lim")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Set Nitro Limit")
                .setCustomId("nit_lim")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Set AFK Check Message")
                .setCustomId("set_afk_msg")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Set Post-AFK Check Message")
                .setCustomId("set_post_afk_msg")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Set Early Location Message")
                .setCustomId("set_early_loc")
                .setStyle("PRIMARY"),
            logChannelButton,
            new MessageButton()
                .setLabel("Set AFK Check Expiration Time")
                .setCustomId("afk_check_expiration")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Configure Post-AFK Check Permissions")
                .setCustomId("config_pre_post_afk")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Configure General AFK Check Permissions")
                .setCustomId("config_gen_afk")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Save")
                .setCustomId("save")
                .setStyle("SUCCESS"),
            new MessageButton()
                .setLabel("Quit")
                .setCustomId("quit")
                .setStyle("DANGER")
        ];

        const embed = new MessageEmbed()
            .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
            .setTitle(`Configure AFK Check Settings: **${section.sectionName}**`)
            .setDescription(
                new StringBuilder()
                    .append("Here, you will be able to configure some AFK check settings. Please read the following")
                    .append(" directions carefully:").appendLine()
                    .append("- To set the VC limit for raids in this section, press the **Set Section VC Limit**. Note")
                    .append(" that you can override this on a per-dungeon limit.").appendLine()
                    .append("- To set the number of people that can use points to join raids, press the **Set Section")
                    .append(" Point Limit**. You will be able to set the number of points needed to get into the")
                    .append(" dungeon via the dungeon configuration command.").appendLine()
                    .append("- To set the number of people that can use Nitro to join raids, press the **Set Nitro")
                    .append(" Limit** button.").appendLine()
                    .append("- To set the message that will be displayed on all AFK checks in this section, press the")
                    .append(" **Set AFK Check Message** button.").appendLine()
                    .append("- To set the message that will be displayed on all __post__-AFK checks in this section,")
                    .append(" press the **Set Post-AFK Check Message** button.").appendLine()
                    .append("- To set the message that will be sent to people that reacted with some early location")
                    .append(" reaction, press the **Set Early Location Message** button.").appendLine()
                    .append("- To set the AFK check expiration time (minimum 10 minutes, maximum 2 hours), press the")
                    .append(" **Set AFK Check Expiration Time** button.").appendLine()
                    .append("- To configure the permissions for the raid VC during pre/post-AFK check or general AFK")
                    .append(" checks, press the corresponding permissions button.").appendLine()
                    .append("- To enable or disable the creation of a logging channel, press the **Enable/Disable Log")
                    .append(" Channel Creation** button.").appendLine()
                    .append("- To save your changes, press **Save**. Otherwise, press **Quit** to quit this process")
                    .append(" and **Go Back** to go back (both without saving your changes).").toString()
            );

        while (true) {
            logChannelButton.setLabel(
                newAfkCheckProps.createLogChannel
                    ? "Disable Log Channel Creation"
                    : "Enable Log Channel Creation"
            );

            embed.fields = [];
            embed.addField("VC Limit", StringUtil.codifyString(newAfkCheckProps.vcLimit), true)
                .addField("Max Point Users", StringUtil.codifyString(newAfkCheckProps.pointUserLimit), true)
                .addField(
                    "Max Nitro Users",
                    StringUtil.codifyString(newAfkCheckProps.nitroEarlyLocationLimit),
                    true
                )
                .addField(
                    "Creating Log Channel?",
                    StringUtil.codifyString(newAfkCheckProps.createLogChannel ? "Yes" : "No"),
                    true
                )
                .addField(
                    "AFK Check Expiration Time",
                    StringUtil.codifyString(TimeUtilities.formatDuration(newAfkCheckProps.afkCheckTimeout, false)),
                    true
                )
                .addField(
                    "General AFK Check Message",
                    StringUtil.codifyString(
                        newAfkCheckProps.customMsg.additionalAfkCheckInfo.length === 0
                            ? "N/A"
                            : newAfkCheckProps.customMsg.additionalAfkCheckInfo
                    )
                )
                .addField(
                    "Post-AFK Check Message",
                    StringUtil.codifyString(
                        newAfkCheckProps.customMsg.postAfkCheckInfo.length === 0
                            ? "N/A"
                            : newAfkCheckProps.customMsg.postAfkCheckInfo
                    )
                )
                .addField(
                    "Early Location Message",
                    StringUtil.codifyString(
                        newAfkCheckProps.customMsg.earlyLocConfirmMsg.length === 0
                            ? "N/A"
                            : newAfkCheckProps.customMsg.earlyLocConfirmMsg
                    )
                );

            await botMsg.edit({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents(buttons)
            });

            const selected = await AdvancedCollector.startInteractionCollector({
                targetChannel: botMsg.channel,
                targetAuthor: ctx.user,
                oldMsg: botMsg,
                acknowledgeImmediately: true,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                duration: 45 * 1000
            });

            if (!selected) {
                await this.dispose(ctx, botMsg);
                return;
            }

            switch (selected.customId) {
                case "back": {
                    await  this.mainMenu(ctx, botMsg);
                    return;
                }
                case "vc_lim": {
                    const v = await askInput<number>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                                    .setTitle("Set Section VC Limit")
                                    .setDescription(
                                        "Here, you can set the section default raid VC limit. If a dungeon doesn't"
                                        + " have a specified VC limit, the dungeon will take on the VC limit defined"
                                        + " by this section (if the raid is done in this section). The current value"
                                        + " is:" + StringUtil.codifyString(newAfkCheckProps.vcLimit)
                                        + "Type an __integer greater than or equal to 5__ to set the new VC limit."
                                        + " If you don't want to set this, press the **Back** button."
                                    )
                            ]
                        },
                        m => {
                            const num = Number.parseInt(m.content, 10);
                            return Number.isNaN(num) ? null : Math.max(5, num);
                        }
                    );

                    if (typeof v === "undefined") {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (!v)
                        break;

                    newAfkCheckProps.vcLimit = v;
                    break;
                }
                case "set_pt_lim": {
                    const p = await askInput<number>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                                    .setTitle("Set Point User Limit")
                                    .setDescription(
                                        "Here, you can set how many people can redeem points to gain priority access"
                                        + " to raid VCs in this section. This is currently set at:"
                                        + StringUtil.codifyString(newAfkCheckProps.pointUserLimit)
                                        + "Either type `0` if you don't want people to redeem points for any dungeon"
                                        + " raid in this section or a positive number. If you don't want to set"
                                        + " this, press the **Back** button."
                                    )
                            ]
                        },
                        m => {
                            const num = Number.parseInt(m.content, 10);
                            return Number.isNaN(num) ? null : Math.max(0, num);
                        }
                    );

                    if (typeof p === "undefined") {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (!p)
                        break;

                    newAfkCheckProps.pointUserLimit = p;
                    break;
                }
                case "nit_lim": {
                    const n = await askInput<number>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                                    .setTitle("Set Nitro User Limit")
                                    .setDescription(
                                        "Here, you can set how many people can gain priority access to raids in this"
                                        + " section via the Nitro reaction. This is currently set to:"
                                        + StringUtil.codifyString(newAfkCheckProps.nitroEarlyLocationLimit)
                                        + "Type a __non-negative__ integer value to set the new Nitro user limit. If"
                                        + " this is set to `0`, the Nitro reaction will not appear if the raid is"
                                        + " done in this section. If you don't want to set this, press the **Back**"
                                        + " button."
                                    )
                            ]
                        },
                        m => {
                            const num = Number.parseInt(m.content, 10);
                            return Number.isNaN(num) ? null : Math.max(5, num);
                        }
                    );

                    if (typeof n === "undefined") {
                        await this.dispose(ctx, botMsg);
                        return;
                    }

                    if (!n)
                        break;

                    newAfkCheckProps.nitroEarlyLocationLimit = n;
                    break;
                }
                case "set_afk_msg": {
                    const am = await askInput<string>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                                    .setTitle("Set AFK Check Message")
                                    .setDescription(
                                        "Here, you can set the message that will be displayed on AFK checks in this"
                                        + " section. This will be displayed on both pre-AFK checks and general"
                                        + " AFK checks. Please send a message that has at __most__ 1000 characters."
                                        + " Keep in mind that basic markdown applies, so you can make your text"
                                        + " bold, use code blocks, embed links, and more. If you don't want to"
                                        + " change this, press the **Back** button."
                                    )
                            ]
                        },
                        m => m.content.length > 1000 ? null : m.content
                    );

                    if (typeof am === "undefined") {
                        await  this.dispose(ctx, botMsg);
                        return;
                    }

                    if (!am)
                        break;

                    newAfkCheckProps.customMsg.additionalAfkCheckInfo = am;
                    break;
                }
                case "set_post_afk_msg": {
                    const pm = await askInput<string>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                                    .setTitle("Set Post-AFK Check Message")
                                    .setDescription(
                                        "Here, you can set the message that will be displayed on AFK checks in this"
                                        + " section __when the AFK check finishes__. Please send a message that has at"
                                        + " __most__ 1000 characters. Keep in mind that basic markdown applies, so"
                                        + " you can make your text bold, use code blocks, embed links, and more. If"
                                        + " you don't want to change this, press the **Back** button."
                                    )
                            ]
                        },
                        m => m.content.length > 1000 ? null : m.content
                    );

                    if (typeof pm === "undefined") {
                        await   this.dispose(ctx, botMsg);
                        return;
                    }

                    if (!pm)
                        break;

                    newAfkCheckProps.customMsg.postAfkCheckInfo = pm;
                    break;
                }
                case "set_early_loc": {
                    const el = await askInput<string>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                                    .setTitle("Set Early Location Message")
                                    .setDescription(
                                        "Here, you can set the message that will be shown to people when they react"
                                        + " with any early location/priority reaction (e.g. Nitro, class reacts)."
                                        + " This message can contain information like steps for verifying class"
                                        + " reactions or rules. As usual, your message must have at most 1000"
                                        + " characters. Keep in mind that basic markdown  applies, so you can make"
                                        + " your text bold, use code blocks, embed links, and more. If you don't"
                                        + " want to change this, press the **Back** button."
                                    )
                            ]
                        },
                        m => m.content.length > 1000 ? null : m.content
                    );

                    if (typeof el === "undefined") {
                        await   this.dispose(ctx, botMsg);
                        return;
                    }

                    if (!el)
                        break;

                    newAfkCheckProps.customMsg.earlyLocConfirmMsg = el;
                    break;
                }
                case "afk_check_expiration": {
                    const e = await askInput<number>(
                        ctx,
                        botMsg,
                        {
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                                    .setTitle("Set AFK Check Expiration Time")
                                    .setDescription(
                                        "Here, you can set how long AFK checks last in this section. The lowest time"
                                        + " you can set is 5 minutes and the highest is 2 hours. After the time is"
                                        + " gone, the AFK check will automatically end. The current time is set to:"
                                        + StringUtil.codifyString(
                                            TimeUtilities.formatDuration(newAfkCheckProps.afkCheckTimeout, false)
                                        )
                                        + "Please type the duration now. Supported time units are minutes (m) or hours"
                                        + " (h). For example, to specify 1 hour and 10 minutes, use \"1h10m\" as the"
                                        + " the duration. If you want to specify 30 minutes, use \"30m\" as the"
                                        + " duration. If you don't want to set this right now, press the **Back**"
                                        + " button."
                                    )
                            ]
                        },
                        m => {
                            const timeStr = TimeUtilities.parseTimeUnit(m.content);
                            if (!timeStr)
                                return null;

                            if (timeStr.ms > 7.2e+6 || timeStr.ms < 300000)
                                return null;

                            return timeStr.ms;
                        }
                    );

                    if (typeof e === "undefined") {
                        await   this.dispose(ctx, botMsg);
                        return;
                    }

                    if (!e)
                        break;

                    newAfkCheckProps.afkCheckTimeout = e;
                    break;
                }
                case "config_pre_post_afk": {
                    const p = await this.configPermissions(
                        ctx,
                        botMsg,
                        newAfkCheckProps.prePostAfkCheckPermissions,
                        "Pre/Post-AFK Check Permissions"
                    );

                    if (p.status === TimedStatus.TIMED_OUT) {
                        await     this.dispose(ctx, botMsg);
                        return;
                    }

                    if (p.status === TimedStatus.CANCELED)
                        break;

                    newAfkCheckProps.prePostAfkCheckPermissions = p.value!;
                    break;
                }
                case "config_gen_afk": {
                    const p = await this.configPermissions(
                        ctx,
                        botMsg,
                        newAfkCheckProps.afkCheckPermissions,
                        "General AFK Check Permissions"
                    );

                    if (p.status === TimedStatus.TIMED_OUT) {
                        await      this.dispose(ctx, botMsg);
                        return;
                    }

                    if (p.status === TimedStatus.CANCELED)
                        break;

                    newAfkCheckProps.afkCheckPermissions = p.value!;
                    break;
                }
                case "save": {
                    const filterQuery: FilterQuery<IGuildInfo> = section.isMainSection
                        ? {guildId: ctx.guild!.id}
                        : {guildId: ctx.guild!.id, "guildSections.uniqueIdentifier": section.uniqueIdentifier};
                    const updateQuery: UpdateQuery<IGuildInfo> = section.isMainSection
                        ? {$set: {"otherMajorConfig.afkCheckProperties": newAfkCheckProps}}
                        : {$set: {"guildSections.$.otherMajorConfig.afkCheckProperties": newAfkCheckProps}};
                    ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc(filterQuery, updateQuery);
                    await   this.mainMenu(ctx, botMsg);
                    return;
                }
                case "quit": {
                    await    this.dispose(ctx, botMsg);
                    return;
                }
                case "create_log_chan": {
                    newAfkCheckProps.createLogChannel = !newAfkCheckProps.createLogChannel;
                    break;
                }
            }
        }
    }

    /**
     * Allows the user to configure raid VC permissions.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {IPropertyKeyValuePair<string, IPermAllowDeny>[]} oldPerms The old permissions.
     * @param {string} permType The permission type (i.e. what you are editing).
     * @return {Promise<TimedResult<IPropertyKeyValuePair<string, IPermAllowDeny>[]>>} The new permissions, if any.
     * @private
     */
    private async configPermissions(
        ctx: ICommandContext,
        botMsg: Message,
        oldPerms: IPropertyKeyValuePair<string, IPermAllowDeny>[],
        permType: string
    ): Promise<TimedResult<IPropertyKeyValuePair<string, IPermAllowDeny>[]>> {
        const newPerms = oldPerms
            .filter(x => {
                // If NOT custom role ID, then return true since this is simply a placeholder value
                if (!MiscUtilities.isSnowflake(x.key))
                    return true;

                // Otherwise, custom role ID so check if it exists.
                return GuildFgrUtilities.hasCachedRole(ctx.guild!, x.key);
            })
            .map(x => {
                return {...x};
            });

        const upButton = new MessageButton()
            .setLabel("Move Up")
            .setCustomId("move_up")
            .setStyle("PRIMARY");
        const downButton = new MessageButton()
            .setLabel("Move Down")
            .setCustomId("move_down")
            .setStyle("PRIMARY");
        const prevRoleButton = new MessageButton()
            .setLabel("Previous Role")
            .setCustomId("prev_role")
            .setStyle("PRIMARY");
        const nextRoleButton = new MessageButton()
            .setLabel("Next Role")
            .setCustomId("next_role")
            .setStyle("PRIMARY");
        const removeRoleButton = new MessageButton()
            .setLabel("Remove Role")
            .setCustomId("remove_role")
            .setStyle("DANGER");
        const addRoleButton = new MessageButton()
            .setLabel("Add Role")
            .setCustomId("add_role")
            .setStyle("PRIMARY");
        const allowPermButton = new MessageButton()
            .setLabel("Allow Permission")
            .setCustomId("allow_perm")
            .setStyle("PRIMARY");
        const nullPermButton = new MessageButton()
            .setLabel("Nullify Permission")
            .setCustomId("null_perm")
            .setStyle("PRIMARY");
        const denyPermButton = new MessageButton()
            .setLabel("Deny Permission")
            .setCustomId("deny_perm")
            .setStyle("PRIMARY");
        const buttons: MessageButton[] = [
            // Level 1 rows
            prevRoleButton,
            nextRoleButton,
            addRoleButton,
            removeRoleButton,
            new MessageButton()
                .setLabel("Save Changes")
                .setCustomId("save")
                .setStyle("SUCCESS"),
            // Level 2 rows
            upButton,
            downButton,
            allowPermButton,
            nullPermButton,
            denyPermButton,
            // Level 3 rows
            new MessageButton()
                .setLabel("Go Back")
                .setCustomId("back")
                .setStyle("DANGER"),
            new MessageButton()
                .setLabel("Quit")
                .setCustomId("quit")
                .setStyle("DANGER")
        ];

        const instructions = new StringBuilder()
            .append("Here, you will be able to configure the permissions for each role that you specify. Please read")
            .append(" the instructions carefully:").appendLine()
            .append("- The bot will tell you what role you are configuring. You can change this by pressing the")
            .append(" **Previous/Next Role** buttons. You can also add a new role if needed or remove the currently")
            .append(" selected role.").appendLine()
            .append("- Once you have selected the role that you want to modify, use the **Move Up/Down** buttons to")
            .append(` move the ${Emojis.RIGHT_TRIANGLE_EMOJI} emoji up or down the permissions list.`).appendLine()
            .append(`- The ${Emojis.RIGHT_TRIANGLE_EMOJI} emoji will point to the currently selected permission for`)
            .append(" the *currently selected role*.").appendLine()
            .append("- Once you have selected the permission that you want to modify, use the **ALlow/Deny/Nullify")
            .append(" Permissions** button to either allow, deny, or nullify (i.e. let a lower role determine")
            .append(" precedence) the permission for that role.").appendLine()
            .append("- Once you are done, you can simply **Save** your changes. If you don't want to, you can also")
            .append(" go back via the **Back** button or quit via the **Quit** button (both of which will not save")
            .append(" your changes).")
            .toString();

        const embed = new MessageEmbed()
            .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
            .setTitle(`Modifying Permissions: **${permType}**`);

        let currentRoleIdx = 0;
        let currentPermIdx = 0;

        while (true) {
            addRoleButton.setDisabled(newPerms.length + 1 > ConfigureAfkCheck.MAX_PERMS_SET);

            // Can't go to next/prev role if only one role
            prevRoleButton.setDisabled(newPerms.length <= 1);
            nextRoleButton.setDisabled(newPerms.length <= 1);

            // If no perms set, this should be completely disabled
            removeRoleButton.setDisabled(newPerms.length === 0);
            upButton.setDisabled(newPerms.length === 0);
            downButton.setDisabled(newPerms.length === 0);
            allowPermButton.setDisabled(newPerms.length === 0);
            nullPermButton.setDisabled(newPerms.length === 0);
            denyPermButton.setDisabled(newPerms.length === 0);

            const currRoleId = newPerms.length === 0
                ? null
                : newPerms[currentRoleIdx].key;
            const currRoleDisplay = currRoleId === null
                ? "No roles configured. Add one!"
                : MiscUtilities.isSnowflake(currRoleId)
                    ? GuildFgrUtilities.getCachedRole(ctx.guild!, currRoleId)!
                    : currRoleId as string;

            // Update embed display
            embed.setDescription(`Configuring Role: ${currRoleDisplay}`);
            embed.fields = [];
            // Display permissions, if any.
            if (newPerms.length > 0) {
                const currentPerm = newPerms[currentRoleIdx].value;
                for (let i = 0; i < ConfigureAfkCheck.VC_PERMISSIONS.length; i++) {
                    const [prettyName, permStr] = ConfigureAfkCheck.VC_PERMISSIONS[i];

                    const fieldName = i === currentPermIdx
                        ? `${Emojis.RIGHT_TRIANGLE_EMOJI} ${prettyName}`
                        : prettyName;
                    if (currentPerm.allow.some(x => x === permStr))
                        embed.addField(fieldName, `${Emojis.GREEN_CHECK_EMOJI} Allowed.`);
                    else if (currentPerm.deny.some(x => x === permStr))
                        embed.addField(fieldName, `${Emojis.X_EMOJI} Denied.`);
                    else
                        embed.addField(fieldName, "Not Specified (Null).");
                }
            }

            await botMsg.edit({
                content: instructions,
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
                case "prev_role": {
                    currentRoleIdx = (currentRoleIdx + newPerms.length - 1) % newPerms.length;
                    break;
                }
                case "next_role": {
                    currentRoleIdx++;
                    currentRoleIdx %= newPerms.length;
                    break;
                }
                case "add_role": {
                    await botMsg.edit({
                        embeds: [
                            new MessageEmbed()
                                .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                                .setTitle("Add Role")
                                .setDescription(
                                    "Here, you will be able to add a role that you can then configure permissions"
                                    + " for in Raid VCs. You can either select a **built-in** role by selecting the"
                                    + " appropriate role in the select menu (dropdown) below *or* a **custom** role"
                                    + " by mentioning the role or typing the role ID.\n\nKeep in mind that if you"
                                    + " select a built-in leader role, that leader role will apply to that specific"
                                    + " group of leaders in all sections (for example, if you give Raid Leaders"
                                    + " specific permissions, both the Universal Leader role and any appropriate"
                                    + " section Leader roles will receive the permissions that you specify).\n\nIf"
                                    + " you don't want to add a new role at this time, press the **Back** button."
                                )
                        ],
                        components: AdvancedCollector.getActionRowsFromComponents([
                            new MessageSelectMenu()
                                .setMinValues(1)
                                .setMaxValues(1)
                                .setCustomId("select")
                                .addOptions(GeneralConstants.ROLE_ORDER.map(x => {
                                    return {
                                        value: x,
                                        label: x
                                    };
                                })),
                            new MessageButton()
                                .setLabel("Back")
                                .setStyle("DANGER")
                                .setCustomId("back")
                        ]),
                        content: null
                    });

                    const specifiedChoice = await AdvancedCollector.startDoubleCollector<Role>({
                        targetChannel: botMsg.channel as TextChannel,
                        targetAuthor: ctx.user,
                        cancelFlag: null,
                        deleteResponseMessage: true,
                        oldMsg: botMsg,
                        acknowledgeImmediately: true,
                        clearInteractionsAfterComplete: false,
                        deleteBaseMsgAfterComplete: false,
                        duration: 2 * 60 * 1000
                    }, m => ParseUtilities.parseRole(m) ?? undefined);

                    if (!specifiedChoice)
                        return {value: null, status: TimedStatus.TIMED_OUT};

                    if (specifiedChoice instanceof MessageComponentInteraction) {
                        if (!specifiedChoice.isSelectMenu())
                            break;

                        const idx = newPerms.findIndex(x => x.key === specifiedChoice.values[0]);
                        if (idx !== -1) {
                            currentRoleIdx = idx;
                            break;
                        }

                        newPerms.push({
                            key: specifiedChoice.values[0],
                            value: {allow: [], deny: []}
                        });
                        break;
                    }

                    const roleIdx = newPerms.findIndex(x => x.key === specifiedChoice.id);
                    if (roleIdx !== -1) {
                        currentRoleIdx = roleIdx;
                        break;
                    }

                    newPerms.push({
                        key: specifiedChoice.id,
                        value: {allow: [], deny: []}
                    });
                    currentRoleIdx = newPerms.length - 1;
                    break;
                }
                case "remove_role": {
                    newPerms.splice(currentRoleIdx, 1);
                    currentRoleIdx = newPerms.length === 0
                        ? 0
                        : (currentRoleIdx + newPerms.length - 1) % newPerms.length;
                    break;
                }
                case "save": {
                    return {value: newPerms, status: TimedStatus.SUCCESS};
                }
                case "move_up": {
                    currentPermIdx = (currentPermIdx
                        + ConfigureAfkCheck.VC_PERMISSIONS.length - 1) % ConfigureAfkCheck.VC_PERMISSIONS.length;
                    break;
                }
                case "move_down": {
                    currentPermIdx++;
                    currentPermIdx %= ConfigureAfkCheck.VC_PERMISSIONS.length;
                    break;
                }
                case "allow_perm": {
                    const denyIdx = newPerms[currentRoleIdx].value.deny
                        .findIndex(x => x === ConfigureAfkCheck.VC_PERMISSIONS[currentPermIdx][1]);
                    if (denyIdx !== -1)
                        newPerms[currentRoleIdx].value.deny.splice(denyIdx, 1);

                    newPerms[currentRoleIdx].value.allow.push(ConfigureAfkCheck.VC_PERMISSIONS[currentPermIdx][1]);
                    break;
                }
                case "null_perm": {
                    const denyIdx = newPerms[currentRoleIdx].value.deny
                        .findIndex(x => x === ConfigureAfkCheck.VC_PERMISSIONS[currentPermIdx][1]);
                    if (denyIdx !== -1)
                        newPerms[currentRoleIdx].value.deny.splice(denyIdx, 1);
                    else {
                        const allowIdx = newPerms[currentRoleIdx].value.allow
                            .findIndex(x => x === ConfigureAfkCheck.VC_PERMISSIONS[currentPermIdx][1]);
                        if (allowIdx !== -1)
                            newPerms[currentRoleIdx].value.allow.splice(allowIdx, 1);
                    }
                    break;
                }
                case "deny_perm": {
                    const allowIdx = newPerms[currentRoleIdx].value.allow
                        .findIndex(x => x === ConfigureAfkCheck.VC_PERMISSIONS[currentPermIdx][1]);
                    if (allowIdx !== -1)
                        newPerms[currentRoleIdx].value.allow.splice(allowIdx, 1);

                    newPerms[currentRoleIdx].value.deny.push(ConfigureAfkCheck.VC_PERMISSIONS[currentPermIdx][1]);
                    break;
                }
                case "back": {
                    return {value: oldPerms, status: TimedStatus.SUCCESS};
                }
                case "quit": {
                    return {value: null, status: TimedStatus.TIMED_OUT};
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
        if (botMsg && await GuildFgrUtilities.hasMessage(botMsg.channel, botMsg.id)) {
            await botMsg?.delete();
        }
    }
}