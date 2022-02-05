import {ArgumentType, BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {VoiceChannel} from "discord.js";
import {GlobalFgrUtilities} from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import {Logger} from "../../utilities/Logger";

const LOGGER: Logger = new Logger(__filename, false);
export class YoinkVC extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "YOINK_VC_CMD",
            formalCommandName: "Yoink VC",
            botCommandName: "yoink",
            description: "Moves all members from a VC to the person's current VC.",
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
                    displayName: "VC to Steal Members from",
                    argName: "vc",
                    desc: "The voice channel where the bot should move the members out of.",
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
        if (!ctx.member!.voice.channel) {
            await ctx.interaction.reply({
                content: "You need to be in a voice channel.",
                ephemeral: true
            });
            return -1;
        }

        const channel = ctx.interaction.options.getChannel("vc", true);
        if (!(channel instanceof VoiceChannel)) {
            await ctx.interaction.reply({
                content: "You must select a voice channel for this to work.",
                ephemeral: true
            });
            return -1;
        }

        if (!(ctx.member!.voice.channel instanceof VoiceChannel)) {
            await ctx.interaction.reply({
                content: "This command can only be executed in a voice channel.",
                ephemeral: true
            });
            return -1;
        }

        await ctx.interaction.deferReply();
        let ct = 0;
        await Promise.all(
            channel.members.map(async x => {
                await GlobalFgrUtilities.tryExecuteAsync(async () => {
                    await x.voice.setChannel(ctx.member!.voice.channel!);
                    ct++;
                });
            })
        );
        
        LOGGER.info(`${ctx.member?.displayName} used YoinkVC to move ${ct} users from ${channel} to ${ctx.member!.voice.channel!}`);
        await ctx.interaction.editReply({
            content: `Moved ${ct} members from ${channel} to ${ctx.member!.voice.channel!}.`
        });

        return 0;
    }
}