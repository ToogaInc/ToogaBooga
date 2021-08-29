import {BaseCommand, ICommandContext} from "../BaseCommand";

export class StartAfkCheck extends BaseCommand {
    public static readonly START_AFK_CMD_CODE: string = "AFK_CHECK_START";

    public constructor() {
        super({
            cmdCode: StartAfkCheck.START_AFK_CMD_CODE,
            formalCommandName: "Start AFK Check Command",
            botCommandName: "startafkcheck",
            description: "Starts a wizard that can be used to start an AFK check.",
            usageGuide: ["startafkcheck"],
            exampleGuide: ["startafkcheck"],
            commandCooldown: 8 * 1000,
            generalPermissions: [],
            botPermissions: [],
            rolePermissions: ["RaidLeader", "AlmostRaidLeader", "HeadRaidLeader", "VeteranRaidLeader"],
            guildOnly: true,
            botOwnerOnly: false
        });
    }

    /** @inheritDoc */
    public async run(ctx: ICommandContext): Promise<number> {
        // Step 1: Ask for the appropriate section
        return 0;
    }
}