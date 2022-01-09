import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {UserManager} from "../../managers/UserManager";
import {MongoManager} from "../../managers/MongoManager";
import {MessageSelectMenu} from "discord.js";
import {DUNGEON_DATA} from "../../constants/dungeons/DungeonData";
import {ArrayUtilities} from "../../utilities/ArrayUtilities";
import {StringUtil} from "../../utilities/StringUtilities";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringBuilder} from "../../utilities/StringBuilder";
import {LoggerManager} from "../../managers/LoggerManager";
import {QuotaManager} from "../../managers/QuotaManager";
import {QuotaLogType} from "../../definitions/Types";
import {ButtonConstants} from "../../constants/ButtonConstants";

export class LogLedRun extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "LOG_LED_RUN_COMMAND",
            formalCommandName: "Log Led Run(s) Command",
            botCommandName: "logrun",
            description: "Logs one or more runs that a leader led. You can log completions/fails/assists for"
                + " yourself or someone else.",
            commandCooldown: 0,
            generalPermissions: [],
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to log this run for. If no member is specified, this will log for you.",
                    type: ArgumentType.String,
                    prettyType: "Member Resolvable (ID, Mention, IGN)",
                    required: false,
                    example: ["@Console#8939", "123313141413155", "Darkmattr"]
                },
                {
                    displayName: "Completed Runs",
                    argName: "completed",
                    desc: "The number of completed runs. Only HRL/Officer+ can subtract runs.",
                    type: ArgumentType.Integer,
                    prettyType: "Integer",
                    required: false,
                    example: ["5"]
                },
                {
                    displayName: "Failed Runs",
                    argName: "failed",
                    desc: "The number of failed runs. Only HRL/Officer+ can subtract runs.",
                    type: ArgumentType.Integer,
                    prettyType: "Integer",
                    required: false,
                    example: ["5"]
                },
                {
                    displayName: "Assisted Runs",
                    argName: "assisted",
                    desc: "The number of assisted runs. Only HRL/Officer+ can subtract runs.",
                    type: ArgumentType.Integer,
                    prettyType: "Integer",
                    required: false,
                    example: ["5"]
                }
            ],
            botPermissions: [],
            rolePermissions: [
                "RaidLeader",
                "AlmostRaidLeader",
                "HeadRaidLeader",
                "VeteranRaidLeader",
                "Officer",
                "Moderator"
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
        const canRemoveRuns = [
                ctx.guildDoc!.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId,
                ctx.guildDoc!.roles.staffRoles.moderation.officerRoleId,
                ctx.guildDoc!.roles.staffRoles.moderation.moderatorRoleId
            ].some(x => GuildFgrUtilities.memberHasCachedRole(ctx.member!, x))
            || ctx.member!.permissions.has("ADMINISTRATOR");

        const mStr = ctx.interaction.options.getString("member", false);
        let completedRuns = ctx.interaction.options.getInteger("completed", false) ?? 0;
        let assistedRuns = ctx.interaction.options.getInteger("assisted", false) ?? 0;
        let failedRuns = ctx.interaction.options.getInteger("failed", false) ?? 0;

        if (!canRemoveRuns && completedRuns < 0) {
            completedRuns = 0;
        }

        if (!canRemoveRuns && assistedRuns < 0) {
            assistedRuns = 0;
        }

        if (!canRemoveRuns && failedRuns < 0) {
            failedRuns = 0;
        }

        if (completedRuns === 0 && assistedRuns === 0 && failedRuns === 0) {
            await ctx.interaction.reply({
                ephemeral: true,
                content: "You aren't logging anything. In order to use this command, you need to log at least one"
                    + " of: completed runs, assisted runs, or failed runs. **If** you are trying to remove runs, you"
                    + " need to contact someone with the HRL/Officer or higher role."
            });

            return 0;
        }

        let memberToLogAs = ctx.member!;

        // See if there is another member to log as. We also need to make sure
        // there is a database entry available
        const resMember = mStr
            ? await UserManager.resolveMember(ctx.guild!, mStr)
            : null;
        if (resMember) {
            if (!resMember.idNameDoc) {
                await MongoManager.addIdNameToIdNameCollection(resMember.member);
            }

            if (!resMember.userDoc) {
                await MongoManager.getOrCreateUserDoc(resMember.member.id);
            }

            memberToLogAs = resMember.member;
        }
        else {
            await MongoManager.addIdNameToIdNameCollection(memberToLogAs);
            await MongoManager.getOrCreateUserDoc(memberToLogAs.id);
        }

        // Grab all dungeons, ask which one to log
        const allDungeons = DUNGEON_DATA.concat(ctx.guildDoc!.properties.customDungeons);
        const subsets = ArrayUtilities.breakArrayIntoSubsets(
            DUNGEON_DATA.concat(ctx.guildDoc!.properties.customDungeons),
            25
        );

        const selectMenus: MessageSelectMenu[] = [];
        const uniqueId = StringUtil.generateRandomString(20);
        for (let i = 0; i < Math.min(4, subsets.length); i++) {
            selectMenus.push(
                new MessageSelectMenu()
                    .setCustomId(`${uniqueId}_${i}`)
                    .setMaxValues(1)
                    .setMinValues(1)
                    .setOptions(subsets[i].map(y => {
                        return {
                            label: y.dungeonName,
                            description: y.isBuiltIn ? "Built-In" : "Custom",
                            value: y.codeName,
                            emoji: y.portalEmojiId
                        };
                    }))
            );
        }

        await ctx.interaction.reply({
            embeds: [
                MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
                    .setTitle("Manually Logging Runs")
                    .setDescription(
                        new StringBuilder()
                            .append("You are logging the following runs for ")
                            .append(memberToLogAs.id === ctx.user.id ? "yourself" : memberToLogAs.toString())
                            .append(":").appendLine()
                            .append(`- \`${completedRuns}\` Completions.`).appendLine()
                            .append(`- \`${assistedRuns}\` Assists.`).appendLine()
                            .append(`- \`${failedRuns}\` Fails.`)
                            .toString()
                    )
                    .addField(
                        "Confirmation",
                        "If the above is correct, please select the dungeon from the below list to complete this"
                        + " logging process. If you made a mistake, press the **Cancel** button and re-run this"
                        + " command with the proper values."
                    )
            ],
            components: AdvancedCollector.getActionRowsFromComponents([
                ...selectMenus,
                ButtonConstants.CANCEL_BUTTON
            ])
        });

        const selectedDgn = await AdvancedCollector.startInteractionEphemeralCollector({
            targetAuthor: ctx.user,
            acknowledgeImmediately: false,
            targetChannel: ctx.channel,
            duration: 1.5 * 60 * 1000
        }, uniqueId);

        if (!selectedDgn || !selectedDgn.isSelectMenu()) {
            await ctx.interaction.editReply({
                components: [],
                content: "You either did not select a dungeon to log or canceled this process.",
                embeds: []
            });

            return 0;
        }

        const dungeonInfo = allDungeons.find(x => x.codeName === selectedDgn.values[0])!;
        const allRunResTypes: [number, LoggerManager.RunResult, QuotaLogType][] = [
            [completedRuns, LoggerManager.RunResult.Complete, "RunComplete"],
            [failedRuns, LoggerManager.RunResult.Failed, "RunFailed"],
            [assistedRuns, LoggerManager.RunResult.Assist, "RunAssist"]
        ];

        for await (const [ct, runRes, quotaLogId] of allRunResTypes) {
            if (ct === 0) {
                continue;
            }

            await LoggerManager.logDungeonLead(
                memberToLogAs,
                dungeonInfo.codeName,
                runRes,
                ct
            );

            const bestQuotaRole = QuotaManager.findBestQuotaToAdd(
                memberToLogAs,
                ctx.guildDoc!,
                quotaLogId,
                dungeonInfo.codeName
            );

            if (bestQuotaRole) {
                await QuotaManager.logQuota(
                    memberToLogAs,
                    bestQuotaRole,
                    `${quotaLogId}:${dungeonInfo.codeName}`,
                    ct
                );
            }
        }

        await ctx.interaction.editReply({
            components: [],
            content: new StringBuilder()
                .append(`Logging completed! As a reminder, you logged the following \`${dungeonInfo.dungeonName}\``)
                .append("runs for ").append(memberToLogAs.id === ctx.user.id ? "yourself" : memberToLogAs.toString())
                .append(":").appendLine()
                .append(`- \`${completedRuns}\` Completions.`).appendLine()
                .append(`- \`${assistedRuns}\` Assists.`).appendLine()
                .append(`- \`${failedRuns}\` Fails.`)
                .toString(),
            embeds: []
        });

        return 0;
    }
}