import {ArgumentType, BaseCommand, ICommandContext} from "../BaseCommand";
import {ThreadChannel} from "discord.js";
import {ModmailManager} from "../../managers/ModmailManager";
import {QuotaManager} from "../../managers/QuotaManager";

export class Reply extends BaseCommand {
    public constructor() {
        super({
            cmdCode: "REPLY_COMMAND",
            formalCommandName: "Reply Command",
            botCommandName: "reply",
            description: "Replies to a modmail thread. This must be executed in a valid modmail thread.",
            rolePermissions: ["Security", "Officer", "HeadRaidLeader", "Moderator"],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 3 * 1000,
            argumentInfo: [
                {
                    displayName: "Response",
                    argName: "response",
                    desc: "Your response to the modmail thread.",
                    type: ArgumentType.String,
                    prettyType: "String",
                    required: true,
                    example: ["I'll talk to the raid leader."]
                },
                {
                    displayName: "Send Anonymously",
                    argName: "anon",
                    desc: "Whether to send your reply anonymously. Default is true.",
                    type: ArgumentType.Boolean,
                    prettyType: "Boolean",
                    required: false,
                    example: ["True", "False"]
                }
            ],
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

        const quotaToLog = QuotaManager.findBestQuotaToAdd(ctx.member!, ctx.guildDoc!, "ModmailRespond");
        const resp = ctx.interaction.options.getString("response", true);
        const anon = ctx.interaction.options.getBoolean("anon", false) ?? true;
        const sentSuccess = await ModmailManager.sendMessageToUser(ctx.channel, ctx.user, resp, anon);
        await ctx.interaction.reply({
            content: sentSuccess ? "Sent!" : "The message could not be sent."
        });

        if (quotaToLog) {
            await QuotaManager.logQuota(ctx.member!, quotaToLog, "ModmailRespond", 1);
        }
        return 0;
    }
}