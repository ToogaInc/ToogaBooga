import { BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { MessageAttachment } from "discord.js";
import { StringBuilder } from "../../utilities/StringBuilder";
import { TimeUtilities } from "../../utilities/TimeUtilities";

export class ShowAllBlacklist extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "SHOW_ALL_BLACKLIST",
            formalCommandName: "Show All Blacklisted Users",
            botCommandName: "showallblacklist",
            description: "Shows a list of all current blacklisted users in the server",
            rolePermissions: ["Officer", "Moderator", "HeadRaidLeader", "Security"],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 3 * 1000,
            argumentInfo: [],
            guildOnly: true,
            botOwnerOnly: false,
        };

        super(cmi);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        const blInfo = ctx.guildDoc!.moderation.blacklistedUsers.map(x => {
            return new StringBuilder()
                .append(`Name: ${x.realmName.ign} (ID: ${x.discordId ? x.discordId : "N/A"})`)
                .appendLine()
                .append(`\tReason: ${x.reason}`)
                .appendLine()
                .append(`\tTime: ${TimeUtilities.getDateTime(x.issuedAt)} GMT`)
                .appendLine()
                .append(`\tModerator: ${x.moderator.name} (${x.moderator.tag})`)
                .toString();
        }).join("\n");

        if (blInfo.length === 0) {
            await ctx.interaction.reply({
                content: "No users have been blacklisted.",
            });
            return -1;
        }

        await ctx.interaction.reply({
            files: [
                new MessageAttachment(Buffer.from(blInfo), "blackListedUsers.txt"),
            ],
        });

        return 0;
    }
}
