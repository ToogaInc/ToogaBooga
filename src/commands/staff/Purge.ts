import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {TextChannel} from "discord.js";
import {MiscUtilities} from "../../utilities/MiscUtilities";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";

export class Purge extends BaseCommand {
    private static readonly OLDEST_POSS_MSG: number = 1.123e+9;

    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "PURGE_CMD",
            formalCommandName: "Purge",
            botCommandName: "purge",
            description: "Bulk-deletes messages from a channel.",
            rolePermissions: [
                "Helper",
                "Security",
                "Officer",
                "Moderator",
                "RaidLeader",
                "HeadRaidLeader",
                "VeteranRaidLeader"
            ],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 3 * 1000,
            argumentInfo: [
                {
                    displayName: "Amount",
                    argName: "amt",
                    desc: "The number of messages to delete. Must be a positive number at most 1000.",
                    type: ArgumentType.Number,
                    prettyType: "Number",
                    required: true,
                    example: ["10"]
                }
            ],
            guildOnly: true,
            botOwnerOnly: false
        };

        super(cmi);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        if (!(ctx.channel instanceof TextChannel)) {
            await ctx.interaction.reply({
                content: "This only works in a text channel.",
                ephemeral: true
            });

            return -1;
        }

        const maxNumToDelete = Math.min(ctx.interaction.options.getNumber("amt", true), 1000);
        let num = Math.min(ctx.interaction.options.getNumber("amt", true), 1000);
        await ctx.interaction.reply({
            content: `Attempting to clear ${num} messages. Please wait.`,
            ephemeral: true
        });

        let numDeleted = 0;
        while (true) {
            const groupMsgs = (await GlobalFgrUtilities.tryExecuteAsync(async () => {
                return await ctx.channel.messages.fetch({
                    limit: Math.min(num, 100)
                });
            }))?.filter(x => !x.pinned && Date.now() - x.createdTimestamp <= Purge.OLDEST_POSS_MSG);

            if (!groupMsgs || groupMsgs.size === 0) {
                break;
            }

            const r = await GlobalFgrUtilities.tryExecuteAsync(async () => {
                await (ctx.channel as TextChannel).bulkDelete(groupMsgs);
                return true;
            });

            if (!r) {
                break;
            }

            num -= groupMsgs.size;
            numDeleted += groupMsgs.size;

            if (num <= 0) {
                break;
            }

            await MiscUtilities.stopFor(3000);
        }

        await ctx.interaction.editReply({
            content: `Cleared ${numDeleted}/${maxNumToDelete} messages successfully.`
        });
        return 0;
    }
}