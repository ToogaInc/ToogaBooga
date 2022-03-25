import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {Role} from "discord.js";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";


export class ListAll extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "LIST_ALL_CMD",
            formalCommandName: "ListAll",
            botCommandName: "listall",
            description: "Lists all users who have the provided role.",
            rolePermissions: [
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
                    displayName: "Role to List",
                    argName: "role",
                    desc: "The role to be listed.",
                    type: ArgumentType.Role,
                    prettyType: "String",
                    required: true,
                    example: ["Oryx Leader", "Security"]
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
        const role = ctx.interaction.options.getRole("role", true) as Role;
        const users = role.members;

        const limit = 4096;
        const str = Array.from(users.values()).map(user => user.displayName).join(`, `);
        if(str.length > limit){
            await ctx.interaction.reply({
                content: `Too many members for role: ${role.name}.`,
                ephemeral: true
            });
            return -1;
        }

        const embed = MessageUtilities.generateBlankEmbed(ctx.user, "RANDOM")
            .setAuthor({
                name: `${ctx.member?.displayName}`,
                iconURL: ctx.user.displayAvatarURL()
            })
            .setTitle(`Members of Role ${role.name}`)
            .setTimestamp(null)
            .setDescription(str);

        const m = await GlobalFgrUtilities.sendMsg(ctx.channel, {embeds: [embed]});
        if (!m) {
            await ctx.interaction.reply({
                content: "Something went wrong when trying to send the list of users.",
                ephemeral: true
            });
            return -1;
        }

        await ctx.interaction.reply({
            content: `Listed ${users.size} members from role ${role.name}`,
            ephemeral: true
        });

        return 0;
    }
}