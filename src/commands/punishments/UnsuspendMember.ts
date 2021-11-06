import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {UserManager} from "../../managers/UserManager";
import {StringUtil} from "../../utilities/StringUtilities";
import {SuspensionManager} from "../../managers/PunishmentManager";
import {StringBuilder} from "../../utilities/StringBuilder";
import {MessageUtilities} from "../../utilities/MessageUtilities";

export class UnsuspendMember extends BaseCommand {
    public static readonly ERROR_NO_UNSUSPEND_STR: string = new StringBuilder()
        .append("Something went wrong when trying to unsuspend this person.").appendLine()
        .append("- The person doesn't have the Suspended role.")
        .toString();


    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "UNSUSPEND_MEMBER",
            formalCommandName: "Unsuspend Member",
            botCommandName: "unsuspend",
            description: "Unsuspends a member, giving them full access to the server.",
            rolePermissions: ["Security", "Officer", "Moderator", "RaidLeader", "HeadRaidLeader", "VeteranRaidLeader"],
            generalPermissions: [],
            botPermissions: ["MANAGE_ROLES"],
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to unsuspend.",
                    type: ArgumentType.String,
                    prettyType: "Member Resolvable (ID, Mention, IGN)",
                    required: true,
                    example: ["@Console#8939", "123313141413155", "Darkmattr"]
                },
                {
                    displayName: "Reason",
                    argName: "reason",
                    desc: "The reason for this unsuspension.",
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

        const reason = ctx.interaction.options.getString("reason", true);
        const currTime = Date.now();

        const unsuspensionRes = await SuspensionManager.removeSuspension(resMember.member, ctx.member!, {
            evidence: [],
            guildDoc: ctx.guildDoc!,
            reason: reason
        });

        if (!unsuspensionRes.punishmentResolved) {
            await ctx.interaction.reply({
                content: UnsuspendMember.ERROR_NO_UNSUSPEND_STR,
                ephemeral: true
            });

            return 0;
        }

        const finalEmbed = MessageUtilities.generateBlankEmbed(ctx.guild!, "GREEN")
            .setTitle("Suspension Removed.")
            .setDescription(`You have unsuspended ${resMember.member} (${resMember.member.displayName}).`)
            .addField("Reason", StringUtil.codifyString(reason))
            .setTimestamp();

        if (unsuspensionRes.punishmentLogged)
            finalEmbed.addField("Moderation ID", StringUtil.codifyString(unsuspensionRes.moderationId!));
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