import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {UserManager} from "../../managers/UserManager";
import {StringUtil} from "../../utilities/StringUtilities";
import {MuteManager} from "../../managers/PunishmentManager";
import {StringBuilder} from "../../utilities/StringBuilder";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import generateRandomString = StringUtil.generateRandomString;

export class UnmuteMember extends BaseCommand {
    public static readonly ERROR_NO_UNMUTE_STR: string = new StringBuilder()
        .append("Something went wrong when trying to unmute this person.").appendLine()
        .append("- The person doesn't have the Muted role.")
        .toString();


    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "UNMUTE_MEMBER",
            formalCommandName: "Unmute Member",
            botCommandName: "unmute",
            description: "Unmutes a member, allowing the member to send messages and speak in voice channels.",
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
                    desc: "The member to unmute.",
                    type: ArgumentType.String,
                    prettyType: "Member Resolvable (ID, Mention, IGN)",
                    required: true,
                    example: ["@Console#8939", "123313141413155", "Darkmattr"]
                },
                {
                    displayName: "Reason",
                    argName: "reason",
                    desc: "The reason for this unmute.",
                    type: ArgumentType.String,
                    prettyType: "String",
                    required: true,
                    example: ["For being good."]
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
        const mStr = ctx.interaction.options.getString("member", true);
        const resMember = await UserManager.resolveMember(ctx.guild!, mStr);
        if (!resMember) {
            await ctx.interaction.reply({
                content: "This member could not be resolved. Please try again.",
                ephemeral: true
            });

            return 0;
        }

        const unmuteId = `Unmute_${Date.now()}_${generateRandomString(15)}`;
        const reason = ctx.interaction.options.getString("reason", true);
        const currTime = Date.now();

        const unmuteRes = await MuteManager.removeMute(resMember.member, ctx.member!, {
            evidence: [],
            guildDoc: ctx.guildDoc!,
            reason: reason
        });

        if (!unmuteRes.punishmentResolved) {
            await ctx.interaction.reply({
                content: UnmuteMember.ERROR_NO_UNMUTE_STR,
                ephemeral: true
            });

            return 0;
        }

        const finalEmbed = MessageUtilities.generateBlankEmbed(ctx.guild!, "GREEN")
            .setTitle("Unmute Issued.")
            .setDescription(`You have unmuted ${resMember.member} (${resMember.member.displayName}).`)
            .addField("Reason", StringUtil.codifyString(reason))
            .setTimestamp();

        if (unmuteRes.punishmentLogged)
            finalEmbed.addField("Moderation ID", StringUtil.codifyString(unmuteRes.moderationId!));
        else {
            finalEmbed.addField(
                "Warning",
                "Something went wrong when trying to save this into the user's punishment history. The user is"
                + " still unmuted, though."
            );
        }

        await ctx.interaction.reply({
            embeds: [finalEmbed]
        });

        return 0;
    }
}