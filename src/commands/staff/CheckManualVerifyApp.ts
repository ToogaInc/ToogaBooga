import { MessageButton } from "discord.js";
import { EmojiConstants } from "../../constants/EmojiConstants";
import { MongoManager } from "../../managers/MongoManager";
import { VerifyManager } from "../../managers/VerifyManager";
import { AdvancedCollector } from "../../utilities/collectors/AdvancedCollector";
import { GuildFgrUtilities } from "../../utilities/fetch-get-request/GuildFgrUtilities";
import { MessageUtilities } from "../../utilities/MessageUtilities";
import { StringBuilder } from "../../utilities/StringBuilder";
import { StringUtil } from "../../utilities/StringUtilities";
import { TimeUtilities } from "../../utilities/TimeUtilities";
import { BaseCommand, ICommandContext } from "../BaseCommand";

export class CheckManualVerifyApp extends BaseCommand {
    public constructor() {
        super({
            cmdCode: "CHECK_MANUAL_VERIFY_APP",
            formalCommandName: "Check Manual Verification Applications",
            botCommandName: "checkmanualverifapp",
            description: "Checks all manual verification applications.",
            rolePermissions: [
                "Helper",
                "Security",
                "Officer",
                "Moderator",
                "HeadRaidLeader"
            ],
            argumentInfo: [],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 3 * 1000,
            guildOnly: true,
            botOwnerOnly: false,
            allowMultipleExecutionByUser: false,
            guildConcurrencyLimit: 1
        });
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        if (ctx.guildDoc!.manualVerificationEntries.length === 0) {
            await ctx.interaction.reply({
                content: "There are no pending manual verification requests." 
            });

            return 0;
        }

        await ctx.interaction.deferReply();

        const removedUsers = new Set<string>();
        let page = 0;
        for await (const m of ctx.guildDoc!.manualVerificationEntries) {
            ++page;
            let section = ctx.guildDoc!.guildSections.find(x => x.uniqueIdentifier === m.sectionId);
            if (!section) {
                if (m.sectionId !== "MAIN") {
                    continue;
                }
                
                section = MongoManager.getMainSection(ctx.guildDoc!);
            }

            const member = await GuildFgrUtilities.fetchGuildMember(ctx.guild!, m.userId);
            if (!member) {
                if (removedUsers.has(m.userId)) {
                    continue;
                }

                removedUsers.add(m.userId);
                await VerifyManager.removeAllManualVerifAppsForUser(ctx.guild!, m.userId);
                continue;
            }

            const embed = MessageUtilities.generateBlankEmbed(member, "YELLOW")
                .setTitle(`[${section.sectionName}] Manual Verification: **${m.ign}**`)
                .setDescription(
                    new StringBuilder()
                        .append(`The following user tried to verify in the section: **\`${section.sectionName}\`**.`).appendLine()
                        .appendLine()
                        .append("__**Discord Account**__").appendLine()
                        .append(`- Discord Mention: ${member} (${member.id})`).appendLine()
                        .append(`- Discord Tag: ${member.user.tag}`).appendLine()
                        .append(`- Discord Created: ${TimeUtilities.getDiscordTime({ time: member.user.createdTimestamp, style: "F" })}`).appendLine()
                        .appendLine()
                        .append("__**RotMG Account**__").appendLine()
                        .append(`- Account IGN: **\`${m.ign}\`**`).appendLine()
                        .append(`- RealmEye Link: [Here](https://www.realmeye.com/player/${m.ign}).`).appendLine()
                        .toString()
                )
                .setFooter({ text: `Page ${page}/${ctx.guildDoc!.manualVerificationEntries.length}` });
            if (m.url) {
                embed.setImage(m.url);
            }
            
            const baseId = StringUtil.generateRandomString(15);
            const accId = baseId + "accept";
            const rejId = baseId + "reject";
            const skipId = baseId + "skip";
            
            await ctx.interaction.editReply({
                embeds: [embed],
                components: AdvancedCollector.getActionRowsFromComponents([
                    new MessageButton()
                        .setLabel("Accept")
                        .setCustomId(accId)
                        .setEmoji(EmojiConstants.GREEN_CHECK_EMOJI)
                        .setStyle("SUCCESS"),
                    new MessageButton()
                        .setLabel("Deny")
                        .setCustomId(rejId)
                        .setEmoji(EmojiConstants.X_EMOJI)
                        .setStyle("DANGER"),
                    new MessageButton()
                        .setLabel("Skip")
                        .setCustomId(skipId)
                        .setEmoji(EmojiConstants.RIGHT_TRIANGLE_EMOJI)
                        .setStyle("SECONDARY")
                ])
            });

            const res = await AdvancedCollector.startInteractionEphemeralCollector({
                acknowledgeImmediately: true,
                targetChannel: ctx.channel,
                targetAuthor: ctx.user,
                duration: 30 * 1000
            }, baseId);

            if (!res) {
                await ctx.interaction.editReply({
                    embeds: [],
                    content: "This process has been terminated due to inactivity.",
                    components: []
                });

                return -1;
            }

            if (res.customId === skipId) {
                continue;
            }

            VerifyManager.acknowledgeManualVerif(
                m, 
                ctx.member!, 
                res.customId === accId
                    ? VerifyManager.MANUAL_VERIFY_ACCEPT_ID
                    : VerifyManager.MANUAL_VERIFY_DENY_ID
            ).then();
        }

        await ctx.interaction.editReply({
            embeds: [],
            content: "There are no more manual verification requests to process.",
            components: []
        });

        return 0;
    }
}