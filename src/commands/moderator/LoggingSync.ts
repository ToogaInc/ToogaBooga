import {BaseCommand, ICommandContext, ICommandInfo} from "../BaseCommand";
import {MongoManager} from "../../managers/MongoManager";
import {MessageUtilities} from "../../utilities/MessageUtilities";
import {Logger} from "../../utilities/Logger";

const LOGGER: Logger = new Logger(__filename, false);
export class LoggingSync extends BaseCommand {
    private _isRunning: boolean = false;

    public constructor() {
        const cmi: ICommandInfo = {
            cmdCode: "LOGGING_SYNC_COMMAND",
            formalCommandName: "Logging Sync",
            botCommandName: "loggingsync",
            description: "Force syncs all users who have logs with the database.",
            rolePermissions: [
                "Moderator"
            ],
            generalPermissions: [],
            botPermissions: [],
            commandCooldown: 15 * 60 * 1000,
            argumentInfo: [],
            guildOnly: true,
            botOwnerOnly: false
        };

        super(cmi);
    }

    /**
     * @inheritDoc
     */
    public async run(ctx: ICommandContext): Promise<number> {
        if (this._isRunning) {
            await ctx.interaction.reply({
                content: "This command is currently in use. Please wait a bit.",
                ephemeral: true
            });

            return -1;
        }

        const guild = ctx.guild!;
        const guildDoc = ctx.guildDoc!;
        const usersWithLogs = guildDoc.properties.usersWithLogs ?? [];
        const startingCount = usersWithLogs.length;

        this._isRunning = true;

        let embed = MessageUtilities.generateBlankEmbed(ctx.guild!, "RANDOM")
            .setTitle("Preparing to Sync.")
            .setDescription(`Started with ${startingCount} members with logs.\nFetching all members in this server...`)
            .setFooter({text: "This might take a while, please wait."})
            .setTimestamp();

        await ctx.interaction.reply({
            embeds: [embed]
        });

        const allMembers = await guild.members.fetch()

        embed = MessageUtilities.generateBlankEmbed(ctx.guild!, "RANDOM")
            .setTitle("Syncing.")
            .setDescription(`Started with ${startingCount} members with logs.\nFound ${allMembers.size} members. Checking logs...`)
            .setFooter({text: "This might take a while, please wait."})
            .setTimestamp();

        await ctx.interaction.editReply({
            embeds: [embed]
        });

        LOGGER.debug(usersWithLogs.map(user => user.discordId));

        let usersAdded = 0;
        for(const member of allMembers){
            const resolvedUser = await MongoManager.getOrCreateUserDoc(member[1].id);
            const info = resolvedUser.loggedInfo;
            if(info.length === 0) continue;
            if(usersWithLogs.find(user => user.discordId === resolvedUser.discordId)) continue;
            usersWithLogs.push(resolvedUser);
            usersAdded++;
        }

        LOGGER.debug(usersWithLogs.map(user => user.discordId));

        this._isRunning = false;

        await MongoManager.updateAndFetchGuildDoc({guildId: guild.id}, {
            $set: {
                "properties.usersWithLogs": usersWithLogs
            }
        });

        embed = MessageUtilities.generateBlankEmbed(ctx.guild!, "RANDOM")
            .setTitle("Finished Sync.")
            .setDescription(`Started with ${startingCount} members with logs.\nFound ${usersAdded} additional members with logs, for a total of ${usersWithLogs.length} members with logs.`)
            .setTimestamp();

        await ctx.interaction.editReply({
            embeds: [embed]
        });
        return 0;
    }
}