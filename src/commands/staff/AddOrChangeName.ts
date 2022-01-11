import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {UserManager} from "../../managers/UserManager";
import {MongoManager} from "../../managers/MongoManager";
import {Collection, MessageSelectMenu} from "discord.js";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {ButtonConstants} from "../../constants/ButtonConstants";
import {StringUtil} from "../../utilities/StringUtilities";
import {QuotaManager} from "../../managers/QuotaManager";

export class AddOrChangeName extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "ADD_CHANGE_NAME_CMD",
            formalCommandName: "Add or Change Name",
            botCommandName: "addorchangename",
            description: "Adds or changes a name.",
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
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to manage.",
                    type: ArgumentType.String,
                    prettyType: "Member Resolvable (ID, Mention)",
                    required: true,
                    example: ["@Console#8939", "123313141413155"]
                },
                {
                    displayName: "In-Game Name",
                    argName: "ign",
                    desc: "The IGN to add to the member specified",
                    type: ArgumentType.String,
                    prettyType: "String",
                    required: true,
                    example: ["Darkmattr"]
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
        const mStr = ctx.interaction.options.getString("member", true);
        const ign = ctx.interaction.options.getString("ign", true);
        const resMember = await UserManager.resolveMember(ctx.guild!, mStr, false);

        if (!resMember) {
            await ctx.interaction.reply({
                content: `The member, \`${mStr}\`, could not be found.`,
                ephemeral: true
            });
            return 0;
        }

        const member = resMember.member;
        // Ask if add or change name
        const uniqueId = StringUtil.generateRandomString(10);
        await ctx.interaction.reply({
            content: `Do you want to __add__ \`${ign}\` or __edit__ one of ${member}'s names to \`${ign}\`?`,
            components: AdvancedCollector.getActionRowsFromComponents([
                ButtonConstants.ADD_BUTTON,
                ButtonConstants.EDIT_BUTTON
            ])
        });

        const selectedOption = await AdvancedCollector.startInteractionEphemeralCollector({
            targetChannel: ctx.channel,
            acknowledgeImmediately: false,
            duration: 60 * 1000,
            targetAuthor: ctx.user
        }, uniqueId);

        if (!selectedOption) {
            await ctx.interaction.editReply({
                content: "You did not select an option in time."
            });
            return 0;
        }

        const lookup = await MongoManager.findNameInIdNameCollection(ign);

        // Deal with potential conflict first
        if (lookup.length > 0 && lookup[0].currentDiscordId !== member.id) {
            const otherEntry = lookup[0];
            await ctx.interaction.editReply({
                content: `The IGN, \`${ign}\`, is already in use by another person with the Discord ID`
                    + ` \`${otherEntry.currentDiscordId}\`. Please have an Officer/HRL resolve this.`
            });

            return 0;
        }

        const bestQuotaToAdd = QuotaManager.findBestQuotaToAdd(ctx.member!, ctx.guildDoc!, "NameAdjustment");

        // Adding
        if (selectedOption.customId === ButtonConstants.ADD_ID) {
            await ctx.interaction.editReply({
                content: `Are you sure you want to add \`${ign}\` to ${member}'s database entry & nickname?`,
                components: AdvancedCollector.getActionRowsFromComponents([
                    ButtonConstants.YES_BUTTON,
                    ButtonConstants.NO_BUTTON
                ])
            });

            const uniqueIdentifier = StringUtil.generateRandomString(20);
            const res = await AdvancedCollector.startInteractionEphemeralCollector({
                targetChannel: ctx.channel,
                acknowledgeImmediately: false,
                duration: 2 * 60 * 1000,
                targetAuthor: ctx.user
            }, uniqueIdentifier);

            if (!res) {
                await ctx.interaction.editReply({
                    content: "You did not respond in time or you said `No` to the confirmation question.",
                    components: []
                });

                return 0;
            }

            let addedToDatabase = false;
            if (lookup.length === 0) {
                await MongoManager.addIdNameToIdNameCollection(member, ign);
                addedToDatabase = true;
            }

            let changedNickname = false;
            if ((member.nickname?.length ?? 0) + ign.length + 4 <= 32
                && !(member.nickname ?? "").toLowerCase().includes(ign.toLowerCase())) {
                await GlobalFgrUtilities.tryExecuteAsync(async () => {
                    if (member.nickname) {
                        await member.setNickname(ign);
                        return;
                    }
                    await member.setNickname(`${member.nickname} | ${ign}`);
                });

                changedNickname = true;
            }

            let finalStr = addedToDatabase
                ? `The name, \`${ign}\`, has been added to ${member}'s database entry. `
                : `The name, \`${ign}\`, has already been added to ${member}'s database entry. `;

            finalStr += changedNickname
                ? "Their nickname has been changed."
                : "Their nickname could not be changed.";

            await ctx.interaction.editReply({
                content: finalStr
            });

            if (bestQuotaToAdd) {
                await QuotaManager.logQuota(ctx.member!, bestQuotaToAdd, "NameAdjustment", 1);
            }

            return 0;
        }

        // Otherwise, changing
        // Key = name (lowercase)
        // Value = [name (normal), is in database, is in nickname]
        const names = new Collection<string, [string, boolean, boolean]>();
        if (member.nickname) {
            UserManager.getAllNames(member.nickname).forEach(x => names.set(x.toLowerCase(), [x, false, true]));
        }

        if (lookup.length > 0) {
            lookup[0].rotmgNames.forEach(x => {
                const d = names.get(x.lowercaseIgn);
                if (d) {
                    d[1] = true;
                    return;
                }

                names.set(x.lowercaseIgn, [x.ign, true, false]);
            });
        }

        if (names.size === 0) {
            await ctx.interaction.editReply({
                content: "This person does not have any names to change. Please add a name instead."
            });

            return 0;
        }

        const selectMenu = new MessageSelectMenu()
            .setCustomId("select")
            .setMinValues(1)
            .setMaxValues(1)
            .setPlaceholder("Possible Names")
            .setOptions(names.map(x => {
                return {value: x[0], label: x[0], description: x[1] ? "In Database" : "Not In Database"}
            }));
        await ctx.interaction.editReply({
            content: `Are you sure you want to add \`${ign}\` to ${member}'s database entry & nickname?`
                + " If you want to add this IGN, please __select__ an IGN that you want to replace this IGN with."
                + " Otherwise, press the **Cancel** button to cancel.",
            components: AdvancedCollector.getActionRowsFromComponents([
                selectMenu,
                ButtonConstants.CANCEL_BUTTON
            ])
        });

        const uniqueIdentifier = StringUtil.generateRandomString(20);
        const res = await AdvancedCollector.startInteractionEphemeralCollector({
            targetChannel: ctx.channel,
            acknowledgeImmediately: false,
            duration: 2 * 60 * 1000,
            targetAuthor: ctx.user
        }, uniqueIdentifier);

        if (!res || !res.isSelectMenu()) {
            await ctx.interaction.editReply({
                content: "You did not respond in time or you canceled this process.",
                components: []
            });

            return 0;
        }

        const lowerCaseName = res.values[0].toLowerCase();
        const [origName, isInDb, wasNickname] = names.get(lowerCaseName)!;
        let updatedDb = false;
        if (isInDb && ign.toLowerCase() !== lowerCaseName) {
            const allNames = lookup[0].rotmgNames;
            const idx = allNames.findIndex(x => x.lowercaseIgn === lowerCaseName);
            if (idx === -1) {
                await ctx.interaction.editReply({
                    content: `An index database error occurred. IGN: ${ign}. ID: ${lookup[0].currentDiscordId}`,
                    components: []
                });

                return 999;
            }

            allNames[idx].ign = ign;
            allNames[idx].lowercaseIgn = ign.toLowerCase();

            await MongoManager.getIdNameCollection().updateOne({currentDiscordId: lookup[0].currentDiscordId}, {
                $set: {
                    rotmgNames: allNames
                }
            });
            updatedDb = true;
        }

        let updatedName = false;
        if (wasNickname && (member.nickname?.length ?? 0) + ign.length + 4 <= 32
            && (member.nickname ?? "").toLowerCase().includes(ign.toLowerCase())) {
            const allNames = member.nickname!.split("|");
            const idx = allNames.findIndex(x => x.toLowerCase().includes(lowerCaseName));
            if (idx === -1) {
                await ctx.interaction.editReply({
                    content: `An index update error occurred. IGN: ${ign}. ID: ${lookup[0].currentDiscordId}`,
                    components: []
                });

                return 999;
            }

            allNames[idx] = ign;
            await GlobalFgrUtilities.tryExecuteAsync(async () => {
                await member.setNickname(`${member.nickname} | ${ign}`);
            });
            updatedName = true;
        }

        let tFinalStr = updatedDb
            ? `The name, \`${ign}\`, has been updated in the ${member}'s database entry. `
            : `The name, \`${ign}\`, is already in the ${member}'s database entry. `;

        tFinalStr += updatedName
            ? "Their nickname has been changed."
            : "Their nickname could not be changed.";

        await ctx.interaction.editReply({
            content: tFinalStr
        });

        if (bestQuotaToAdd) {
            await QuotaManager.logQuota(ctx.member!, bestQuotaToAdd, "NameAdjustment", 1);
        }

        return 0;
    }
}