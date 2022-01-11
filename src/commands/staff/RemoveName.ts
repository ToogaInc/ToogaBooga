import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {UserManager} from "../../managers/UserManager";
import {MongoManager} from "../../managers/MongoManager";
import {Collection, MessageSelectMenu} from "discord.js";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {ButtonConstants} from "../../constants/ButtonConstants";
import {StringUtil} from "../../utilities/StringUtilities";
import {QuotaManager} from "../../managers/QuotaManager";

export class RemoveName extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "REMOVE_NAME_CMD",
            formalCommandName: "Remove Name",
            botCommandName: "removename",
            description: "Removes a name.",
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
        const resMember = await UserManager.resolveMember(ctx.guild!, mStr, false);

        if (!resMember) {
            await ctx.interaction.reply({
                content: `The member, \`${mStr}\`, could not be found.`,
                ephemeral: true
            });
            return 0;
        }

        const bestQuotaToAdd = QuotaManager.findBestQuotaToAdd(ctx.member!, ctx.guildDoc!, "NameAdjustment");

        const member = resMember.member;
        // Make sure they have a document to begin with
        await MongoManager.addIdNameToIdNameCollection(member);
        const idNameDoc = await MongoManager.findIdInIdNameCollection(member.id);
        const namesInDb = idNameDoc.length > 0 ? idNameDoc[0].rotmgNames : [];
        // Key = name (lowercase)
        // Value = [name (normal), is in database, is in nickname]
        const names = new Collection<string, [string, boolean, boolean]>();
        if (member.nickname) {
            UserManager.getAllNames(member.nickname).forEach(x => names.set(x.toLowerCase(), [x, false, true]));
        }

        if (namesInDb.length > 0) {
            namesInDb.forEach(x => {
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
                content: "This person does not have any names to remove. Please add a name instead.",
                components: []
            });

            return 0;
        }

        const uniqueIdentifier = StringUtil.generateRandomString(20);
        const selectMenu = new MessageSelectMenu()
            .setCustomId(uniqueIdentifier + "_select")
            .setMinValues(1)
            .setMaxValues(1)
            .setPlaceholder("Possible Names to Remove")
            .setOptions(names.map(x => {
                return {value: x[0], label: x[0], description: x[1] ? "In Database" : "Not In Database"}
            }));
        const cancelButton = AdvancedCollector.cloneButton(ButtonConstants.CANCEL_BUTTON)
            .setCustomId(uniqueIdentifier + "_cancel");
        await ctx.interaction.reply({
            content: `Please select one name to remove from ${member}'s database entry. If you want to cancel this,`
                + " press the **Cancel** button.",
            allowedMentions: {
                users: []
            },
            components: AdvancedCollector.getActionRowsFromComponents([
                selectMenu,
                cancelButton
            ])
        });

        const res = await AdvancedCollector.startInteractionEphemeralCollector({
            targetChannel: ctx.channel,
            acknowledgeImmediately: true,
            duration: 60 * 1000,
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
        if (isInDb) {
            if (idNameDoc.length > 0 && idNameDoc[0].currentDiscordId !== member.id) {
                await ctx.interaction.editReply({
                    content: `A ID-mismatch database error occurred. ID: ${member.id}`,
                    components: []
                });

                return 999;
            }

            const idx = namesInDb.findIndex(x => x.lowercaseIgn === lowerCaseName);
            if (idx === -1) {
                await ctx.interaction.editReply({
                    content: `An index database error occurred. ID: ${member.id}`,
                    components: []
                });

                return 999;
            }

            namesInDb.splice(idx, 1);

            await MongoManager.getIdNameCollection().updateOne({currentDiscordId: member.id}, {
                $set: {
                    rotmgNames: namesInDb
                },
                $push: {
                    pastRealmNames: {
                        ign: lowerCaseName,
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
        if (wasNickname && allNames.length > 1) {
            const idx = allNames.findIndex(x => x.toLowerCase().includes(lowerCaseName));
            if (idx === -1) {
                await ctx.interaction.editReply({
                    content: `An index update error occurred. ID: ${member.id}`,
                    components: []
                });

                return 999;
            }

            allNames.splice(idx, 1);

            let newName = allNames.join(" | ");
            if (prefix && !newName.startsWith(prefix)) {
                newName = prefix + newName;
            }
            await GlobalFgrUtilities.tryExecuteAsync(async () => {
                await member.setNickname(newName);
            });
            updatedName = true;
        }

        let tFinalStr = updatedDb
            ? `The name, \`${origName}\`, has been removed from the ${member}'s database entry. `
            : `The name, \`${origName}\`, wasn't in the ${member}'s database entry. `;

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