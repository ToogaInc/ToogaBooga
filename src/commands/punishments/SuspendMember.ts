import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {UserManager} from "../../managers/UserManager";
import {TimeUtilities} from "../../utilities/TimeUtilities";
import {SuspensionManager} from "../../managers/PunishmentManager";
import {StringBuilder} from "../../utilities/StringBuilder";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringUtil} from "../../utilities/StringUtilities";
import {preCheckPunishment} from "./common/PunishmentCommon";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import {Logger} from "../../utilities/Logger"

const LOGGER: Logger = new Logger(__filename, false);
export class SuspendMember extends BaseCommand {
    public static readonly ERROR_NO_SUSPEND_STR: string = new StringBuilder()
        .append("Something went wrong when trying to suspend this person.").appendLine()
        .append("- The person already has the suspended role. In this case, manually remove the Suspended role and")
        .append(" then try running the command again.").appendLine()
        .toString();

    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "SUSPEND_MEMBER",
            formalCommandName: "Suspend Member",
            botCommandName: "suspend",
            description: "Suspends a user from the server.",
            rolePermissions: ["Security", "Officer", "Moderator", "RaidLeader", "HeadRaidLeader", "VeteranRaidLeader"],
            generalPermissions: [],
            botPermissions: ["MANAGE_ROLES"],
            commandCooldown: 3 * 1000,
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to suspend.",
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
                        + " implies an indefinite suspension. Not specifying the time unit implies days.",
                    type: ArgumentType.String,
                    prettyType: "String",
                    required: true,
                    example: ["3h10m", "10w10h8d-1m"]
                },
                {
                    displayName: "Reason",
                    argName: "reason",
                    desc: "The reason for this suspension.",
                    type: ArgumentType.String,
                    prettyType: "String",
                    required: true,
                    example: ["For being bad."]
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
        await ctx.interaction.deferReply();
        const memberStr = ctx.interaction.options.getString("member", true);
        const resMember = await UserManager.resolveMember(ctx.guild!, memberStr);

        if (!(await preCheckPunishment(ctx.interaction, ctx.member!, resMember))) {
            return -1;
        }

        let durationStr = ctx.interaction.options.getString("duration", false);
        if(durationStr === "-1") durationStr = null;
        
        LOGGER.info(`Issuing suspension for ${resMember?.member.displayName} of duration ${durationStr}`);

        const parsedDuration = durationStr ? TimeUtilities.parseTimeUnit(durationStr) : null;

        const reason = ctx.interaction.options.getString("reason", true);

        const susRes = await SuspensionManager.tryAddSuspension(resMember!.member, ctx.member!, {
            duration: parsedDuration?.ms ?? -1,
            evidence: [],
            guildDoc: ctx.guildDoc!,
            reason: reason
        });

        if (!susRes.punishmentResolved) {
            await ctx.interaction.editReply({
                content: SuspendMember.ERROR_NO_SUSPEND_STR,
            });

            return 0;
        }

        const embed = MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
            .setTitle("Suspension Issued.")
            .setDescription(`${resMember!.member} has been suspended successfully.`)
            .addField("Reason", StringUtil.codifyString(reason))
            .addField("Duration", StringUtil.codifyString(parsedDuration?.formatted ?? "Indefinite"))
            .setTimestamp();

        if (susRes.punishmentLogged)
            embed.addField("Moderation ID", StringUtil.codifyString(susRes.moderationId!));
        else {
            embed.addField(
                "Warning",
                "Something went wrong when trying to save this punishment into the user's punishment history. The"
                + " user is still suspended, though."
            );
        }

        if (resMember?.member.voice) {
            await GlobalFgrUtilities.tryExecuteAsync(async () => {
                await resMember.member.voice.disconnect("Suspended.");
            });
        }

        await ctx.interaction.editReply({
            embeds: [embed]
        });

        return 0;
    }
}