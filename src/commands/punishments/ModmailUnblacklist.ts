import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {StringUtil} from "../../utilities/StringUtilities";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {MongoManager} from "../../managers/MongoManager";
import {PunishmentManager} from "../../managers/PunishmentManager";
import {UserManager} from "../../managers/UserManager";

export class ModmailUnblacklist extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "MODMAIL_UNBLACKLIST_COMMAND",
            formalCommandName: "Modmail Unblacklist Command",
            botCommandName: "modmailunblacklist",
            description: "Unblacklists a member from using modmail.",
            rolePermissions: ["Security", "Officer", "Moderator", "HeadRaidLeader"],
            generalPermissions: [],
            botPermissions: [],
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to unblacklist from modmail.",
                    type: ArgumentType.String,
                    prettyType: "String",
                    required: true,
                    example: ["Opre", "MeatRod", "Darkmattr"]
                },
                {
                    displayName: "Reason",
                    argName: "reason",
                    desc: "The reason for this modmail unblacklist.",
                    type: ArgumentType.String,
                    prettyType: "String",
                    required: true,
                    example: ["Appealed blacklist."]
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
        if (!resMember) {
            await ctx.interaction.editReply({
                content: `${mStr} is not in the server.`
            });

            return 0;
        }

        const id = resMember.member.id;
        const blInfo = ctx.guildDoc!.moderation.blacklistedModmailUsers
            .find(x => x.affectedUser.id === id);
        if (!blInfo) {
            await ctx.interaction.editReply({
                content: `Member with ID \`${id}\` is not blacklisted.`,
            });

            return 0;
        }

        const reason = ctx.interaction.options.getString("reason", true);
        const currTime = Date.now();
        await MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
            $pull: {
                "moderation.blacklistedModmailUsers": {
                    actionId: blInfo.actionId
                }
            }
        });

        const logInfo = await PunishmentManager.logPunishment(resMember.member, "ModmailUnblacklist", {
            actionIdToResolve: blInfo.actionId,
            evidence: [],
            guild: ctx.guild!,
            guildDoc: ctx.guildDoc!,
            issuedTime: currTime,
            moderator: ctx.member!,
            reason: reason,
            section: MongoManager.getMainSection(ctx.guildDoc!),
            sendLogInfo: true,
            sendNoticeToAffectedUser: false
        });

        const finalEmbed = MessageUtilities.generateBlankEmbed(ctx.guild!, "GREEN")
            .setTitle("Modmail Blacklist Removed.")
            .setDescription(`Member with ID \`${id}\` (${resMember.member}) has been unblacklisted from modmail`
                + " successfully.")
            .addField("Reason", StringUtil.codifyString(reason))
            .setTimestamp();

        if (!logInfo) {
            finalEmbed.addField(
                "Warning",
                "An error occurred when trying to log this punishment. While the modmail blacklist was successful, it's"
                + " possible that this punishment could not be logged in the user's database."
            );
        }

        await ctx.interaction.editReply({
            embeds: [finalEmbed]
        });

        return 0;
    }
}