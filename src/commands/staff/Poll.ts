import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {EmojiIdentifierResolvable} from "discord.js";
import {EmojiConstants} from "../../constants/EmojiConstants";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";

export class Poll extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "POLL_CMD",
            formalCommandName: "Poll",
            botCommandName: "poll",
            description: "Creates a poll with up to 20 choices.",
            rolePermissions: [
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
                    displayName: "Poll Question",
                    argName: "question",
                    desc: "The question for this poll.",
                    type: ArgumentType.String,
                    prettyType: "String",
                    required: true,
                    example: ["What dungeon should we do?"]
                }
            ],
            guildOnly: true,
            botOwnerOnly: false
        };

        for (let i = 0; i < 20; ++i) {
            cmi.argumentInfo.push({
                displayName: `Choice ${i + 1}`,
                argName: `choice_${i + 1}`,
                desc: `Choice ${i + 1} for the poll.`,
                type: ArgumentType.String,
                prettyType: "String",
                required: false,
                example: [`Answer ${i + 1}`]
            });
        }

        super(cmi);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        const options: string[] = [];
        for (let i = 0; i < 20; i++) {
            const choice = ctx.interaction.options.getString(`choice_${i + 1}`, false);
            if (choice) {
                options.push(choice);
            }
        }

        const reactions: EmojiIdentifierResolvable[] = [];
        const embed = MessageUtilities.generateBlankEmbed(ctx.user, "RANDOM")
            .setTitle(`${EmojiConstants.BAR_GRAPH_EMOJI} Poll`)
            .setDescription(ctx.interaction.options.getString("question", true))
            .setTimestamp();

        if (options.length === 0) {
            reactions.push(
                EmojiConstants.UP_TRIANGLE_EMOJI,
                EmojiConstants.LONG_SIDEWAYS_ARROW_EMOJI,
                EmojiConstants.DOWN_TRIANGLE_EMOJI
            );
        }
        else {
            let i = 0;
            for (const option of options) {
                reactions.push(EmojiConstants.NUMERICAL_EMOJIS[i]);
                embed.addField(`Choice ${EmojiConstants.NUMERICAL_EMOJIS[i]}`, option, true);
                i++;
            }
        }

        const m = await GlobalFgrUtilities.sendMsg(ctx.channel, {embeds: [embed]});
        if (!m) {
            await ctx.interaction.reply({
                content: "Something went wrong when trying to send this poll message.",
                ephemeral: true
            });

            return -1;
        }

        AdvancedCollector.reactFaster(m, reactions);
        await ctx.interaction.reply({
            content: "Sent!",
            ephemeral: true
        });

        return 0;
    }
}