import {BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {SlashCommandBuilder} from "@discordjs/builders";
import {MongoManager} from "../../managers/MongoManager";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringBuilder} from "../../utilities/StringBuilder";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import {StringUtil} from "../../utilities/StringUtilities";
import {TimeUtilities} from "../../utilities/TimeUtilities";
import {OneLifeBot} from "../../OneLifeBot";

export class FindPunishment extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "FIND_PUNISHMENT",
            formalCommandName: "Find Punishment",
            botCommandName: "findpunishment",
            description: "Finds punishment information given a punishment ID. This command should be used when the"
                + " punishment ID is known.",
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
            usageGuide: ["findpunishment [Punishment ID]"],
            exampleGuide: ["findpunishment 2130idosfhowadf"],
            guildOnly: true,
            botOwnerOnly: false
        };

        const scb = new SlashCommandBuilder()
            .setName(cmi.botCommandName)
            .setDescription(cmi.description);
        scb.addStringOption(o => o
            .setName("moderation_id")
            .setDescription("The moderation ID to lookup.")
            .setRequired(true)
        );

        super(cmi, scb);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        const punishmentId = ctx.interaction.options.getString("moderation_id", true);
        const pInfo = await MongoManager.lookupPunishmentById(punishmentId);
        if (!pInfo) {
            await ctx.interaction.reply({
                content: `The moderation ID, \`${punishmentId}\`, was not found.`
            });
            return 0;
        }

        const [uMention, mMention, mResolvedMention, guild] = await Promise.all([
            GlobalFgrUtilities.fetchUser(pInfo.affectedUser.id),
            GlobalFgrUtilities.fetchUser(pInfo.moderator.id),
            GlobalFgrUtilities.fetchUser(pInfo.resolved?.moderator.id ?? ""),
            GlobalFgrUtilities.fetchGuild(pInfo.guildId)
        ]);

        const embed = MessageUtilities.generateBlankEmbed(ctx.guild!)
            .setTitle(`${pInfo.moderationType} Information: ${pInfo.affectedUser.name}`);

        // Let bot owners see all moderation history regardless of guild, but no one else
        if (pInfo.guildId !== ctx.guild!.id && !OneLifeBot.BotInstance.config.ids.botOwnerIds.includes(ctx.user.id)) {
            embed.setDescription(
                "You do not have permission to view this moderation information because this moderation action was"
                + " performed in a different server."
            );

            await ctx.interaction.reply({
                embeds: [embed]
            });

            return 0;
        }

        // Bot owner can see guild name in footer
        if (OneLifeBot.BotInstance.config.ids.botOwnerIds.includes(ctx.user.id)) {
            embed.setFooter(`Guild Name/ID: ${guild?.name ?? pInfo.guildId}`);
        }

        const punishmentObj = pInfo.resolved?.actionId === punishmentId
            ? pInfo.resolved
            : pInfo;

        const modMentionToUse = pInfo.resolved?.actionId === punishmentId
            ? mResolvedMention
            : mMention;

        embed.setColor(pInfo.resolved?.actionId === punishmentId ? "GREEN" : "RED")
            .setDescription(
            new StringBuilder()
                .append(`__**User Information**__ ${uMention ?? ""}`).appendLine()
                .append(`- User ID: ${punishmentObj.affectedUser.id}`).appendLine()
                .append(`- User Tag: ${punishmentObj.affectedUser.tag}`).appendLine()
                .append(`- User Nickname: ${punishmentObj.affectedUser.name}`).appendLine()
                .appendLine()
                .append(`__**Moderator Information**__ ${modMentionToUse ?? ""}`).appendLine()
                .append(`- Moderator ID: ${punishmentObj.moderator.id}`).appendLine()
                .append(`- Moderator Tag: ${punishmentObj.moderator.tag}`).appendLine()
                .append(`- Moderator Nickname: ${punishmentObj.moderator.name}`).appendLine()
                .toString()
        ).addField(
            "Moderation ID",
            StringUtil.codifyString(punishmentObj.actionId)
        ).addField(
            "Issued At",
            StringUtil.codifyString(`${TimeUtilities.getDateTime(punishmentObj.issuedAt)} GMT`),
            true
        );

        // If this is a punishment, we also include duration, expiration time BEFORE the reason + evidence
        if (pInfo.actionId === punishmentId) {
            if (typeof pInfo.duration !== "undefined") {
                embed.addField(
                    "Duration",
                    StringUtil.codifyString(TimeUtilities.formatDuration(pInfo.duration, false))
                );
            }

            if (typeof pInfo.expiresAt !== "undefined") {
                embed.addField(
                    "Expires At",
                    StringUtil.codifyString(`${TimeUtilities.getDateTime(pInfo.expiresAt)} GMT`)
                );
            }
        }


        embed.addField("Reason", StringUtil.codifyString(punishmentObj.reason));
        if (punishmentObj.evidence.length > 0) {
            let i = 1;
            embed.addField("Evidence", punishmentObj.evidence.map(x => `[Evidence ${i++}](${x})`).join(", "));
        }

        // Include reference to either resolution ID or the original punishment mod ID
        if (pInfo.resolved?.actionId === punishmentId) {
            embed.addField(
                "Original Punishment",
                `The moderation ID of the original punishment is: ${StringUtil.codifyString(pInfo.actionId)}`
            );
        }
        else {
            if (pInfo.resolved) {
                embed.addField(
                    "Punishment Resolved",
                    `The moderation ID of the resolution is: ${StringUtil.codifyString(pInfo.resolved.actionId)}`
                );
            }
            else {
                embed.addField(
                    "Punishment Not Resolved",
                    "This punishment has not been resolved; it is still ongoing."
                );
            }
        }

        await ctx.interaction.reply({
            embeds: [embed]
        });
        return 0;
    }
}