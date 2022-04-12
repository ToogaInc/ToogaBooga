import {BaseCommand, ICommandContext} from "../BaseCommand";
import {ThreadChannel} from "discord.js";
import {ModmailManager} from "../../managers/ModmailManager";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";

export class Archive extends BaseCommand {
    public constructor() {
        super({
            cmdCode: "ARCHIVE_COMMAND",
            formalCommandName: "Archive Command",
            botCommandName: "archive",
            description: "Archives a modmail thread. This must be executed in a valid modmail thread.",
            rolePermissions: ["Security", "Officer", "HeadRaidLeader", "Moderator"],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 3 * 1000,
            argumentInfo: [],
            guildOnly: true,
            botOwnerOnly: false
        });
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        if (!(ctx.channel instanceof ThreadChannel)) {
            await ctx.interaction.reply({
                content: "This command can only be used in a modmail thread channel. If this is a thread in the"
                    + " modmail channel, you may need to close and re-open the thread."
            });
            return -1;
        }

        const mmMessage = await GuildFgrUtilities.fetchMessage(ctx.channel.parent!, ctx.channel.id!);
        if (!mmMessage) {
            await ctx.interaction.reply({
                content: "An unknown error occurred when trying to archive this."
            });
            return -1;
        }
        await ctx.interaction.reply({
            content: "Archived."
        });
        await ModmailManager.closeModmailThread(mmMessage, ctx.guildDoc!);
        return 0;
    }
}