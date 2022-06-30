import { BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { MessageAttachment, } from "discord.js";
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
        const blInfo = ctx.guildDoc!.moderation.blacklistedUsers.map(x => ` Realm Name: ${x.realmName.lowercaseIgn}` + 
        ` - Reason: ${x.reason}`).join("\n");

        const usersBf = new StringBuilder()
            .append("================= BlackListed Users =================").appendLine()
            .append(blInfo).appendLine()
            .append("======================= END =========================").appendLine()
            .toString();

        if (!blInfo) {
            await ctx.interaction.reply({
                content: "Could not retrieve blacklisted members."
            });
            return -1;
        }

        else if (blInfo.length === 0 ){
            await ctx.interaction.reply({
                content: "No users have been blacklisted."
            });
            return -1;
        }
      
        await ctx.interaction.reply({
            files: [
                new MessageAttachment(Buffer.from(usersBf),"blackListedUsers.txt")
            ],
        });
        return 0;
    }
}