import { ArgumentType, BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { VoiceChannel } from "discord.js";
import { RaidInstance } from "../../instances/RaidInstance";
import { QuotaManager } from "../../managers/QuotaManager";

export class Parse extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "PARSE_COMMAND",
            formalCommandName: "Parse Command",
            botCommandName: "parse",
            description: "Parses a raid VC.",
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
                    displayName: "/who Image",
                    argName: "image",
                    desc: "The /who in the dungeon. Only use images.",
                    type: ArgumentType.Attachment,
                    prettyType: "Attachment",
                    required: true,
                    example: [""]
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
        const res = ctx.interaction.options.getAttachment("image", true);

        if (!ctx.member!.voice.channel) {
            await ctx.interaction.reply({
                content: "You need to be in a voice channel.",
                ephemeral: true
            });
            return -1;
        }

        if (!(ctx.member!.voice.channel instanceof VoiceChannel)) {
            await ctx.interaction.reply({
                content: "This command can only be executed in a voice channel.",
                ephemeral: true
            });
            return -1;
        }

        await ctx.interaction.deferReply();

        if (!res.height) {
            await ctx.interaction.reply({
                content: "Could not find an image in your attachment. Please try again.",
                ephemeral: true
            });
            return -1;
        }

        const parseSummary = await RaidInstance.parseScreenshot(res.url, ctx.member!.voice.channel);
        if (!parseSummary) {
            await ctx.interaction.editReply({
                content: "Something went wrong when trying to parse this screenshot. Try again later."
            });

            return -1;
        }

        const embed = await RaidInstance.interpretParseRes(parseSummary, ctx.user, ctx.member!.voice.channel);
        await ctx.interaction.editReply({
            content: null,
            embeds: [embed]
        });

        const roleId = QuotaManager.findBestQuotaToAdd(ctx.member!, ctx.guildDoc!, "Parse");
        if (roleId) {
            await QuotaManager.logQuota(ctx.member!, roleId, "Parse", 1);
        }

        return 0;
    }
}