import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {UserManager} from "../../managers/UserManager";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {MongoManager} from "../../managers/MongoManager";
import {MessageSelectMenu, TextChannel} from "discord.js";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {QuotaManager} from "../../managers/QuotaManager";
import {ButtonConstants} from "../../constants/ButtonConstants";

export class ManualVerifySection extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "MANUAL_VERIFY_SECTION",
            formalCommandName: "Manual Verify (Other Sections)",
            botCommandName: "manualverifysection",
            description: "Manually verifies a person in any non-Main section.",
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
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to manual verify.",
                    type: ArgumentType.String,
                    prettyType: "Member Resolvable (ID, Mention, IGN)",
                    required: true,
                    example: ["@Console#8939", "123313141413155", "Darkmattr"]
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
        const mStr = ctx.interaction.options.getString("member", true);
        const resMember = await UserManager.resolveMember(ctx.guild!, mStr);
        if (!resMember) {
            await ctx.interaction.reply({
                content: "This member could not be resolved. Please try again.",
                ephemeral: true
            });

            return 0;
        }

        // If the member verified, no need to do it again.
        if (!GuildFgrUtilities.memberHasCachedRole(resMember.member, ctx.guildDoc!.roles.verifiedRoleId)) {
            await ctx.interaction.reply({
                content: `${resMember.member} is not verified in the Main section yet. This person needs to be verified`
                    + " in the Main section first. Run `/manualverifymain` if needed",
                ephemeral: true
            });

            return -1;
        }

        // Otherwise, let them decide what section
        const possSections = ctx.guildDoc!.guildSections
            .filter(x => {
                return GuildFgrUtilities.hasCachedRole(ctx.guild!, x.roles.verifiedRoleId)
                    && !GuildFgrUtilities.memberHasCachedRole(resMember.member, x.roles.verifiedRoleId);
            });

        if (possSections.length === 0) {
            await ctx.interaction.reply({
                content: "This member already has all possible section roles!",
                ephemeral: true
            });

            return 0;
        }

        const m = await GlobalFgrUtilities.sendMsg(ctx.channel, {
            content: `You are about to manually verify: ${resMember.member}. Select __one__ section to manually verify`
                + " this person in. If you don't want to manually verify this person, press the **Cancel** button.",
            components: AdvancedCollector.getActionRowsFromComponents([
                new MessageSelectMenu()
                    .setMinValues(1)
                    .setMaxValues(1)
                    .setCustomId("c")
                    .setOptions(possSections.map(x => {
                        return {
                            value: x.roles.verifiedRoleId,
                            label: x.sectionName
                        };
                    })),
                ButtonConstants.CANCEL_BUTTON
            ])
        });

        if (!m) {
            await ctx.interaction.reply({
                content: "Something went wrong when trying to send the message to manually verify this person. Does"
                    + " the bot have permission to send messages in this channel?",
                ephemeral: true
            });

            return -1;
        }

        await ctx.interaction.reply({
            content: "Please see the message that was just sent.",
            ephemeral: true
        });

        const selectedOption = await AdvancedCollector.startInteractionCollector({
            targetChannel: ctx.channel,
            acknowledgeImmediately: true,
            duration: 30 * 1000,
            targetAuthor: ctx.user,
            oldMsg: m,
            deleteBaseMsgAfterComplete: false,
            clearInteractionsAfterComplete: false
        });

        if (!selectedOption) {
            await m.edit({
                content: "The prompt timed out. If you want to try again, run the command again.",
                components: []
            });

            return -1;
        }

        if (!selectedOption.isSelectMenu()) {
            await m.edit({
                content: "This prompt has been canceled",
                components: []
            });

            return 0;
        }

        const section = possSections.find(x => x.roles.verifiedRoleId === selectedOption.values[0])!;
        const secVerifSuccessChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            ctx.guild!,
            section.channels.loggingChannels.find(x => x.key === "VerifySuccess")?.value ?? ""
        );

        const secVerifEmbed = MessageUtilities.generateBlankEmbed(ctx.guild!, "GREEN")
            .setTitle(`**${ctx.guild!.name}**: ${section.sectionName} Section Manual Verification Successful`)
            .setTimestamp();
        if (section.otherMajorConfig.verificationProperties.verificationSuccessMessage) {
            secVerifEmbed.setDescription(
                section.otherMajorConfig.verificationProperties.verificationSuccessMessage
            );
        }
        else {
            secVerifEmbed.setDescription(
                "You have successfully been verified in this server or section. Please make sure to read the"
                + " applicable rules/guidelines. If you have any questions, please message a staff member."
                + " Thanks!"
            );
        }

        await GlobalFgrUtilities.sendMsg(resMember.member, {embeds: [secVerifEmbed]});

        await GlobalFgrUtilities.tryExecuteAsync(async () => {
            await resMember.member.roles.add(section.roles.verifiedRoleId);
        });

        await secVerifSuccessChannel?.send({
            content: `[${section.sectionName}] ${resMember.member} has been manually verified by ${ctx.user}.`
        });

        const sVerifyEntry = ctx.guildDoc!.manualVerificationEntries
            .find(x => x.userId === resMember.member.id && x.sectionId === section.uniqueIdentifier);
        if (sVerifyEntry) {
            await MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
                $pull: {
                    manualVerificationEntries: {
                        sectionId: section.uniqueIdentifier,
                        userId: resMember.member.id
                    }
                }
            });

            const channel = GuildFgrUtilities.getCachedChannel(ctx.guild!, sVerifyEntry.manualVerifyChannelId);
            if (channel) {
                const sVerifyMsg = await GuildFgrUtilities.fetchMessage(channel, sVerifyEntry.manualVerifyMsgId);
                if (sVerifyMsg) {
                    await GlobalFgrUtilities.tryExecuteAsync(() => {
                        return sVerifyMsg.delete();
                    });
                }
            }
        }

        await m.edit({
            content: `${resMember.member} has been manually verified in the ${section.sectionName} section.`,
            components: []
        });

        const bestQuotaRole = QuotaManager.findBestQuotaToAdd(ctx.member!, ctx.guildDoc!, "ManualVerify");
        if (bestQuotaRole) {
            await QuotaManager.logQuota(ctx.member!, bestQuotaRole, "ManualVerify", 1);
        }

        return 0;
    }
}