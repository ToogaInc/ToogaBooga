import { BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { MessageUtilities } from "../../utilities/MessageUtilities";
import { writeFileSync, readFileSync } from "fs";
import { join } from "path";


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
        
        try{
            writeFileSync(join(__dirname, "blackListedUsers.txt"), blInfo, {
                flag: "w",
            });
        } catch(err){
            console.error(err);
            return -1;
        }

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
                "A list of all currently blacklisted users"
            );
        
        await ctx.interaction.reply({
            files: [`${__dirname}/blackListedUsers.txt`],
            embeds: [embed],
        });

        // try {
        //     fs.unlinkSync("./blacklistedUsers.txt");
        //     console.log("File removed:", "./blacklistedUsers.txt");
        //   } catch (err) {
        //     console.log("NOT FINDING IT OR TRYING TO DELTE BEFORE CREATED")
        //     console.error(err);
        //     return -1
        //   }
        return 0;
    }
}