import { ArgumentType, BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { VoiceChannel } from "discord.js";
import { GlobalFgrUtilities } from "../../utilities/fetch-get-request/GlobalFgrUtilities";
import { Logger } from "../../utilities/Logger";

const LOGGER: Logger = new Logger(__filename, false);

export class Clean extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "CLEAN_COMMAND",
            formalCommandName: "Clean Command",
            botCommandName: "clean",
            description: "Removes all members from a VC.",
            rolePermissions: [
                "Security",
                "Officer",
                "Moderator",
                "AlmostRaidLeader",
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
                    desc: "The voice channel that should be cleaned.",
                    type: ArgumentType.Channel,
                    restrictions: {
                        // 2 is the constant value for GuildVoice
                        channelModifier: o => o.addChannelType(2)
                    },
                    prettyType: "Voice Channel",
                    required: true,
                    example: ["Raid 1"]
                },
                {
                    displayName: "Whether to Clean Staff",
                    argName: "staff",
                    desc: "Whether to remove staff from the vc. Default is false.",
                    type: ArgumentType.Boolean,
                    prettyType: "Boolean",
                    required: false,
                    example: ["True", "False"]
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
        const guildDoc = ctx.guildDoc;
        const channel = ctx.interaction.options.getChannel("vc", true);
        const member = ctx.member;
        const removeStaff = ctx.interaction.options.getBoolean("staff", false) ?? false;

        if (!member) {
            await ctx.interaction.reply({
                content: "An unknown error occurred.",
                ephemeral: true
            });
            return -1;
        }

        if (!guildDoc) {
            await ctx.interaction.reply({
                content: "An unknown error occurred.",
                ephemeral: true
            });
            return -1;
        }

        // Enforce that this is a VC (for type checking purposes) and in case
        // discord.js decides to change the constant value of the GuildVoice
        // channel. 
        if (!(channel instanceof VoiceChannel)) {
            await ctx.interaction.reply({
                content: "You must select a voice channel for this to work.",
                ephemeral: true
            });
            return -1;
        }

        LOGGER.info(`${member.displayName} used CleanVC on ${channel}`);
        await ctx.interaction.deferReply();

        let ct = 0;
        const teamRoleId = guildDoc.roles.staffRoles.teamRoleId;

        await Promise.all(
            channel.members.map(async x => {
                await GlobalFgrUtilities.tryExecuteAsync(async () => {
                    // Do not clean staff members
                    if (x.roles.cache.has(teamRoleId) && !removeStaff) {
                        return;
                    }
                    await x.voice.disconnect();
                    ct++;
                });
            })
        );

        LOGGER.info(`${ctx.member?.displayName} used CleanVC to remove ${ct} users from ${channel}`);
        await ctx.interaction.editReply({
            content: `Disconnected ${ct} members from ${channel}.`
        });

        return 0;
    }
}