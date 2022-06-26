import { ArgumentType, BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageUtilities } from "../../utilities/MessageUtilities";
import { StringBuilder } from "../../utilities/StringBuilder";
import { StringUtil } from "../../utilities/StringUtilities";
import { TimeUtilities } from "../../utilities/TimeUtilities";

export class ShowBlackList extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "SHOW_BLACKLIST",
            formalCommandName: "Show Blacklist",
            botCommandName: "showblacklist",
            description: "Shows a list of all current blacklisted users of the server",
            rolePermissions: ["Officer", "Moderator", "HeadRaidLeader"],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 3 * 1000,
            argumentInfo: [],
            guildOnly: true,
            botOwnerOnly: false
        };

        super(cmi);
    }

    /**
     * @inheritDoc
     */
    //add command to index of commands and bot.ts
    public async run(ctx: ICommandContext): Promise<number> {
        const limit = 4096;
        const blInfo = ctx.guildDoc?.moderation.blacklistedUsers;
        if (!blInfo) {
            await ctx.interaction.reply({
                content: "Could not retrieve blacklisted members"
            });

            return 0;
        }
        else if (blInfo.length > limit){
            await ctx.interaction.reply({
                content: "List too big yell at devs."
            });
        }
        
        const embed = MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
            .setTitle("Blacklisted users: ")
            .setDescription(
                new StringBuilder()
                    .append(`- Blacklisted Members: ${blInfo}`).appendLine()
                    .toString()
            );
        await ctx.interaction.reply({
            embeds: [embed]
        });
        return 0;
    }
}