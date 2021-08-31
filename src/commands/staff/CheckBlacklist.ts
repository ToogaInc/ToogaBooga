import {BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {SlashCommandBuilder} from "@discordjs/builders";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringBuilder} from "../../utilities/StringBuilder";
import {StringUtil} from "../../utilities/StringUtilities";
import {TimeUtilities} from "../../utilities/TimeUtilities";

export class CheckBlacklist extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "CHECK_BLACKLIST",
            formalCommandName: "Check Blacklist",
            botCommandName: "checkblacklist",
            description: "Checks the blacklist status for a particular name.",
            rolePermissions: [
                "Helper",
                "Security",
                "Officer",
                "Moderator",
                "HeadRaidLeader",
                "VeteranRaidLeader"
            ],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 3 * 1000,
            usageGuide: ["checkblacklist [Name]"],
            exampleGuide: ["checkblacklist Opre"],
            guildOnly: true,
            botOwnerOnly: false
        };

        const scb = new SlashCommandBuilder()
            .setName(cmi.botCommandName)
            .setDescription(cmi.description);
        scb.addStringOption(o => o
            .setName("name")
            .setDescription("The in-game name to lookup. This is not case-sensitive.")
            .setRequired(true)
        );

        super(cmi, scb);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        const ignToLookUp = ctx.interaction.options.getString("name", true);
        const blInfo = ctx.guildDoc?.moderation.blacklistedUsers
            .find(x => x.realmName.lowercaseIgn === ignToLookUp.toLowerCase());
        if (!blInfo) {
            await ctx.interaction.reply({
                content: `The in-game name, \`${ignToLookUp}\`, is currently not blacklisted.`
            });

            return 0;
        }

        const embed = MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
            .setTitle(`Blacklist Information: **${ignToLookUp}**`)
            .setDescription(
                new StringBuilder()
                    .append("__**User Information**__").appendLine()
                    .append(`- User IGN: ${blInfo.realmName.ign}`).appendLine()
                    .append(`- Discord ID: ${blInfo.discordId ? blInfo.discordId : "N/A"}`).appendLine()
                    .appendLine()
                    .append("__**Moderator Information**__").appendLine()
                    .append(`- Moderator IGN: ${blInfo.moderator.name}`).appendLine()
                    .append(`- Moderator Tag: ${blInfo.moderator.tag}`).appendLine()
                    .append(`- Moderator ID: ${blInfo.moderator.id}`).appendLine()
                    .toString()
            )
            .addField(
                "Issued At",
                StringUtil.codifyString(`${TimeUtilities.getTime(blInfo.issuedAt)} GMT`)
            )
            .addField("Blacklist Reason", StringUtil.codifyString(blInfo.reason))
            .setFooter(`Moderation ID: ${blInfo.actionId}`);

        if (blInfo.evidence.length > 0) {
            let i = 1;
            embed.addField(
                "Evidence",
                blInfo.evidence.map(x => `[Evidence ${i++}](${x})`).join(", ")
            );
        }

        await ctx.interaction.reply({
            embeds: [embed]
        });
        return 0;
    }
}