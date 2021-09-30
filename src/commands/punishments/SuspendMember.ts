import {BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {SlashCommandBuilder} from "@discordjs/builders";
import {UserManager} from "../../managers/UserManager";
import {TimeUtilities} from "../../utilities/TimeUtilities";
import {SuspensionManager} from "../../managers/PunishmentManager";
import {StringBuilder} from "../../utilities/StringBuilder";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringUtil} from "../../utilities/StringUtilities";

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
            usageGuide: ["suspend [Member] {Duration} [Reason]"],
            exampleGuide: ["suspend @Console#8939 For being bad", "suspend @Console#8939 3d For being bad"],
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to suspend.",
                    type: "Member Resolvable (ID, Mention, IGN)",
                    required: true,
                    example: ["@Console#8939", "123313141413155", "Darkmattr"]
                },
                {
                    displayName: "Duration",
                    argName: "duration",
                    desc: "The duration. Supported time units are minutes (m), hours (h), days (d), weeks (w). For"
                        + " example, to specify 3 days, use \"3d\" as the duration. Not specifying a duration at all"
                        + " implies an indefinite suspension. Not specifying the time unit for the mute implies days.",
                    type: "String",
                    required: false,
                    example: ["3h10m", "10w10h8d-1m"]
                },
                {
                    displayName: "Reason",
                    argName: "reason",
                    desc: "The reason for this suspension.",
                    type: "String",
                    required: true,
                    example: ["For being bad."]
                }
            ],
            guildOnly: true,
            botOwnerOnly: false
        };

        const scb = new SlashCommandBuilder()
            .setName(cmi.botCommandName)
            .setDescription(cmi.description);
        scb.addStringOption(o => {
            return o
                .setName("member")
                .setDescription("The member to suspend. This can either be an ID, IGN, or mention.")
                .setRequired(true);
        }).addStringOption(o => {
            return o
                .setName("duration")
                .setDescription(
                    "The duration. Supported time units are minutes (m), hours (h), days (d), weeks (w). For"
                    + " example, to specify 3 days, use \"3d\" as the duration. Not specifying a duration at all"
                    + " implies an indefinite suspension. Not specifying the time unit for the suspension implies days."
                )
                .setRequired(false);
        }).addStringOption(o => {
            return o
                .setName("reason")
                .setDescription("The reason for this suspension.")
                .setRequired(true);
        });

        super(cmi, scb);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        const memberStr = ctx.interaction.options.getString("member", true);
        const resMember = await UserManager.resolveMember(ctx.guild!, memberStr);

        if (!resMember) {
            await ctx.interaction.reply({
                content: "This member could not be resolved. Please try again.",
                ephemeral: true
            });

            return 0;
        }

        const durationStr = ctx.interaction.options.getString("duration", false);
        const parsedDuration = durationStr ? TimeUtilities.parseTimeUnit(durationStr) : null;

        const reason = ctx.interaction.options.getString("reason", true);

        const susRes = await SuspensionManager.tryAddSuspension(resMember.member, ctx.member!, {
            duration: parsedDuration?.ms ?? -1,
            evidence: [],
            guildDoc: ctx.guildDoc!,
            reason: reason
        });

        if (!susRes.punishmentResolved) {
            await ctx.interaction.reply({
                content: SuspendMember.ERROR_NO_SUSPEND_STR,
                ephemeral: true
            });

            return 0;
        }

        const embed = MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
            .setTitle("Suspension Issued.")
            .setDescription(`${resMember.member} has been suspended successfully.`)
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

        await ctx.interaction.reply({
            embeds: [embed]
        });

        return 0;
    }
}