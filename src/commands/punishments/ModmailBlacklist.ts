import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {UserManager} from "../../managers/UserManager";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringUtil} from "../../utilities/StringUtilities";
import {MongoManager} from "../../managers/MongoManager";
import {IBlacklistedModmailUser} from "../../definitions";
import {PunishmentManager} from "../../managers/PunishmentManager";
import generateRandomString = StringUtil.generateRandomString;

export class ModmailBlacklist extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "MODMAIL_BLACKLIST_COMMAND",
            formalCommandName: "Modmail Blacklist Command",
            botCommandName: "modmailblacklist",
            description: "Blacklists a user from using modmail.",
            rolePermissions: ["Security", "Officer", "Moderator", "HeadRaidLeader"],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 3 * 1000,
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to blacklist from modmail.",
                    type: ArgumentType.String,
                    prettyType: "Member Resolvable (ID, Mention, IGN)",
                    required: true,
                    example: ["@Console#8939", "123313141413155", "Darkmattr"]
                },
                {
                    displayName: "Reason",
                    argName: "reason",
                    desc: "The reason for this blacklist.",
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
        const mStr = ctx.interaction.options.getString("member", true);
        const resMember = await UserManager.resolveMember(ctx.guild!, mStr);
        const reason = ctx.interaction.options.getString("reason", true);
        if (!resMember) {
            await ctx.interaction.editReply({
                content: `${mStr} is not in the server.`
            });

            return 0;
        }

        const id = resMember.member.id;

        const blInfo = ctx.guildDoc!.moderation.blacklistedModmailUsers
            .find(x => x.affectedUser.id === id);
        if (blInfo) {
            await ctx.interaction.editReply({
                content: `Member with ID \`${id}\` is already blacklisted from modmail. The moderation ID associated`
                    + ` with this modmail blacklist is: ${StringUtil.codifyString(blInfo.actionId)}`,
            });

            return 0;
        }

        const modmaiLBlacklistId = `ModmailBlacklist_${Date.now()}_${generateRandomString(15)}`;
        const currTime = Date.now();
        const rBlInfo: IBlacklistedModmailUser = {
            actionId: modmaiLBlacklistId,
            evidence: [],
            issuedAt: currTime,
            moderator: {id: ctx.user.id, name: ctx.member!.displayName, tag: ctx.user.tag},
            reason: reason,
            affectedUser: {
                id,
                tag: resMember.member.user.tag,
                name: resMember.member.displayName
            }
        };

        ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
            $push: {
                "moderation.blacklistedModmailUsers": rBlInfo
            }
        });
        const logInfo = await PunishmentManager.logPunishment(resMember.member, "ModmailBlacklist", {
            actionIdToUse: modmaiLBlacklistId,
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

        const finalEmbed = MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
            .setTitle("Modmail Blacklist Issued.")
            .addField("Reason", StringUtil.codifyString(reason))
            .addField("Moderation ID", StringUtil.codifyString(modmaiLBlacklistId))
            .setTimestamp()
            .setDescription(`Member with ID \`${id}\` (${resMember.member}) has been blacklisted from modmail`
                + " successfully.");
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