import { BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { MessageUtilities } from "../../utilities/MessageUtilities";
import fs, { promises as fsPromises } from 'fs'
import { join } from 'path';


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
        const blInfo = ctx.guildDoc!.moderation.blacklistedUsers.map(x => `
        ___${x.realmName.lowercaseIgn}___`).join("\n")
        
        async () => {
            try{
                await fsPromises.writeFile(join(__dirname, "blackListedUsers.txt"), blInfo,{
                    flag: 'w',
                  });
            } catch(err){
                console.error(err)
                return -1
            }
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
            )
            .addField("blacklisted user(s) realmname:", "")
        
        await ctx.interaction.reply({
            embeds: [embed], files: ["./blackListedUsers.txt"]
        });

        try {
            fs.unlinkSync("./blacklistedUsers.txt");
            console.log("File removed:", "./blacklistedUsers.txt");
          } catch (err) {
            console.error(err);
            return -1
          }
        return 0;
    }
}