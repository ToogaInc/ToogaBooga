import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {BaseMessageComponent, ColorResolvable, GuildMember, MessageEmbed} from "discord.js";
import {UserManager} from "../../managers/UserManager";
import {MongoManager} from "../../managers/MongoManager";
import {IIdNameInfo, IUserInfo} from "../../definitions";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringBuilder} from "../../utilities/StringBuilder";
import {StringUtil} from "../../utilities/StringUtilities";
import {Bot} from "../../Bot";
import {TimeUtilities} from "../../utilities/TimeUtilities";
import {ArrayUtilities} from "../../utilities/ArrayUtilities";
import {EmojiConstants} from "../../constants/EmojiConstants";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import {ButtonConstants} from "../../constants/ButtonConstants";
import getDateTime = TimeUtilities.getDateTime;

export class Find extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "FIND_COMMAND",
            formalCommandName: "Find Command",
            botCommandName: "find",
            description: "Finds a member given their IGN, ID, or Mention.",
            rolePermissions: [
                "Team",
                "Helper",
                "Security",
                "Officer",
                "Moderator",
                "AlmostRaidLeader",
                "RaidLeader",
                "VeteranRaidLeader",
                "HeadRaidLeader"
            ],
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to find.",
                    type: ArgumentType.String,
                    prettyType: "Member Resolvable (ID, Mention, IGN)",
                    required: true,
                    example: ["@Console#8939", "123313141413155", "Darkmattr"]
                },
                {
                    displayName: "Extra Details",
                    argName: "extra_details",
                    desc: "Whether to show extra information, if available. Default is false.",
                    type: ArgumentType.Boolean,
                    prettyType: "Boolean",
                    required: false,
                    example: ["True", "False"]
                }
            ],
            generalPermissions: [],
            botPermissions: [],
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
        const showExtraDetails = ctx.interaction.options.getBoolean("extra_details", false) ?? false;
        const memberStr = ctx.interaction.options.getString("member", true);
        const resMember = await UserManager.resolveMember(ctx.guild!, memberStr);

        await ctx.interaction.deferReply();
        const targetMember: GuildMember | null = resMember?.member ?? null;
        const nameIdRes: IIdNameInfo | null = resMember?.idNameDoc ?? null;

        // Final result
        if (!targetMember) {
            const failEmbed = MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
                .setTitle(`Find Query Failed: **${memberStr}**`)
                .setTimestamp();
            if (nameIdRes) {
                const guilds = Bot.BotInstance.client.guilds.cache
                    .filter(x => x.members.cache.has(nameIdRes!.currentDiscordId));

                failEmbed.setDescription(
                    `**\`${memberStr}\`** could not be found in this server, but has verified with this bot.`
                );

                if (nameIdRes.rotmgNames.length > 0) {
                    failEmbed.addField(
                        "Registered Names",
                        StringUtil.codifyString(nameIdRes.rotmgNames.map(x => `- ${x.ign}`).join("\n"))
                    );
                }

                failEmbed.addField(
                    "Registered Discord ID",
                    StringUtil.codifyString(nameIdRes.currentDiscordId)
                ).addField(
                    "Current Guilds",
                    StringUtil.codifyString(guilds.map(x => `- ${x.name}`).join("\n"))
                );
            }
            else {
                failEmbed.setDescription(`**\`${memberStr}\`** was not found in this server.`);
            }

            await ctx.interaction.editReply({
                embeds: [failEmbed]
            });
            return 0;
        }

        // Member found
        const [userNameIds, userDoc]: [IIdNameInfo[], IUserInfo | null] = await Promise.all([
            MongoManager.findIdInIdNameCollection(targetMember.id),
            MongoManager.getUserCollection().findOne({discordId: targetMember.id})
        ]);

        if (userNameIds.length > 1) {
            console.warn(`${targetMember.id} - ${userNameIds.length}`);
        }

        const warnDisplay = userNameIds.length > 0
            ? userNameIds[0].rotmgNames.length === 0
                ? "`" + EmojiConstants.WARNING_EMOJI + "`"
                : ""
            : "";

        const basicDisplay = new StringBuilder();
        let successEmbed: MessageEmbed;
        if (showExtraDetails) {
            successEmbed = MessageUtilities.generateBlankEmbed(targetMember, "GREEN")
                .setTitle(`Find Query Success: **${memberStr}**`)
                .setTimestamp()
                .setThumbnail(targetMember.user.displayAvatarURL())
                .setDescription(
                    new StringBuilder()
                        .append("__Basic Profile Information__").appendLine()
                        .append(`- ID: ${targetMember.id}`).appendLine()
                        .append(`- Tag: ${targetMember.user.tag}`).appendLine()
                        .append(`- Mention: ${targetMember}`).appendLine()
                        .append(`- In ID Database: ${userNameIds.length > 0 ? "Yes" : "No"} ${warnDisplay}`)
                        .appendLine()
                        .append(`- In User Database: ${userDoc ? "Yes" : "No"}`).appendLine()
                        .toString()
                );
        }
        else {
            const baseIgns = UserManager.getAllNames(targetMember.displayName);
            if (baseIgns.length === 0) {
                baseIgns.push(...userNameIds[0].rotmgNames.map(x => x.ign));
            }

            successEmbed = MessageUtilities.generateBlankEmbed(targetMember, "GREEN")
                .setTitle(`Find Query Success: **${memberStr}**`)
                .setTimestamp()
                .setDescription(
                    `Found ${targetMember} with IGN(s): \`[${baseIgns.join(", ")}]\``
                );

            basicDisplay.append(`Found ${targetMember} with IGN(s): \`[${baseIgns.join(", ")}]\``)
                .appendLine();
        }


        if (userNameIds.length > 0 && showExtraDetails) {
            const id = userNameIds[0];
            successEmbed.addField(
                "ID Information",
                new StringBuilder()
                    .append(`Past Name(s): \`${id.pastRealmNames.length}\``).appendLine()
                    .append(`Past ID(s): \`${id.pastDiscordIds.length}\``).appendLine()
                    .append(`Connected ID: \`${id.currentDiscordId}\``).appendLine()
                    .append(`Connected Name(s): ${StringUtil.codifyString(
                        `[${id.rotmgNames.map(x => x.ign).join(", ")}]`
                    )}`).toString()
            );

            const pNamesDisplay = ArrayUtilities.breakArrayIntoSubsets(
                id.pastRealmNames.map(x => `- \`${x.ign}\` (To ${getDateTime(x.toDate)} GMT)`),
                5
            );

            const pIdDisplay = ArrayUtilities.breakArrayIntoSubsets(
                id.pastDiscordIds.map(x => `- \`${x.oldId}\` (To ${getDateTime(x.toDate)} GMT)`),
                5
            );

            for (const pastName of pNamesDisplay) {
                successEmbed.addField("Past Name(s)", pastName.join("\n"), true);
            }

            for (const pastId of pIdDisplay) {
                successEmbed.addField("Past ID(s)", pastId.join("\n"), true);
            }
        }

        successEmbed.addField(
            "Highest Role",
            targetMember.roles.highest.toString(),
            true
        ).addField(
            "Voice Channel",
            targetMember.voice.channel?.toString() ?? "None",
            true
        );

        if (showExtraDetails) {
            successEmbed.addField(
                "Joined Server",
                StringUtil.codifyString(
                    targetMember.joinedTimestamp
                        ? `${TimeUtilities.getDateTime(targetMember.joinedTimestamp)} GMT`
                        : "N/A"
                )
            ).addField(
                "Joined Discord",
                StringUtil.codifyString(TimeUtilities.getDateTime(targetMember.user.createdTimestamp))
            );
        }

        if (userDoc) {
            const gNote = userDoc.details.guildNotes.find(x => x.key === ctx.guild!.id);
            const suspendInfo = ctx.guildDoc!.moderation.suspendedUsers
                .find(x => x.affectedUser.id === targetMember!.id);

            if (showExtraDetails) {
                successEmbed.addField(
                    "Suspension Information",
                    StringUtil.codifyString(suspendInfo ? `Yes; Mod. ID: ${suspendInfo.actionId}` : "None.")
                );
            }
            else {
                basicDisplay.append(
                    `Suspended: ${suspendInfo ? EmojiConstants.GREEN_CHECK_EMOJI : EmojiConstants.X_EMOJI}`
                ).appendLine();
            }


            if (!suspendInfo) {
                const sectionsWhereSuspended = ctx.guildDoc!.guildSections
                    .filter(x => x.moderation.sectionSuspended.some(y => y.affectedUser.id === targetMember!.id));
                if (sectionsWhereSuspended.length > 0) {
                    const ssSb = new StringBuilder();
                    let iterations = 0;
                    for (const section of sectionsWhereSuspended) {
                        if (iterations++ > 15) {
                            ssSb.append("...");
                            break;
                        }

                        const susInfo = section.moderation.sectionSuspended
                            .find(x => x.affectedUser.id === targetMember!.id)!;
                        ssSb.append(`- ${section.sectionName}: ${susInfo.actionId}`)
                            .appendLine();
                    }

                    if (showExtraDetails) {
                        successEmbed.addField(
                            "Section Suspension Information",
                            StringUtil.codifyString(ssSb.toString())
                        );
                    }
                    else {
                        basicDisplay.append("Section Suspended: " + EmojiConstants.GREEN_CHECK_EMOJI);
                    }
                }
            }

            if (showExtraDetails) {
                if (gNote) {
                    successEmbed.addField(
                        "Guild Note",
                        StringUtil.codifyString(gNote)
                    );
                }

                if (userDoc.details.universalNotes) {
                    successEmbed.addField(
                        "Universal Note",
                        StringUtil.codifyString(userDoc.details.universalNotes)
                    );
                }
            }
        }

        if (!showExtraDetails) {
            successEmbed.setDescription(basicDisplay.toString());
        }

        if (userDoc && ctx.guildDoc && ctx.guild) {
            const thisGuildPunishmentHist = userDoc.details.moderationHistory.filter(x => x.guildId === ctx.guild!.id);
            if (thisGuildPunishmentHist.length === 0) {
                await ctx.interaction.editReply({
                    embeds: [successEmbed]
                });
                return 0;
            }

            const displayModHist: {
                e: MessageEmbed,
                i: string | null
            }[] = thisGuildPunishmentHist.map((x, i) => {
                let colorToUse: ColorResolvable;
                if (x.moderationType === "Warn") {
                    colorToUse = "YELLOW";
                }
                else {
                    colorToUse = x.resolved ? "GREEN" : "RED";
                }

                let expiresAtDisplay: string = "Indefinite.";
                if (x.expiresAt && x.expiresAt !== -1) {
                    expiresAtDisplay = `${getDateTime(x.expiresAt)} GMT`;
                }

                if (!showExtraDetails) {
                    const desc = new StringBuilder()
                        .append(`Moderator: <@${x.moderator.id}>`).appendLine()
                        .append(
                            `Resolved: ${x.resolved ? EmojiConstants.GREEN_CHECK_EMOJI : EmojiConstants.X_EMOJI}`
                        );

                    const time = new StringBuilder()
                        .append(`Issued: \`${getDateTime(x.issuedAt)} GMT\``).appendLine()
                        .append(
                            x.resolved
                                ? `Resolved: \`${getDateTime(x.resolved.issuedAt)} GMT\``
                                : `Expires At: \`${expiresAtDisplay}\``
                        );

                    return {
                        e: MessageUtilities.generateBlankEmbed(targetMember!, colorToUse)
                            .setTitle(`Log #${i + 1}: ${x.moderationType}`)
                            .setDescription(desc.toString())
                            .addField("Reason", x.reason)
                            .addField("Time", time.toString())
                            .setFooter({text: `Page ${i + 2}/${thisGuildPunishmentHist.length + 1}`}),
                        i: `**\`${x.actionId}\`**`
                    };
                }

                const embed = MessageUtilities.generateBlankEmbed(targetMember!, colorToUse)
                    .setTitle(`Punishment Information: ${x.moderationType}`)
                    .setDescription(
                        new StringBuilder()
                            .append("__**User Information**__").appendLine()
                            .append(`- User Nickname: ${x.affectedUser.name ?? "N/A"}`).appendLine()
                            .append(`- Discord ID: ${x.affectedUser.id ?? "N/A"}`).appendLine()
                            .appendLine()
                            .append("__**Moderator Information**__").appendLine()
                            .append(`- Moderator IGN: ${x.moderator.name}`).appendLine()
                            .append(`- Moderator Tag: ${x.moderator.tag}`).appendLine()
                            .append(`- Moderator ID: ${x.moderator.id}`).appendLine()
                            .toString()
                    )
                    .addField(
                        "Moderation ID",
                        StringUtil.codifyString(x.actionId)
                    )
                    .addField(
                        "Issued At",
                        StringUtil.codifyString(`${getDateTime(x.issuedAt)} GMT`),
                        true
                    )
                    .addField(
                        "Expires At",
                        StringUtil.codifyString(expiresAtDisplay),
                        true
                    )
                    .addField(
                        "Reason",
                        StringUtil.codifyString(x.reason)
                    )
                    .setTimestamp(x.issuedAt);

                if (x.resolved) {
                    const s = StringUtil.codifyString(
                        `${x.resolved.moderator.name ? x.resolved.moderator.name : "N/A"}`
                        + ` (ID ${x.resolved.moderator.id})`
                    );
                    embed.addField(
                        "Punishment Resolution",
                        new StringBuilder()
                            .append(`__Resolved By:__ ${s}`)
                            .append(`__Time:__ ${StringUtil.codifyString(`${getDateTime(x.resolved.issuedAt)} GMT`)}`)
                            .append(`__Resolution Reason:__ ${StringUtil.codifyString(x.resolved.reason)}`)
                            .append(`__Resolution ID:__ ${StringUtil.codifyString(x.resolved.actionId)}`)
                            .toString()
                    );
                }
                else if (x.moderationType !== "Warn") {
                    embed.addField(
                        "Punishment Not Resolved",
                        "This punishment has not been resolved; it is still ongoing."
                    );
                }

                embed.setFooter({
                    text: `Page ${i + 2}/${thisGuildPunishmentHist.length + 1}`
                });
                return {e: embed, i: `**\`${x.actionId}\`**`};
            });

            displayModHist.unshift({
                e: successEmbed.setFooter({text: `Page 1/${thisGuildPunishmentHist.length + 1}`}),
                i: null
            });

            const uniqueId = StringUtil.generateRandomString(20);
            const nextId = uniqueId + "_next";
            const stopId = uniqueId + "_stop";
            const backId = uniqueId + "_back";
            const components: BaseMessageComponent[] = [
                AdvancedCollector.cloneButton(ButtonConstants.PREVIOUS_BUTTON)
                    .setCustomId(backId),
                AdvancedCollector.cloneButton(ButtonConstants.STOP_BUTTON)
                    .setCustomId(stopId),
                AdvancedCollector.cloneButton(ButtonConstants.NEXT_BUTTON)
                    .setCustomId(nextId)
            ];

            await ctx.interaction.editReply({
                embeds: [successEmbed],
                components: AdvancedCollector.getActionRowsFromComponents(components)
            });

            const collector = ctx.channel.createMessageComponentCollector({
                filter: i => i.customId.startsWith(uniqueId) && i.user.id === ctx.user.id,
                time: 3 * 60 * 1000
            });

            let currPage = 0;
            collector.on("collect", async i => {
                await i.deferUpdate();

                switch (i.customId) {
                    case nextId: {
                        currPage++;
                        currPage %= displayModHist.length;
                        break;
                    }
                    case backId: {
                        currPage--;
                        currPage = (currPage + displayModHist.length) % displayModHist.length;
                        break;
                    }
                    case stopId: {
                        collector.stop("stopped");
                        return;
                    }
                }

                await ctx.interaction.editReply({
                    embeds: [displayModHist[currPage].e],
                    content: displayModHist[currPage].i,
                    components: AdvancedCollector.getActionRowsFromComponents(components)
                });
            });

            collector.on("end", async () => {
                // Possible that someone might delete the message before this triggers.
                await GlobalFgrUtilities.tryExecuteAsync(async () => {
                    await ctx.interaction.editReply({
                        embeds: [successEmbed],
                        components: []
                    });
                });
            });

            return 0;
        }

        await ctx.interaction.editReply({
            embeds: [successEmbed]
        });

        return 0;
    }
}