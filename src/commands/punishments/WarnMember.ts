import {BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {SlashCommandBuilder} from "@discordjs/builders";
import {UserManager} from "../../managers/UserManager";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringUtil} from "../../utilities/StringUtilities";
import generateRandomString = StringUtil.generateRandomString;
import {MongoManager} from "../../managers/MongoManager";
import {PunishmentManager} from "../../managers/PunishmentManager";

export class WarnMember extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "WARN_MEMBER",
            formalCommandName: "Warn Member",
            botCommandName: "warn",
            description: "Warns a member. He or she will receive a message from the bot with the warning, and the"
                + " warning will be logged in the database.",
            rolePermissions: [
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
            usageGuide: ["warn [Member] [Reason]"],
            exampleGuide: ["warn @Console#8939 For being bad", "warn Darkmattr For being bad"],
            guildOnly: true,
            botOwnerOnly: false
        };

        const scb = new SlashCommandBuilder()
            .setName(cmi.botCommandName)
            .setDescription(cmi.description);
        scb.addStringOption(o => {
            return o
                .setName("member")
                .setDescription("The member to warn. This can either be an ID, IGN, or mention.")
                .setRequired(true);
        }).addStringOption(o => {
            return o
                .setName("reason")
                .setDescription("The reason for this warning.")
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

        const reason = ctx.interaction.options.getString("reason", true);
        const warningId = `Warning_${Date.now()}_${resMember?.member.id ?? mStr}}_${generateRandomString(10)}`;
        const currTime = Date.now();

        const finalEmbed = MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
            .setTitle("Warning.")
            .setDescription(`You have issued a warning to ${resMember.member} (${resMember.member.displayName}).`)
            .addField("Reason", StringUtil.codifyString(reason))
            .addField("Moderation ID", StringUtil.codifyString(reason))
            .setTimestamp();

        const logInfo = await PunishmentManager.logPunishment(resMember.member, "Warn", {
            actionIdToUse: warningId,
            evidence: [],
            guild: ctx.guild!,
            guildDoc: ctx.guildDoc!,
            issuedTime: currTime,
            moderator: ctx.member!,
            reason: reason,
            section: MongoManager.getMainSection(ctx.guildDoc!),
            sendLogInfo: true,
            sendNoticeToAffectedUser: true
        });

        if (!logInfo) {
            finalEmbed.addField(
                "Alert",
                "An error occurred when trying to log this punishment. While the warning was successful, it's"
                + " possible that this punishment could not be logged in the user's database."
            );
        }

        await ctx.interaction.reply({
            embeds: [finalEmbed]
        });

        return 0;
    }
}