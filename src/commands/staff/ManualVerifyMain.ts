import {BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {SlashCommandBuilder} from "@discordjs/builders";
import {UserManager} from "../../managers/UserManager";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {MongoManager} from "../../managers/MongoManager";
import {IRealmIgn} from "../../definitions";
import {MessageButton, MessageSelectMenu, TextChannel} from "discord.js";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {Emojis} from "../../constants/Emojis";
import {QuotaManager} from "../../managers/QuotaManager";

export class ManualVerifyMain extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "MANUAL_VERIFY_MAIN",
            formalCommandName: "Manual Verify (Main Section)",
            botCommandName: "manualverifymain",
            description: "Manually verifies a person in the Main section.",
            rolePermissions: [
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
                    type: "Member Resolvable (ID, Mention)",
                    required: true,
                    example: ["@Console#8939", "123313141413155"]
                },
                {
                    displayName: "In-Game Name",
                    argName: "ign",
                    desc: "The in-game name to manually verify this person under.",
                    type: "String",
                    required: true,
                    example: ["Darkmattr"]
                }
            ],
            usageGuide: ["manualverifymain [Member] {IGN}"],
            exampleGuide: ["manualverifymain @Console#8939 ConsoleMC", "manualverifymain 123313141413155"],
            guildOnly: true,
            botOwnerOnly: false
        };

        const scb = new SlashCommandBuilder()
            .setName(cmi.botCommandName)
            .setDescription(cmi.description);
        scb.addStringOption(o => {
            return o
                .setName("member")
                .setDescription("The member to manual verify. This should be a mention or ID (no IGN).")
                .setRequired(true);
        }).addStringOption(o => {
            return o
                .setName("ign")
                .setDescription("The in-game name to manually verify this person under.")
                .setRequired(true);
        });

        super(cmi, scb);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        const mStr = ctx.interaction.options.getString("member", true);
        const resMember = await UserManager.resolveMember(ctx.guild!, mStr, false);
        if (!resMember) {
            await ctx.interaction.reply({
                content: "This member could not be resolved. Please try again.",
                ephemeral: true
            });

            return 0;
        }

        const ign = ctx.interaction.options.getString("ign", false);
        const promises: (Promise<any> | undefined)[] = [];

        // If the member isn't verified at all, don't go further
        if (GuildFgrUtilities.memberHasCachedRole(resMember.member, ctx.guildDoc!.roles.verifiedRoleId)) {
            await ctx.interaction.reply({
                content: "This member is already verified in the Main section. Did you mean to run the"
                    + " `/manualverifysection` command?",
                ephemeral: true
            });

            return -1;
        }

        const verifiedRole = await GuildFgrUtilities.fetchRole(ctx.guild!, ctx.guildDoc!.roles.verifiedRoleId);
        if (!verifiedRole) {
            await ctx.interaction.reply({
                content: "The main section verified role doesn't exist. Please configure this first.",
                ephemeral: true
            });

            return 0;
        }

        let ignToVerifyWith: string = "";
        let useAlreadyVerifiedIgn = false;
        if (ign) {
            ignToVerifyWith = ign;
        }
        else {
            // If no IGN is provided, see if they have any given IGNs.
            const docs = await MongoManager.findIdInIdNameCollection(resMember.member.id);
            if (docs.length === 0) {
                await ctx.interaction.reply({
                    content: "Please provide an in-game name to verify this person as.",
                    ephemeral: true
                });
                return -1;
            }

            const ignToUse = await new Promise<IRealmIgn | null>(async r => {
                if (docs.length === 0 || docs[0].rotmgNames.length === 0) {
                    await ctx.interaction.reply({
                        content: "No IGNs could be found for this person. Please provide an IGN by re-running this"
                            + " command with the IGN as an argument.",
                        ephemeral: true
                    });
                    return r(null);
                }

                if (docs[0].rotmgNames.length === 1) {
                    return r(docs[0].rotmgNames[0]);
                }

                const selectMenu = new MessageSelectMenu()
                    .setCustomId("ign_selector")
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(docs[0].rotmgNames.map(x => {
                        return {
                            label: x.ign,
                            value: x.ign
                        };
                    }));

                const selected = await AdvancedCollector.startInteractionCollector({
                    acknowledgeImmediately: false,
                    clearInteractionsAfterComplete: false,
                    deleteBaseMsgAfterComplete: true,
                    duration: 45 * 1000,
                    msgOptions: {
                        embeds: [
                            MessageUtilities.generateBlankEmbed(ctx.user, "RANDOM")
                                .setTitle("Select IGN")
                                .setDescription(
                                    "Please select an in-game name that you want to manually verify this person"
                                    + " under. If you want to specify a different in-game name, press the **Cancel**"
                                    + " button and re-run this command with the specified IGN as an argument."
                                )
                        ],
                        components: AdvancedCollector.getActionRowsFromComponents([
                            selectMenu,
                            new MessageButton()
                                .setCustomId("cancel")
                                .setLabel("Cancel")
                                .setStyle("DANGER")
                                .setEmoji(Emojis.X_EMOJI)
                        ])
                    },
                    targetAuthor: ctx.user,
                    targetChannel: ctx.channel
                });

                if (!selected) {
                    return null;
                }

                return !selected.isSelectMenu()
                    ? null
                    : selected.values[0];
            });

            if (!ignToUse) {
                return 0;
            }

            ignToVerifyWith = ignToUse.ign;
            useAlreadyVerifiedIgn = true;
        }

        const verifySuccessChannel = GuildFgrUtilities.getCachedChannel<TextChannel>(
            ctx.guild!,
            ctx.guildDoc!.channels.loggingChannels.find(x => x.key === "VerifySuccess")?.value ?? ""
        );

        promises.push(
            GlobalFgrUtilities.tryExecuteAsync(async () => {
                await resMember.member.setNickname(ignToVerifyWith, "Manually verified.");
            }),
            verifySuccessChannel?.send({
                content: `[Main] ${resMember.member} has been manually verified as **\`${ignToVerifyWith}\`** by`
                    + ` ${ctx.user}.`
            })
        );

        if (!useAlreadyVerifiedIgn) {
            promises.push(MongoManager.addIdNameToIdNameCollection(resMember.member));
        }

        const finishedEmbed = MessageUtilities.generateBlankEmbed(ctx.guild!, "GREEN")
            .setTitle(`**${ctx.guild!.name}**: Guild Manual Verification Successful`)
            .setTimestamp();
        if (ctx.guildDoc!.otherMajorConfig.verificationProperties.verificationSuccessMessage) {
            finishedEmbed.setDescription(
                ctx.guildDoc!.otherMajorConfig.verificationProperties.verificationSuccessMessage
            );
        }
        else {
            finishedEmbed.setDescription(
                "You have successfully been verified in this server or section. Please make sure to read the"
                + " applicable rules/guidelines. If you have any questions, please message a staff member."
                + " Thanks!"
            );
        }

        promises.push(
            GlobalFgrUtilities.sendMsg(resMember.member, {embeds: [finishedEmbed]}),
            resMember.member.roles.add(verifiedRole)
        );

        // Finally, remove manual verification entry if it exists
        const mVerifyEntry = ctx.guildDoc!.manualVerificationEntries
            .find(x => x.userId === resMember.member.id && x.sectionId === "MAIN");
        if (mVerifyEntry) {
            promises.push(
                MongoManager.updateAndFetchGuildDoc({guildId: ctx.guild!.id}, {
                    $pull: {
                        manualVerificationEntries: {
                            sectionId: "MAIN",
                            userId: resMember.member.id
                        }
                    }
                })
            );

            const channel = GuildFgrUtilities.getCachedChannel(ctx.guild!, mVerifyEntry.manualVerifyChannelId);
            if (channel) {
                const mVerifyMsg = await GuildFgrUtilities.fetchMessage(channel, mVerifyEntry.manualVerifyMsgId);
                if (mVerifyMsg) {
                    await GlobalFgrUtilities.tryExecuteAsync(() => {
                        return mVerifyMsg.delete();
                    });
                }
            }
        }

        // Finally, log it if possible
        const quotaToLog = QuotaManager.findBestQuotaToAdd(ctx.member!, ctx.guildDoc!, "ManualVerify");
        if (quotaToLog) {
            promises.push(
                QuotaManager.logQuota(ctx.member!, quotaToLog, "ManualVerify", 1)
            );
        }

        await Promise.all(promises);
        await ctx.interaction.reply({
            content: `${resMember.member} has been manually verified in the Main section.`
        });

        return 0;
    }
}