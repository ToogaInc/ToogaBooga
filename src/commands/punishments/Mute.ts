import { ArgumentType, BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { UserManager } from "../../managers/UserManager";
import { MessageUtilities } from "../../utilities/MessageUtilities";
import { StringUtil } from "../../utilities/StringUtilities";
import { MuteManager } from "../../managers/PunishmentManager";
import { TimeUtilities } from "../../utilities/TimeUtilities";
import { StringBuilder } from "../../utilities/StringBuilder";
import { preCheckPunishment } from "./common/PunishmentCommon";
import { Logger } from "../../utilities/Logger";

const LOGGER: Logger = new Logger(__filename, false);

export class Mute extends BaseCommand {
    public static readonly ERROR_NO_MUTE_STR: string = new StringBuilder()
        .append("Something went wrong when trying to mute this person.").appendLine()
        .append("- The person already has the muted role. In this case, manually remove the Muted role and")
        .append(" then try running the command again.").appendLine()
        .toString();

    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "MUTE_COMMAND",
            formalCommandName: "Mute Command",
            botCommandName: "mute",
            description: "Mutes a member, preventing the member from talking in any channels.",
            rolePermissions: [
                "Helper",
                "Security",
                "Officer",
                "Moderator",
                "AlmostRaidLeader",
                "RaidLeader",
                "HeadRaidLeader",
                "VeteranRaidLeader"
            ],
            generalPermissions: [],
            botPermissions: [],
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to mute.",
                    type: ArgumentType.String,
                    prettyType: "Member Resolvable (ID, Mention, IGN)",
                    required: true,
                    example: ["@Console#8939", "123313141413155", "Darkmattr"]
                },
                {
                    displayName: "Duration",
                    argName: "duration",
                    desc: "The duration. Supported time units are minutes (m), hours (h), days (d), weeks (w). For"
                        + " example, to specify 3 days, use \"3d\" as the duration. Duration of -1"
                        + " implies an indefinite mute. Not specifying the time unit for the mute implies days.",
                    type: ArgumentType.String,
                    prettyType: "String",
                    required: true,
                    example: ["3h10m", "10w10h8d-1m"]
                },
                {
                    displayName: "Reason",
                    argName: "reason",
                    desc: "The reason for this mute.",
                    type: ArgumentType.String,
                    prettyType: "String",
                    required: true,
                    example: ["For being bad."]
                }
            ],
            commandCooldown: 3 * 1000,
            guildOnly: true,
            botOwnerOnly: false
        };

        super(cmi);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        await ctx.interaction.deferReply();
        const mStr = ctx.interaction.options.getString("member", true);
        const resMember = await UserManager.resolveMember(ctx.guild!, mStr);
        if (!(await preCheckPunishment(ctx.interaction, ctx.member!, resMember))) {
            return -1;
        }

        let durationStr = ctx.interaction.options.getString("duration", false);
        if (durationStr === "-1") durationStr = null;

        LOGGER.info(`Issuing mute for ${resMember?.member.displayName} of duration ${durationStr}`);

        const parsedDuration = durationStr ? TimeUtilities.parseTimeUnit(durationStr) : null;

        const reason = ctx.interaction.options.getString("reason", true);

        const muteRes = await MuteManager.addMute(resMember!.member, ctx.member!, {
            duration: parsedDuration?.ms ?? -1,
            evidence: [],
            guildDoc: ctx.guildDoc!,
            reason: reason
        });

        if (!muteRes.punishmentResolved) {
            await ctx.interaction.editReply({
                content: Mute.ERROR_NO_MUTE_STR,
            });

            return 0;
        }

        const finalEmbed = MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
            .setTitle("Mute Issued.")
            .setDescription(`You have issued a mute to ${resMember!.member} (${resMember!.member.displayName}).`)
            .addField("Reason", StringUtil.codifyString(reason))
            .addField("Duration", StringUtil.codifyString(parsedDuration?.formatted ?? "Indefinite"))
            .setTimestamp();

        if (muteRes.punishmentLogged)
            finalEmbed.addField("Moderation ID", StringUtil.codifyString(muteRes.moderationId!));
        else {
            finalEmbed.addField(
                "Warning",
                "Something went wrong when trying to save this punishment into the user's punishment history. The"
                + " user is still muted, though."
            );
        }


        await ctx.interaction.editReply({
            embeds: [finalEmbed]
        });

        return 0;
    }
}