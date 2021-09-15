import {BaseCommand, ICommandContext} from "../BaseCommand";
import {
    Message,
    MessageButton,
    MessageComponentInteraction,
    MessageEmbed,
    MessageSelectMenu, MessageSelectOptionData, Role,
    TextChannel
} from "discord.js";
import {StringBuilder} from "../../utilities/StringBuilder";
import {Emojis} from "../../constants/Emojis";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {DungeonType, IAfkCheckReaction, ICustomDungeonInfo} from "../../definitions";
import {StringUtil} from "../../utilities/StringUtilities";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import {MiscUtilities} from "../../utilities/MiscUtilities";
import {MAPPED_AFK_CHECK_REACTIONS} from "../../constants/MappedAfkCheckReactions";
import {ArrayUtilities} from "../../utilities/ArrayUtilities";
import {GeneralConstants} from "../../constants/GeneralConstants";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {ParseUtilities} from "../../utilities/ParseUtilities";

enum ValidatorResult {
    // Success = ValidationReturnType#res is not null
    Success,
    // Failed = validation failed
    Failed,
    // Canceled = user doesn't want to specify value
    Canceled
}

type ValidationReturnType<T> = { res: T | null; status: ValidatorResult; };
type ValidationFunction<T> = (input: string) => ValidationReturnType<T> | Promise<ValidationReturnType<T>>;
type ValidationInfo = {
    nameOfPrompt: string;
    descOfPrompt: string;
    expectedType: string;
    currentValue: string | null;
};

type GenericConfigOptions<T> = {
    validator: (msg: Message) => (T | null) | Promise<T | null>;
    nameOfPrompt: string;
    descOfPrompt: string;
    itemName: string;
    expectedType: string;

    embedTitleResolver: (input: T) => string;
    embedDescResolver: (input: T) => string;
};

export class ConfigureDungeons extends BaseCommand {
    public static readonly MAXIMUM_PRIORITY_REACTS: number = 22;
    public static readonly MAXIMUM_NORMAL_REACTS: number = 20;
    public static readonly MAXIMUM_CUSTOM_DUNGEONS: number = 20;

    public constructor() {
        super({
            cmdCode: "CONFIGURE_DUNGEONS",
            formalCommandName: "Configure Dungeons",
            botCommandName: "configdungeons",
            description: "Allows you to configure custom dungeons and what dungeons can be raided in each of the"
                + " sections.",
            rolePermissions: ["Officer", "HeadRaidLeader", "Moderator"],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 3 * 1000,
            usageGuide: ["configdungeons"],
            exampleGuide: ["configdungeons"],
            guildOnly: true,
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
        const embed: MessageEmbed = new MessageEmbed()
            .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
            .setTitle("Dungeon Configuration Command")
            .setDescription(
                new StringBuilder()
                    .append("Here, you will be able to configure dungeons for this bot. In particular, you will be")
                    .append(" able to configure:").appendLine()
                    .append("- What dungeons can show up on the AFK check on a per-dungeon basis.").appendLine()
                    .append("- Add or remove custom dungeons.").appendLine()
                    .append("- Override the existing dungeon settings.").appendLine()
                    .append("- Add, remove, or modify reactions for each dungeon in the AFK checks.").appendLine(2)
                    .append("Please select the appropriate option.")
                    .toString()
            )
            .addField(
                "Exit",
                "Click on the `Exit` button to exit this process."
            )
            .addField(
                "Modify Existing Dungeon",
                "Click on the `Modify Existing Dungeon` button if you want to modify a built-in dungeon."
            )
            .addField(
                "Allow/Deny Dungeon Raids",
                "Click on the `Allow/Deny Dungeon Raids` button if you want to set what dungeons can be raided on a"
                + " per-section basis."
            )
            .addField(
                "Override Base Dungeon",
                "Click on the `Override Base Dungeon` button if you want to override some properties of a built-in"
                + " dungeon."
            );

        const buttons: MessageButton[] = [
            new MessageButton()
                .setLabel("Exit")
                .setStyle("DANGER")
                .setCustomId("exit")
                .setEmoji(Emojis.X_EMOJI),
            new MessageButton()
                .setLabel("Modify Existing Dungeon")
                .setStyle("PRIMARY")
                .setCustomId("modify_existing")
                .setEmoji(Emojis.PENCIL_EMOJI),
            new MessageButton()
                .setLabel("Allow/Deny Dungeon Raids")
                .setStyle("PRIMARY")
                .setCustomId("a_d_dungeon_raids")
                .setEmoji(Emojis.PENCIL_EMOJI),
            new MessageButton()
                .setLabel("Override Base Dungeon")
                .setStyle("PRIMARY")
                .setCustomId("override_base")
                .setEmoji(Emojis.PLUS_EMOJI)
        ];

        if (ctx.guildDoc!.properties.customDungeons.length + 1 < ConfigureDungeons.MAXIMUM_CUSTOM_DUNGEONS) {
            embed.addField(
                "Create Custom Dungeon",
                "Click on the `Create Custom Dungeon` button if you want to create your own custom dungeon."
            ).addField(
                "Clone Base Dungeon",
                "Click on the `Clone Base Dungeon` button if you want to clone a built-in dungeon so you can create"
                + " a custom dungeon out of it."
            );

            buttons.push(
                new MessageButton()
                    .setLabel("Create Custom Dungeon")
                    .setStyle("PRIMARY")
                    .setCustomId("create_custom")
                    .setEmoji(Emojis.PLUS_EMOJI),
                new MessageButton()
                    .setLabel("Clone Base Dungeon")
                    .setStyle("PRIMARY")
                    .setCustomId("clone_base")
                    .setEmoji(Emojis.PLUS_EMOJI)
            );
        }

        if (ctx.guildDoc!.properties.customDungeons.length > 0) {
            embed.addField(
                "Modify Custom Dungeon",
                "Click on the `Modify Custom Dungeon` button if you want to modify a custom dungeon."
            ).addField(
                "Delete Custom Dungeon",
                "Click on the `Delete Custom Dungeon` button if you want to delete a custom dungeon."
            );

            buttons.push(
                new MessageButton()
                    .setLabel("Modify Custom Dungeon")
                    .setStyle("PRIMARY")
                    .setCustomId("modify_custom")
                    .setEmoji(Emojis.PLUS_EMOJI),
                new MessageButton()
                    .setLabel("Delete Custom Dungeon")
                    .setStyle("DANGER")
                    .setCustomId("delete_custom")
                    .setEmoji(Emojis.WASTEBIN_EMOJI)
            );
        }


        if (botMsg) {
            await botMsg.edit({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents(buttons)
            });
        }
        else {
            botMsg = await ctx.channel!.send({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents(buttons)
            });
        }

        const selectedButton = await AdvancedCollector.startInteractionCollector({
            targetChannel: botMsg.channel as TextChannel,
            targetAuthor: botMsg.author,
            oldMsg: botMsg,
            acknowledgeImmediately: true,
            clearInteractionsAfterComplete: true,
            deleteBaseMsgAfterComplete: false,
            duration: 2 * 60 * 1000
        });

        if (!selectedButton) {
            this.dispose(ctx, botMsg).then();
            return;
        }

        switch (selectedButton.customId) {
            case "exit": {
                this.dispose(ctx, botMsg).catch();
                return;
            }
            case "modify_existing": {
                return;
            }
            case "a_d_dungeon_raids": {
                return;
            }
            case "create_custom": {
                return;
            }
            case "modify_custom": {
                return;
            }
            case "delete_custom": {
                return;
            }
        }
    }

    /**
     * Creates or modifies a dungeon.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {ICustomDungeonInfo} [dungeon] The dungeon, if any.
     */
    public async createOrModifyCustomDungeon(ctx: ICommandContext, botMsg: Message,
                                             dungeon?: ICustomDungeonInfo): Promise<void> {
        const cDungeon: ICustomDungeonInfo = dungeon ?? {
            bossLinks: [],
            codeName: "",
            dungeonCategory: "Uncategorized",
            dungeonColors: [],
            dungeonName: "",
            isBaseOrDerived: false,
            keyReactions: [],
            nitroEarlyLocationLimit: 0,
            otherReactions: [],
            pointCost: 0,
            portalEmojiId: "",
            portalLink: "",
            roleRequirement: [],
            vcLimit: -1
        };

        const embed = new MessageEmbed()
            .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
            .setTitle("Create Custom Dungeon")
            .setDescription(
                "You can create a new custom dungeon here. In order to create a custom dungeon, you must fill out"
                + " the __required__ items. Once you are done, press the **Submit** button. If you decide that you"
                + " don't want to create a new dungeon at this time, press the **Back** button."
            );

        const saveButton = new MessageButton()
            .setLabel("Save")
            .setCustomId("save")
            .setStyle("SUCCESS")
            .setDisabled(!cDungeon.dungeonName);

        const buttons: MessageButton[] = [
            new MessageButton()
                .setLabel("Back")
                .setCustomId("back")
                .setStyle("DANGER"),
            new MessageButton()
                .setLabel("Dungeon Name")
                .setCustomId("dungeon_name")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Portal Emoji")
                .setCustomId("portal_emoji")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Configure Reactions")
                .setCustomId("config_reactions")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Portal Link")
                .setCustomId("portal_link")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Boss Links")
                .setCustomId("boss_links")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Dungeon Colors")
                .setCustomId("dungeon_colors")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Dungeon Category")
                .setCustomId("dungeon_category")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Points to Enter")
                .setCustomId("points_enter")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Nitro Limit")
                .setCustomId("nitro_limit")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("VC Limit")
                .setCustomId("vc_limit")
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("Role Requirements")
                .setCustomId("role_requirements")
                .setStyle("PRIMARY"),
            saveButton
        ];

        while (true) {
            const ptCostStr = (cDungeon.pointCost === 0
                ? "Point System Not Used"
                : cDungeon.pointCost).toString();

            const nitroEarlyStr = (cDungeon.nitroEarlyLocationLimit === -1
                ? "Section Default"
                : cDungeon.nitroEarlyLocationLimit === 0
                    ? "No Nitros Allowed"
                    : cDungeon.nitroEarlyLocationLimit).toString();

            const vcLimitStr = (cDungeon.vcLimit === -1
                ? "Section Default"
                : cDungeon.vcLimit === 100
                    ? "Infinite"
                    : cDungeon.vcLimit).toString();

            embed.fields = [];
            embed.addField(
                "Dungeon Name (Required)",
                "Click on the `Dungeon Name` button to set the dungeon name. This is currently set to:"
                + StringUtil.codifyString(cDungeon.dungeonName.length === 0 ? "N/A" : cDungeon.dungeonName)
            ).addField(
                "Portal Emoji",
                "Click on the `Portal Emoji` to set the portal emoji that is used to represent this dungeon. This"
                + " is currently set to: "
                + (cDungeon.portalEmojiId.length === 0
                    ? "N/A"
                    : GlobalFgrUtilities.getCachedEmoji(cDungeon.portalEmojiId)?.toString() ?? "N/A")
            ).addField(
                "Configure Reactions",
                "Click on the `Configure Reactions` button to add, remove, or modify reactions for this dungeon. You"
                + " can set priority and non-priority reactions here for this dungeon."
            ).addField(
                "Portal Link",
                "The link to the portal image. This is displayed on the AFK check. This is currently set to: "
                + (cDungeon.portalLink.length === 0
                    ? "N/A"
                    : `Click [Here](${cDungeon.portalLink}).`)
            ).addField(
                "Boss Links",
                "Click on the `Boss Links` button to configure the boss images that should be shown on the AFK check. "
                + `There are currently **${cDungeon.bossLinks.length}** boss link(s) configured.`
            ).addField(
                "Dungeon Colors",
                "Click on the `Dungeon Colors` button to configure the colors that represent this dungeon. For"
                + " example, Parasite Chambers can have different shades of red. As of now, there are currently"
                + ` **${cDungeon.dungeonColors.length}** dungeon colors set for this dungeon.`
            ).addField(
                "Dungeon Category",
                "Click on the `Dungeon Category` button to set what category this dungeon belongs to. At this time,"
                + " this dungeon is currently set to the category:"
                + (cDungeon.dungeonCategory.length === 0
                    ? StringUtil.codifyString("Not Set.")
                    : StringUtil.codifyString(cDungeon.dungeonCategory.length))
            ).addField(
                "Points to Enter",
                "Click on the `Points to Enter` button to set how many points a user needs in order to automatically"
                + " join the VC and gain early location. This is currently set to: "
                + ptCostStr
            ).addField(
                "Number of Nitro Early Location",
                "Click on the `Nitro Limit` button to set how many people can join the VC and gain early"
                + " location via the Nitro reaction. This is currently set to: "
                + nitroEarlyStr
            ).addField(
                "VC Limit",
                "Click on the `VC Limit` button to set the VC limit for the raid voice channel. In particular, this"
                + " will set the raid VC limit to the specified value *if* the raid is for this dungeon. The current"
                + " VC limit is: "
                + vcLimitStr
            ).addField(
                "Role Requirements",
                "Click on the `Role Requirements` button to add or remove any additional roles needed to run this"
                + " particular dungeon. For example, for full-skip dungeons, you might require a Fullskip role. The"
                + ` number of role(s) set is: ${cDungeon.roleRequirement.length}`
            );

            const selectedButton = await AdvancedCollector.startInteractionCollector({
                targetChannel: botMsg.channel as TextChannel,
                targetAuthor: botMsg.author,
                oldMsg: botMsg,
                acknowledgeImmediately: true,
                clearInteractionsAfterComplete: true,
                deleteBaseMsgAfterComplete: false,
                duration: 60 * 1000
            });

            if (!selectedButton) {
                this.dispose(ctx, botMsg).then();
                return;
            }

            switch (selectedButton.customId) {
                case "back": {
                    this.mainMenu(ctx, botMsg).catch();
                    return;
                }
                case "dungeon_name": {
                    const res = await this.askInput<string>(ctx, botMsg, {
                        currentValue: cDungeon.dungeonName,
                        descOfPrompt: "Please type the **name** of this dungeon.",
                        expectedType: "String",
                        nameOfPrompt: "Dungeon Name"
                    }, v => {
                        return v.length < 150
                            ? {res: v, status: ValidatorResult.Success}
                            : {res: null, status: ValidatorResult.Failed};
                    }, "");

                    if (typeof res === "string") {
                        cDungeon.dungeonName = res;
                        continue;
                    }

                    if (res === ValidatorResult.Failed) {
                        this.dispose(ctx, botMsg).catch();
                        return;
                    }

                    break;
                }
                case "portal_emoji": {
                    const res = await this.askInput<string>(ctx, botMsg, {
                        currentValue: GlobalFgrUtilities.getCachedEmoji(cDungeon.portalEmojiId)?.toString() ?? null,
                        descOfPrompt: "Please send the **emoji** of this dungeon's portal. This must be a custom emoji",
                        expectedType: "Custom Emoji",
                        nameOfPrompt: "Portal Emoji"
                    }, v => {
                        const [, , , emojiId,] = v.split(/[<>:]/);
                        if (!emojiId)
                            return {res: null, status: ValidatorResult.Failed};

                        // Invalid custom emoji will only print out <:emoji_name:>
                        // Valid custom emoji will always print out <:emoji_name:id>
                        return GlobalFgrUtilities.hasCachedEmoji(emojiId)
                            ? {res: emojiId, status: ValidatorResult.Success}
                            : {res: null, status: ValidatorResult.Failed};
                    }, "");

                    if (typeof res === "string") {
                        cDungeon.dungeonName = res;
                        continue;
                    }

                    if (res === ValidatorResult.Failed) {
                        this.dispose(ctx, botMsg).catch();
                        return;
                    }
                    return;
                }
                case "config_reactions": {
                    const newReactions = await this.configReactions(
                        ctx,
                        botMsg,
                        cDungeon.keyReactions.concat(cDungeon.otherReactions)
                    );

                    if (!newReactions) {
                        this.dispose(ctx, botMsg).catch();
                        return;
                    }

                    cDungeon.keyReactions = [];
                    cDungeon.otherReactions = [];
                    for (const r of newReactions) {
                        const reactionInfo = r.mapKey in MAPPED_AFK_CHECK_REACTIONS
                            ? MAPPED_AFK_CHECK_REACTIONS[r.mapKey]
                            : ctx.guildDoc!.properties.customReactions.find(x => x.key === r.mapKey)!.value;

                        if (reactionInfo.type === "KEY" || reactionInfo.type === "NM_KEY") {
                            cDungeon.keyReactions.push(r);
                            continue;
                        }

                        cDungeon.otherReactions.push(r);
                    }

                    break;
                }
                case "portal_link": {
                    // TODO
                    break;
                }
                case "boss_links": {
                    // TODO
                    break;
                }
                case "dungeon_colors": {
                    const newDgnColors = await this.configSetting<number>(
                        ctx,
                        botMsg,
                        cDungeon.dungeonColors,
                        {
                            nameOfPrompt: "Dungeon Colors",
                            descOfPrompt: "Here, you will have the ability to specify what colors are associated"
                                + " with this dungeon. For example, you can associated various shades of red with"
                                + " Parasite Chambers. __It is recommended that you have a color picker ready__.",
                            expectedType: "HEX Number (`#xxxxxx`), RGB (`r, g, b`)",
                            itemName: "Color Resolvable",
                            embedDescResolver: input => {
                                const [r, g, b] = MiscUtilities.hexToRgb(`#${input.toString(16)}`);
                                return `- RGB: (${r}, ${g}, ${b})`;
                            },
                            embedTitleResolver: input => `HEX 0x${input.toString(16)}`,
                            validator: m => {
                                if (m.content.includes(",")) {
                                    const rgb = m.content.split(",")
                                        .map(x => Number.parseInt(x, 10))
                                        .filter(x => !Number.isNaN(x) && x >= 0 && x <= 255);
                                    if (rgb.length !== 3)
                                        return null;

                                    const [r, g, b] = rgb;
                                    return Number.parseInt(MiscUtilities.rgbToHex(r, g, b).slice(1), 16);
                                }

                                const num = Number.parseInt(
                                    m.content.startsWith("#") ? m.content.slice(1) : m.content,
                                    16
                                );

                                return Number.isNaN(num) ? null : num;
                            }
                        }
                    );

                    if (!newDgnColors) {
                        this.dispose(ctx, botMsg).catch();
                        return;
                    }

                    cDungeon.dungeonColors = newDgnColors;
                    break;
                }
                case "dungeon_category": {
                    const possibleCategories: MessageSelectOptionData[] = ([
                        "Uncategorized",
                        "Basic Dungeons",
                        "Godland Dungeons",
                        "Endgame Dungeons",
                        "Event Dungeons",
                        "Mini Dungeons",
                        "Heroic Dungeons",
                        "Epic Dungeons"
                    ] as DungeonType[]).map(x => {
                        return {
                            label: x,
                            value: x
                        };
                    });

                    await botMsg.edit({
                        embeds: [
                            new MessageEmbed()
                                .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                                .setTitle("Set Dungeon Category")
                                .setDescription("Please select the category (from the select menu) that best"
                                    + " represents this dungeon. To go back, press the **Back** button.")
                        ],
                        components: AdvancedCollector.getActionRowsFromComponents([
                            new MessageSelectMenu()
                                .setCustomId("cat_select")
                                .setMaxValues(1)
                                .setMinValues(1)
                                .addOptions(possibleCategories),
                            new MessageButton()
                                .setCustomId("back")
                                .setLabel("Back")
                                .setStyle("DANGER")
                        ])
                    });

                    const resInteraction = await AdvancedCollector.startInteractionCollector({
                        targetChannel: botMsg.channel as TextChannel,
                        targetAuthor: botMsg.author,
                        oldMsg: botMsg,
                        acknowledgeImmediately: true,
                        clearInteractionsAfterComplete: true,
                        deleteBaseMsgAfterComplete: false,
                        duration: 45 * 1000
                    });

                    if (!resInteraction || !resInteraction.isSelectMenu())
                        break;

                    cDungeon.dungeonCategory = resInteraction.values[0] as DungeonType;
                    break;
                }
                case "points_enter": {
                    const res = await this.askInput<number>(ctx, botMsg, {
                        currentValue: ptCostStr,
                        descOfPrompt: "Please type the number of points (as a __whole__ number) needed for someone to"
                            + " get early location and priority status for a raid. If you don't want people to use"
                            + " points to gain access to this dungeon, type `0`. Otherwise, type any number greater"
                            + " than `0`.",
                        expectedType: "Number",
                        nameOfPrompt: "Point Cost"
                    }, v => {
                        const num = Number.parseInt(v, 10);
                        if (Number.isNaN(num))
                            return {res: null, status: ValidatorResult.Failed};

                        return {res: Math.max(0, num), status: ValidatorResult.Success};
                    }, 0);

                    if (typeof res === "number") {
                        cDungeon.pointCost = res;
                        continue;
                    }

                    if (res === ValidatorResult.Failed) {
                        this.dispose(ctx, botMsg).catch();
                        return;
                    }
                    break;
                }
                case "nitro_limit": {
                    const res = await this.askInput<number>(ctx, botMsg, {
                        currentValue: nitroEarlyStr,
                        descOfPrompt: "Please specify how many people can get priority access and early location in"
                            + " this dungeon raid via the Nitro react. If you don't want the Nitro react to show up"
                            + " for this dungeon raid, use `0`. If you want to default to whatever the section is"
                            + " using, use `-1`. Otherwise, specify a positive number.",
                        expectedType: "Number",
                        nameOfPrompt: "Nitro VC Limit"
                    }, v => {
                        const num = Number.parseInt(v, 10);
                        if (Number.isNaN(num))
                            return {res: null, status: ValidatorResult.Failed};

                        return {res: Math.max(-1, num), status: ValidatorResult.Success};
                    }, 0);

                    if (typeof res === "number") {
                        cDungeon.nitroEarlyLocationLimit = res;
                        continue;
                    }

                    if (res === ValidatorResult.Failed) {
                        this.dispose(ctx, botMsg).catch();
                        return;
                    }
                    break;
                }
                case "vc_limit": {
                    const res = await this.askInput<number>(ctx, botMsg, {
                        currentValue: vcLimitStr,
                        descOfPrompt: "Please specify the raid VC capacity for any of this dungeon's raid. Specify"
                            + " `-1` if you want to use the section's default VC limit. Specify `100` if you don't"
                            + " want a voice channel limit. Otherwise, specify any number between 1 and 99.",
                        expectedType: "Number",
                        nameOfPrompt: "VC Limit"
                    }, v => {
                        const num = Number.parseInt(v, 10);
                        if (Number.isNaN(num))
                            return {res: null, status: ValidatorResult.Failed};

                        return {res: Math.max(-1, Math.min(100, num)), status: ValidatorResult.Success};
                    }, -1);

                    if (typeof res === "number") {
                        cDungeon.vcLimit = res;
                        continue;
                    }

                    if (res === ValidatorResult.Failed) {
                        this.dispose(ctx, botMsg).catch();
                        return;
                    }
                    break;
                }
                case "role_requirements": {
                    const newRoleReqs = await this.configSetting<Role>(
                        ctx,
                        botMsg,
                        cDungeon.roleRequirement.map(x => GuildFgrUtilities.getCachedRole(ctx.guild!, x))
                            .filter(x => !!x) as Role[],
                        {
                            nameOfPrompt: "Leader Role Requirements",
                            descOfPrompt: "Here, you will have the ability to add or remove roles that are needed to"
                                + " run this dungeon.",
                            expectedType: "Role Mention or ID",
                            itemName: "Role",
                            embedDescResolver: input => `Role ID: ${input.id}`,
                            embedTitleResolver: input => input.name,
                            validator: msg => {
                                const role = ParseUtilities.parseRole(msg);
                                return role ? role : null;
                            }
                        }
                    );

                    if (!newRoleReqs) {
                        this.dispose(ctx, botMsg).catch();
                        return;
                    }

                    cDungeon.roleRequirement = newRoleReqs.map(x => x.id);
                    break;
                }
            }
        }
    }

    /**
     * Configures a generic setting. Similar in nature to `configReactions` but allows for multiple different
     * options at the expense of extreme customizability.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {T[]} cOptions The current options that are set.
     * @param {GenericConfigOptions} addOptions Additional settings for this configuration.
     * @returns {Promise<T[] | null>} The new selected options, or `null` if this was canceled.
     * @private
     */
    public async configSetting<T>(ctx: ICommandContext, botMsg: Message,
                              cOptions: T[], addOptions: GenericConfigOptions<T>): Promise<T[] | null> {
        const selected = cOptions.slice();
        const itemName = addOptions.itemName.toLowerCase();
        const embed = new MessageEmbed()
            .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
            .setTitle(`Edit Setting: ${addOptions.nameOfPrompt}`)
            .setDescription(
                new StringBuilder()
                    .append("__**Specific Directions**__").appendLine()
                    .append(addOptions.descOfPrompt)
                    .appendLine(2)
                    .append("__**General Directions**__").appendLine()
                    .append(`Here, you will be able to add a new ${itemName} or remove an already existing ${itemName}`)
                    .append(` from the list below.`)
                    .appendLine(2)
                    .append(`- The ${Emojis.RIGHT_TRIANGLE_EMOJI} emoji will point to the currently selected`)
                    .append(` ${itemName}.`)
                    .appendLine()
                    .append(`- To move up or down the list of current ${itemName}, press the Up/Down buttons.`)
                    .appendLine()
                    .append(`- If you want to remove the selected ${itemName}, press the **Remove** button.`)
                    .appendLine()
                    .append(`- If you want to *add* a new ${itemName}, press the **Add** button.`)
                    .appendLine()
                    .append("- Once you're done, press the **Save** button to save your changes.")
                    .appendLine()
                    .append("- Alternatively, you can either press **Back** if you want to go back to the previous")
                    .append(" option or press the **Quit** button to quit this entire process. In either case, your")
                    .append(" changes will definitely not be saved.")
                    .toString()
            );

        // TODO put these buttons somewhere so we aren't
        // - constantly creating the same EXACT buttons
        // - less repetition
        const removeButton = new MessageButton()
            .setLabel("Remove")
            .setEmoji(Emojis.WASTEBIN_EMOJI)
            .setCustomId("remove")
            .setStyle("PRIMARY");
        const addButton = new MessageButton()
            .setLabel("Add")
            .setEmoji(Emojis.PLUS_EMOJI)
            .setCustomId("add")
            .setStyle("PRIMARY");
        const upButton = new MessageButton()
            .setLabel("Up")
            .setEmoji(Emojis.UP_TRIANGLE_EMOJI)
            .setCustomId("up")
            .setStyle("PRIMARY");
        const downButton = new MessageButton()
            .setLabel("Down")
            .setEmoji(Emojis.DOWN_TRIANGLE_EMOJI)
            .setCustomId("down")
            .setStyle("PRIMARY");
        const saveButton = new MessageButton()
            .setLabel("Save")
            .setEmoji(Emojis.GREEN_CHECK_EMOJI)
            .setCustomId("save")
            .setStyle("SUCCESS");

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

        let currentIdx = 0;
        while (true) {
            upButton.setDisabled(selected.length <= 1);
            downButton.setDisabled(selected.length <= 1);
            removeButton.setDisabled(selected.length === 0);

            const rawFields: string[] = [];
            for (let i = 0; i < selected.length; i++) {
                rawFields.push(
                    new StringBuilder()
                        .append(
                            i === currentIdx
                                ? `${Emojis.RIGHT_TRIANGLE_EMOJI} ${addOptions.embedTitleResolver(selected[i])}`
                                : addOptions.embedTitleResolver(selected[i])
                        )
                        .append(addOptions.embedDescResolver(selected[i]))
                        .toString()
                );
            }

            const fields = ArrayUtilities.arrayToStringFields(rawFields, (_, elem) => elem);
            for (const field of fields) {
                embed.addField(GeneralConstants.ZERO_WIDTH_SPACE, field);
            }

            await botMsg.edit({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents(buttons)
            });

            const result = await AdvancedCollector.startInteractionCollector({
                targetChannel: botMsg.channel as TextChannel,
                targetAuthor: ctx.user,
                duration: 30 * 1000,
                deleteBaseMsgAfterComplete: false,
                acknowledgeImmediately: true,
                oldMsg: botMsg,
                clearInteractionsAfterComplete: false
            });

            if (!result)
                return null;

            switch (result.customId) {
                case saveButton.customId!: {
                    return selected;
                }
                case addButton.customId!: {
                    // only need to add reaction and that's literally it
                    await botMsg.edit({
                        embeds: [
                            new MessageEmbed()
                                .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                                .setTitle(`Adding **${addOptions.itemName}**`)
                                .setDescription(
                                    new StringBuilder()
                                        .append(`To add a new ${itemName}, please send a message containing only the`)
                                        .append(` following: **${addOptions.expectedType}**`)
                                        .appendLine(2)
                                        .append(`If you don't want to add a new ${itemName} at this time, press the`)
                                        .append(" **Go Back** button.")
                                        .toString()
                                )
                        ],
                        components: AdvancedCollector.getActionRowsFromComponents([
                            new MessageButton()
                                .setLabel("Go Back")
                                .setCustomId("go_back")
                                .setStyle("DANGER")
                                .setEmoji(Emojis.LONG_LEFT_ARROW_EMOJI)
                        ])
                    });

                    const validatorRes = await AdvancedCollector.startDoubleCollector<T>({
                        cancelFlag: null,
                        deleteResponseMessage: true,
                        targetChannel: ctx.channel,
                        acknowledgeImmediately: true,
                        clearInteractionsAfterComplete: false,
                        deleteBaseMsgAfterComplete: false,
                        duration: 60 * 1000,
                        targetAuthor: ctx.user,
                        oldMsg: botMsg
                    }, async m => {
                        const vRes = await addOptions.validator(m);
                        if (vRes) return vRes;
                    });

                    if (!validatorRes)
                        return null;

                    if (validatorRes instanceof MessageComponentInteraction)
                        break;

                    selected.push(validatorRes);
                    break;
                }
                case removeButton.customId!: {
                    selected.splice(currentIdx, 1);
                    currentIdx %= selected.length;
                    break;
                }
                case upButton.customId!: {
                    currentIdx--;
                    currentIdx %= selected.length;
                    break;
                }
                case downButton.customId!: {
                    currentIdx++;
                    currentIdx %= selected.length;
                    break;
                }
                case "back": {
                    return cOptions;
                }
                case "quit": {
                    return null;
                }
            } // end switch case
        }
    }

    /**
     * Configures the reactions for this dungeon.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message,
     * @param {IAfkCheckReaction[]} cReactions The current reactions set.
     * @returns {Promise<IAfkCheckReaction[] | null>} The new reactions, or `null` if this was canceled.
     * @private
     */
    private async configReactions(ctx: ICommandContext, botMsg: Message,
                                  cReactions: IAfkCheckReaction[]): Promise<IAfkCheckReaction[] | null> {
        const currentReactions = cReactions.slice().filter(x => {
            return x.mapKey in MAPPED_AFK_CHECK_REACTIONS
                ? true
                : ctx.guildDoc!.properties.customReactions.some(y => y.key === x.mapKey);
        });

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
        const removeButton = new MessageButton()
            .setLabel("Remove")
            .setEmoji(Emojis.WASTEBIN_EMOJI)
            .setCustomId("remove")
            .setStyle("PRIMARY");
        const upButton = new MessageButton()
            .setLabel("Up")
            .setEmoji(Emojis.UP_TRIANGLE_EMOJI)
            .setCustomId("up")
            .setStyle("PRIMARY");
        const downButton = new MessageButton()
            .setLabel("Down")
            .setEmoji(Emojis.DOWN_TRIANGLE_EMOJI)
            .setCustomId("down")
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

        const embed = new MessageEmbed()
            .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
            .setTitle("Dungeon Reaction Manager")
            .setDescription(
                new StringBuilder()
                    .append("Here, you will be able to add, remove, or manage reactions for this dungeon. Please read")
                    .append(" the directions carefully.")
                    .appendLine(2)
                    .append(`- The ${Emojis.RIGHT_TRIANGLE_EMOJI} emoji will point to the current reaction (if any).`)
                    .appendLine()
                    .append("- To move up or down the list of current reactions, press the Up/Down buttons. If there")
                    .append(" are too many reactions, you can also use the jump (`j`) command. For example, to move")
                    .append(" the arrow down 2, send `j 2`. To move the arrow up 4, send `j -4`.")
                    .appendLine()
                    .append("- Once you have selected the appropriate reaction, you can choose to do a few things.")
                    .appendLine()
                    .append("`  -` To edit how many people can get priority access and early location from this")
                    .append(" reaction, simply send a __non-negative__ number.")
                    .appendLine()
                    .append("`  -` To edit the emoji used for this reaction, you will need to run the configure emoji")
                    .append(" command. Note that reactions *without* valid emojis will __not__ be displayed on AFK")
                    .append(" checks.")
                    .appendLine()
                    .append("`  -` To delete this reaction (so it doesn't show up on the AFK check), press the")
                    .append(" **Remove** button.")
                    .appendLine()
                    .append("- If you want to *add* a reaction, press the **Add** button.")
                    .appendLine()
                    .append("- Once you're done, press the **Save** button to save your changes.")
                    .appendLine()
                    .append("- Alternatively, you can either press **Back** if you want to go back to the previous")
                    .append(" option or press the **Quit** button to quit this entire process. In either case, your")
                    .append(" changes will definitely not be saved.")
                    .toString()
            );

        let currentIdx = 0;
        while (true) {
            upButton.setDisabled(currentReactions.length <= 1);
            downButton.setDisabled(currentReactions.length <= 1);
            removeButton.setDisabled(currentReactions.length === 0);

            const rawFields: string[] = [];
            for (let i = 0; i < currentReactions.length; i++) {
                const reactionInfo = currentReactions[i].mapKey in MAPPED_AFK_CHECK_REACTIONS
                    ? MAPPED_AFK_CHECK_REACTIONS[currentReactions[i].mapKey]
                    : ctx.guildDoc!.properties.customReactions.find(x => x.key === currentReactions[i].mapKey)!.value;
                const emoji = reactionInfo.emojiInfo.isCustom
                    ? GlobalFgrUtilities.getCachedEmoji(reactionInfo.emojiInfo.identifier)
                    : reactionInfo.emojiInfo.identifier;

                rawFields.push(
                    new StringBuilder()
                        .append(
                            i === currentIdx
                                ? `${Emojis.RIGHT_TRIANGLE_EMOJI} ${reactionInfo.name}`
                                : reactionInfo.name
                        )
                        .append(`- Emoji: ${emoji ?? "N/A"} (ID: ${reactionInfo.emojiInfo.identifier})`).appendLine()
                        .append(`- Priority: ${currentReactions[i].maxEarlyLocation}`).appendLine(2)
                        .toString()
                );
            }

            const fields = ArrayUtilities.arrayToStringFields(rawFields, (_, elem) => elem);
            for (const field of fields) {
                embed.addField(GeneralConstants.ZERO_WIDTH_SPACE, field);
            }

            await botMsg.edit({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents(buttons)
            });

            const result = await AdvancedCollector.startDoubleCollector<string>({
                targetChannel: botMsg.channel as TextChannel,
                targetAuthor: ctx.user,
                duration: 60 * 1000,
                deleteBaseMsgAfterComplete: false,
                acknowledgeImmediately: true,
                deleteResponseMessage: true,
                oldMsg: botMsg,
                clearInteractionsAfterComplete: false,
                cancelFlag: null
            }, AdvancedCollector.getStringPrompt(ctx.channel, {min: 1}));

            if (!result)
                return null;

            if (currentReactions.length > 0 && typeof result === "string") {
                if (result.startsWith("j ")) {
                    const jumpBy = Number.parseInt(result.slice(2).trim(), 10);
                    if (Number.isNaN(jumpBy))
                        continue;

                    currentIdx += jumpBy;
                    currentIdx %= currentReactions.length;
                    continue;
                }

                const num = Number.parseInt(result, 10);
                if (Number.isNaN(num))
                    continue;

                currentReactions[currentIdx].maxEarlyLocation = num;
                continue;
            }

            switch (result) {
                case saveButton.customId!: {
                    return currentReactions;
                }
                case addButton.customId!: {
                    // only need to add reaction and that's literally it
                    const possibleReactionsToUse = ctx.guildDoc!.properties.customReactions.map(x => {
                        return {mapKey: x.key, ...x.value};
                    }).concat(Object.entries(MAPPED_AFK_CHECK_REACTIONS).map(x => {
                        return {mapKey: x[0], ...x[1]};
                    })).filter(y => {
                        // Check if this has already been used
                        if (currentReactions.some(x => x.mapKey === y.mapKey))
                            return false;

                        return !!(y.emojiInfo.isCustom
                            ? GlobalFgrUtilities.getCachedEmoji(y.emojiInfo.identifier)
                            : y.emojiInfo.identifier);
                    });

                    // Nothing to add means, well, skip
                    if (possibleReactionsToUse.length === 0) {
                        await botMsg.edit({
                            embeds: [
                                new MessageEmbed()
                                    .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                                    .setTitle("No Reactions to Add")
                                    .setDescription("There are no more reactions that you can add at this time.")
                                    .setFooter("This message will automatically revert back in 5 seconds.")
                            ],
                            components: []
                        });

                        await MiscUtilities.stopFor(5 * 1000);
                        break;
                    }

                    const subsets = ArrayUtilities.breakArrayIntoSubsets(possibleReactionsToUse, 25);
                    const selectMenus: MessageSelectMenu[] = [];
                    for (const subset of subsets) {
                        selectMenus.push(
                            new MessageSelectMenu()
                                .setCustomId("r_chooser")
                                .setMinValues(1)
                                .setMaxValues(1)
                                .addOptions(subset.map(x => {
                                    const prettyTypeName = x.type[0].toUpperCase() + x.type.substring(1).toLowerCase();
                                    return {
                                        description: `Reaction Type: ${prettyTypeName}`,
                                        emoji: x.emojiInfo.identifier,
                                        label: x.name,
                                        value: x.mapKey
                                    };
                                }))
                        );

                        if (selectMenus.length === 4)
                            break;
                    }

                    await botMsg.edit({
                        embeds: [
                            new MessageEmbed()
                                .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
                                .setTitle("Select Reaction to Add")
                                .setDescription("Please select **one** reaction to add to this dungeon. If you don't"
                                    + " want to add a reaction, press the **Go Back** button.")
                        ],
                        components: AdvancedCollector.getActionRowsFromComponents([
                            ...selectMenus,
                            new MessageButton()
                                .setLabel("Go Back")
                                .setCustomId("go_back")
                                .setStyle("DANGER")
                                .setEmoji(Emojis.LONG_LEFT_ARROW_EMOJI)
                        ])
                    });

                    const res = await AdvancedCollector.startInteractionCollector({
                        targetChannel: ctx.channel,
                        acknowledgeImmediately: true,
                        clearInteractionsAfterComplete: false,
                        deleteBaseMsgAfterComplete: false,
                        duration: 60 * 1000,
                        targetAuthor: ctx.user,
                        oldMsg: botMsg
                    });

                    if (!res)
                        return null;

                    if (res.isSelectMenu()) {
                        currentReactions.push({
                            mapKey: res.values[0],
                            maxEarlyLocation: 0
                        });
                    }

                    break;
                }
                case removeButton.customId!: {
                    currentReactions.splice(currentIdx, 1);
                    currentIdx %= currentReactions.length;
                    break;
                }
                case upButton.customId!: {
                    currentIdx--;
                    currentIdx %= currentReactions.length;
                    break;
                }
                case downButton.customId!: {
                    currentIdx++;
                    currentIdx %= currentReactions.length;
                    break;
                }
                case "back": {
                    return cReactions;
                }
                case "quit": {
                    return null;
                }
            } // end switch case
        } // end while loop
    }

    /**
     * Asks for the user's input.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     * @param {ValidationInfo} validationInfo The validation information. Used when displaying the relevant
     * instructions.
     * @param {Function} validator The validator. This is the function that parses the user's input and returns an
     * object -- or a promise to that object. This object contains the `res` property, which represents the parsed
     * *result* of the input (if any). It also contains the `status` property, which indicates whether the parsing
     * was successful.
     * @param {T} defaultT The default `T` value.
     * @returns {Promise<T | ValidatorResult>} The parsed result, if any. Otherwise, the validator result indicating
     * whether this was canceled.
     * @private
     */
    private async askInput<T>(ctx: ICommandContext, botMsg: Message, validationInfo: ValidationInfo,
                              validator: ValidationFunction<T>, defaultT: T): Promise<T | ValidatorResult> {
        const embed = new MessageEmbed()
            .setAuthor(ctx.guild!.name, ctx.guild!.iconURL() ?? undefined)
            .setTitle(`Prompt: **${validationInfo.nameOfPrompt}**`)
            .setDescription(
                new StringBuilder()
                    .append(`- **Directions**: ${validationInfo.descOfPrompt}`)
                    .appendLine(2)
                    .append(`- **Required Input Type**: \`${validationInfo.expectedType}\``)
                    .appendLine(2)
                    .append("Please type the value for this prompt now. If you wish to go back to the previous menu")
                    .append(" without setting anything, press the **Back** button. If you want to reset this field,")
                    .append(" press the **Reset** button.")
                    .toString()
            ).addField(
                "Current Value",
                validationInfo.currentValue ?? "*Not Set*"
            );

        await botMsg.edit({
            embeds: [embed],
            components: AdvancedCollector.getActionRowsFromComponents([
                new MessageButton()
                    .setLabel("Back")
                    .setStyle("DANGER")
                    .setCustomId("back")
                    .setEmoji(Emojis.LONG_LEFT_ARROW_EMOJI),
                new MessageButton()
                    .setLabel("Reset")
                    .setStyle("DANGER")
                    .setCustomId("reset")
                    .setEmoji(Emojis.X_EMOJI)
            ])
        });

        while (true) {
            const selectedValue = await AdvancedCollector.startDoubleCollector<string>({
                acknowledgeImmediately: true,
                cancelFlag: null,
                clearInteractionsAfterComplete: false,
                deleteBaseMsgAfterComplete: false,
                deleteResponseMessage: true,
                duration: 60 * 1000,
                targetAuthor: ctx.user,
                targetChannel: botMsg.channel,
                oldMsg: botMsg
            }, AdvancedCollector.getStringPrompt(ctx.channel, {min: 1}));

            if (!selectedValue) {
                await this.dispose(ctx, botMsg);
                return ValidatorResult.Failed;
            }

            if (selectedValue instanceof MessageComponentInteraction) {
                switch (selectedValue.customId) {
                    case "back": {
                        return ValidatorResult.Canceled;
                    }
                    case "reset": {
                        return defaultT;
                    }
                }
                return ValidatorResult.Canceled;
            }

            const r = await validator(selectedValue);
            if (r.res !== null) {
                return r.res;
            }

            if (r.status === ValidatorResult.Canceled) {
                return ValidatorResult.Canceled;
            }

            // Failed = loop back to beginning and ask again
            ctx.channel.send({
                content: `Your input was invalid. Please specify a value of \`${validationInfo.expectedType}\`.`
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