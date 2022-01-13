import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {ChannelLogsQueryOptions, TextChannel} from "discord.js";
import {MiscUtilities} from "../../utilities/MiscUtilities";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";

export class Purge extends BaseCommand {
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

        let num = Math.min(ctx.interaction.options.getNumber("amt", true), 1000);
        await ctx.interaction.reply({
            content: `Clearing ${num} messages.`,
            ephemeral: true
        });

        let numToClear: number = 0;
        while (num > 0) {
            if (num > 100) {
                numToClear = 100;
                num -= 100;
            }
            else {
                numToClear = num;
                num = 0;
            }

            const q: ChannelLogsQueryOptions = {
                limit: numToClear
            };

            const groupMsgs = (await GlobalFgrUtilities.tryExecuteAsync(async () => {
                return await ctx.channel.messages.fetch(q);
            }))?.filter(x => !x.pinned);

            if (!groupMsgs) {
                break;
            }

            if (groupMsgs.size === 0) {
                break;
            }

            const r = await GlobalFgrUtilities.tryExecuteAsync(async () => {
                await (ctx.channel as TextChannel).bulkDelete(groupMsgs);
                return true;
            });

            if (!r) {
                break;
            }

            await MiscUtilities.stopFor(3000);
        }

        return 0;
    }
}