import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {UserManager} from "../../managers/UserManager";
import {MongoManager} from "../../managers/MongoManager";
import {StringUtil} from "../../utilities/StringUtilities";
import {AdvancedCollector} from "../../utilities/collectors/AdvancedCollector";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {StringBuilder} from "../../utilities/StringBuilder";
import {QuotaManager} from "../../managers/QuotaManager";
import {ButtonConstants} from "../../constants/ButtonConstants";
import {Logger} from "../../utilities/Logger";

export class LogParse extends BaseCommand{

    private _logger : Logger;

    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "LOG_PARSE_COMMAND",
            formalCommandName: "Log Parse(s) Command",
            botCommandName: "logparse",
            description: "Logs one or more parses that a staff performed.",
            commandCooldown: 0,
            generalPermissions: [],
            argumentInfo: [
                {
                    displayName: "Member",
                    argName: "member",
                    desc: "The member to log a parse for. If no member is specified, this will log for you.",
                    type: ArgumentType.String,
                    prettyType: "Member Resolvable (ID, Mention, IGN)",
                    required: false,
                    example: ["@Console#8939", "123313141413155", "Darkmattr"]
                },
                {
                    displayName: "Completed Parses",
                    argName: "completed",
                    desc: "The number of completed parses.  If not provided, defaults to 1.",
                    type: ArgumentType.Integer,
                    prettyType: "Integer",
                    required: false,
                    example: ["5"]
                },
            ],
            botPermissions: [],
            rolePermissions: [
                "Helper",
                "Officer",
                "Moderator"
            ],
            guildOnly: true,
            botOwnerOnly: false
        };
        super(cmi);        

        this._logger = new Logger(__filename);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        
        const mStr = ctx.interaction.options.getString("member", false);

        let memberToLogAs = ctx.member!;
        // See if there is another member to log as. We also need to make sure
        // there is a database entry available
        const resMember = mStr
            ? await UserManager.resolveMember(ctx.guild!, mStr)
            : null;
        if (resMember) {
            if (!resMember.idNameDoc) {
                await MongoManager.addIdNameToIdNameCollection(resMember.member);
            }

            if (!resMember.userDoc) {
                await MongoManager.getOrCreateUserDoc(resMember.member.id);
            }

            memberToLogAs = resMember.member;
        }
        else {
            await MongoManager.addIdNameToIdNameCollection(memberToLogAs);
            await MongoManager.getOrCreateUserDoc(memberToLogAs.id);
        }

        const cInt = ctx.interaction.options.getInteger("completed", false) ?? 1;

        this._logger.info("Logging " + cInt + " parses for " + memberToLogAs.displayName + "...");

        const uniqueId = StringUtil.generateRandomString(20);
        await ctx.interaction.reply({
            embeds: [
                MessageUtilities.generateBlankEmbed(ctx.guild!, "RED")
                    .setTitle("Manually Logging Parses")
                    .setDescription(
                        new StringBuilder()
                            .append("You are logging the following parses for ")
                            .append(memberToLogAs.id === ctx.user.id ? "yourself" : memberToLogAs.toString())
                            .append(":").appendLine()
                            .append(`- \`${cInt}\` Parses.`).appendLine()
                            .toString()
                    )
                    .addField(
                        "Confirmation",
                        "If the above is correct, please select **Continue**.  Otherwise, "
                        + "press the **Cancel** button and re-run this"
                        + " command with the proper values."
                    )
            ],
            components: AdvancedCollector.getActionRowsFromComponents([
                AdvancedCollector.cloneButton(ButtonConstants.CONTINUE_BUTTON)
                    .setCustomId(uniqueId + ButtonConstants.CONTINUE_ID),
                AdvancedCollector.cloneButton(ButtonConstants.CANCEL_BUTTON)
                    .setCustomId(uniqueId + ButtonConstants.CANCEL_ID)
            ])
        });


        const selection = await AdvancedCollector.startInteractionEphemeralCollector({
            targetAuthor: ctx.user,
            acknowledgeImmediately: false,
            targetChannel: ctx.channel,
            duration: 1.5 * 60 * 1000
        }, uniqueId);

        if (!selection || selection.customId === uniqueId+ButtonConstants.CANCEL_ID){
            this._logger.info("Logparse cancelled for " + memberToLogAs.displayName);
            await ctx.interaction.editReply({
                components: [],
                content: "You cancelled the logging process.",
                embeds: []
            });
            return 0;
        }   
        
        const roleId = QuotaManager.findBestQuotaToAdd(memberToLogAs, ctx.guildDoc!, "Parse");
        if (roleId) {
            await QuotaManager.logQuota(memberToLogAs!, roleId, "Parse", cInt);
        }

        await ctx.interaction.editReply({
            components: [],
            content: new StringBuilder()
                .append(`Logging completed! As a reminder, you logged \`${cInt}\``)
                .append("parses for ").append(memberToLogAs.id === ctx.user.id ? "yourself" : memberToLogAs.toString())
                .toString(),
            embeds: []
        });

        this._logger.info("Logparse completed for " + memberToLogAs.displayName);
        return 0;
    }
}