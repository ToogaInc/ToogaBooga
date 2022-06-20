import { ArgumentType, BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { UserManager } from "../../managers/UserManager";
import { MongoManager } from "../../managers/MongoManager";
import { Collection, MessageSelectMenu } from "discord.js";
import { GlobalFgrUtilities } from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import { AdvancedCollector } from "../../utilities/collectors/AdvancedCollector";
import { ButtonConstants } from "../../constants/ButtonConstants";
import { StringUtil } from "../../utilities/StringUtilities";
import { QuotaManager } from "../../managers/QuotaManager";
import { CommonRegex } from "../../constants/CommonRegex";

export class EditName extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "EDIT_NAME_COMMAND",
            formalCommandName: "Edit Name Command",
            botCommandName: "editname",
            description: "Use to add or change a name of a member.",
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
        const newIgn = ctx.interaction.options.getString("ign", true);
        if (newIgn.length > 14 || !CommonRegex.ONLY_LETTERS.test(newIgn)) {
            await ctx.interaction.reply({
                content: `Your name, \`${newIgn}\`, can only have letters and must be at most 14 letters long.`,
                ephemeral: true
            });

            return -1;
        }

        const resMember = await UserManager.resolveMember(ctx.guild!, mStr, false);

        if (!resMember || resMember.member.user.bot) {
            await ctx.interaction.reply({
                content: `The member, \`${mStr}\`, could not be found, or the member you mentioned is a bot.`,
                ephemeral: true
            });
            return 0;
        }

        const member = resMember.member;
        // Ask if add or change name
        const uniqueIdentifier = StringUtil.generateRandomString(20);
        const addId = `${uniqueIdentifier}_ADD`;
        const replaceId = `${uniqueIdentifier}_REPLACE`;
        const addButton = AdvancedCollector.cloneButton(ButtonConstants.ADD_BUTTON)
            .setCustomId(addId);
        const replaceButton = AdvancedCollector.cloneButton(ButtonConstants.EDIT_BUTTON)
            .setCustomId(replaceId)
            .setLabel("Replace");
        const cancelButton = AdvancedCollector.cloneButton(ButtonConstants.CANCEL_BUTTON)
            .setCustomId(`${uniqueIdentifier}_CANCEL`);
        await ctx.interaction.reply({
            content: `Do you want to __add__ \`${newIgn}\` or __replace__ one of ${member}'s names to \`${newIgn}\`?`,
            allowedMentions: {
                users: []
            },
            components: AdvancedCollector.getActionRowsFromComponents([
                addButton,
                replaceButton,
                cancelButton
            ])
        });

        const selectedOption = await AdvancedCollector.startInteractionEphemeralCollector({
            targetChannel: ctx.channel,
            acknowledgeImmediately: true,
            duration: 60 * 1000,
            targetAuthor: ctx.user
        }, uniqueIdentifier);

        if (!selectedOption || selectedOption.customId.includes("CANCEL")) {
            await ctx.interaction.editReply({
                content: "You did not select an option in time, or you canceled this.",
                components: []
            });
            return 0;
        }

        // See if this particular IGN already exists somewhere else
        // We only want ONE active instance of this IGN anywhere in the bot's database
        const lookup = await MongoManager.findNameInIdNameCollection(newIgn);

        // Deal with potential conflict first
        if (lookup.length > 0 && lookup[0].currentDiscordId !== member.id) {
            const otherEntry = lookup[0];
            await ctx.interaction.editReply({
                content: `The IGN, \`${newIgn}\`, is already in use by another person with the Discord ID`
                    + ` \`${otherEntry.currentDiscordId}\`. Please have an Officer/HRL resolve this.`,
                components: []
            });

            return 0;
        }

        // At this point, if there is an entry, it MUST either be in member's database entry
        // OR it MUST not exist at all


        const bestQuotaToAdd = QuotaManager.findBestQuotaToAdd(ctx.member!, ctx.guildDoc!, "NameAdjustment");
        // Adding
        if (selectedOption.customId === addId) {
            const yesButton = AdvancedCollector.cloneButton(ButtonConstants.YES_BUTTON)
                .setCustomId(uniqueIdentifier + "_yes");
            const noId = uniqueIdentifier + "_no";
            const noButton = AdvancedCollector.cloneButton(ButtonConstants.NO_BUTTON)
                .setCustomId(noId);

            await ctx.interaction.editReply({
                content: `Are you sure you want to add \`${newIgn}\` to ${member}'s database entry & nickname?`,
                components: AdvancedCollector.getActionRowsFromComponents([
                    yesButton,
                    noButton
                ])
            });

            const res = await AdvancedCollector.startInteractionEphemeralCollector({
                targetChannel: ctx.channel,
                acknowledgeImmediately: true,
                duration: 2 * 60 * 1000,
                targetAuthor: ctx.user
            }, uniqueIdentifier);

            if (!res || res.customId === noId) {
                await ctx.interaction.editReply({
                    content: "You did not respond in time or you said `No` to the confirmation question.",
                    components: []
                });

                return 0;
            }

            let addedToDatabase = false;
            if (lookup.length === 0) {
                await MongoManager.addIdNameToIdNameCollection(member, newIgn);
                addedToDatabase = true;
            }

            let changedNickname = false;
            // Make sure we can edit the name
            const allNicknames = member.nickname
                ? UserManager.getAllNames(member.nickname, true)
                : [];
            if ((member.nickname?.length ?? 0) + newIgn.length + 4 <= 32
                && !allNicknames.includes(newIgn.toLowerCase())) {
                const res = await GlobalFgrUtilities.tryExecuteAsync(async () => {
                    if (!member.nickname) {
                        await member.setNickname(newIgn);
                        return true;
                    }
                    await member.setNickname(`${member.nickname} | ${newIgn}`);
                    return true;
                });

                changedNickname = !!res;
            }

            let finalStr = addedToDatabase
                ? `The name, \`${newIgn}\`, has been added to ${member}'s database entry. `
                : `The name, \`${newIgn}\`, has already been added to ${member}'s database entry. `;

            finalStr += changedNickname
                ? "Their nickname has been changed."
                : "Their nickname could not be changed.";

            await ctx.interaction.editReply({
                content: finalStr,
                components: []
            });

            if (bestQuotaToAdd) {
                await QuotaManager.logQuota(ctx.member!, bestQuotaToAdd, "NameAdjustment", 1);
            }

            return 0;
        }

        // Otherwise, changing
        // Key = name (lowercase)
        // Value = [name (normal display), is in database, is in nickname]
        const names = new Collection<string, [string, boolean, boolean]>();
        if (member.nickname) {
            UserManager.getAllNames(member.nickname).forEach(x => names.set(x.toLowerCase(), [x, false, true]));
        }

        const doc = await MongoManager.findIdInIdNameCollection(member.id);
        if (doc.length > 0) {
            doc[0].rotmgNames.forEach(x => {
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
                content: "This person does not have any names to change. Please add a name instead.",
                components: []
            });

            return 0;
        }

        const selectMenu = new MessageSelectMenu()
            .setCustomId(uniqueIdentifier + "_select")
            .setMinValues(1)
            .setMaxValues(1)
            .setPlaceholder("Possible Names to Replace")
            .setOptions(names.map(x => {
                return { value: x[0], label: x[0], description: x[1] ? "In Database" : "Not In Database" };
            }));

        await ctx.interaction.editReply({
            content: `Are you sure you want to add \`${newIgn}\` to ${member}'s database entry & nickname?`
                + " If you want to add this IGN, please __select__ an IGN that you want to replace this IGN with."
                + " Otherwise, press the **Cancel** button to cancel.",
            components: AdvancedCollector.getActionRowsFromComponents([
                selectMenu,
                cancelButton
            ])
        });

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

        const [, newNameInDb] = names.get(newIgn.toLowerCase()) ?? [undefined, false];

        const oldNameLC = res.values[0].toLowerCase();
        const [origName, isInDb, wasNickname] = names.get(oldNameLC)!;
        let updatedDb = false;
        // If the original name is in the database AND the new name is not the same as the old name AND the new name
        // is not already in the database
        if (isInDb && newIgn.toLowerCase() !== oldNameLC && !newNameInDb) {
            const allNames = doc[0].rotmgNames;
            const idx = allNames.findIndex(x => x.lowercaseIgn === oldNameLC);
            if (idx === -1) {
                await ctx.interaction.editReply({
                    content: `An index database error occurred. IGN: ${newIgn}. ID: ${doc[0].currentDiscordId}`,
                    components: []
                });

                return 999;
            }

            allNames[idx].ign = newIgn;
            allNames[idx].lowercaseIgn = newIgn.toLowerCase();

            await MongoManager.getIdNameCollection().updateOne({ currentDiscordId: doc[0].currentDiscordId }, {
                $set: {
                    rotmgNames: allNames
                },
                $push: {
                    pastRealmNames: {
                        ign: oldNameLC,
                        lowercaseIgn: origName,
                        toDate: Date.now()
                    }
                }
            });
            updatedDb = true;
        }

        let updatedName = false;
        const prefix = UserManager.getPrefix(member.nickname!);
        const allNames = UserManager.getAllNames(member.nickname!);
        if (wasNickname && (member.nickname?.length ?? 0) + newIgn.length + 4 <= 32
            && !allNames.map(x => x.toLowerCase()).includes(newIgn.toLowerCase())) {
            const allNames = member.nickname!.split("|");
            const idx = allNames.findIndex(x => x.toLowerCase().includes(oldNameLC));
            if (idx === -1) {
                await ctx.interaction.editReply({
                    content: `An index update error occurred. IGN: ${newIgn}. ID: ${doc[0].currentDiscordId}`,
                    components: []
                });

                return 999;
            }

            allNames[idx] = newIgn;
            let newName = allNames.join(" | ");
            if (prefix && !newName.startsWith(prefix)) {
                newName = prefix + newName;
            }
            const res = await GlobalFgrUtilities.tryExecuteAsync(async () => {
                await member.setNickname(newName);
                return true;
            });
            updatedName = !!res;
        }

        let tFinalStr = updatedDb
            ? `The name, \`${newIgn}\`, has been updated in the ${member}'s database entry. `
            : `The name, \`${newIgn}\`, is already in the ${member}'s database entry. `;

        tFinalStr += updatedName
            ? "Their nickname has been changed."
            : "Their nickname could not be changed.";

        await ctx.interaction.editReply({
            content: tFinalStr,
            components: []
        });

        if (bestQuotaToAdd) {
            await QuotaManager.logQuota(ctx.member!, bestQuotaToAdd, "NameAdjustment", 1);
        }

        return 0;
    }
}