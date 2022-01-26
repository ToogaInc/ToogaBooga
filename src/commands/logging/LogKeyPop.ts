import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {UserManager} from "../../managers/UserManager";
import {MongoManager} from "../../managers/MongoManager";
import {MessageSelectMenu} from "discord.js";
import {ArrayUtilities} from "../../utilities/ArrayUtilities";
import {StringUtil} from "../../utilities/StringUtilities";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {LoggerManager} from "../../managers/LoggerManager";
import {ButtonConstants} from "../../constants/ButtonConstants";
import {MAPPED_AFK_CHECK_REACTIONS} from "../../constants/dungeons/MappedAfkCheckReactions";

export class LogKeyPop extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "LOG_KEY_POP_COMMAND",
            formalCommandName: "Log Key Pop(s) Command",
            botCommandName: "logkey",
            description: "Logs one or more key pops.",
            commandCooldown: 0,
            generalPermissions: [],
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to log this key for. If no member is specified, this will log for you.",
                    type: ArgumentType.String,
                    prettyType: "Member Resolvable (ID, Mention, IGN)",
                    required: false,
                    example: ["@Console#8939", "123313141413155", "Darkmattr"]
                },
                {
                    displayName: "Keys",
                    argName: "keys",
                    desc: "The number of keys popped. Default is 1.",
                    type: ArgumentType.Integer,
                    prettyType: "Integer",
                    required: false,
                    example: ["5"]
                }
            ],
            botPermissions: [],
            rolePermissions: [
                "RaidLeader",
                "AlmostRaidLeader",
                "HeadRaidLeader",
                "VeteranRaidLeader",
                "Officer",
                "Moderator",
                "Security",
                "Helper"
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
        const mStr = ctx.interaction.options.getString("member", false);
        const keys = ctx.interaction.options.getInteger("keys", false) ?? 1;

        if (keys === 0) {
            await ctx.interaction.reply({
                ephemeral: true,
                content: "You aren't logging anything."
            });

            return 0;
        }

        // See if there is another member to log as. We also need to make sure
        // there is a database entry available
        const resMember = mStr
            ? (await UserManager.resolveMember(ctx.guild!, mStr))?.member ?? ctx.member!
            : ctx.member!;
        await MongoManager.addIdNameToIdNameCollection(resMember);
        await MongoManager.getOrCreateUserDoc(resMember.id);

        // Grab all dungeons, ask which one to log
        const allKeys = Object.keys(MAPPED_AFK_CHECK_REACTIONS)
            .filter(x => MAPPED_AFK_CHECK_REACTIONS[x].type === "KEY"
                || MAPPED_AFK_CHECK_REACTIONS[x].type === "NM_KEY")
            .map(x => {
                return {key: x, val: MAPPED_AFK_CHECK_REACTIONS[x]};
            });

        const subsets = ArrayUtilities.breakArrayIntoSubsets(allKeys, 25);

        const selectMenus: MessageSelectMenu[] = [];
        const uniqueId = StringUtil.generateRandomString(20);
        for (let i = 0; i < Math.min(4, subsets.length); i++) {
            selectMenus.push(
                new MessageSelectMenu()
                    .setCustomId(`${uniqueId}_${i}`)
                    .setMaxValues(1)
                    .setMinValues(1)
                    .setOptions(subsets[i].map(y => {
                        return {
                            label: y.val.name,
                            description: y.val.type,
                            value: y.key,
                            emoji: y.val.emojiInfo.identifier
                        };
                    }))
            );
        }

        const userToLogFor = resMember.id === ctx.user.id ? "yourself" : resMember.toString();
        await ctx.interaction.reply({
            embeds: [
                MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
                    .setTitle("Manually Logging Keys")
                    .setDescription(`You are logging \`${keys}\` key(s) for ${userToLogFor}.`)
                    .addField(
                        "Confirmation",
                        "If the above is correct, please select the key from the below list to complete this"
                        + " logging process. If you made a mistake, press the **Cancel** button and re-run this"
                        + " command with the proper values."
                    )
            ],
            components: AdvancedCollector.getActionRowsFromComponents([
                ...selectMenus,
                AdvancedCollector.cloneButton(ButtonConstants.CANCEL_BUTTON)
                    .setCustomId(uniqueId + ButtonConstants.CANCEL_ID)
            ])
        });

        const selectedKey = await AdvancedCollector.startInteractionEphemeralCollector({
            targetAuthor: ctx.user,
            acknowledgeImmediately: false,
            targetChannel: ctx.channel,
            duration: 2 * 60 * 1000
        }, uniqueId);

        if (!selectedKey || !selectedKey.isSelectMenu()) {
            await ctx.interaction.editReply({
                components: [],
                content: "You either did not select a key to log or canceled this process.",
                embeds: []
            });

            return 0;
        }

        await LoggerManager.logKeyUse(
            resMember,
            selectedKey.values[0],
            keys
        );

        await ctx.interaction.editReply({
            components: [],
            content: `Logging completed! As a reminder, you are logging \`${keys}\` key(s) for ${userToLogFor}.`,
            embeds: []
        });

        return 0;
    }
}