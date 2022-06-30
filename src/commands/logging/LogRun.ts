import { ArgumentType, BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { GuildFgrUtilities } from "../../utilities/fetch-get-request/GuildFgrUtilities";
import { UserManager } from "../../managers/UserManager";
import { MongoManager } from "../../managers/MongoManager";
import { DUNGEON_DATA } from "../../constants/dungeons/DungeonData";
import { StringUtil } from "../../utilities/StringUtilities";
import { AdvancedCollector } from "../../utilities/collectors/AdvancedCollector";
import { MessageUtilities } from "../../utilities/MessageUtilities";
import { StringBuilder } from "../../utilities/StringBuilder";
import { LoggerManager } from "../../managers/LoggerManager";
import { QuotaManager } from "../../managers/QuotaManager";
import { QuotaLogType } from "../../definitions/Types";
import { ButtonConstants } from "../../constants/ButtonConstants";
import { DungeonUtilities } from "../../utilities/DungeonUtilities";

export class LogRun extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "LOG_RUN_COMMAND",
            formalCommandName: "Log Run Command",
            botCommandName: "logrun",
            description: "Logs one or more runs led. You can log completions/fails/assists. Defaults to 1 completed run for yourself.",
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
                },
                {
                    displayName: "Dungeon",
                    argName: "dungeon",
                    desc: "The dungeon to log as a complete/assist/fail.",
                    type: ArgumentType.String,
                    restrictions: {
                        stringChoices: [
                            { name: "o3", value: "ORYX_3" },
                            { name: "shatts", value: "SHATTERS" },
                            { name: "nest", value: "NEST" },
                            { name: "cult", value: "CULTIST_HIDEOUT" },
                            { name: "fungal", value: "FUNGAL_CAVERN" },
                            { name: "void", value: "THE_VOID" },
                        ]
                    },
                    prettyType: "Dungeon name (one word: o3, shatts, nest)",
                    required: false,
                    example: ["o3"]
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
            completedRuns = 1;
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
        const uniqueId = StringUtil.generateRandomString(20);
        await ctx.interaction.reply({
            ephemeral: true,
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
                        "If the above is correct, press the **Continue** button.\n"
                        + "If you made a mistake, press the **Cancel** button and re-run this"
                        + " command with the proper values."
                    )
            ],
            components: AdvancedCollector.getActionRowsFromComponents([
                AdvancedCollector.cloneButton(ButtonConstants.CONTINUE_BUTTON)
                    .setCustomId(`${uniqueId}_${ButtonConstants.CONTINUE_ID}`),
                AdvancedCollector.cloneButton(ButtonConstants.CANCEL_BUTTON)
                    .setCustomId(`${uniqueId}_${ButtonConstants.CANCEL_ID}`),
            ])
        });

        const confirmation = await AdvancedCollector.startInteractionEphemeralCollector({
            targetAuthor: ctx.user,
            acknowledgeImmediately: true,
            targetChannel: ctx.channel,
            duration: 1.5 * 60 * 1000
        }, uniqueId);

        if(!confirmation || confirmation.customId !== `${uniqueId}_${ButtonConstants.CONTINUE_ID}`){
            await ctx.interaction.editReply({
                components: [],
                content: "You either did not select a dungeon to log or canceled this process.",
                embeds: []
            });

            return 0;
        }

        // Grab all dungeons, ask which one to log
        const dungeonInfo = await DungeonUtilities.selectDungeon(ctx, DUNGEON_DATA.concat(ctx.guildDoc!.properties.customDungeons));
        if(!dungeonInfo){
            await ctx.interaction.editReply({
                components: [],
                content: "You either did not select a dungeon to log or canceled this process.",
                embeds: []
            });

            return 0;
        }
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
                .append(`Logging completed! As a reminder, you logged the following \`${dungeonInfo.dungeonName}\` `)
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