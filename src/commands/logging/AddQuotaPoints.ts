import { ArgumentType, BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { UserManager } from "../../managers/UserManager";
import { MongoManager } from "../../managers/MongoManager";
import { QuotaManager } from "../../managers/QuotaManager";

export class AddQuotaPoints extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "ADD_QUOTA_POINTS_COMMAND",
            formalCommandName: "Add Quota Points Command",
            botCommandName: "addquotapoints",
            description: "Adds quota points to a member, defaulting to yourself.  Use negative number to remove points.",
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
                "HeadRaidLeader",
                "Officer",
                "Moderator"
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
        const points = ctx.interaction.options.getInteger("points", true);

        // See if there is another member to log as. We also need to make sure
        // there is a database entry available
        const resMember = mStr
            ? (await UserManager.resolveMember(ctx.guild!, mStr))?.member ?? ctx.member!
            : ctx.member!;
        await MongoManager.addIdNameToIdNameCollection(resMember);
        await MongoManager.getOrCreateUserDoc(resMember.id);

        const resultDoc = await QuotaManager.addQuotaPts(resMember, ctx.guild!.id, points);
        const newPoints = resultDoc?.details.quotaPoints.find(x => x.key === ctx.guild!.id)?.value;
        await ctx.interaction.reply({
            components: [],
            content: `Added \`${points}\` point(s) to ${resMember} for a new total of ${newPoints}.`,
            embeds: []
        });

        return 0;
    }
}