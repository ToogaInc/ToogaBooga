import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {MongoManager} from "../../managers/MongoManager";
import {RaidInstance} from "../../instances/RaidInstance";
import {SlashCommandBuilder} from "@discordjs/builders";
import {DungeonUtilities} from "../../utilities/DungeonUtilities";
import {
    DungeonSelectionType,
    getAvailableSections,
    getSelectedDungeon,
    getSelectedSection, selectVc
} from "./common/RaidLeaderCommon";
import {IRaidOptions} from "../../definitions";

export class StartAfkCheck extends BaseCommand {
    public static readonly START_AFK_CMD_CODE: string = "AFK_CHECK_START";

    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: StartAfkCheck.START_AFK_CMD_CODE,
            formalCommandName: "Start AFK Check Command",
            botCommandName: "afkcheck",
            description: "Starts a wizard that can be used to start an AFK check.",
            commandCooldown: 8 * 1000,
            generalPermissions: [],
            botPermissions: [],
            rolePermissions: ["RaidLeader", "AlmostRaidLeader", "HeadRaidLeader", "VeteranRaidLeader"],
            argumentInfo: [
                {
                    displayName: "Location",
                    argName: "location",
                    desc: "The location for this raid.",
                    required: false,
                    example: ["usw right"],
                    type: ArgumentType.String,
                    prettyType: "String"
                }
            ],
            guildOnly: true,
            botOwnerOnly: false,
            allowMultipleExecutionByUser: false,
            guildConcurrencyLimit: 2
        };

        const scb = new SlashCommandBuilder()
            .setName(cmi.botCommandName)
            .setDescription(cmi.description);
        scb.addStringOption(o => o
            .setName("location")
            .setDescription("The location for this raid. You can change this later.")
            .setRequired(false)
        );

        super(cmi, scb);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        ctx.guildDoc = await DungeonUtilities.fixDungeons(ctx.guildDoc!, ctx.guild!)!;
        await ctx.interaction.deferReply();
        const location = ctx.interaction.options.getString("location");
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

        // Step 3: Get the VC
        const vcToUse = await selectVc(ctx.interaction, ctx.guildDoc!, sectionToUse.cpChan!, ctx.member!);
        const raidOptions: IRaidOptions = {
            location: location ?? ""
        };

        if (vcToUse) {
            raidOptions.existingVc = {
                vc: vcToUse,
                oldPerms: Array.from(vcToUse.permissionOverwrites.cache.values())
            };
        }

        // Step 4: Ask for the appropriate dungeon
        const selectedDgn = await getSelectedDungeon(ctx, sectionToUse);

        if (!selectedDgn) {
            await ctx.interaction.editReply({
                components: [],
                content: "You either did not select a dungeon in time or canceled this process.",
                embeds: []
            });
            return 0;
        }
        const dungeonToUse = sectionToUse.dungeons.find(x => x.codeName === selectedDgn.values[0])!;

        // Step 5: Start it
        const rm = RaidInstance.new(ctx.member!, ctx.guildDoc!, sectionToUse.section, dungeonToUse, raidOptions);

        if (!rm) {
            await ctx.interaction.editReply({
                components: [],
                content: "An unknown error occurred when trying to create an AFK Check instance. Please try again"
                    + " later or report this issue to a developer.",
                embeds: []
            });
            return 0;
        }

        await ctx.interaction.editReply({
            components: [],
            content: `An AFK Check has been started. See ${sectionToUse.afkCheckChan} and ${sectionToUse.cpChan}`,
            embeds: []
        });
        rm.startPreAfkCheck().then();
        return 0;
    }
}