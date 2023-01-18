import { ArgumentType, BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { MongoManager } from "../../managers/MongoManager";
import { HeadcountInstance } from "../../instances/HeadcountInstance";
import { RaidInstance } from "../../instances/RaidInstance";
import { DungeonUtilities } from "../../utilities/DungeonUtilities";
import {
    DungeonSelectionType,
    getAvailableSections,
    getSelectedSection, selectVc
} from "./common/RaidLeaderCommon";
import { IRaidOptions } from "../../definitions";
import { TextChannel, VoiceChannel } from "discord.js";

export class StartAfkCheck extends BaseCommand {
    public static readonly START_AFK_CMD_CODE: string = "AFK_CHECK_START";

    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: StartAfkCheck.START_AFK_CMD_CODE,
            formalCommandName: "Start AFK Check Command",
            botCommandName: "afkcheck",
            description: "Starts an AFK check.",
            commandCooldown: 8 * 1000,
            generalPermissions: [],
            botPermissions: [],
            rolePermissions: ["RaidLeader", "AlmostRaidLeader", "HeadRaidLeader", "VeteranRaidLeader"],
            argumentInfo: [
                {
                    displayName: "Dungeon",
                    argName: "dungeon",
                    desc: "The dungeon for this raid.",
                    type: ArgumentType.String,
                    restrictions: {
                        stringChoices: [
                            { name: "steamworks", value: "STEAMWORKS" },
                            { name: "o3", value: "ORYX_3" },
                            { name: "shatts", value: "SHATTERS" },
                            { name: "nest", value: "NEST" },
                            { name: "fungal", value: "FUNGAL_CAVERN" },
                            { name: "cult", value: "CULTIST_HIDEOUT" },
                            { name: "void", value: "THE_VOID" },
                            { name: "lost halls", value: "LOST_HALLS" }
                        ]
                    },
                    prettyType: "Dungeon name (one word: o3, shatts, cult)",
                    required: false,
                    example: ["o3", "shatt", "cult"]
                },
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

        super(cmi);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        await ctx.interaction.deferReply({ ephemeral: true });
        ctx.guildDoc = await DungeonUtilities.fixDungeons(ctx.guildDoc!, ctx.guild!)!;
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

        const vclessAllowed = sectionToUse.section.otherMajorConfig.afkCheckProperties.allowVcless ?? false;
        let isVcless = false;

        // Step 3: Get the VC
        let vcSelect: VoiceChannel | boolean = false; //Default: create a temporary vc
        const raidOptions: IRaidOptions = {
            vcless: isVcless,
            location: location ?? ""
        };

        if (sectionToUse.section.otherMajorConfig.afkCheckProperties.allowUsingExistingVcs) {
            vcSelect = await selectVc(
                ctx.interaction,
                ctx.guildDoc!,
                sectionToUse.cpChan,
                ctx.channel as TextChannel,
                ctx.member!,
                vclessAllowed
            );

            if (typeof vcSelect === typeof VoiceChannel) { //Vc returned, use the vc
                const vcToUse = vcSelect as VoiceChannel;
                raidOptions.existingVc = {
                    vc: vcToUse,
                    oldPerms: Array.from(vcToUse.permissionOverwrites.cache.values())
                };
            } else if (vclessAllowed && vcSelect) { //Vcless selected and allowed, use vcless
                isVcless = true;
                raidOptions.vcless = true;
            } else { //Vcless not selected, create temporary vc
                isVcless = false;
                raidOptions.vcless = false;
            }
        }

        // Step 4: Ask for the appropriate dungeon

        const dungeonToUse = await DungeonUtilities.selectDungeon(ctx, sectionToUse.dungeons);
        if (!dungeonToUse) {
            await ctx.interaction.editReply({
                components: [],
                content: "You either did not select a dungeon in time or canceled this process.",
                embeds: []
            });
            return 0;
        }

        // Step 5: Check if there are any headcounts active and abort them.

        HeadcountInstance.ActiveHeadcounts.each(async (headcount: HeadcountInstance) => {
            if (headcount.getHeadcountInfoObject()!.memberInit === ctx.interaction.user.id) {
                await headcount.abortHeadcount();
            }
        });

        // Step 6: Start it

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
        rm.startPreAfkCheck().then();

        await ctx.interaction.editReply({
            components: [],
            content: `An AFK Check has been started. See ${sectionToUse.afkCheckChan} and ${sectionToUse.cpChan}`,
            embeds: []
        });

        return 0;
    }
}