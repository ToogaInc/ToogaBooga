import { ArgumentType, BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { UserManager } from "../../managers/UserManager";
import { MongoManager } from "../../managers/MongoManager";
import { LoggerManager } from "../../managers/LoggerManager";

export class GivePoints extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "GIVE_POINTS_COMMAND",
            formalCommandName: "Give Points Command",
            botCommandName: "givepoints",
            description: "Gives points to a member, defaulting to yourself.",
            commandCooldown: 0,
            generalPermissions: [],
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to give points to. If no member is specified, this will give points to you.",
                    type: ArgumentType.String,
                    prettyType: "Member Resolvable (ID, Mention, IGN)",
                    required: false,
                    example: ["@Console#8939", "123313141413155", "Darkmattr"]
                },
                {
                    displayName: "Points",
                    argName: "points",
                    desc: "The number of points to give.",
                    type: ArgumentType.Integer,
                    prettyType: "Integer",
                    required: true,
                    example: ["5"]
                }
            ],
            botPermissions: [],
            rolePermissions: [
                "RaidLeader",
                "HeadRaidLeader",
                "VeteranRaidLeader",
                "Officer",
                "Moderator",
                "Security"
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
        const points = ctx.interaction.options.getInteger("points", false) ?? 20;

        if (points === 0) {
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
        await LoggerManager.logPoints(resMember, points);
        await ctx.interaction.reply({
            components: [],
            content: `Logging completed! As a reminder, you gave \`${points}\` point(s) to ${resMember}.`,
            embeds: []
        });

        return 0;
    }
}