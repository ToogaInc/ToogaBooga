import { ArgumentType, BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { IResolvedMember, UserManager } from "../../managers/UserManager";
import { LoggerManager } from "../../managers/LoggerManager";
import { MessageUtilities } from "../../utilities/MessageUtilities";
import { ArrayUtilities } from "../../utilities/ArrayUtilities";
import { Collection } from "discord.js";
import { EmojiConstants } from "../../constants/EmojiConstants";
import DungeonLedType = LoggerManager.DungeonLedType;
import DungeonRanType = LoggerManager.DungeonRunType;

export class Stats extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "STATS_COMMAND",
            formalCommandName: "Stats Command",
            botCommandName: "stats",
            description: "Gets stats for a member, defaulting to yourself.",
            commandCooldown: 5 * 1000,
            generalPermissions: [],
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to look up.  If no member is specified, this will get your stats.",
                    type: ArgumentType.String,
                    prettyType: "Member Resolvable (ID, Mention, IGN)",
                    required: false,
                    example: ["@Console#8939", "123313141413155", "Darkmattr"]
                },
                {
                    displayName: "Show All",
                    argName: "show_all",
                    desc: "Whether to show total statistics across all servers. Default is false.",
                    type: ArgumentType.Boolean,
                    prettyType: "Boolean",
                    required: false,
                    example: ["true", "false"]
                }
            ],
            botPermissions: [],
            rolePermissions: [
                "Raider"
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
        const showAll = ctx.interaction.options.getBoolean("show_all", false) ?? false;
        const mStr = ctx.interaction.options.getString("member", false);
        const query = mStr ?? ctx.user.id;
        const resMember = ctx.guild
            ? await UserManager.resolveMember(ctx.guild, query, true)
            : await UserManager.resolveUser(query);
        if (!resMember) {
            await ctx.interaction.reply({
                content: `Something went wrong when trying to find ${query === ctx.user.id ? "your profile" : query}.`
                    + " Perhaps, this person didn't verify with the bot somehow."
            });
            return -1;
        }

        await ctx.interaction.deferReply();
        const user = "member" in resMember
            ? resMember.member.user
            : resMember.user;
        const stats = await LoggerManager.getStats(user, ctx.guild?.id);
        if (!stats) {
            await ctx.interaction.editReply({
                content: query === ctx.user.id
                    ? "You do not have anything logged under your account."
                    : `No stats were found for ${mStr}.`,
                allowedMentions: {
                    users: []
                }
            });
            return -1;
        }

        const embed = MessageUtilities.generateBlankEmbed(user, "RANDOM")
            .setTimestamp()
            .setFooter({ text: "C = Completed; F = Failed; A = Assisted." });

        /**
         * Prettifies the dungeon led statistics, putting it into the embed.
         * @param {DungeonLedType} dungeonsLed Stats on what dungeons this person led.
         */
        const processDungeonsLed = (dungeonsLed: DungeonLedType): void => {
            if (dungeonsLed.size === 0) {
                return;
            }

            const ledInfo: string[] = [];
            for (const [dgn, { completed, failed, assisted }] of dungeonsLed) {
                ledInfo.push(`__${dgn}__: \`${completed} / ${failed} / ${assisted}\``);
            }

            const subsets = ArrayUtilities.breakArrayIntoSubsets(ledInfo, 5);
            for (const subset of subsets) {
                embed.addField("Runs Led (C/F/A)", subset.join("\n"), true);
            }
        };

        /**
         * Prettifies the dungeon ran statistics, putting it into the embed.
         * @param {DungeonRanType} dungeonsRan Stats on what dungeons this person ran.
         */
        const processDungeonsRan = (dungeonsRan: DungeonRanType): void => {
            if (dungeonsRan.size === 0) {
                return;
            }

            const runs: string[] = [];
            for (const [dgn, { completed, failed }] of dungeonsRan) {
                runs.push(`__${dgn}__: \`${completed} / ${failed}\``);
            }

            const subsets = ArrayUtilities.breakArrayIntoSubsets(runs, 5);
            for (const subset of subsets) {
                embed.addField("Runs Done (C/F)", subset.join("\n"), true);
            }
        };

        /**
         * Prettifies the key popped statistics, putting it into the embed.
         * @param {Collection<string, number>} keysPopped Stats on what keys this person popped.
         */
        const processKeys = (keysPopped: Collection<string, number>): void => {
            if (keysPopped.size === 0) {
                return;
            }

            const keys: string[] = [];
            for (const [key, amt] of keysPopped) {
                keys.push(`__${key}__: \`${amt}\``);
            }

            const subsets = ArrayUtilities.breakArrayIntoSubsets(keys, 5);
            for (const subset of subsets) {
                embed.addField("Keys Popped", subset.join("\n"), true);
            }
        };

        const pts = await LoggerManager.getPoints((resMember as IResolvedMember).member);
        let description = `${EmojiConstants.TICKET_EMOJI} Points: ${pts}`;
        if(stats.quotaPoints > 0) description +=`\nQuota Points: ${stats.quotaPoints}`;

        if (ctx.guild && !showAll) {            

            embed.setTitle(`Stats for **${user.tag}** in **${ctx.guild!}**`)
                .setDescription(description);

            const dungeonsLed = stats.dungeonsLed.get(ctx.guild.id);
            if (dungeonsLed) {
                processDungeonsLed(dungeonsLed);
            }

            const dungeonsRan = stats.dungeonRuns.get(ctx.guild.id);
            if (dungeonsRan) {
                processDungeonsRan(dungeonsRan);
            }

            const keysPopped = stats.keyUse.get(ctx.guild.id);
            if (keysPopped) {
                processKeys(keysPopped);
            }
        }
        else {
            embed.setTitle(`Stats for **${user.tag}**`)
                .setDescription("Please note that custom dungeons and keys are not shown here.");

            const dungeonsLed: DungeonLedType = new Collection();
            for (const [, dgnLedMap] of stats.dungeonsLed) {
                for (const [dungeon, { completed, failed, assisted }] of dgnLedMap) {
                    if (!dungeonsLed.has(dungeon)) {
                        dungeonsLed.set(dungeon, { completed: 0, failed: 0, assisted: 0 });
                    }

                    dungeonsLed.get(dungeon)!.completed += completed;
                    dungeonsLed.get(dungeon)!.failed += failed;
                    dungeonsLed.get(dungeon)!.assisted += assisted;
                }
            }

            processDungeonsLed(dungeonsLed);

            const dungeonsRan: DungeonRanType = new Collection();
            for (const [, dgnRanMap] of stats.dungeonRuns) {
                for (const [dungeon, { completed, failed }] of dgnRanMap) {
                    if (!dungeonsRan.has(dungeon)) {
                        dungeonsRan.set(dungeon, { completed: 0, failed: 0 });
                    }

                    dungeonsRan.get(dungeon)!.completed += completed;
                    dungeonsRan.get(dungeon)!.failed += failed;
                }
            }

            processDungeonsRan(dungeonsRan);

            const keysPopped: Collection<string, number> = new Collection<string, number>();
            for (const [, keysPoppedMap] of stats.keyUse) {
                for (const [keyName, amt] of keysPoppedMap) {
                    if (!keysPopped.has(keyName)) {
                        keysPopped.set(keyName, 0);
                    }

                    keysPopped.set(keyName, keysPopped.get(keyName)! + amt);
                }
            }

            processKeys(keysPopped);
        }

        await ctx.interaction.editReply({
            embeds: [embed]
        });
        return 0;
    }
}