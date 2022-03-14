import {BaseCommand, ICommandContext} from "../BaseCommand";
import {
    ConfigType,
    DATABASE_CONFIG_DESCRIPTION,
    DB_CONFIG_ACTION_ROW,
    entryFunction,
    getInstructions,
    IBaseDatabaseEntryInfo,
    IConfigCommand
} from "./common/ConfigCommon";
import {IGuildInfo, ISectionInfo} from "../../definitions";
import {Guild, Message, MessageButton, MessageEmbed, Role, TextChannel} from "discord.js";
import {StringBuilder} from "../../utilities/StringBuilder";
import {GuildFgrUtilities} from "../../utilities/fetch-get-request/GuildFgrUtilities";
import {EmojiConstants} from "../../constants/EmojiConstants";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {Filter} from "mongodb";
import {MongoManager} from "../../managers/MongoManager";
import {ParseUtilities} from "../../utilities/ParseUtilities";
import {ArrayUtilities} from "../../utilities/ArrayUtilities";
import {GeneralConstants} from "../../constants/GeneralConstants";
import {ButtonConstants} from "../../constants/ButtonConstants";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {UserManager} from "../../managers/UserManager";
import getCachedRole = GuildFgrUtilities.getCachedRole;
import hasCachedRole = GuildFgrUtilities.hasCachedRole;

enum DisplayFilter {
    Moderation = (1 << 0),
    UniversalLeader = (1 << 1),
    SectionLeader = (1 << 2),
    General = (1 << 3)
}

enum RoleCategoryType {
    Moderation,
    UniversalLeader,
    SectionLeader,
    General
}

interface IRoleMongo extends IBaseDatabaseEntryInfo {
    roleType: RoleCategoryType;
}

export class ConfigureRoles extends BaseCommand implements IConfigCommand {
    private static readonly NA: string = "N/A";
    private static readonly ROLE_MONGO: IRoleMongo[] = [
        {
            name: "Muted Role",
            description: "When a user has this role, he or she will not be able to talk in voice channels or in the"
                + " server.",
            guildDocPath: "roles.mutedRoleId",
            sectionPath: "",
            roleType: RoleCategoryType.General,
            configTypeOrInstructions: ConfigType.Role,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection)
                    throw new Error("muted role not for sections.");
                return guildDoc.roles.mutedRoleId;
            }
        },
        {
            name: "Verified Role",
            description: "The role which signifies that the person has been verified in the server or a particular"
                + " section.",
            guildDocPath: "roles.verifiedRoleId",
            sectionPath: "guildSections.$.roles.verifiedRoleId",
            roleType: RoleCategoryType.General,
            configTypeOrInstructions: ConfigType.Role,
            getCurrentValue: (guildDoc, section) => {
                return section.isMainSection
                    ? guildDoc.roles.verifiedRoleId
                    : section.roles.verifiedRoleId;
            }
        },
        {
            name: "Suspended Role",
            description: "The role which signifies that the person has been suspended from the server. When a person"
                + " is suspended, he or she will not be able to see any member-verified channels (including the AFK"
                + " check channel).",
            guildDocPath: "roles.suspendedRoleId",
            sectionPath: "",
            roleType: RoleCategoryType.General,
            configTypeOrInstructions: ConfigType.Role,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection)
                    throw new Error("suspended role not for sections.");
                return guildDoc.roles.suspendedRoleId;
            }
        },
        // Staff roles
        {
            name: "Team Role",
            description: "The role which signifies that someone is a staff member. This role is automatically"
                + " assigned to all defined raid leaders, helpers, securities, officers, and more.",
            guildDocPath: "roles.staffRoles.teamRoleId",
            sectionPath: "",
            roleType: RoleCategoryType.General,
            configTypeOrInstructions: ConfigType.Role,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection)
                    throw new Error("team role not for sections.");
                return guildDoc.roles.staffRoles.teamRoleId;
            }
        },
        // Universal leader roles
        {
            name: "Universal Almost Leader Role",
            description: "The **Universal** Almost Leader role. Members with this role will be able to start AFK"
                + " checks in **any** section.",
            guildDocPath: "roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId",
            sectionPath: "",
            roleType: RoleCategoryType.UniversalLeader,
            configTypeOrInstructions: ConfigType.Role,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection)
                    throw new Error("universal leader not for sections.");
                return guildDoc.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId;
            }
        },
        {
            name: "Universal Leader Role",
            description: "The **Universal** Leader role. Members with this role will be able to start AFK checks in"
                + " **any** section and will have additional permissions (such as the ability to suspend members).",
            guildDocPath: "roles.staffRoles.universalLeaderRoleIds.leaderRoleId",
            sectionPath: "",
            roleType: RoleCategoryType.UniversalLeader,
            configTypeOrInstructions: ConfigType.Role,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection)
                    throw new Error("universal leader not for sections.");
                return guildDoc.roles.staffRoles.universalLeaderRoleIds.leaderRoleId;
            }
        },
        {
            name: "Universal Veteran Leader Role",
            description: "The **Universal** Veteran Leader role. Members with this role will be able to start AFK"
                + " checks in **any** section. Same permissions as the Leader role.",
            guildDocPath: "roles.staffRoles.universalLeaderRoleIds.vetLeaderRoleId",
            sectionPath: "",
            roleType: RoleCategoryType.UniversalLeader,
            configTypeOrInstructions: ConfigType.Role,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection)
                    throw new Error("universal leader not for sections.");
                return guildDoc.roles.staffRoles.universalLeaderRoleIds.vetLeaderRoleId;
            }
        },
        {
            name: "Head Leader Role",
            description: "The Head Leader role. Members with this role will be able to start AFK checks in  **any**"
                + " section. Additionally, members with this role will be able to access configuration commands.",
            guildDocPath: "roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId",
            sectionPath: "",
            roleType: RoleCategoryType.UniversalLeader,
            configTypeOrInstructions: ConfigType.Role,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection)
                    throw new Error("universal leader not for sections.");
                return guildDoc.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId;
            }
        },
        // Section leader roles
        {
            name: "Section Almost Leader Role",
            description: "The **Section** Almost Leader role. Members with this role will be able to start AFK"
                + " checks in **this** section only.",
            guildDocPath: "roles.staffRoles.sectionLeaderRoleIds.sectionAlmostLeaderRoleId",
            sectionPath: "guildSections.$.roles.leaders.sectionAlmostLeaderRoleId",
            roleType: RoleCategoryType.SectionLeader,
            configTypeOrInstructions: ConfigType.Role,
            getCurrentValue: (guildDoc, section) => {
                return section.isMainSection
                    ? guildDoc.roles.staffRoles.sectionLeaderRoleIds.sectionAlmostLeaderRoleId
                    : section.roles.leaders.sectionAlmostLeaderRoleId;
            }
        },
        {
            name: "Section Leader Role",
            description: "The **Section** Leader role. Members with this role will be able to start AFK checks in"
                + " **this** section only and will have additional permissions (like the ability to section suspend"
                + " members).",
            guildDocPath: "roles.staffRoles.sectionLeaderRoleIds.sectionLeaderRoleId",
            sectionPath: "guildSections.$.roles.leaders.sectionLeaderRoleId",
            roleType: RoleCategoryType.SectionLeader,
            configTypeOrInstructions: ConfigType.Role,
            getCurrentValue: (guildDoc, section) => {
                return section.isMainSection
                    ? guildDoc.roles.staffRoles.sectionLeaderRoleIds.sectionLeaderRoleId
                    : section.roles.leaders.sectionLeaderRoleId;
            }
        },
        {
            name: "Section Veteran Leader Role",
            description: "The **Section** Veteran Leader role. Members with this role will be able to start AFK"
                + " checks in **this** section only. Same permissions as Section Leader Role.",
            guildDocPath: "roles.staffRoles.sectionLeaderRoleIds.sectionVetLeaderRoleId",
            sectionPath: "guildSections.$.roles.leaders.sectionVetLeaderRoleId",
            roleType: RoleCategoryType.SectionLeader,
            configTypeOrInstructions: ConfigType.Role,
            getCurrentValue: (guildDoc, section) => {
                return section.isMainSection
                    ? guildDoc.roles.staffRoles.sectionLeaderRoleIds.sectionVetLeaderRoleId
                    : section.roles.leaders.sectionVetLeaderRoleId;
            }
        },
        // Moderation
        {
            name: "Helper Role",
            description: "The Helper role. Members with this role will be able to perform administrative duties like"
                + " manually verifying people, parse raids, respond to modmail messages, issue warnings (but not"
                + " suspensions), and more.",
            guildDocPath: "roles.staffRoles.moderation.helperRoleId",
            sectionPath: "",
            roleType: RoleCategoryType.Moderation,
            configTypeOrInstructions: ConfigType.Role,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection)
                    throw new Error("helper not for sections.");
                return guildDoc.roles.staffRoles.moderation.helperRoleId;
            }
        },
        {
            name: "Security Role",
            description: "The Security role. Members with this role will be able to perform administrative duties like"
                + " manually verifying people, parse raids, respond to modmail messages, issue warnings and"
                + " suspensions, and more.",
            guildDocPath: "roles.staffRoles.moderation.securityRoleId",
            sectionPath: "",
            roleType: RoleCategoryType.Moderation,
            configTypeOrInstructions: ConfigType.Role,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection)
                    throw new Error("security not for sections.");
                return guildDoc.roles.staffRoles.moderation.securityRoleId;
            }
        },
        {
            name: "Officer Role",
            description: "The Officer role. Members with this role will be able to perform administrative duties like"
                + " manually verifying people, parse raids, respond to modmail messages, issue warnings and"
                + " suspensions, blacklist members, configure the bot, and more.",
            guildDocPath: "roles.staffRoles.moderation.officerRoleId",
            sectionPath: "",
            roleType: RoleCategoryType.Moderation,
            configTypeOrInstructions: ConfigType.Role,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection)
                    throw new Error("officer not for sections.");
                return guildDoc.roles.staffRoles.moderation.officerRoleId;
            }
        },
        {
            name: "Moderator Role",
            description: "The Moderator role. Members with this role will be able to perform the same duties as"
                + " Officers. Ideally, members with this role should have elevated Discord permissions compared to"
                + " Officers.",
            guildDocPath: "roles.staffRoles.moderation.moderatorRoleId",
            sectionPath: "",
            roleType: RoleCategoryType.Moderation,
            configTypeOrInstructions: ConfigType.Role,
            getCurrentValue: (guildDoc, section) => {
                if (!section.isMainSection)
                    throw new Error("moderator not for sections.");
                return guildDoc.roles.staffRoles.moderation.moderatorRoleId;
            }
        },
    ];

    public constructor() {
        super({
            cmdCode: "CONFIGURE_ROLE_COMMAND",
            formalCommandName: "Configure Roles Command",
            botCommandName: "configroles",
            description: "Allows the user to configure roles for the entire server or for a specific section",
            commandCooldown: 10 * 1000,
            generalPermissions: ["MANAGE_GUILD"],
            argumentInfo: [],
            rolePermissions: ["Officer", "HeadRaidLeader", "Moderator"],
            botPermissions: ["ADD_REACTIONS", "MANAGE_MESSAGES"],
            guildOnly: true,
            botOwnerOnly: false,
            guildConcurrencyLimit: 1,
            allowMultipleExecutionByUser: false
        });
    }

    /** @inheritDoc */
    public async run(ctx: ICommandContext): Promise<number> {
        if (!(ctx.channel instanceof TextChannel)) return -1;

        await ctx.interaction.reply({
            content: "A new message should have popped up! Please refer to that message."
        });

        await this.entry(ctx, null);
        return 0;
    }

    /** @inheritDoc */
    public async entry(ctx: ICommandContext, botMsg: Message | null): Promise<void> {
        const entryRes = await entryFunction(ctx, botMsg);
        if (!entryRes) {
            await this.dispose(ctx, botMsg);
            return;
        }

        await this.mainMenu(ctx, entryRes[0], entryRes[1]);
    }

    /** @inheritDoc */
    public async mainMenu(ctx: ICommandContext, section: ISectionInfo, botMsg: Message): Promise<void> {
        const currentConfiguration = this.getCurrentConfiguration(
            ctx.guild!,
            ctx.guildDoc!,
            section,
            DisplayFilter.General
            | DisplayFilter.UniversalLeader
            | DisplayFilter.SectionLeader
            | DisplayFilter.Moderation
        );

        const buttons: MessageButton[] = [
            ButtonConstants.BACK_BUTTON,
            new MessageButton()
                .setLabel("Edit General Roles")
                .setStyle("PRIMARY")
                .setCustomId("general")
                .setEmoji(EmojiConstants.PENCIL_PAPER_EMOJI),
            new MessageButton()
                .setLabel("Edit Section Leader Roles")
                .setStyle("PRIMARY")
                .setCustomId("sec_leader")
                .setEmoji(EmojiConstants.SECOND_PLACE_EMOJI)
        ];

        const displayEmbed = new MessageEmbed()
            .setAuthor({name: ctx.guild!.name, iconURL: ctx.guild!.iconURL() ?? undefined})
            .setTitle(`[${section.sectionName}] **Role** Configuration Main Menu`)
            .setDescription(`Please select the appropriate option.\n\n${currentConfiguration}`)
            .setFooter({text: `ID: ${section.uniqueIdentifier}`})
            .addField(
                "Go Back",
                "Click on the `Back` button to go back to the section selection embed. You can choose a new section"
                + " to modify."
            ).addField(
                "Edit General Roles",
                "Click on the `Edit General Roles` button to configure the verified raider role for this section. If"
                + " this pertains to the entire server, you can also configure the suspended and muted role."
            ).addField(
                "Edit Section Leader Roles",
                "Click on the `Edit Section Leader Roles` button to configure the section leader roles for this"
                + " section. These leader roles only work in *this* section."
            );

        if (section.isMainSection) {
            displayEmbed.addField(
                "Edit Universal Leader Roles",
                "Click on the `Edit Universal Leader Roles` button to configure the universal leader roles for this"
                + " server. These leader roles work in every section."
            ).addField(
                "Edit Moderation Roles",
                "Click on the `Edit Moderation Roles` button to configure the moderation roles for this server."
            ).addField(
                "Configure Team Roles",
                "Click on the `Edit Team Roles` button to add or remove *custom* roles that should be considered"
                + " staff roles."
            );

            buttons.push(
                new MessageButton()
                    .setLabel("Edit Universal Leader Roles")
                    .setStyle("PRIMARY")
                    .setCustomId("uni_leader")
                    .setEmoji(EmojiConstants.FIRST_PLACE_EMOJI),
                new MessageButton()
                    .setLabel("Edit Moderation Roles")
                    .setStyle("PRIMARY")
                    .setCustomId("mod")
                    .setEmoji(EmojiConstants.CROSSED_SWORDS_EMOJI),
                new MessageButton()
                    .setLabel("Edit Team Roles")
                    .setStyle("PRIMARY")
                    .setCustomId("team")
                    .setEmoji(EmojiConstants.MULTIPLE_FLAGS_EMOJI)
            );
        }

        displayEmbed.addField(
            "Quit",
            "Click on the `Quit` button to exit this process."
        );

        buttons.push(ButtonConstants.QUIT_BUTTON);

        await botMsg.edit({
            embeds: [displayEmbed],
            components: AdvancedCollector.getActionRowsFromComponents(buttons)
        });

        const selectedButton = await AdvancedCollector.startInteractionCollector({
            targetChannel: botMsg.channel as TextChannel,
            targetAuthor: ctx.user,
            oldMsg: botMsg,
            acknowledgeImmediately: true,
            clearInteractionsAfterComplete: false,
            deleteBaseMsgAfterComplete: false,
            duration: 45 * 1000
        });

        if (!selectedButton) {
            await this.dispose(ctx, botMsg);
            return;
        }

        switch (selectedButton.customId) {
            case ButtonConstants.BACK_ID: {
                await this.entry(ctx, botMsg);
                return;
            }
            case "general": {
                await this.editDatabaseSettings(
                    ctx,
                    section,
                    botMsg,
                    ConfigureRoles.ROLE_MONGO.filter(x => {
                        return x.roleType === RoleCategoryType.General
                            && (section.isMainSection ? true : !!x.sectionPath);
                    }),
                    "General"
                );
                return;
            }
            case "sec_leader": {
                await this.editDatabaseSettings(
                    ctx,
                    section,
                    botMsg,
                    ConfigureRoles.ROLE_MONGO.filter(x => x.roleType === RoleCategoryType.SectionLeader),
                    "Section Leaders"
                );
                return;
            }
            case "uni_leader": {
                await this.editDatabaseSettings(
                    ctx,
                    section,
                    botMsg,
                    ConfigureRoles.ROLE_MONGO.filter(x => x.roleType === RoleCategoryType.UniversalLeader),
                    "Universal Leaders"
                );
                return;
            }
            case "mod": {
                await this.editDatabaseSettings(
                    ctx,
                    section,
                    botMsg,
                    ConfigureRoles.ROLE_MONGO.filter(x => x.roleType === RoleCategoryType.Moderation),
                    "Moderation"
                );
                return;
            }
            case "team": {
                await this.editTeamRoles(ctx, botMsg);
                return;
            }
            case ButtonConstants.QUIT_ID: {
                await this.dispose(ctx, botMsg);
                return;
            }
        }
    }

    /** @inheritDoc */
    public getCurrentConfiguration(guild: Guild, guildDoc: IGuildInfo, section: ISectionInfo,
                                   displayFilter: number): string {
        const currentConfiguration = new StringBuilder();

        if (displayFilter & DisplayFilter.General) {
            const raiderRole = getCachedRole(
                guild,
                section.isMainSection ? guildDoc.roles.verifiedRoleId : section.roles.verifiedRoleId
            );

            currentConfiguration.append("__**General Roles**__").appendLine()
                .append(`⇒ Verified Raider Role: ${raiderRole ?? ConfigureRoles.NA}`).appendLine();

            if (section.isMainSection) {
                const suspendedRole = getCachedRole(
                    guild,
                    guildDoc.roles.suspendedRoleId
                );

                const mutedRole = getCachedRole(
                    guild,
                    guildDoc.roles.mutedRoleId
                );

                const teamRole = getCachedRole(
                    guild,
                    guildDoc.roles.staffRoles.teamRoleId
                );

                currentConfiguration.append(`⇒ Suspended Role: ${suspendedRole ?? ConfigureRoles.NA}`).appendLine()
                    .append(`⇒ Muted Role: ${mutedRole ?? ConfigureRoles.NA}`).appendLine()
                    .append(`⇒ Team Role: ${teamRole ?? ConfigureRoles.NA}`).appendLine();
            }
        }

        if (displayFilter & DisplayFilter.SectionLeader) {
            const secArlRole = getCachedRole(
                guild,
                section.roles.leaders.sectionAlmostLeaderRoleId
            );

            const secRlRole = getCachedRole(
                guild,
                section.roles.leaders.sectionLeaderRoleId
            );

            const secVrlRole = getCachedRole(
                guild,
                section.roles.leaders.sectionVetLeaderRoleId
            );

            currentConfiguration.append("__**Section Leader Roles**__").appendLine()
                .append(`⇒ Section Almost Leader Role: ${secArlRole ?? ConfigureRoles.NA}`).appendLine()
                .append(`⇒ Section Leader Role: ${secRlRole ?? ConfigureRoles.NA}`).appendLine()
                .append(`⇒ Section Veteran Leader Role: ${secVrlRole ?? ConfigureRoles.NA}`).appendLine();
        }

        if (section.isMainSection) {
            if (displayFilter & DisplayFilter.UniversalLeader) {
                const arlRole = getCachedRole(
                    guild,
                    guildDoc.roles.staffRoles.universalLeaderRoleIds.almostLeaderRoleId
                );

                const rlRole = getCachedRole(
                    guild,
                    guildDoc.roles.staffRoles.universalLeaderRoleIds.leaderRoleId
                );

                const vrlRole = getCachedRole(
                    guild,
                    guildDoc.roles.staffRoles.universalLeaderRoleIds.vetLeaderRoleId
                );

                const hrlRole = getCachedRole(
                    guild,
                    guildDoc.roles.staffRoles.universalLeaderRoleIds.headLeaderRoleId
                );

                currentConfiguration.append("__**Universal Leader Roles**__").appendLine()
                    .append(`⇒ Universal Almost Leader Role: ${arlRole ?? ConfigureRoles.NA}`).appendLine()
                    .append(`⇒ Universal Leader Role: ${rlRole ?? ConfigureRoles.NA}`).appendLine()
                    .append(`⇒ Universal Veteran Leader Role: ${vrlRole ?? ConfigureRoles.NA}`).appendLine()
                    .append(`⇒ Universal Head Leader Role: ${hrlRole ?? ConfigureRoles.NA}`).appendLine();
            }

            if (displayFilter & DisplayFilter.Moderation) {
                const helperRole = getCachedRole(
                    guild,
                    guildDoc.roles.staffRoles.moderation.helperRoleId
                );

                const secRole = getCachedRole(
                    guild,
                    guildDoc.roles.staffRoles.moderation.securityRoleId
                );

                const officerRole = getCachedRole(
                    guild,
                    guildDoc.roles.staffRoles.moderation.officerRoleId
                );

                const modRole = getCachedRole(
                    guild,
                    guildDoc.roles.staffRoles.moderation.moderatorRoleId
                );

                currentConfiguration.append("__**Moderation Roles**__").appendLine()
                    .append(`⇒ Helper Role: ${helperRole ?? ConfigureRoles.NA}`).appendLine()
                    .append(`⇒ Security Role: ${secRole ?? ConfigureRoles.NA}`).appendLine()
                    .append(`⇒ Officer Role: ${officerRole ?? ConfigureRoles.NA}`).appendLine()
                    .append(`⇒ Moderator Role: ${modRole ?? ConfigureRoles.NA}`).appendLine();
            }
        }

        return currentConfiguration.toString();
    }

    /** @inheritDoc */
    public async dispose(ctx: ICommandContext, botMsg: Message | null, ...args: any[]): Promise<void> {
        if (botMsg) {
            await MessageUtilities.tryDelete(botMsg);
        }
    }

    /**
     * Modifies the array of roles that should be denoted as staff roles.
     * @param {ICommandContext} ctx The command context.
     * @param {Message} botMsg The bot message.
     */
    public async editTeamRoles(ctx: ICommandContext, botMsg: Message): Promise<void> {
        const guild = ctx.guild!;

        const embedToDisplay = new MessageEmbed()
            .setAuthor({name: guild.name, iconURL: guild.iconURL() ?? undefined})
            .setDescription(
                "Here, you will have the ability to modify what __custom__ (i.e. not built-in) roles are *staff*"
                + " roles. Members will receive the Team role when they receive a staff role and will lose the"
                + " Team role when they have no staff roles.\n\n- To **add** a role as a staff role, simply"
                + " **mention** the role or type the ID of the role. If this role already exists as a staff"
                + " role, it will be removed.\n- To **remove** a role as a staff role, you can either mention"
                + " the role or type the ID, or type the number corresponding to the role that you want to"
                + " remove.\n- Once you are finished, press the **Back** button to go back to the previous prompt"
                + " or the **Quit** button to quit this process. Your changes, if any, are saved automatically."
            );

        while (true) {
            embedToDisplay.fields = [];
            let validStaffRoles: Role[] = [];
            if (ctx.guildDoc!.roles.staffRoles.otherStaffRoleIds.length === 0) {
                embedToDisplay.addField(GeneralConstants.ZERO_WIDTH_SPACE, "No Custom Staff Roles.");
            }
            else {
                const staffRoles = ctx.guildDoc!.roles.staffRoles.otherStaffRoleIds
                    .map(x => {
                        // r = role ID, v = whether it exists
                        return {r: x, v: hasCachedRole(guild, x)};
                    });

                const invalidRoles = staffRoles.filter(x => !x.v);
                if (invalidRoles.length > 0) {
                    ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc({guildId: guild.id}, {
                        $pull: {
                            "roles.staffRoles.otherStaffRoleIds": {
                                "$in": invalidRoles.map(x => x.r)
                            }
                        }
                    });
                }

                validStaffRoles = staffRoles.map(x => getCachedRole(guild, x.r)!);
                if (validStaffRoles.length === 0) {
                    embedToDisplay.addField(GeneralConstants.ZERO_WIDTH_SPACE, "No Custom Staff Roles.");
                }
                else {
                    const fields = ArrayUtilities.arrayToStringFields(
                        validStaffRoles,
                        (i, e) => `**\`[${i + 1}]\`** ${e}\n`
                    );
                    for (const field of fields) {
                        embedToDisplay.addField(GeneralConstants.ZERO_WIDTH_SPACE, field);
                    }
                }
            }

            await botMsg.edit({
                embeds: [embedToDisplay],
                components: AdvancedCollector.getActionRowsFromComponents([
                    ButtonConstants.BACK_BUTTON,
                    ButtonConstants.QUIT_BUTTON
                ])
            });

            const result = await AdvancedCollector.startDoubleCollector<number | Role>({
                targetChannel: botMsg.channel as TextChannel,
                targetAuthor: ctx.user,
                duration: 60 * 1000,
                deleteBaseMsgAfterComplete: false,
                acknowledgeImmediately: true,
                deleteResponseMessage: true,
                oldMsg: botMsg,
                clearInteractionsAfterComplete: false,
                cancelFlag: "-cancel"
            }, async (msg: Message) => {
                // Parse for role.
                const role = ParseUtilities.parseRole(msg);
                // noinspection DuplicatedCode
                if (role) return role;
                // Parse for number.
                const num = Number.parseInt(msg.content, 10);
                if (Number.isNaN(num)) return;
                const actualIdx = num - 1;
                if (actualIdx < 0 || actualIdx >= validStaffRoles.length)
                    return;

                return actualIdx;
            });

            // Case 0: Nothing
            if (result === null) {
                await this.dispose(ctx, botMsg);
                return;
            }

            // Case 1: Number
            if (typeof result === "number") {
                ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc({guildId: guild.id}, {
                    $pull: {
                        "roles.staffRoles.otherStaffRoleIds": validStaffRoles[result].id
                    }
                });

                UserManager.updateStaffRolesForRole(ctx.guildDoc!, validStaffRoles[result], "remove");
                continue;
            }

            // Case 2: Role
            if (result instanceof Role) {
                const toRemove = validStaffRoles.some(x => x.id === result.id);
                ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc({guildId: guild.id}, {
                    [toRemove ? "$pull" : "$push"]: {
                        "roles.staffRoles.otherStaffRoleIds": result.id
                    }
                });

                UserManager.updateStaffRolesForRole(ctx.guildDoc!, result, toRemove ? "remove" : "add");
                continue;
            }

            // Case 3: Buttons
            switch (result.customId) {
                case ButtonConstants.BACK_ID: {
                    await this.mainMenu(ctx, MongoManager.getMainSection(ctx.guildDoc!), botMsg);
                    return;
                }
                case ButtonConstants.QUIT_ID: {
                    await this.dispose(ctx, botMsg);
                    return;
                }
            }
        }
    }

    /**
     * Edits the database entries. This is the function that is responsible for editing the database.
     * @param {ICommandContext} ctx The command context.
     * @param {ISectionInfo} section The section to edit.
     * @param {Message} botMsg The bot message.
     * @param {IRoleMongo[]} entries The entries to manipulate.
     * @param {string} group The group name.
     * @private
     */
    public async editDatabaseSettings(ctx: ICommandContext, section: ISectionInfo, botMsg: Message,
                                      entries: IRoleMongo[], group: string): Promise<void> {
        const guild = ctx.guild!;

        let selected = 0;
        const embedToDisplay = new MessageEmbed()
            .setAuthor({name: guild.name, iconURL: guild.iconURL() ?? undefined})
            .setTitle(`[${section.sectionName}] **Role** Configuration ⇒ ${group}`)
            .setDescription(DATABASE_CONFIG_DESCRIPTION);
        while (true) {
            embedToDisplay.fields = [];
            embedToDisplay.setFooter({text: getInstructions(entries[selected].configTypeOrInstructions)});
            for (let i = 0; i < entries.length; i++) {
                const currSet: Role | null = getCachedRole(
                    guild,
                    entries[i].getCurrentValue(ctx.guildDoc!, section) as string
                );
                embedToDisplay.addField(
                    i === selected ? `${EmojiConstants.RIGHT_TRIANGLE_EMOJI} ${entries[i].name}` : entries[i].name,
                    `Current Value: ${currSet ?? ConfigureRoles.NA}`
                );
            }

            await botMsg.edit({
                embeds: [embedToDisplay],
                components: DB_CONFIG_ACTION_ROW
            });

            const result = await AdvancedCollector.startDoubleCollector<number | Role>({
                targetChannel: botMsg.channel as TextChannel,
                targetAuthor: ctx.user,
                duration: 45 * 1000,
                deleteBaseMsgAfterComplete: false,
                acknowledgeImmediately: true,
                deleteResponseMessage: true,
                oldMsg: botMsg,
                clearInteractionsAfterComplete: false,
                cancelFlag: "-cancel"
            }, async (msg: Message) => {
                // Parse for role.
                const role = ParseUtilities.parseRole(msg);
                // noinspection DuplicatedCode
                if (role) return role;
                // Parse for number.
                const contentArr = msg.content.split(" ");
                if (contentArr.length <= 1) return;
                if (contentArr[0].toLowerCase() !== "j") return;
                const num = Number.parseInt(contentArr[1], 10);
                if (Number.isNaN(num) || num === 0) return;
                return num;
            });

            // Case 0: Nothing
            // noinspection DuplicatedCode
            if (!result) {
                await this.dispose(ctx, botMsg);
                return;
            }

            // Case 1: Number
            if (typeof result === "number") {
                selected += result;
                selected %= entries.length;
                continue;
            }

            // Case 2: Role
            const query: Filter<IGuildInfo> = section.isMainSection
                ? {guildId: guild.id}
                : {guildId: guild.id, "guildSections.uniqueIdentifier": section.uniqueIdentifier};
            const keySetter = section.isMainSection
                ? entries[selected].guildDocPath
                : entries[selected].sectionPath;

            if (result instanceof Role) {
                ctx.guildDoc = await MongoManager.updateAndFetchGuildDoc(query, {
                    $set: {
                        [keySetter]: result.id
                    }
                });
                section = MongoManager.getAllSections(ctx.guildDoc!)
                    .find(x => x.uniqueIdentifier === section.uniqueIdentifier)!;
                continue;
            }

            // Case 3: Button
            switch (result.customId) {
                case ButtonConstants.BACK_ID: {
                    await this.mainMenu(ctx, section, botMsg);
                    return;
                }
                case ButtonConstants.UP_ID: {
                    selected = (entries.length + selected - 1) % entries.length;
                    break;
                }
                case ButtonConstants.DOWN_ID: {
                    selected++;
                    selected %= entries.length;
                    break;
                }
                case ButtonConstants.RESET_ID: {
                    ctx.guildDoc = (await MongoManager.updateAndFetchGuildDoc(query, {
                        $set: {
                            [keySetter]: ""
                        }
                    }))!;
                    section = MongoManager.getAllSections(ctx.guildDoc!)
                        .find(x => x.uniqueIdentifier === section.uniqueIdentifier)!;
                    break;
                }
                case ButtonConstants.QUIT_ID: {
                    await this.dispose(ctx, botMsg);
                    return;
                }
            }
        }
    }
}