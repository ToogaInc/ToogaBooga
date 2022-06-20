import {
    BaseCommandInteraction,
    Collection, GuildMember,
    MessageActionRow, MessageButton, MessageComponentInteraction,
    MessageSelectMenu,
    Role,
    TextChannel,
    VoiceChannel,
} from "discord.js";
import { IDungeonInfo, IGuildInfo, ISectionInfo, } from "../../../definitions";
import { DefinedRole } from "../../../definitions/Types";
import { canManageRaidsIn, hasPermsToRaid, } from "../../../instances/Common";
import { ICommandContext } from "../../../commands";
import { DUNGEON_DATA } from "../../../constants/dungeons/DungeonData";
import { DungeonUtilities } from "../../../utilities/DungeonUtilities";
import { ArrayUtilities } from "../../../utilities/ArrayUtilities";
import { MessageUtilities } from "../../../utilities/MessageUtilities";
import { GuildFgrUtilities } from "../../../utilities/fetch-get-request/GuildFgrUtilities";
import { StringUtil } from "../../../utilities/StringUtilities";
import { AdvancedCollector } from "../../../utilities/collectors/AdvancedCollector";
import { StringBuilder } from "../../../utilities/StringBuilder";


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
export async function getSelectedSection(
    ctx: ICommandContext,
    availableSections: DungeonSelectionType[]
): Promise<DungeonSelectionType | null> {
    return await new Promise(async (resolve) => {
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
}

/**
 * Gives the user the ability to select a voice channel for their raid, assuming the VC is valid.
 * @param {BaseCommandInteraction} interaction The interaction.
 * @param {IGuildInfo} guildDoc The guild document.
 * @param {TextChannel} controlPanelChannel The control panel channel.
 * @param {TextChannel} targetChannel The channel where the selection of the VC should be asked in.
 * @param {GuildMember} from The member that initiated this.
 * @returns {Promise<VoiceChannel | null>} The voice channel if one is selected, or `null` otherwise if one should be
 * created for temporary purposes.
 */
export async function selectVc<T extends BaseCommandInteraction | MessageComponentInteraction>(
    interaction: T,
    guildDoc: IGuildInfo,
    controlPanelChannel: TextChannel,
    targetChannel: TextChannel,
    from: GuildMember
): Promise<VoiceChannel | null> {
    // All valid VCs must start with some word and end with a number
    // For example, "Raid 1" is a valid name but "Staff Lounge" is not
    // A valid VC must also not be used
    const usedVcs = new Set(guildDoc.activeRaids.map(x => x.vcId));
    const validVcs = controlPanelChannel.parent!.children
        .filter(x => {
            if (!(x instanceof VoiceChannel)) {
                return false;
            }

            const names = x.name.split(/[- ]/g).filter(z => z.length > 0);
            if (names.length === 0) {
                return false;
            }

            if (Number.isNaN(Number.parseInt(names.at(-1)!, 10))) {
                return false;
            }

            return !usedVcs.has(x.id);
        });

    if (validVcs.size === 0) {
        return null;
    }

    validVcs.sort((a, b) => a.position - b.position);

    const uIdentifier = StringUtil.generateRandomString(10);
    const selectMenus: MessageSelectMenu[] = [];
    const subsets = ArrayUtilities.breakArrayIntoSubsets(Array.from(validVcs.values()), 10);
    const endLen = Math.min(subsets.length, 4);
    for (let i = 0; i < endLen; i++) {
        selectMenus.push(
            new MessageSelectMenu()
                .setCustomId(`${uIdentifier}_${i}`)
                .setOptions(...subsets[i].map(x => {
                    return {
                        label: x.name.substring(0, 30),
                        value: x.id
                    };
                }))
                .setMaxValues(1)
                .setMinValues(1)
                .setPlaceholder("Select an Existing VC")
        );
    }

    const askDgnEmbed = MessageUtilities.generateBlankEmbed(from, "GOLD")
        .setTitle("Select Voice Channel for Raid")
        .setDescription(
            new StringBuilder()
                .append("Please select a voice channel where you want to host your raid.")
                .appendLine()
                .append("- If you want the bot to create a temporary raiding VC, press the **Temporary VC** button.")
                .appendLine()
                .append("- If you want the bot to select the first available raiding VC, press the **First Available")
                .append(" VC** button.")
                .appendLine()
                .append("Otherwise, select a VC from the dropdown menu.")
                .toString()
        )
        .setFooter({ text: "You have 1 minute and 30 seconds to select a dungeon." })
        .setTimestamp();

    await interaction.editReply({
        embeds: [askDgnEmbed],
        components: AdvancedCollector.getActionRowsFromComponents([
            new MessageButton()
                .setLabel("Temporary VC")
                .setCustomId(uIdentifier)
                .setStyle("PRIMARY"),
            new MessageButton()
                .setLabel("First Available VC")
                .setCustomId(`${uIdentifier}_first`)
                .setStyle("PRIMARY"),
            ...selectMenus
        ])
    });

    const selected = await AdvancedCollector.startInteractionEphemeralCollector({
        targetAuthor: from.user,
        acknowledgeImmediately: true,
        targetChannel: targetChannel,
        duration: 30 * 1000
    }, uIdentifier);

    if (!selected) {
        return null;
    }

    if (selected.isSelectMenu()) {
        return validVcs.get(selected.values[0])! as VoiceChannel;
    }

    if (selected.customId.endsWith("first")) {
        return validVcs.first() as VoiceChannel;
    }

    // Default value
    return null;
}