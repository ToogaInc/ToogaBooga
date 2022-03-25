import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {UserManager} from "../../managers/UserManager";
import {StringUtil} from "../../utilities/StringUtilities";
import {SuspensionManager} from "../../managers/PunishmentManager";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {MessageSelectMenu, MessageSelectOptionData} from "discord.js";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {preCheckPunishment} from "./common/PunishmentCommon";

export class UnsuspendFromSection extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "UNSUSPEND_FROM_SECTION",
            formalCommandName: "Unsuspend from Section",
            botCommandName: "unsectionsuspend",
            description: "Unsuspends a member from a section, allowing them to re-verify in the section.",
            rolePermissions: ["Security", "Officer", "Moderator", "RaidLeader", "HeadRaidLeader", "VeteranRaidLeader"],
            generalPermissions: [],
            botPermissions: ["MANAGE_ROLES"],
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to unsuspend from a section.",
                    type: ArgumentType.String,
                    prettyType: "Member Resolvable (ID, Mention, IGN)",
                    required: true,
                    example: ["@Console#8939", "123313141413155", "Darkmattr"]
                },
                {
                    displayName: "Reason",
                    argName: "reason",
                    desc: "The reason for this section unsuspension.",
                    type: ArgumentType.String,
                    prettyType: "String",
                    required: true,
                    example: ["For being good."]
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
        if (!(await preCheckPunishment(ctx.interaction, ctx.member!, resMember))) {
            return -1;
        }

        const sections = ctx.guildDoc!.guildSections.filter(sec => {
            // Not suspended in section = nothing to do here
            if (sec.moderation.sectionSuspended.every(susInfo => susInfo.affectedUser.id !== resMember!.member.id)) {
                return false;
            }

            // Has permission = good
            return SuspensionManager.sectionsToManage(ctx.guildDoc!, sec)
                .some(x => GuildFgrUtilities.memberHasCachedRole(ctx.member!, x));
        });

        if (sections.length === 0) {
            await ctx.interaction.editReply({
                content: "It appears that this person is not suspended in any sections.",
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
            content: "Please select the section where you want to unsuspend this person from.",
            components: AdvancedCollector.getActionRowsFromComponents([
                new MessageSelectMenu()
                    .setMaxValues(1)
                    .setMinValues(1)
                    .setCustomId(uId)
                    .addOptions(secSelectOpt.concat({
                        label: "Cancel",
                        description: "Cancel the Section Unsuspension Process",
                        value: "cancel"
                    }))
            ])
        });

        const result = await AdvancedCollector.startInteractionEphemeralCollector({
            targetChannel: ctx.channel!,
            targetAuthor: ctx.user,
            duration: 45 * 1000,
            acknowledgeImmediately: true
        }, uId);

        if (!result || !result.isSelectMenu() || result.values[0] === "cancel") {
            await ctx.interaction.editReply({
                content: "This process has been canceled.",
                components: []
            });

            return 0;
        }

        const sectionPicked = sections.find(x => x.uniqueIdentifier === result.values[0])!;
        const reason = ctx.interaction.options.getString("reason", true);
        const currTime = Date.now();

        const unsuspensionRes = await SuspensionManager.removeSectionSuspension(resMember!.member, ctx.member!, {
            section: sectionPicked,
            evidence: [],
            guildDoc: ctx.guildDoc!,
            reason: reason
        });

        if (!unsuspensionRes.punishmentResolved) {
            await ctx.interaction.editReply({
                content: "Something went wrong when trying to unsuspend this person.",
                components: []
            });

            return 0;
        }

        const finalEmbed = MessageUtilities.generateBlankEmbed(ctx.guild!, "GREEN")
            .setTitle("Section Suspension Removed.")
            .setDescription(`You have unsuspended ${resMember!.member} (${resMember!.member.displayName}) from the`
                + ` section: **\`${sectionPicked.sectionName}\`**`)
            .addField("Reason", StringUtil.codifyString(reason))
            .setTimestamp();

        if (unsuspensionRes.punishmentLogged)
            finalEmbed.addField("Moderation ID", StringUtil.codifyString(unsuspensionRes.moderationId!));
        else {
            finalEmbed.addField(
                "Warning",
                "Something went wrong when trying to save this into the user's punishment history. The user is"
                + " still section unsuspended, though."
            );
        }

        await ctx.interaction.editReply({
            content: null,
            embeds: [finalEmbed],
            components: []
        });

        return 0;
    }
}