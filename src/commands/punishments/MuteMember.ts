import {BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {SlashCommandBuilder} from "@discordjs/builders";
import {UserManager} from "../../managers/UserManager";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringUtil} from "../../utilities/StringUtilities";
import generateRandomString = StringUtil.generateRandomString;
import {MuteManager} from "../../managers/PunishmentManager";
import {TimeUtilities} from "../../utilities/TimeUtilities";
import {StringBuilder} from "../../utilities/StringBuilder";

export class MuteMember extends BaseCommand {
    public static readonly ERROR_NO_MUTE_STR: string = new StringBuilder()
        .append("Something went wrong when trying to mute this person.").appendLine()
        .append("- The person already has the muted role. In this case, manually remove the Muted role and")
        .append(" then try running the command again.").appendLine()
        .toString();

    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "MUTE_MEMBER",
            formalCommandName: "Mute Member",
            botCommandName: "mute",
            description: "Mutes a member. He or she will not be able to talk in public voice channels or any text"
                + " channels unless permission is explicitly granted to that person.",
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
            commandCooldown: 3 * 1000,
            usageGuide: ["mute [Member] {Duration} [Reason]"],
            exampleGuide: ["mute @Console#8939 10m For being bad", "mute Darkmattr For being bad"],
            guildOnly: true,
            botOwnerOnly: false
        };

        const scb = new SlashCommandBuilder()
            .setName(cmi.botCommandName)
            .setDescription(cmi.description);
        scb.addStringOption(o => {
            return o
                .setName("member")
                .setDescription("The member to mute. This can either be an ID, IGN, or mention.")
                .setRequired(true);
        }).addStringOption(o => {
            return o
                .setName("duration")
                .setDescription(
                    "The duration. Supported time units are minutes (m), hours (h), days (d), weeks (w). For"
                    + " example, to specify 3 days, use \"3d\" as the duration. Not specifying a duration at all"
                    + " implies an indefinite mute. Not specifying the time unit for the mute implies days."
                )
                .setRequired(false);
        }).addStringOption(o => {
            return o
                .setName("reason")
                .setDescription("The reason for this mute.")
                .setRequired(true);
        });

        super(cmi, scb);
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

        const warningId = `Mute_${Date.now()}_${resMember?.member.id ?? mStr}}_${generateRandomString(10)}`;

        const durationStr = ctx.interaction.options.getString("duration", false);
        const parsedDuration = durationStr ? TimeUtilities.parseTimeUnit(durationStr) : null;

        const reason = ctx.interaction.options.getString("reason", true);
        const currTime = Date.now();

        const muteRes = await MuteManager.addMute(resMember.member, ctx.member!, {
            duration: parsedDuration?.ms ?? -1,
            evidence: [],
            guildDoc: ctx.guildDoc!,
            reason: reason
        });

        if (!muteRes.punishmentResolved) {
            await ctx.interaction.reply({
                content: MuteMember.ERROR_NO_MUTE_STR,
                ephemeral: true
            });

            return 0;
        }

        const finalEmbed = MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
            .setTitle("Mute Issued.")
            .setDescription(`You have issued a mute to ${resMember.member} (${resMember.member.displayName}).`)
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


        await ctx.interaction.reply({
            embeds: [finalEmbed]
        });

        return 0;
    }
}