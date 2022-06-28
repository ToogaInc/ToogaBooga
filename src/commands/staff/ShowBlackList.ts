import { BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { MessageUtilities } from "../../utilities/MessageUtilities";
import { StringBuilder } from "../../utilities/StringBuilder";

export class ShowBlacklist extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "SHOW_BLACKLIST",
            formalCommandName: "Show Blacklist",
            botCommandName: "showblacklist",
            description: "Shows a list of all current blacklisted users of the server",
            rolePermissions: ["Officer", "Moderator", "HeadRaidLeader", "Security"],
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
        const blInfo = ctx.guildDoc?.moderation.blacklistedUsers
        .filter(x => !x.realmName.lowercaseIgn.includes("a"))
        
        if (!blInfo) {
            await ctx.interaction.reply({
                content: "Could not retrieve blacklisted members."
            });
            return -1;
        }

        else if (blInfo.length > limit){
            await ctx.interaction.reply({
                content: "List of blacklisted members is too large."
            });
            return -1;
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