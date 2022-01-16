import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {UserManager} from "../../managers/UserManager";
import {TimeUtilities} from "../../utilities/TimeUtilities";
import {SuspensionManager} from "../../managers/PunishmentManager";
import {StringBuilder} from "../../utilities/StringBuilder";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringUtil} from "../../utilities/StringUtilities";
import {MessageSelectMenu, MessageSelectOptionData} from "discord.js";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {SuspendMember} from "./SuspendMember";
import {preCheckPunishment} from "./common/PunishmentCommon";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";

export class SectionSuspendMember extends BaseCommand {
    private static readonly ERROR_NO_SUSPEND_STR: string = new StringBuilder()
        .append("Something went wrong when trying to suspend this person.").appendLine()
        .append("- The person already has the suspended role. In this case, manually remove the Suspended role and")
        .append(" then try running the command again.").appendLine()
        .toString();

    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "SECTION_SUSPEND_MEMBER",
            formalCommandName: "Section Suspend Member",
            botCommandName: "sectionsuspend",
            description: "Suspends a user from a particular section (not the main section).",
            rolePermissions: ["Security", "Officer", "Moderator", "RaidLeader", "HeadRaidLeader", "VeteranRaidLeader"],
            generalPermissions: [],
            botPermissions: ["MANAGE_ROLES"],
            commandCooldown: 3 * 1000,
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to section suspend.",
                    type: ArgumentType.String,
                    prettyType: "Member Resolvable (ID, Mention, IGN)",
                    required: true,
                    example: ["@Console#8939", "123313141413155", "Darkmattr"]
                },
                {
                    displayName: "Duration",
                    argName: "duration",
                    desc: "The duration. Supported time units are minutes (m), hours (h), days (d), weeks (w). For"
                        + " example, to specify 3 days, use \"3d\" as the duration. Not specifying a duration at all"
                        + " implies an indefinite suspension. Not specifying the time unit implies days.",
                    type: ArgumentType.String,
                    prettyType: "String",
                    required: false,
                    example: ["3h10m", "10w10h8d-1m"]
                },
                {
                    displayName: "Reason",
                    argName: "reason",
                    desc: "The reason for this section suspension.",
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
        const memberStr = ctx.interaction.options.getString("member", true);
        const resMember = await UserManager.resolveMember(ctx.guild!, memberStr);

        if (!(await preCheckPunishment(ctx.interaction, ctx.member!, resMember))) {
            return -1;
        }

        const sections = ctx.guildDoc!.guildSections.filter(section => {
            // Already suspended = cannot suspend again
            if (section.moderation.sectionSuspended.some(x => x.affectedUser.id === resMember!.member.id)) {
                return false;
            }

            return SuspensionManager.sectionsToManage(ctx.guildDoc!, section)
                .some(x => GuildFgrUtilities.memberHasCachedRole(ctx.member!, x));
        });

        if (sections.length === 0) {
            await ctx.interaction.editReply({
                content: "You are not able to suspend this user from any sections at this time. Try again later.",
            });

            return 0;
        }

        const secSelectOpt: MessageSelectOptionData[] = sections
            .map(x => {
                const role = GuildFgrUtilities.getCachedRole(ctx.guild!, x.roles.verifiedRoleId);
                return {
                    label: x.sectionName,
                    description: role?.name ?? "No Member Role.",
                    value: x.uniqueIdentifier
                };
            });

        const uId = StringUtil.generateRandomString(30);
        await ctx.interaction.editReply({
            content: "Please select the section where you want to section suspend this person from.",
            components: AdvancedCollector.getActionRowsFromComponents([
                new MessageSelectMenu()
                    .setMaxValues(1)
                    .setMinValues(1)
                    .setCustomId(uId)
                    .addOptions(secSelectOpt.concat({
                        label: "Cancel",
                        description: "Cancel the Section Suspension Process",
                        value: "cancel"
                    }))
            ])
        });

        const result = await AdvancedCollector.startInteractionEphemeralCollector({
            targetChannel: ctx.channel!,
            targetAuthor: ctx.user,
            acknowledgeImmediately: true,
            duration: 60 * 1000
        }, uId);

        if (!result || !result.isSelectMenu() || result.values[0] === "cancel") {
            await ctx.interaction.editReply({
                content: "This process has been canceled.",
                components: []
            });

            return 0;
        }

        const sectionPicked = sections.find(x => x.uniqueIdentifier === result.values[0])!;

        const durationStr = ctx.interaction.options.getString("duration", false);
        const parsedDuration = durationStr ? TimeUtilities.parseTimeUnit(durationStr) : null;

        const reason = ctx.interaction.options.getString("reason", true);

        const susRes = await SuspensionManager.tryAddSectionSuspension(resMember!.member, ctx.member!, {
            duration: parsedDuration?.ms ?? -1,
            evidence: [],
            guildDoc: ctx.guildDoc!,
            reason: reason,
            section: sectionPicked
        });

        if (!susRes.punishmentResolved) {
            await ctx.interaction.editReply({
                content: SuspendMember.ERROR_NO_SUSPEND_STR,
                components: []
            });

            return 0;
        }

        const embed = MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
            .setTitle("Section Suspension Issued.")
            .setDescription(`${resMember!.member} has been suspended from \`${sectionPicked.sectionName}\`.`)
            .addField("Reason", StringUtil.codifyString(reason))
            .addField("Duration", StringUtil.codifyString(parsedDuration?.formatted ?? "Indefinite"))
            .setTimestamp();

        if (susRes.punishmentResolved)
            embed.addField("Moderation ID", StringUtil.codifyString(susRes.moderationId!));
        else {
            embed.addField(
                "Warning",
                "Something went wrong when trying to save this punishment into the user's punishment history. The"
                + " user is still suspended, though."
            );
        }

        const allActiveSecRaids = ctx.guildDoc!.activeRaids
            .filter(x => x.sectionIdentifier === sectionPicked.uniqueIdentifier);
        if (resMember?.member.voice && allActiveSecRaids.some(x => x.vcId === resMember.member.voice.channelId)) {
            await GlobalFgrUtilities.tryExecuteAsync(async () => {
                await resMember.member.voice.disconnect("Section Suspended.");
            });
        }

        await ctx.interaction.editReply({
            content: null,
            embeds: [embed],
            components: []
        });

        return 0;
    }
}