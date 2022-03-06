import {Collection, MessageActionRow, MessageSelectMenu, Role, SelectMenuInteraction, TextChannel,} from "discord.js";
import {IDungeonInfo, ISectionInfo,} from "../../../definitions";
import {DefinedRole} from "../../../definitions/Types";
import {canManageRaidsIn, hasPermsToRaid,} from "../../../instances/Common";
import {ICommandContext} from "../../../commands";
import {DUNGEON_DATA} from "../../../constants/dungeons/DungeonData";
import {DungeonUtilities} from "../../../utilities/DungeonUtilities";
import {ArrayUtilities} from "../../../utilities/ArrayUtilities";
import {MessageUtilities} from "../../../utilities/MessageUtilities";
import {ButtonConstants} from "../../../constants/ButtonConstants";
import {GuildFgrUtilities} from "../../../utilities/fetch-get-request/GuildFgrUtilities";
import {StringUtil} from "../../../utilities/StringUtilities";
import {AdvancedCollector} from "../../../utilities/collectors/AdvancedCollector";


export type DungeonSelectionType = {
    section: ISectionInfo;
    afkCheckChan: TextChannel;
    cpChan: TextChannel;
    raiderRole: Role;
    dungeons: IDungeonInfo[];
    omittedDungeons: IDungeonInfo[];
};

/**
 * Checks all the sections a raider can lead in.
 * @param {ICommandContext} ctx The command context.
 * @param {Collection<DefinedRole, string[]>} allRolePerms The role collection.
 * @param {ISectionInfo[]>} allSections All Guild Sections.
 * @return {Promise<DungeonSelectionType[]>} All sections the leader can lead in.
 */
export async function getAvailableSections(ctx: ICommandContext, allRolePerms: Collection<DefinedRole, string[]>,
                                           allSections: ISectionInfo[]): Promise<DungeonSelectionType[]> {

    const availableSections: DungeonSelectionType[] = [];
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
    return availableSections;
}

/**
 * Prompts leader to select a section to use.
 * @param {ICommandContext} ctx The command context.
 * @param {DungeonSelectionType[]} availableSections The available sections.
 * @return {Promise<DungeonSelectionType | null>} A section or null.
 */
export async function getSelectedSection(ctx: ICommandContext, availableSections: DungeonSelectionType[]): Promise<DungeonSelectionType | null> {
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

        await res.deferUpdate();
        return resolve(availableSections.find(x => x.section.uniqueIdentifier === res.values[0])!);
    });
    return sectionToUse;
}

/**
 * Prompts leader to select a dungeon to use.
 * @param {ICommandContext} ctx The command context.
 * @param {DungeonSelectionType[]} sectionToUse The section to use.
 * @return {Promise<SelectMenuInteraction | null>} A dungeon selection or null.
 */
export async function getSelectedDungeon(ctx: ICommandContext, sectionToUse: DungeonSelectionType): Promise<SelectMenuInteraction | null> {
    const uIdentifier = StringUtil.generateRandomString(20);
    const selectMenus: MessageSelectMenu[] = [];

    let exaltDungeons = [];
    for (let i = 0; i < sectionToUse.dungeons.length; i++) {
        if (sectionToUse.dungeons[i].dungeonCategory === "Exaltation Dungeons") {
            exaltDungeons.push(sectionToUse.dungeons[i]);
        }
    }

    if (exaltDungeons.length > 0) {
        selectMenus.push(
            new MessageSelectMenu()
                .setCustomId(`${uIdentifier}_${5}`)
                .setMinValues(1)
                .setMaxValues(1)
                .setPlaceholder("Exaltation Dungeons")
                .addOptions(exaltDungeons.map(x => {
                    return {
                        label: x.dungeonName,
                        value: x.codeName,
                        emoji: x.portalEmojiId
                    };
                }))
        );
    }

    const dungeonSubset = ArrayUtilities.breakArrayIntoSubsets(
        sectionToUse.dungeons.filter(x => x.dungeonCategory !== "Exaltation Dungeons"),
        25
    );
    for (let i = 0; i < Math.min(4, dungeonSubset.length); i++) {
        selectMenus.push(
            new MessageSelectMenu()
                .setCustomId(`${uIdentifier}_${i}`)
                .setMinValues(1)
                .setMaxValues(1)
                .setPlaceholder("All Dungeons " + (i + 1))
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
        .setFooter({text: "You have 1 minute and 30 seconds to select a dungeon."})
        .setTimestamp();

    if (sectionToUse.omittedDungeons.length > 0) {
        askDgnEmbed.addField(
            "Omitted Dungeon",
            "You are not able to lead in the following dungeons due to not having the necessary role(s)."
            + StringUtil.codifyString(
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
            AdvancedCollector.cloneButton(ButtonConstants.CANCEL_BUTTON)
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
        return null;
    }

    return selectedDgn;
}