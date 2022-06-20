import { BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { GuildFgrUtilities } from "../../utilities/fetch-get-request/GuildFgrUtilities";
import { MongoManager } from "../../managers/MongoManager";
import { UserManager } from "../../managers/UserManager";
import { MessageUtilities } from "../../utilities/MessageUtilities";
import { StringUtil } from "../../utilities/StringUtilities";
import { StringBuilder } from "../../utilities/StringBuilder";
import { TimeUtilities } from "../../utilities/TimeUtilities";
import { IRealmIgn } from "../../definitions";
import { FindCursor } from "mongodb";
import { MessageEmbed } from "discord.js";

// It might be worth blocking access to the bot while this command is running.
// Or, better yet, making this command bot developer-only
export class ForceSync extends BaseCommand {
    private _isRunning: boolean = false;

    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "FORCE_SYNC_COMMAND",
            formalCommandName: "Force Sync",
            botCommandName: "forcesync",
            description: "Force syncs all members in a server with the database.",
            rolePermissions: [
                "Moderator"
            ],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 2 * 60 ** 2 * 1000,
            argumentInfo: [],
            guildOnly: true,
            botOwnerOnly: false
        };

        super(cmi);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        if (this._isRunning) {
            await ctx.interaction.reply({
                content: "This command is currently in use. Please wait a bit.",
                ephemeral: true
            });

            return -1;
        }

        const memberRole = GuildFgrUtilities.getCachedRole(ctx.guild!, ctx.guildDoc!.roles.verifiedRoleId);
        if (!memberRole) {
            await ctx.interaction.reply({
                content: "No member role defined in this server.",
                ephemeral: true
            });

            return -1;
        }

        this._isRunning = true;

        const embed = MessageUtilities.generateBlankEmbed(ctx.guild!, "RANDOM")
            .setTitle("Preparing to Sync.")
            .setDescription("Fetching all members in this server...")
            .setFooter({ text: "This might take a while, please wait." })
            .setTimestamp();

        await ctx.interaction.reply({
            embeds: [embed]
        });

        const allMembers = (await ctx.guild!.members.fetch()).filter(x => {
            return x.roles.cache.has(memberRole.id) || x.roles.cache.has(ctx.guildDoc!.roles.suspendedRoleId)
                && !!x.nickname;
        }).map(x => {
            return { member: x, names: x.nickname ? UserManager.getAllNames(x.nickname) : [] };
        });

        const allDocs: FindCursor<{
            rotmgNames: IRealmIgn[]
        }> = MongoManager.getIdNameCollection().find({}).project({
            rotmgNames: 1
        });

        let retDocs = 0;
        const ttlDocs = await allDocs.count();
        const namesUsed = new Set<string>();

        const initEmbed = (): MessageEmbed => {
            const rawPercent = retDocs / ttlDocs;
            const roundedPercent = Math.floor(rawPercent * 10000) / 100;
            embed.setDescription(
                new StringBuilder()
                    .append(`Retrieved \`${retDocs} / ${ttlDocs}\` Documents.`).appendLine()
                    .append(StringUtil.getEmojiProgressBar(20, rawPercent)).appendLine()
                    .append(`Percent Completed: \`${roundedPercent}\`%`)
                    .toString()
            );

            return embed;
        };

        const initialInterval = setInterval(async () => {
            await ctx.interaction.editReply({
                embeds: [initEmbed()]
            });
        }, 3 * 1000);

        await ctx.interaction.editReply({
            embeds: [initEmbed()]
        });

        await allDocs.forEach(doc => {
            for (const name of doc.rotmgNames) {
                namesUsed.add(name.lowercaseIgn);
            }

            ++retDocs;
        });

        clearInterval(initialInterval);

        const timeStart = Date.now();
        let added = 0;
        let skipped = 0;
        let numPasses = 1;
        let processed = 0;

        const createEmbed = () => {
            const rawPercent = processed / allMembers.length;
            const roundedPercent = Math.floor(rawPercent * 10000) / 100;
            return MessageUtilities.generateBlankEmbed(ctx.guild!, "RANDOM")
                .setTitle(`Pass **${numPasses}**`)
                .setDescription(
                    new StringBuilder()
                        .append(`Processed \`${processed} / ${allMembers.length}\` Accounts`).appendLine()
                        .append(StringUtil.getEmojiProgressBar(20, rawPercent)).appendLine()
                        .append(`Percent Completed: \`${roundedPercent}\`%`)
                        .toString()
                )
                .addField("Added to DB", StringUtil.codifyString(added), true)
                .addField("Skipped", StringUtil.codifyString(skipped), true)
                .addField("Status", StringUtil.codifyString("Processing..."))
                .setFooter({
                    text: `${namesUsed.size} names & ${ttlDocs} entries originally in database.`
                })
                .setTimestamp();
        };

        const interval = setInterval(async () => {
            await ctx.interaction.editReply({
                embeds: [createEmbed()]
            });
        }, 3 * 1000);

        while (true) {
            await ctx.interaction.editReply({
                content: null,
                embeds: [createEmbed()]
            });

            let promises: Promise<unknown>[] = [];
            let addedAnyDocs = false;
            for await (const obj of allMembers) {
                if (promises.length > 0 && promises.length % 250 === 0) {
                    await Promise.all(promises);
                    added += promises.length;
                    promises = [];
                }

                processed++;
                if (obj.names.length === 0) {
                    if (numPasses === 1) {
                        skipped++;
                    }
                    continue;
                }

                const name = obj.names.shift()!;
                if (namesUsed.has(name.toLowerCase())) {
                    if (numPasses === 1) {
                        skipped++;
                    }
                    continue;
                }

                promises.push(MongoManager.addIdNameToIdNameCollection(obj.member, name));
                namesUsed.add(name);
                addedAnyDocs = true;
            }

            if (promises.length > 0) {
                await Promise.all(promises);
                added += promises.length;
            }

            if (!addedAnyDocs) {
                break;
            }

            numPasses++;
            processed = 0;
        }

        this._isRunning = false;

        clearInterval(interval);
        await ctx.interaction.editReply({
            embeds: [
                MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
                    .setTitle(`Completed **${numPasses}** Pass(es)!`)
                    .setDescription(
                        new StringBuilder()
                            .append(`Processed \`${allMembers.length} / ${allMembers.length}\` Accounts`)
                            .appendLine()
                            .append(StringUtil.getEmojiProgressBar(20, 1))
                            .appendLine()
                            .append("Percent Completed: `100`%")
                            .toString()
                    )
                    .addField("Added to DB", StringUtil.codifyString(added), true)
                    .addField("Skipped", StringUtil.codifyString(skipped), true)
                    .addField("Status", StringUtil.codifyString("Completed!"))
                    .addField("Time Taken", StringUtil.codifyString(
                        TimeUtilities.formatDuration(Date.now() - timeStart, true, false))
                    )
                    .setFooter({
                        text: `${namesUsed.size} names & ${ttlDocs} entries originally in database.`
                    })
                    .setTimestamp()
            ]
        });
        return 0;
    }
}