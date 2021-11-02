import {BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {SlashCommandBuilder} from "@discordjs/builders";
import {StringUtil} from "../../utilities/StringUtilities";
import {CommonRegex} from "../../constants/CommonRegex";
import generateRandomString = StringUtil.generateRandomString;
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import {MongoManager} from "../../managers/MongoManager";
import {PunishmentManager} from "../../managers/PunishmentManager";
import {User} from "discord.js";

export class UnblacklistMember extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "UNBLACKLIST_MEMBER",
            formalCommandName: "Unblacklist Member",
            botCommandName: "unblacklist",
            description: "Unblacklists a member. If the member was banned, the member will be unbanned.",
            rolePermissions: ["Officer", "Moderator", "HeadRaidLeader"],
            generalPermissions: [],
            botPermissions: [],
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to unblacklist.",
                    type: "String",
                    required: true,
                    example: ["Opre", "MeatRod", "Darkmattr"]
                },
                {
                    displayName: "Reason",
                    argName: "reason",
                    desc: "The reason for this unblacklist.",
                    type: "String",
                    required: true,
                    example: ["Appealed blacklist."]
                }
            ],
            commandCooldown: 3 * 1000,
            usageGuide: ["unblacklist [Member] [Reason]"],
            exampleGuide: ["unblacklist Opre Appealed blacklist successfully."],
            guildOnly: true,
            botOwnerOnly: false
        };

        const scb = new SlashCommandBuilder()
            .setName(cmi.botCommandName)
            .setDescription(cmi.description);
        scb.addStringOption(o => {
            return o
                .setName("member")
                .setDescription("The member to unblacklist. This should be an IGN.")
                .setRequired(true);
        }).addStringOption(o => {
            return o
                .setName("reason")
                .setDescription("The reason for this unblacklist.")
                .setRequired(true);
        });

        super(cmi, scb);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        const mStr = ctx.interaction.options.getString("member", true);
        if (!CommonRegex.ONLY_LETTERS.test(mStr)) {
            await ctx.interaction.reply({
                content: "The name that you specified must only contain letters.",
                ephemeral: true
            });

            return 0;
        }

        const blInfo = ctx.guildDoc!.moderation.blacklistedUsers
            .find(x => x.realmName.lowercaseIgn === mStr.toLowerCase());
        if (!blInfo) {
            await ctx.interaction.reply({
                content: `\`${mStr}\` is not blacklisted.`,
                ephemeral: true
            });

            return 0;
        }

        let userUnbanned: User | null = null;
        if (blInfo.discordId) {
            const banInfo = await GlobalFgrUtilities.tryExecuteAsync(() => {
                return ctx.guild!.bans.fetch({
                    user: blInfo.discordId
                });
            });

            if (banInfo) {
                await ctx.guild!.bans.remove(banInfo.user);
                userUnbanned = banInfo.user;
            }
        }

        const unblacklistId = `Unblacklist_${Date.now()}_${generateRandomString(15)}`;
        const reason = ctx.interaction.options.getString("reason", true);
        const currTime = Date.now();
        await MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
            $pull: {
                "moderation.blacklistedUsers": {
                    actionId: blInfo.actionId
                }
            }
        });

        const logInfo = await PunishmentManager.logPunishment({
            name: blInfo.realmName.ign
        }, "Unblacklist", {
            actionIdToUse: unblacklistId,
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
            .setTitle("Blacklist Removed.")
            .setDescription(`You have un-blacklisted \`${mStr}\`.`)
            .addField("Reason", StringUtil.codifyString(reason))
            .addField(
                "Unbanned?",
                userUnbanned
                    ? `Unbanned: ${userUnbanned}`
                    : StringUtil.codifyString("No")
            )
            .setTimestamp();

        if (!logInfo) {
            finalEmbed.addField(
                "Warning",
                "An error occurred when trying to log this punishment. While the blacklist was successful, it's"
                + " possible that this punishment could not be logged in the user's database."
            );
        }

        await ctx.interaction.reply({
            embeds: [finalEmbed]
        });

        return 0;
    }
}