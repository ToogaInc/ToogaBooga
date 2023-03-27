import { MessageSelectMenu } from "discord.js";
import { ArgumentType, BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { MessageUtilities } from "../../utilities/MessageUtilities";
import { StringUtil } from "../../utilities/StringUtilities";
import { ArrayUtilities } from "../../utilities/ArrayUtilities";
import { StringBuilder } from "../../utilities/StringBuilder";
import { AdvancedCollector } from "../../utilities/collectors/AdvancedCollector";
import { QuotaManager } from "../../managers/QuotaManager";
import { RaidInstance } from "../../instances/RaidInstance";
import { IRaidInfo } from "../../definitions";
import { ButtonConstants } from "../../constants/ButtonConstants";

export class ParseVcless extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "PARSE_VCLESS_COMMAND",
            formalCommandName: "Parse Vcless Command",
            botCommandName: "parsevcless",
            description: "Parses a Vc-less raid.",
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
                    displayName: "/who Image",
                    argName: "image",
                    desc: "The /who in the dungeon. Only use images.",
                    type: ArgumentType.Attachment,
                    prettyType: "Attachment",
                    required: true,
                    example: [""]
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
        const image = ctx.interaction.options.getAttachment("image", true);
        if (!image.height) {
            await ctx.interaction.reply({
                content: "Could not find an image in your attachment. Please try again.",
                ephemeral: true
            });
            return -1;
        }

        //Find raid
        const allVclessRaids = ctx.guildDoc!.activeRaids.filter(raid => raid.vcless);

        if (allVclessRaids.length === 0) {
            await ctx.interaction.reply({
                content: "No vcless raids to parse!",
                ephemeral: true
            });
            return -1;
        }

        const uIdentifier = StringUtil.generateRandomString(10);
        const selectMenus: MessageSelectMenu[] = [];
        const subsets = ArrayUtilities.breakArrayIntoSubsets(allVclessRaids, 10);
        const endLen = Math.min(subsets.length, 4);
        for (let i = 0; i < endLen; i++) {
            selectMenus.push(
                new MessageSelectMenu()
                    .setCustomId(`${uIdentifier}_${i}`)
                    .setOptions(...subsets[i].map(x => {
                        return {
                            label: (`${x.memberInitName ?? x.memberInit}'s ${x.dungeonCodeName}`).substring(0, 30),
                            value: x.raidId
                        };
                    }))
                    .setMaxValues(1)
                    .setMinValues(1)
                    .setPlaceholder("Select an Active Raid")
            );
        }

        const askRaidEmbed = MessageUtilities.generateBlankEmbed(ctx.member!, "GOLD")
            .setTitle("Select Raid to Parse")
            .setDescription(
                new StringBuilder()
                    .append("Please select one of these active raids to parse.")
                    .appendLine()
                    .toString()
            )
            .setFooter({ text: "You have 1 minute and 30 seconds to select a raid." })
            .setTimestamp();

        await ctx.interaction.reply({
            embeds: [askRaidEmbed],
            components: AdvancedCollector.getActionRowsFromComponents([
                AdvancedCollector.cloneButton(ButtonConstants.CANCEL_BUTTON)
                    .setCustomId(`${uIdentifier}_cancel`),
                ...selectMenus
            ]),
        });

        let raidInfo: IRaidInfo | null;

        const selectedRaid = await AdvancedCollector.startInteractionEphemeralCollector({
            targetAuthor: ctx.user,
            acknowledgeImmediately: true,
            targetChannel: ctx.channel,
            duration: 1.5 * 60 * 1000
        }, uIdentifier);

        if (!selectedRaid) {
            raidInfo = null;
        } else if (selectedRaid.isSelectMenu()) {
            const raidInfoId = selectedRaid.values[0]!;
            raidInfo = allVclessRaids.find(raid => raid.raidId === raidInfoId) ?? null;

        } else if (selectedRaid.customId.endsWith("cancel")) {
            await ctx.interaction.editReply({
                content: "You have cancelled this process.",
                embeds: [],
                components: [],
            });
            return -1;

        } else {
            raidInfo = null;
        }

        if (!raidInfo) {
            await ctx.interaction.editReply({
                content: "Unable to identify the raid. Please try again.",
                embeds: [],
                components: [],
            });
            return -1;
        }

        const parseSummary = await RaidInstance.parseVclessRaid(image.url, raidInfo.raidId, ctx.guildDoc!, ctx.guild!);
        if (!parseSummary) {
            await ctx.interaction.editReply({
                content: "Something went wrong when trying to parse this screenshot. Try again later.",
                embeds: [],
                components: [],
            });

            return -1;
        }

        const embed = await RaidInstance.interpretVclessParseRes(parseSummary, ctx.user, raidInfo.memberInitName);
        await ctx.interaction.editReply({
            content: null,
            components: [],
            embeds: [embed]
        });

        const roleId = QuotaManager.findBestQuotaToAdd(ctx.member!, ctx.guildDoc!, "Parse");
        if (roleId) {
            await QuotaManager.logQuota(ctx.member!, roleId, "Parse", 1);
        }

        return 0;
    }
}