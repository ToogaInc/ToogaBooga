import { ArgumentType, BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { MongoManager } from "../../managers/MongoManager";
import { DungeonUtilities } from "../../utilities/DungeonUtilities";
import {
    DungeonSelectionType,
    getAvailableSections,
    getSelectedSection
} from "./common/RaidLeaderCommon";
import { HeadcountInstance } from "../../instances/HeadcountInstance";

export class StartHeadcount extends BaseCommand {
    public static readonly START_HC_CMD_CODE: string = "HEADCOUNT_START";

    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: StartHeadcount.START_HC_CMD_CODE,
            formalCommandName: "Start Headcount Command",
            botCommandName: "headcount",
            description: "Starts a headcount.",
            commandCooldown: 8 * 1000,
            generalPermissions: [],
            botPermissions: [],
            rolePermissions: ["RaidLeader", "AlmostRaidLeader", "HeadRaidLeader", "VeteranRaidLeader"],
            argumentInfo: [
                {
                    displayName: "Dungeon",
                    argName: "dungeon",
                    desc: "The dungeon for this headcount.",
                    type: ArgumentType.String,
                    restrictions: {
                        stringChoices: [
                            { name: "o3", value: "ORYX_3" },
                            { name: "shatts", value: "SHATTERS" },
                            { name: "nest", value: "NEST" },
                            { name: "cult", value: "CULTIST_HIDEOUT" },
                            { name: "fungal", value: "FUNGAL_CAVERN" },
                            { name: "void", value: "THE_VOID" }
                        ]
                    },
                    prettyType: "Dungeon name (one word: o3, oryx, shatts, shatters)",
                    required: false,
                    example: ["o3", "shatts", "cult"]
                }
            ],
            guildOnly: true,
            botOwnerOnly: false,
            allowMultipleExecutionByUser: false,
            guildConcurrencyLimit: 2
        };

        super(cmi);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        await ctx.interaction.deferReply({ ephemeral: true });
        ctx.guildDoc = await DungeonUtilities.fixDungeons(ctx.guildDoc!, ctx.guild!)!;
        const allSections = MongoManager.getAllSections(ctx.guildDoc!);
        const allRolePerms = MongoManager.getAllConfiguredRoles(ctx.guildDoc!);

        // Step 1: Find all sections that the leader can lead in.
        const availableSections = await getAvailableSections(ctx, allRolePerms, allSections);

        if (availableSections.length === 0) {
            await ctx.interaction.editReply({
                content: "You cannot start a raid in any sections. Please make sure you have the appropriate"
                    + " permissions and that the section in particular has a configured AFK Check channel, control"
                    + " panel channel, and section verified role."
            });

            return 0;
        }

        // Step 2: Ask for the appropriate section.
        const sectionToUse: DungeonSelectionType | null = await getSelectedSection(ctx, availableSections);

        if (!sectionToUse) {
            await ctx.interaction.editReply({
                content: "This process has been canceled.",
                components: []
            });
            return 0;
        }

        // Step 3: Ask for the appropriate dungeon
        const dungeonToUse = await DungeonUtilities.selectDungeon(ctx, sectionToUse.dungeons);
        if (!dungeonToUse) {
            await ctx.interaction.editReply({
                components: [],
                content: "You either did not select a dungeon in time or canceled this process.",
                embeds: []
            });
            return 0;
        }


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