import {BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {SlashCommandBuilder} from "@discordjs/builders";
import {UserManager} from "../../managers/UserManager";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringUtil} from "../../utilities/StringUtilities";
import {CommonRegex} from "../../constants/CommonRegex";
import generateRandomString = StringUtil.generateRandomString;
import {MongoManager} from "../../managers/MongoManager";
import {IBlacklistedUser} from "../../definitions";
import {PunishmentManager} from "../../managers/PunishmentManager";
import {StringBuilder} from "../../utilities/StringBuilder";

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
            usageGuide: ["blacklist [Member] [Reason]"],
            exampleGuide: ["blacklist @Console#8939 For being bad", "blacklist Darkmattr For being bad"],
            guildOnly: true,
            botOwnerOnly: false
        };

        const scb = new SlashCommandBuilder()
            .setName(cmi.botCommandName)
            .setDescription(cmi.description);
        scb.addStringOption(o => {
            return o
                .setName("member")
                .setDescription("The member to blacklist. This can either be an ID, IGN, or mention.")
                .setRequired(true);
        }).addStringOption(o => {
            return o
                .setName("reason")
                .setDescription("The reason for this blacklist.")
                .setRequired(true);
        });

        super(cmi, scb);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        const mStr = ctx.interaction.options.getString("member", true);
        const blInfo = ctx.guildDoc!.moderation.blacklistedUsers
            .find(x => x.realmName.lowercaseIgn === mStr.toLowerCase());
        if (blInfo) {
            await ctx.interaction.reply({
                content: `\`${mStr}\` is already blacklisted. The moderation ID associated with this blacklist is:`
                    + StringUtil.codifyString(blInfo.actionId),
                ephemeral: true
            });

            return 0;
        }


        const resMember = await UserManager.resolveMember(ctx.guild!, mStr);
        const reason = ctx.interaction.options.getString("reason", true);

        const blacklistId = `Blacklist_${Date.now()}_${resMember?.member.id ?? mStr}}_${generateRandomString(10)}`;
        const currTime = Date.now();

        if (!resMember) {
            // If this was an ID or a mention, then we can't resolve it
            // We can blacklist names though
            if (!CommonRegex.ONLY_LETTERS.test(mStr)) {
                await ctx.interaction.reply({
                    content: "This member could not be resolved. Please try again.",
                    ephemeral: true
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
                guild: ctx.guild!,
                guildDoc: ctx.guildDoc!,
                issuedTime: currTime,
                moderator: ctx.member!,
                nickname: mStr,
                reason: reason,
                section: MongoManager.getMainSection(ctx.guildDoc!),
                sendLogInfo: true,
                sendNoticeToAffectedUser: false
            });

            if (!res) {
                await ctx.interaction.reply({
                    content: "Something went wrong when trying to blacklist this person.",
                    ephemeral: true
                });

                return 0;
            }

            await ctx.interaction.reply({
                embeds: [
                    MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
                        .setTitle("Blacklisted.")
                        .setDescription(`\`${mStr}\` has been blacklisted successfully.`)
                        .addField("Reason", StringUtil.codifyString(reason))
                        .addField("Moderation ID", StringUtil.codifyString(reason))
                        .setTimestamp()
                ]
            });

            return 0;
        }

        const namesToBlacklist: IBlacklistedUser[] = [
            {
                actionId: blacklistId,
                evidence: [],
                issuedAt: currTime,
                moderator: {id: ctx.user.id, name: ctx.member!.displayName, tag: ctx.user.tag},
                realmName: {lowercaseIgn: mStr.toLowerCase(), ign: mStr},
                reason: reason,
                discordId: resMember.member.id
            }
        ];

        const blIds: string[] = [
            blacklistId
        ];

        const lowercaseNameSet = new Set<string>();
        lowercaseNameSet.add(mStr.toLowerCase());
        if (resMember.idNameDoc?.rotmgNames) {
            let num = 1;
            for (const name of resMember.idNameDoc.rotmgNames) {
                if (lowercaseNameSet.has(name.lowercaseIgn))
                    continue;

                if (ctx.guildDoc!.moderation.blacklistedUsers.some(x => x.realmName.lowercaseIgn === name.lowercaseIgn))
                    continue;

                lowercaseNameSet.add(name.lowercaseIgn);

                const thisBlId = blacklistId + "_" + (num++);
                namesToBlacklist.push({
                    actionId: thisBlId,
                    evidence: [],
                    issuedAt: currTime,
                    moderator: {id: ctx.user.id, name: ctx.member!.displayName, tag: ctx.user.tag},
                    realmName: {lowercaseIgn: name.lowercaseIgn, ign: name.ign},
                    reason: reason,
                    discordId: resMember.member.id
                });

                blIds.push(thisBlId);
            }
        }

        ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
            $push: {
                "moderation.blacklistedUsers": namesToBlacklist
            }
        });

        const logInfoStrBuilder = new StringBuilder();

        const mainSec = MongoManager.getMainSection(ctx.guildDoc!);
        for (let i = 0; i < namesToBlacklist.length; i++) {
            const name = namesToBlacklist[i];
            const blId = blIds[i];

            const res = await PunishmentManager.logPunishment({name: mStr}, "Blacklist", {
                actionIdToUse: blId,
                evidence: [],
                guild: ctx.guild!,
                guildDoc: ctx.guildDoc!,
                issuedTime: currTime,
                moderator: ctx.member!,
                nickname: name.realmName.ign,
                reason: reason,
                section: mainSec,
                sendLogInfo: true,
                sendNoticeToAffectedUser: false
            });

            if (!res)
                continue;

            logInfoStrBuilder.append(`- ${name.realmName.ign}: ${blId}`)
                .appendLine();
        }

        await resMember.member.ban({
            reason: `Blacklisted. Reason: ${reason}`
        });

        await ctx.interaction.reply({
            embeds: [
                MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
                    .setTitle("Blacklisted.")
                    .setDescription(`\`${resMember.member}\` has been blacklisted successfully.`)
                    .addField("Reason", StringUtil.codifyString(reason))
                    .addField("Moderation ID", StringUtil.codifyString(reason))
                    .addField("Blacklisted Accounts", logInfoStrBuilder.length() === 0
                        ? "N/A"
                        : logInfoStrBuilder.toString())
                    .setTimestamp()
            ]
        });

        return 0;
    }
}