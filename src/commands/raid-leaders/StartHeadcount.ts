import {BaseCommand, ICommandContext} from "../BaseCommand";
import {MongoManager} from "../../managers/MongoManager";
import {IDungeonInfo, ISectionInfo} from "../../definitions";
import {
    MessageActionRow,
    MessageSelectMenu,
    Role,
    TextChannel
} from "discord.js";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {DUNGEON_DATA} from "../../constants/dungeons/DungeonData";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {StringUtil} from "../../utilities/StringUtilities";
import {ArrayUtilities} from "../../utilities/ArrayUtilities";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {DungeonUtilities} from "../../utilities/DungeonUtilities";
import {canManageRaidsIn, hasPermsToRaid} from "../../instances/Common";
import {HeadcountInstance} from "../../instances/HeadcountInstance";
import {ButtonConstants} from "../../constants/ButtonConstants";

type DungeonSelectionType = {
    section: ISectionInfo;
    afkCheckChan: TextChannel;
    cpChan: TextChannel;
    raiderRole: Role;
    dungeons: IDungeonInfo[];
    omittedDungeons: IDungeonInfo[];
};

export class StartHeadcount extends BaseCommand {
    public static readonly START_HC_CMD_CODE: string = "HEADCOUNT_START";

    public constructor() {
        super({
            cmdCode: StartHeadcount.START_HC_CMD_CODE,
            formalCommandName: "Start Headcount Command",
            botCommandName: "startheadcount",
            description: "Starts a wizard that can be used to start a headcount.",
            commandCooldown: 8 * 1000,
            generalPermissions: [],
            botPermissions: [],
            rolePermissions: ["RaidLeader", "AlmostRaidLeader", "HeadRaidLeader", "VeteranRaidLeader"],
            argumentInfo: [],
            guildOnly: true,
            botOwnerOnly: false,
            allowMultipleExecutionByUser: false,
            guildConcurrencyLimit: 2
        });
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        ctx.guildDoc = await DungeonUtilities.fixDungeons(ctx.guildDoc!, ctx.guild!)!;
        await ctx.interaction.deferReply();
        const location = ctx.interaction.options.getString("location");
        const allSections = MongoManager.getAllSections(ctx.guildDoc!);

        // Step 1: Find all sections that the leader can lead in.
        const availableSections: DungeonSelectionType[] = [];

        // Get all sections that the member can lead in
        const allRolePerms = MongoManager.getAllConfiguredRoles(ctx.guildDoc!);
        for (const section of allSections) {
            if (!canManageRaidsIn(section, ctx.member!, ctx.guildDoc!))
                continue;

            const dungeons: IDungeonInfo[] = [];
            const omittedDungeons: IDungeonInfo[] = [];
            section.otherMajorConfig.afkCheckProperties.allowedDungeons.forEach(id => {
                if (DungeonUtilities.isCustomDungeon(id)) {
                    const customDgn = ctx.guildDoc!.properties.customDungeons.find(x => x.codeName === id);
                    if (customDgn) {
                        if (!hasPermsToRaid(customDgn.roleRequirement, ctx.member!, allRolePerms)) {
                            omittedDungeons.push(customDgn);
                            return;
                        }

                        dungeons.push(customDgn);
                    }

                    return;
                }

                const dgn = DUNGEON_DATA.find(x => x.codeName === id);
                if (!dgn)
                    return;

                const overrideInfo = ctx.guildDoc!.properties.dungeonOverride.find(x => x.codeName === id);
                if (!hasPermsToRaid(overrideInfo?.roleRequirement, ctx.member!, allRolePerms)) {
                    omittedDungeons.push(dgn);
                    return;
                }

                dungeons.push(dgn);
                return;
            });

            if (dungeons.length === 0)
                continue;

            const afkCheckChan = GuildFgrUtilities.getCachedChannel<TextChannel>(
                ctx.guild!,
                section.channels.raids.afkCheckChannelId
            )!;

            const controlPanelChan = GuildFgrUtilities.getCachedChannel<TextChannel>(
                ctx.guild!,
                section.channels.raids.controlPanelChannelId
            )!;

            const verifiedRole = GuildFgrUtilities.getCachedRole(
                ctx.guild!,
                section.roles.verifiedRoleId
            )!;

            availableSections.push({
                section: section,
                cpChan: controlPanelChan,
                afkCheckChan: afkCheckChan,
                raiderRole: verifiedRole,
                dungeons: dungeons,
                omittedDungeons: omittedDungeons
            });
        }

        if (availableSections.length === 0) {
            await ctx.interaction.editReply({
                content: "You cannot start a headcount in any sections. Please make sure you have the appropriate"
                    + " permissions and that the section in particular has a configured AFK Check channel, control"
                    + " panel channel, and section verified role."
            });

            return 0;
        }

        // Step 2: Ask for the appropriate section.
        const sectionToUse: DungeonSelectionType | null = await new Promise(async (resolve) => {
            if (availableSections.length === 1)
                return resolve(availableSections[0]);

            const identifier = StringUtil.generateRandomString(20);
            const selectMenu = new MessageSelectMenu()
                .setCustomId(identifier)
                .setMaxValues(1)
                .setMinValues(1);

            selectMenu.addOptions([
                {
                    description: "Cancels the section selection menu",
                    label: "Cancel.",
                    value: "cancel"
                },
                ...availableSections.map(x => {
                    return {
                        description: `AFK Channel Channel: ${x.afkCheckChan.name}`,
                        label: x.section.sectionName,
                        value: x.section.uniqueIdentifier
                    };
                })
            ]);

            await ctx.interaction.editReply({
                content: "Please select the section that you want to start your headcount in. You have a minute and a"
                    + " half to choose. If you do not want to start a raid at this time, select the **Cancel** option.",
                components: [new MessageActionRow().addComponents(selectMenu)]
            });

            const res = await AdvancedCollector.startInteractionEphemeralCollector({
                targetAuthor: ctx.user,
                acknowledgeImmediately: false,
                targetChannel: ctx.channel,
                duration:  60 * 1000
            }, identifier);

            if (!res || !res.isSelectMenu()) {
                return resolve(null);
            }

            if (res.values[0] === "cancel") {
                return resolve(null);
            }

            await res.deferUpdate();
            return resolve(availableSections.find(x => x.section.uniqueIdentifier === res.values[0])!);
        });

        if (!sectionToUse) {
            await ctx.interaction.editReply({
                content: "This process has been canceled.",
                components: []
            });
            return 0;
        }

        // Step 3: Ask for the appropriate dungeon
        const uIdentifier = StringUtil.generateRandomString(20);
        const selectMenus: MessageSelectMenu[] = [];
        const dungeonSubset = ArrayUtilities.breakArrayIntoSubsets(sectionToUse.dungeons, 25);
        for (let i = 0; i < Math.min(4, dungeonSubset.length); i++) {
            selectMenus.push(
                new MessageSelectMenu()
                    .setCustomId(`${uIdentifier}_${i}`)
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(dungeonSubset[i].map(x => {
                        return {
                            label: x.dungeonName,
                            value: x.codeName,
                            emoji: x.portalEmojiId
                        };
                    }))
            );
        }

        const askDgnEmbed = MessageUtilities.generateBlankEmbed(ctx.member!, "GOLD")
            .setTitle(`${sectionToUse.section.sectionName}: Select Dungeon`)
            .setDescription("Please select a dungeon from the dropdown menu(s) below. If you want to cancel this,"
                + " press the **Cancel** button.")
            .setFooter("You have 1 minute and 30 seconds to select a dungeon.")
            .setTimestamp();

        if (sectionToUse.omittedDungeons.length > 0) {
            askDgnEmbed.addField(
                "Omitted Dungeon",
                "You are not able to start a headcount in the following dungeons due to not having the necessary"
                + " role(s)." + StringUtil.codifyString(
                    sectionToUse.omittedDungeons
                        .map(x => `- ${x.dungeonName} (${x.isBuiltIn ? "Built-In" : "Custom"})`)
                        .join("\n")
                )
            );
        }

        if (dungeonSubset.length > 4) {
            askDgnEmbed.addField(
                "Warning",
                "Some dungeons have been excluded from the dropdown. This is due to a Discord limitation. To fix "
                + "this issue, please ask a higher-up to exclude some irrelevant dungeons from this list."
            );
        }

        await ctx.interaction.editReply({
            embeds: [askDgnEmbed],
            components: AdvancedCollector.getActionRowsFromComponents([
                ...selectMenus,
                ButtonConstants.CANCEL_BUTTON
            ])
        });

        const selectedDgn = await AdvancedCollector.startInteractionEphemeralCollector({
            targetAuthor: ctx.user,
            acknowledgeImmediately: false,
            targetChannel: ctx.channel,
            duration: 1.5 * 60 * 1000
        }, uIdentifier);

        if (!selectedDgn || !selectedDgn.isSelectMenu()) {
            await ctx.interaction.editReply({
                components: [],
                content: "You either did not select a dungeon in time or canceled this process.",
                embeds: []
            });

            return 0;
        }

        const dungeonToUse = sectionToUse.dungeons.find(x => x.codeName === selectedDgn.values[0])!;

        // Step 4: Start it
        const hc = HeadcountInstance.new(ctx.member!, ctx.guildDoc!, sectionToUse.section, dungeonToUse);

        if (!hc) {
            await ctx.interaction.editReply({
                components: [],
                content: "An unknown error occurred when trying to create a headcount instance. Please try again"
                    + " later or report this issue to a developer.",
                embeds: []
            });
            return 0;
        }

        await ctx.interaction.editReply({
            components: [],
            content: `A headcount has been started. See ${sectionToUse.afkCheckChan} and ${sectionToUse.cpChan}`,
            embeds: []
        });

        hc.startHeadcount().then();
        return 0;
    }
}