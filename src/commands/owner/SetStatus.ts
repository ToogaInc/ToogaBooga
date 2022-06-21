import { ArgumentType, BaseCommand, ICommandContext, ICommandInfo } from "../BaseCommand";
import { ActivitiesOptions, ClientPresenceStatus, PresenceData } from "discord.js";

export class SetStatus extends BaseCommand {
    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "SET_STATUS_COMMAND",
            formalCommandName: "Set Status Command",
            botCommandName: "setstatus",
            description: "Sets the bot's status.",
            commandCooldown: 3,
            generalPermissions: [],
            argumentInfo: [
                {
                    displayName: "Presence",
                    argName: "presence",
                    desc: "The bot's presence (online, idle, do not disturb).",
                    type: ArgumentType.String,
                    restrictions: {
                        stringChoices: [
                            { name: "Online", value: "online" },
                            { name: "Idle", value: "idle" },
                            { name: "Do Not Disturb", value: "dnd" },
                        ]
                    },
                    prettyType: "String",
                    required: false,
                    example: ["Online"]
                },
                {
                    displayName: "Activity",
                    argName: "activity",
                    desc: "The bot's activity (game).",
                    type: ArgumentType.String,
                    prettyType: "String",
                    required: false,
                    example: ["Realm of the Mad God"]
                },
                {
                    displayName: "Activity Type",
                    argName: "activity_type",
                    desc: "The bot's activity type (Playing, Watching, Listening).",
                    type: ArgumentType.String,
                    restrictions: {
                        stringChoices: [
                            { name: "Playing", value: "PLAYING" },
                            { name: "Listening (to)", value: "LISTENING" },
                            { name: "Watching", value: "WATCHING" },
                        ]
                    },
                    prettyType: "String",
                    required: false,
                    example: ["Watching"]
                }
            ],
            botPermissions: [],
            rolePermissions: [],
            guildOnly: false,
            botOwnerOnly: true
        };

        super(cmi);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        const presence = ctx.interaction.options.getString("presence", false);
        const activity = ctx.interaction.options.getString("activity", false);
        const activityType = ctx.interaction.options.getString("activity_type", false);

        const presenceData: PresenceData = {};
        if (presence) {
            presenceData.status = presence as ClientPresenceStatus;
        }

        if (activityType && activity) {
            // We have to do this because a string is not an ActivityTypes
            const fullActivity: ActivitiesOptions = {};
            switch (activityType) {
                case "PLAYING": {
                    fullActivity.type = "PLAYING";
                    break;
                }
                case "LISTENING": {
                    fullActivity.type = "LISTENING";
                    break;
                }
                case "WATCHING": {
                    fullActivity.type = "WATCHING";
                    break;
                }
                default: {
                    fullActivity.type = "PLAYING";
                    break;
                }
            }

            fullActivity.name = activity;
            presenceData.activities = [fullActivity];
        }

        await ctx.user.client.user!.setPresence(presenceData);
        await ctx.interaction.reply({
            ephemeral: true,
            content: "Done!"
        });
        return 0;
    }
}