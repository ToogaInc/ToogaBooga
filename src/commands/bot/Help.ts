import {BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {SlashCommandBuilder} from "@discordjs/builders";
import {OneLifeBot} from "../../OneLifeBot";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringUtil} from "../../utilities/StringUtilities";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {Role} from "discord.js";

export class Help extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "HELP",
            formalCommandName: "Help",
            botCommandName: "help",
            description: "Runs the help command. This lists all commands.",
            rolePermissions: [],
            generalPermissions: [],
            botPermissions: [],
            argumentInfo: [
                {
                    displayName: "Command Name",
                    argName: "command",
                    desc: "The command to find help information for.",
                    type: "String",
                    required: false,
                    example: ["help", "startafkcheck"]
                }
            ],
            commandCooldown: 4 * 1000,
            usageGuide: ["help {Command}", "help"],
            exampleGuide: ["help ping", "help"],
            guildOnly: false,
            botOwnerOnly: false
        };

        const scb = new SlashCommandBuilder()
            .setName(cmi.botCommandName)
            .setDescription(cmi.description);

        scb.addStringOption(
            option => option
                .setName("command")
                .setDescription("The command to get help information for. Use `all` to show all available commands.")
                .setRequired(false)
        );

        super(cmi, scb);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        const cmdName = ctx.interaction.options.getString("command");
        let showCmdHelp = false;

        if (cmdName) {
            const command = OneLifeBot.NameCommands.get(cmdName);
            if (command) {
                const cmdHelpEmbed = MessageUtilities.generateBlankEmbed(ctx.user, "GREEN")
                    .setTitle(`Command Help: **${command.commandInfo.formalCommandName}**`)
                    .setFooter(`Server Context: ${ctx.guild!.name}`)
                    .setDescription(command.commandInfo.description)
                    .addField("Command Code", StringUtil.codifyString(command.commandInfo.botCommandName))
                    .addField(
                        "Guild Only?",
                        StringUtil.codifyString(command.commandInfo.guildOnly ? "Yes" : "No"),
                        true
                    )
                    .addField(
                        "Bot Owner Only?",
                        StringUtil.codifyString(command.commandInfo.botOwnerOnly ? "Yes" : "No"),
                        true
                    )
                    .addField(
                        "Discord User Permissions Needed (≥ 1)",
                        StringUtil.codifyString(
                            command.commandInfo.generalPermissions.length > 0
                                ? command.commandInfo.generalPermissions.join(", ")
                                : "N/A."
                        )
                    )
                    .addField(
                        "Discord Bot Permissions Needed (≥ 1)",
                        StringUtil.codifyString(
                            command.commandInfo.botPermissions.length > 0
                                ? command.commandInfo.botPermissions
                                : "N/A."
                        )
                    );

                const pRoleIds: string[] = [];
                if (ctx.guildDoc) {
                    const customPermData = ctx.guildDoc.properties.customCmdPermissions
                        .find(x => x.key === command.commandInfo.cmdCode);
                    const useCustomPerms = Boolean(customPermData && !customPermData.value.useDefaultRolePerms);
                    const rPerms = useCustomPerms
                        ? customPermData!.value.rolePermsNeeded
                        : command.commandInfo.rolePermissions;
                    const roles: Role[] = BaseCommand.getNeededPermissionsBase(rPerms, ctx.guildDoc)
                        .map(x => GuildFgrUtilities.getCachedRole(ctx.guild!, x))
                        .filter(x => Boolean(x)) as Role[];

                    cmdHelpEmbed.addField(
                        "Server Roles Needed (≥ 1)",
                        roles.length > 0 ? roles.join(", ") : StringUtil.codifyString("N/A.")
                    );
                }
                else if (command.commandInfo.rolePermissions.length > 0) {
                    cmdHelpEmbed.addField(
                        "Server Roles Needed (≥ 1)",
                        command.commandInfo.rolePermissions.join(", ")
                    );
                }
                else {
                    cmdHelpEmbed.addField(
                        "Server Roles Needed (≥ 1)",
                        StringUtil.codifyString("N/A")
                    );
                }

                cmdHelpEmbed
                    .addField(
                        "Usage Guide",
                        StringUtil.codifyString(
                            command.commandInfo.usageGuide.length > 0
                                ? command.commandInfo.usageGuide.map(x => `- /${x}`).join("\n")
                                : "N/A."
                        )
                    )
                    .addField(
                        "Example(s)",
                        StringUtil.codifyString(
                            command.commandInfo.exampleGuide.length > 0
                                ? command.commandInfo.exampleGuide.map(x => `- /${x}`).join("\n")
                                : "N/A."
                        )
                    );

                await ctx.interaction.reply({
                    embeds: [cmdHelpEmbed]
                });

                return 0;
            }

            showCmdHelp = true;
        }

        const helpEmbed = MessageUtilities.generateBlankEmbed(ctx.user, "GREEN")
            .setTitle("Command List")
            .setFooter(`Server Context: ${ctx.guild!.name}`)
            .setDescription(
                showCmdHelp
                    ? `The command, \`${cmdName}\`, could not be found. Try looking through the list below.`
                    : "Below is a list of all supported commands."
            );

        for (const [category, commands] of OneLifeBot.Commands) {
            helpEmbed.addField(
                category,
                StringUtil.codifyString(
                    commands.filter(x => x.hasPermissionToRun(ctx.user, ctx.guild, ctx.guildDoc))
                        .map(x => x.commandInfo.botCommandName)
                        .join(", ")
                )
            );
        }

        await ctx.interaction.reply({
            embeds: [helpEmbed]
        });
        return 0;
    }
}