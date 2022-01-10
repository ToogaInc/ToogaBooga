import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {UserManager} from "../../managers/UserManager";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringUtil} from "../../utilities/StringUtilities";
import {CommonRegex} from "../../constants/CommonRegex";
import {MongoManager} from "../../managers/MongoManager";
import {IBlacklistedUser} from "../../definitions";
import {PunishmentManager} from "../../managers/PunishmentManager";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import generateRandomString = StringUtil.generateRandomString;

export class BlacklistMember extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "BLACKLIST_MEMBER",
            formalCommandName: "Blacklist Member",
            botCommandName: "blacklist",
            description: "Blacklists a user from the server. If the user is in the server, he or she will be banned.",
            rolePermissions: ["Officer", "Moderator", "HeadRaidLeader"],
            generalPermissions: [],
            botPermissions: ["BAN_MEMBERS"],
            commandCooldown: 3 * 1000,
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to blacklist.",
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

        const blacklistId = `Blacklist_${Date.now()}_${generateRandomString(15)}`;
        const currTime = Date.now();

        const finalEmbed = MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
            .setTitle("Blacklist Issued.")
            .addField("Reason", StringUtil.codifyString(reason))
            .addField("Moderation ID", StringUtil.codifyString(blacklistId))
            .setTimestamp();

        // No member = we need to assume that mStr is an IGN
        if (!resMember) {
            // If this was an ID or a mention, then we can't resolve it
            // We can blacklist names though
            if (!CommonRegex.ONLY_LETTERS.test(mStr)) {
                await ctx.interaction.editReply({
                    content: "This member could not be resolved. Please try again.",
                });

                return 0;
            }

            const notInGuildBlInfo = ctx.guildDoc!.moderation.blacklistedUsers
                .find(x => x.realmName.lowercaseIgn === mStr.toLowerCase());
            if (notInGuildBlInfo) {
                await ctx.interaction.editReply({
                    content: `\`${mStr}\` is already blacklisted. The moderation ID associated with this blacklist is:`
                        + StringUtil.codifyString(notInGuildBlInfo.actionId),
                });

                return 0;
            }

            const blObj: IBlacklistedUser = {
                actionId: blacklistId,
                evidence: [],
                issuedAt: currTime,
                moderator: {id: ctx.user.id, name: ctx.member!.displayName, tag: ctx.user.tag},
                realmName: {lowercaseIgn: mStr.toLowerCase(), ign: mStr},
                reason: reason,
                discordId: ""
            };

            ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
                $push: {
                    "moderation.blacklistedUsers": blObj
                }
            });

            const res = await PunishmentManager.logPunishment({name: mStr}, "Blacklist", {
                actionIdToUse: blacklistId,
                evidence: [],
                guildDoc: ctx.guildDoc!,
                guild: ctx.guild!,
                issuedTime: currTime,
                section: MongoManager.getMainSection(ctx.guildDoc!),
                moderator: ctx.member!,
                reason: reason,
                sendLogInfo: true,
                sendNoticeToAffectedUser: false
            });

            finalEmbed.setDescription(`\`${mStr}\` has been blacklisted successfully.`);
            if (!res) {
                finalEmbed.addField(
                    "Warning",
                    "An error occurred when trying to log this punishment. While the blacklist was successful, it's"
                    + " possible that this punishment could not be logged in the user's database."
                );
            }

            await ctx.interaction.editReply({
                embeds: [finalEmbed]
            });

            return 0;
        }

        // mStr can still either be one of
        // - Discord ID
        // - Mention
        // - IGN
        // Figure out what we're working with and then get the *IGN*

        let finalIgnToBl: string;
        // IGN = use it
        if (CommonRegex.ONLY_LETTERS.test(mStr))
            finalIgnToBl = mStr;
        // Not IGN, must be either mention or ID
        else if (resMember.idNameDoc && resMember.idNameDoc.rotmgNames.length > 0)
            finalIgnToBl = resMember.idNameDoc.rotmgNames[0].ign;
        // Otherwise, check nickname
        else {
            const possNames = UserManager.getAllNames(resMember.member.displayName);
            if (possNames.length === 0) {
                await ctx.interaction.editReply({
                    content: "This member could not be resolved. Please try again.",
                });

                return 0;
            }

            finalIgnToBl = possNames[0];
        }


        const blInfo = ctx.guildDoc!.moderation.blacklistedUsers
            .find(x => x.realmName.lowercaseIgn === finalIgnToBl.toLowerCase());
        if (blInfo) {
            await ctx.interaction.editReply({
                content: `\`${finalIgnToBl}\` is already blacklisted. The moderation ID associated with this blacklist:`
                    + ` is: ${StringUtil.codifyString(blInfo.actionId)}`,
            });

            return 0;
        }

        const rBlInfo: IBlacklistedUser = {
            actionId: blacklistId,
            evidence: [],
            issuedAt: currTime,
            moderator: {id: ctx.user.id, name: ctx.member!.displayName, tag: ctx.user.tag},
            realmName: {lowercaseIgn: finalIgnToBl.toLowerCase(), ign: finalIgnToBl},
            reason: reason,
            discordId: resMember.member.id
        };

        const [newDoc,] = await Promise.all([
            MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
                $push: {
                    "moderation.blacklistedUsers": rBlInfo
                }
            }),
            GlobalFgrUtilities.tryExecuteAsync(async () => {
                await resMember.member.ban({
                    reason: `Blacklisted. Reason: ${reason}`
                });
            })
        ]);

        ctx.guildDoc = newDoc;
        const logInfo = await PunishmentManager.logPunishment({name: finalIgnToBl}, "Blacklist", {
            actionIdToUse: blacklistId,
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

        finalEmbed.setDescription(`\`${finalIgnToBl}\` has been blacklisted successfully.`);
        if (!logInfo) {
            finalEmbed.addField(
                "Warning",
                "An error occurred when trying to log this punishment. While the blacklist was successful, it's"
                + " possible that this punishment could not be logged in the user's database."
            );
        }

        await ctx.interaction.editReply({
            embeds: [finalEmbed]
        });

        return 0;
    }
}