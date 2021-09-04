import {BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {SlashCommandBuilder} from "@discordjs/builders";
import {GuildMember} from "discord.js";
import {UserManager} from "../../managers/UserManager";
import {MongoManager} from "../../managers/MongoManager";
import {IIdNameInfo} from "../../definitions";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringBuilder} from "../../utilities/StringBuilder";
import {StringUtil} from "../../utilities/StringUtilities";
import {OneLifeBot} from "../../OneLifeBot";
import {TimeUtilities} from "../../utilities/TimeUtilities";

export class FindPerson extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo ={
            cmdCode: "FIND_PERSON",
            formalCommandName: "Find Person/User",
            botCommandName: "find",
            description: "Finds a person given their IGN.",
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
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 3 * 1000,
            usageGuide: ["find [IGN]"],
            exampleGuide: ["find MeatRod"],
            guildOnly: true,
            botOwnerOnly: false
        };

        const scb = new SlashCommandBuilder()
            .setName(cmi.botCommandName)
            .setDescription(cmi.description);
        scb.addStringOption(o => o
            .setName("ign")
            .setDescription("The in-game name to lookup.")
            .setRequired(true)
        );

        super(cmi, scb);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        const query = ctx.interaction.options.getString("ign", true);
        let targetMember: GuildMember | null = null;

        // Does the cache have this person?
        const cachedResult = ctx.guild!.members.cache.find(x => {
            return UserManager.getAllNames(x.displayName, true).includes(query.toLowerCase());
        });

        if (cachedResult)
            targetMember = cachedResult;

        // If it doesn't, try searching for this member
        if (!targetMember) {
            // TODO does `search` take case into account here?
            const results = await ctx.guild!.members.search({
                query: query,
                // Bigger limit because this checks both usernames and nicknames, when all we want to check is
                // nicknames
                limit: 10
            });


            if (results.size > 0) {
                for (const [id, member] of results) {
                    const splitName = UserManager.getAllNames(member.displayName);
                    if (splitName.some(x => x.toLowerCase() === query.toLowerCase())) {
                        targetMember = member;
                        break;
                    }
                }
            }
        }

        // If this doesn't work, try searching in the database
        let nameIdRes: IIdNameInfo | null = null;
        if (!targetMember) {
            const dbRes = await MongoManager.findNameInIdNameCollection(query);
            if (dbRes.length > 0) {
                nameIdRes = dbRes[0];
                const member = await ctx.guild!.members.fetch(dbRes[0].currentDiscordId);
                if (member)
                    targetMember = member;
            }
        }

        // Final result
        if (!targetMember) {
            const failEmbed = MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
                .setTitle(`Find Query Failed: **${query}**`)
                .setTimestamp();
            if (nameIdRes) {
                const guilds = OneLifeBot.BotInstance.client.guilds.cache
                    .filter(x => x.members.cache.has(nameIdRes!.currentDiscordId));

                failEmbed.setDescription(
                    `**\`${query}\`** could not be found in this server, but has verified with this bot.`
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
                failEmbed.setDescription(`**\`${query}\`** was not found in this server.`);
            }

            await ctx.interaction.reply({
                embeds: [failEmbed]
            });
            return 0;
        }

        // Member found
        const [userNameId, userDoc] = await Promise.all([
            MongoManager.findIdInIdNameCollection(targetMember.id),
            MongoManager.getUserCollection().findOne({discordId: targetMember.id})
        ]);

        const successEmbed = MessageUtilities.generateBlankEmbed(targetMember, "GREEN")
            .setTitle(`Find Query Success: **${query}**`)
            .setTimestamp()
            .setDescription(
                new StringBuilder()
                    .append(`- ID: ${targetMember.id}`).appendLine()
                    .append(`- Tag: ${targetMember.user.tag}`).appendLine()
                    .append(`- Mention: ${targetMember}`).appendLine()
                    .toString()
            ).addField(
                "Highest Role",
                targetMember.roles.highest.toString(),
                true
            ).addField(
                "Voice Channel",
                targetMember.voice.channel?.toString() ?? "None",
                true
            ).addField(
                "Joined Server",
                StringUtil.codifyString(
                    targetMember.joinedTimestamp
                        ? `${TimeUtilities.getTime(targetMember.joinedTimestamp)} GMT`
                        : "N/A"
                )
            ).addField(
                "Joined Discord",
                StringUtil.codifyString(TimeUtilities.getTime(targetMember.user.createdTimestamp))
            );

        if (userDoc) {
            const gNote = userDoc.details.guildNotes.find(x => x.key === ctx.guild!.id);
            const suspendInfo = ctx.guildDoc!.moderation.suspendedUsers
                .find(x => x.affectedUser.id === targetMember!.id);

            successEmbed.addField(
                "Suspension Information",
                StringUtil.codifyString(suspendInfo ? `Yes; Mod. ID: ${suspendInfo.actionId}` : "No.")
            );

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

                    successEmbed.addField(
                        "Section Suspension Information",
                        StringUtil.codifyString(ssSb.toString())
                    );
                }
            }


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

        await ctx.interaction.reply({
            embeds: [successEmbed]
        });
        return 0;
    }
}