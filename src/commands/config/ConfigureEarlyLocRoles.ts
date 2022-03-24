import {ArgumentType, BaseCommand, ICommandContext} from "../BaseCommand";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {DungeonUtilities} from "../../utilities/DungeonUtilities";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {GeneralConstants} from "../../constants/GeneralConstants";
import {StringBuilder} from "../../utilities/StringBuilder";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import {MongoManager} from "../../managers/MongoManager";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {BaseMessageComponent, MessageSelectMenu, MessageSelectOptionData} from "discord.js";
import {ButtonConstants} from "../../constants/ButtonConstants";
import {StringUtil} from "../../utilities/StringUtilities";
import {ArrayUtilities} from "../../utilities/ArrayUtilities";

export class ConfigureEarlyLocRoles extends BaseCommand {
    private static readonly MAX_EARLY_LOC_ROLES: number = 3;

    public constructor() {
        super({
            cmdCode: "CONFIGURE_EARLY_LOCATION_ROLES",
            formalCommandName: "Configure Early Location Roles",
            botCommandName: "configearlylocroles",
            description: "Allows you to configure early location roles",
            rolePermissions: ["Officer", "HeadRaidLeader", "Moderator"],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 3 * 1000,
            argumentInfo: [
                {
                    displayName: "Modifier",
                    argName: "modifier",
                    desc: "Whether to add, remove, or list early location roles.",
                    type: ArgumentType.String,
                    restrictions: {
                        stringChoices: [
                            ["Add Role", "add"],
                            ["Remove Role", "remove"],
                            ["List All Roles", "list"]
                        ]
                    },
                    prettyType: "String",
                    required: true,
                    example: ["Add Role"]
                },
                {
                    displayName: "Role",
                    argName: "role",
                    desc: "The role to add or remove, if applicable.",
                    type: ArgumentType.Role,
                    prettyType: "Role",
                    required: false,
                    example: ["@Team"]
                }
            ],
            guildOnly: true,
            botOwnerOnly: false,
            guildConcurrencyLimit: 1,
            allowMultipleExecutionByUser: false
        });
    }

    /** @inheritDoc */
    public async run(ctx: ICommandContext): Promise<number> {
        const choice = ctx.interaction.options.getString("modifier", true);
        const role = ctx.interaction.options.getRole("role", false);
        ctx.guildDoc = (await DungeonUtilities.fixEarlyLocRoles(ctx.guildDoc!, ctx.guild!))!;
        const earlyLocRoles = ctx.guildDoc.properties.genEarlyLocReactions!;

        // Choice "list"
        if (choice === "list") {
            const embed = MessageUtilities.generateBlankEmbed(ctx.member!, "RANDOM")
                .setTitle("All Early Location Roles")
                .setTimestamp();

            if (earlyLocRoles.length === 0) {
                embed.setDescription("There are no early location roles set. To add one, use the `add` modifier with"
                    + " the relevant role.");

                await ctx.interaction.reply({
                    embeds: [embed],
                    ephemeral: true
                });

                return 0;
            }

            embed.setDescription(`There are ${earlyLocRoles.length}/${ConfigureEarlyLocRoles.MAX_EARLY_LOC_ROLES}`
                + " early location roles set.");

            for (const {roleId, mappingKey} of earlyLocRoles) {
                const r = DungeonUtilities.getReaction(ctx.guildDoc!, mappingKey)!;
                embed.addField(
                    GeneralConstants.ZERO_WIDTH_SPACE,
                    new StringBuilder()
                        .append(`- Role: ${GuildFgrUtilities.getCachedRole(ctx.guild!, roleId) ?? "N/A"}`)
                        .appendLine()
                        .append(`- Reaction: ${GlobalFgrUtilities.getNormalOrCustomEmoji(r)}`)
                        .toString()
                );
            }

            await ctx.interaction.reply({
                embeds: [embed],
                ephemeral: true
            });

            return 0;
        }

        if (!role) {
            await ctx.interaction.reply({
                content: "You need to provide a role when using the `add` or `remove` modifier.",
                ephemeral: true
            });

            return -1;
        }

        const idx = earlyLocRoles.findIndex(x => x.roleId === role.id);
        if (choice === "remove") {
            if (idx === -1) {
                await ctx.interaction.reply({
                    content: "The role you're trying to remove does not exist as an early location role. Try again.",
                    ephemeral: true
                });

                return -1;
            }

            earlyLocRoles.splice(idx, 1);
            await MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
                $set: {
                    "properties.genEarlyLocReactions": earlyLocRoles
                }
            });

            await ctx.interaction.reply({
                content: "Removed the role successfully.",
                ephemeral: true
            });

            return 0;
        }

        if (idx !== -1) {
            await ctx.interaction.reply({
                content: "The role you're trying to add already exists as an early location role. Try again.",
                ephemeral: true
            });

            return -1;
        }

        const allAvailableReactions = ctx.guildDoc!.properties.customReactions
            .filter(x => x.value.type === "EARLY_LOCATION"
                && !ctx.guildDoc!.properties.genEarlyLocReactions.some(y => y.mappingKey === x.key)
                && !!GlobalFgrUtilities.getNormalOrCustomEmoji(x.value));

        if (allAvailableReactions.length === 0) {
            await ctx.interaction.reply({
                content: "There are no custom reactions that can be used. To add a new reaction, please use the"
                    + " appropriate configuration command.",
                ephemeral: true
            });

            return -1;
        }

        const uniqueId = StringUtil.generateRandomString(15);
        const components: BaseMessageComponent[] = [
            AdvancedCollector.cloneButton(ButtonConstants.CANCEL_BUTTON)
                .setCustomId(uniqueId)
        ];

        const selectOpts: MessageSelectOptionData[] = allAvailableReactions.map(x => {
            return {
                label: x.value.name,
                emoji: GlobalFgrUtilities.getNormalOrCustomEmoji(x.value)!,
                value: x.key
            };
        });

        const subsets = ArrayUtilities.breakArrayIntoSubsets(selectOpts, 24);
        const maxAmt = Math.min(subsets.length, 4);
        for (let i = 0; i < maxAmt; ++i) {
            components.push(
                new MessageSelectMenu()
                    .setCustomId(`${uniqueId}_${i}`)
                    .setOptions(subsets[i])
                    .setMinValues(1)
                    .setMaxValues(1)
            );
        }

        const embed = MessageUtilities.generateBlankEmbed(ctx.user, "RANDOM")
            .setTitle("Select Custom Emoji")
            .setDescription(
                new StringBuilder()
                    .append(`You are currently associating a custom emoji with the role ${role}.`).appendLine(2)
                    .append("Please select the emoji that you want to use by selecting the emoji from the dropdown")
                    .append(" menu. If you don't find the emoji that you want to use, create a new custom emoji using")
                    .append(" the corresponding configuration command, and make sure the custom emoji is an Early")
                    .append(" Location emoji type. If you want to cancel this process, press the Cancel button")
                    .append(" instead.")
                    .toString()
            )
            .setTimestamp();

        await ctx.interaction.reply({
            embeds: [embed],
            components: AdvancedCollector.getActionRowsFromComponents(components)
        });

        const res = await AdvancedCollector.startInteractionEphemeralCollector({
            targetAuthor: ctx.user,
            acknowledgeImmediately: true,
            targetChannel: ctx.channel,
            duration: 1.5 * 60 * 1000
        }, uniqueId);

        if (!res || !res.isSelectMenu()) {
            await ctx.interaction.editReply({
                content: "This process has been canceled, or it has timed out.",
                embeds: [],
                components: []
            });

            return -1;
        }

        earlyLocRoles.push({
            roleId: role.id,
            mappingKey: res.values[0]
        });

        await MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
            $set: {
                "properties.genEarlyLocReactions": earlyLocRoles
            }
        });

        await ctx.interaction.editReply({
            content: "Added successfully",
            embeds: [],
            components: []
        });

        return 0;
    }
}