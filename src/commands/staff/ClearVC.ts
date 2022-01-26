import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {VoiceChannel} from "discord.js";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import {Logger} from "../../utilities/Logger";

export class ClearVC extends BaseCommand {
    private _logger = new Logger(__filename);
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "CLEAR_VC_CMD",
            formalCommandName: "Clear VC",
            botCommandName: "clear",
            description: "Removes all members from a VC.",
            rolePermissions: [
                "Security",
                "Officer",
                "Moderator",
                "RaidLeader",
                "HeadRaidLeader",
                "VeteranRaidLeader"
            ],
            generalPermissions: [],
            botPermissions: ["MOVE_MEMBERS"],
            commandCooldown: 3 * 1000,
            argumentInfo: [
                {
                    displayName: "VC to Remove Members from",
                    argName: "vc",
                    desc: "The voice channel that should be cleared.",
                    type: ArgumentType.Channel,
                    prettyType: "Voice Channel",
                    required: true,
                    example: ["Raid 1"]
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
        const channel = ctx.interaction.options.getChannel("vc", true);
        this._logger.info(`${ctx.member?.displayName} used ClearVC on ${channel}`);

        if (!(channel instanceof VoiceChannel)) {
            await ctx.interaction.reply({
                content: "You must select a voice channel for this to work.",
                ephemeral: true
            });
            return -1;
        }
        
        await ctx.interaction.deferReply();
        let ct = 0;
        await Promise.all(
            channel.members.map(async x => {
                await GlobalFgrUtilities.tryExecuteAsync(async () => {
                    await x.voice.disconnect();
                    ct++;
                });
            })
        );
        
        this._logger.info(`${ctx.member?.displayName} used ClearVC to remove ${ct} users from ${channel}`);
        await ctx.interaction.editReply({
            content: `Disconnected ${ct} members from ${channel}.`
        });

        return 0;
    }
}