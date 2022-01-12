import {BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {Message, MessageAttachment, VoiceChannel} from "discord.js";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {RaidInstance} from "../../instances/RaidInstance";
import {QuotaManager} from "../../managers/QuotaManager";

export class ParseRaidVc extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "PARSE_RAID_VC_CMD",
            formalCommandName: "Parse Raid VC",
            botCommandName: "parsevc",
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
            argumentInfo: [],
            guildOnly: true,
            botOwnerOnly: false
        };

        super(cmi);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
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

        const res = await AdvancedCollector.startNormalCollector<MessageAttachment>({
            msgOptions: {
                content: "Please send a **screenshot** (not a URL to a screenshot, but an actual attachment)"
                    + " containing the results of your `/who` now. This screenshot does not need to be"
                    + " cropped. To cancel this process, please type `cancel`.",
            },
            cancelFlag: "cancel",
            targetChannel: ctx.channel,
            targetAuthor: ctx.user,
            deleteBaseMsgAfterComplete: true,
            deleteResponseMessage: false,
            duration: 30 * 1000
        }, (m: Message) => {
            if (m.attachments.size === 0)
                return;

            // Images have a height property, non-images don't.
            const imgAttachment = m.attachments.find(x => x.height !== null);
            if (!imgAttachment)
                return;

            return imgAttachment;
        });

        if (!res) {
            await ctx.interaction.editReply({
                content: "You either canceled this process or didn't upload a screenshot in time."
            });

            return 0;
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