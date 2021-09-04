import {BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {MongoManager} from "../../managers/MongoManager";
import {IDungeonInfo, ISectionInfo} from "../../definitions";
import {
    Collection,
    GuildMember,
    MessageActionRow, MessageButton,
    MessageSelectMenu,
    Role,
    TextChannel
} from "discord.js";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {RaidInstance} from "../../instances/RaidInstance";
import {DUNGEON_DATA} from "../../constants/DungeonData";
import {MiscUtilities} from "../../utilities/MiscUtilities";
import {DefinedRole} from "../../definitions/Types";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {StringUtil} from "../../utilities/StringUtilities";
import {ArrayUtilities} from "../../utilities/ArrayUtilities";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {Emojis} from "../../constants/Emojis";
import {SlashCommandBuilder} from "@discordjs/builders";

export class StartAfkCheck extends BaseCommand {
    public static readonly START_AFK_CMD_CODE: string = "AFK_CHECK_START";

    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: StartAfkCheck.START_AFK_CMD_CODE,
            formalCommandName: "Start AFK Check Command",
            botCommandName: "startafkcheck",
            description: "Starts a wizard that can be used to start an AFK check.",
            usageGuide: ["startafkcheck"],
            exampleGuide: ["startafkcheck"],
            commandCooldown: 8 * 1000,
            generalPermissions: [],
            botPermissions: [],
            rolePermissions: ["RaidLeader", "AlmostRaidLeader", "HeadRaidLeader", "VeteranRaidLeader"],
            guildOnly: true,
            botOwnerOnly: false
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
     * Checks whether the person has the correct permissions to raid in this particular dungeon.
     * @param {string[] | undefined} roleReqs The role requirements.
     * @param {GuildMember} member The member.
     * @param {Collection<DefinedRole, string[]>} roleCol The role collection.
     * @return {boolean} Whether the person can run a raid in this dungeon.
     */
    static hasPermsToRaid(roleReqs: string[] | undefined, member: GuildMember,
                          roleCol: Collection<DefinedRole, string[]>): boolean {
        if (!roleReqs || roleReqs.length === 0)
            return true;

        for (const role of roleReqs) {
            if (GuildFgrUtilities.memberHasCachedRole(member, role))
                return true;

            if (!MiscUtilities.isDefinedRole(role))
                continue;

            const roleArr = roleCol.get(role);
            if (!roleArr)
                continue;

            if (roleArr.some(x => GuildFgrUtilities.memberHasCachedRole(member, x)))
                return true;
        }

        return false;
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        const location = ctx.interaction.options.getString("location");
        await ctx.interaction.deferReply();
        const allSections = MongoManager.getAllSections(ctx.guildDoc!);

        // Step 1: Find all sections that the leader can lead in.
        const availableSections: {
            section: ISectionInfo;
            afkCheckChan: TextChannel;
            cpChan: TextChannel;
            raiderRole: Role;
            dungeons: IDungeonInfo[];
        }[] = [];

        // Get all sections that the member can lead in
        const allRolePerms = MongoManager.getAllConfiguredRoles(ctx.guildDoc!);
        for (const section of allSections) {
            if (!RaidInstance.canManageRaidsIn(section, ctx.member!, ctx.guildDoc!))
                continue;

            const dungeons: IDungeonInfo[] = [];
            section.otherMajorConfig.afkCheckProperties.allowedDungeons.forEach(id => {
                const dgn = DUNGEON_DATA.find(x => x.codeName === id);
                if (dgn) {
                    const overrideInfo = ctx.guildDoc!.properties.dungeonOverride.find(x => x.codeName === id);
                    if (!StartAfkCheck.hasPermsToRaid(overrideInfo?.roleRequirement, ctx.member!, allRolePerms)) {
                        return;
                    }

                    dungeons.push(dgn);
                    return;
                }

                const customDgn = ctx.guildDoc!.properties.customDungeons.find(x => x.codeName === id);
                if (customDgn) {
                    if (!StartAfkCheck.hasPermsToRaid(customDgn?.roleRequirement, ctx.member!, allRolePerms)) {
                        return;
                    }

                    dungeons.push(customDgn);
                }
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
                dungeons: dungeons
            });
        }

        if (availableSections.length === 0) {
            await ctx.interaction.reply({
                content: "You cannot start a raid in any sections. Please make sure you have the appropriate"
                    + " permissions and that the section in particular has a configured AFK Check channel, control"
                    + " panel channel, and section verified role."
            });

            return 0;
        }

        // Step 2: Ask for the appropriate section.
        const sectionToUse: {
            section: ISectionInfo;
            afkCheckChan: TextChannel;
            cpChan: TextChannel;
            raiderRole: Role;
            dungeons: IDungeonInfo[];
        } | null = await new Promise(async (resolve) => {
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
                content: "Please select the section that you want to start your raid in. You have a minute and a"
                    + " half to choose. If you do not want to start a raid at this time, select the **Cancel** option.",
                components: [new MessageActionRow().addComponents(selectMenu)]
            });

            const res = await AdvancedCollector.startInteractionEphemeralCollector({
                targetAuthor: ctx.user,
                acknowledgeImmediately: false,
                targetChannel: ctx.channel,
                duration: 1.5 * 60 * 1000
            }, identifier);

            if (!res || !res.isSelectMenu()) {
                return resolve(null);
            }

            if (res.values[0] === "cancel") {
                return resolve(null);
            }

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
                new MessageButton()
                    .setStyle("DANGER")
                    .setEmoji(Emojis.X_EMOJI)
                    .setLabel("Cancel")
                    .setCustomId(`${uIdentifier}_cancel`)
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
        const rm = RaidInstance.new(ctx.member!, ctx.guildDoc!, sectionToUse.section, dungeonToUse, {
            location: location ?? ""
        });

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
        await rm.startPreAfkCheck();
        return 0;
    }
}