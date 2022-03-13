import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {MongoManager} from "../../managers/MongoManager";

export class RemovePunishmentHistory extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "REMOVE_PUNISHMENT_HISTORU",
            formalCommandName: "Remove Punishment History",
            botCommandName: "removepunishhist",
            description: "Removes the punishment entry from the user's profile. Note that this completely removes the"
                + " punishment history from the database.",
            rolePermissions: [
                "Officer",
                "Moderator",
                "HeadRaidLeader"
            ],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 3 * 1000,
            argumentInfo: [
                {
                    displayName: "Moderation ID",
                    argName: "moderation_id",
                    desc: "The moderation ID associated with the punishment that you want to remove.",
                    type: ArgumentType.String,
                    prettyType: "String",
                    required: true,
                    example: ["Suspend_1641697466314_jDQI2q0AXppriKa"]
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
        const modId = ctx.interaction.options.getString("moderation_id", true);
        const res = await MongoManager.getUserCollection().findOne({
            $or: [
                {
                    "details.moderationHistory.actionId": modId,
                    "details.moderationHistory.guildId": ctx.guild!.id
                },
                {
                    "details.moderationHistory.resolved.actionId": modId,
                    "details.moderationHistory.resolved.guildId": ctx.guild!.id
                }
            ]
        });

        if (!res) {
            await ctx.interaction.reply({
                content: `The moderation ID, \`${modId}\`, was not found.`
            });

            return -1;
        }

        const modHistObj = res.details.moderationHistory
            .find(x => x.actionId === modId || x.resolved?.actionId === modId)!;

        if (!modHistObj.resolved && modHistObj.moderationType !== "Warn") {
            await ctx.interaction.reply({
                content: `The punishment associated with the moderation ID, \`${modId}\`, is currently active. Please`
                    + " unsuspend/unmute/unblacklist this person and then run this command again."
            });

            return -1;
        }

        const r = await MongoManager.getUserCollection().updateOne({
            discordId: res.discordId,
        }, {
            $pull: {
                "details.moderationHistory": {
                    actionId: modHistObj.actionId
                }
            }
        });

        await ctx.interaction.reply({
            content: r.modifiedCount > 0
                ? `Removed moderation ID \`${modId}\` from the user with Discord ID \`${res.discordId}\`.`
                : `An unknown error occurred when trying to remove moderation ID \`${modId}\`. Try again later.`
        });

        return 0;
    }
}