import {IConfiguration} from "./definitions";
import {
    Client,
    Collection, DMChannel, Guild, GuildChannel, GuildMember,
    Interaction, Message, PartialMessage, ThreadChannel,
    VoiceState
} from "discord.js";
import {MongoManager} from "./managers/MongoManager";
import axios, {AxiosInstance} from "axios";
import * as Cmds from "./commands";
import {
    onErrorEvent,
    onGuildCreateEvent,
    onInteractionEvent,
    onMessageEvent,
    onReadyEvent,
    onVoiceStateEvent,
    onThreadArchiveEvent,
    onChannelDeleteEvent,
    onMessageDeleteEvent,
    onGuildMemberAdd
} from "./events";
import {QuotaService} from "./managers/QuotaManager";
import {REST} from "@discordjs/rest";
import {RESTPostAPIApplicationCommandsJSONBody, Routes} from "discord-api-types/v9";
import {Logger} from "./utilities/Logger";

export class Bot {

    private _logger: Logger;

    private readonly _config: IConfiguration;
    private readonly _bot: Client;
    private _eventsIsStarted: boolean = false;
    private readonly _instanceStarted: Date;

    /**
     * The bot instance.
     * @type {Bot}
     */
    public static BotInstance: Bot;

    /**
     * The HTTP client used to make web requests.
     * @type {AxiosInstance}
     */
    public static AxiosClient: AxiosInstance = axios.create();

    /**
     * All commands. The key is the category name and the value is the array of commands.
     * @type {Collection<string, BaseCommand[]>}
     */
    public static Commands: Collection<string, Cmds.BaseCommand[]>;

    /**
     * All commands. The key is the name of the command (essentially, the slash command name) and the value is the
     * command object.
     *
     * **DO NOT MANUALLY POPULATE THIS OBJECT.**
     *
     * @type {Collection<string, BaseCommand>}
     */
    public static NameCommands: Collection<string, Cmds.BaseCommand>;

    /**
     * All commands. This is sent to Discord for the purpose of slash commands.
     *
     * **DO NOT MANUALLY POPULATE THIS OBJECT.**
     *
     * @type {object[]}
     */
    public static JsonCommands: RESTPostAPIApplicationCommandsJSONBody[];

    public static Rest: REST;

    /**
     * Constructs a new Discord bot.
     *
     * @param {IConfiguration} config The configuration file.
     * @throws {Error} If a command name was registered twice or if `data.name` is not equal to `botCommandName`.
     */
    public constructor(config: IConfiguration | null) {
        this._logger = new Logger(__filename, false);

        if (!config) {
            this._logger.error("No config file given.");
            throw new Error("No config file given.");
        }

        this._instanceStarted = new Date();
        this._config = config;
        this._bot = new Client({
            partials: [
                "MESSAGE",
                "CHANNEL"
            ],
            intents: [
                // Need guild information for database, server management.
                "GUILDS",
                // Need guild members for managing member roles (suspensions, mutes, etc.), tracking join/leave, etc.
                "GUILD_MEMBERS",
                // Need guild messages for various collectors, AFK check confirmation, etc.
                "GUILD_MESSAGES",
                // Need direct messages for modmail
                "DIRECT_MESSAGES",
                // Need guild emojis for custom emojis
                "GUILD_EMOJIS_AND_STICKERS",
                // For checking voice channel changes
                "GUILD_VOICE_STATES",
                // For getting reaction data
                "GUILD_MESSAGE_REACTIONS"
            ]
        });
        Bot.BotInstance = this;
        this._logger.info(`Starting Bot`);

        this._logger.info(`Configuring commands`);
        Bot.Commands = new Collection<string, Cmds.BaseCommand[]>();

        Bot.Commands.set("Bot Information", [
            new Cmds.Ping(),
            new Cmds.BotInfo(),
            new Cmds.Help()
        ]);

        Bot.Commands.set("General", [
            new Cmds.GetStats()
        ]);

        Bot.Commands.set("Moderator", [
            new Cmds.ForceSync()
        ]);

        Bot.Commands.set("Staff", [
            new Cmds.FindPunishment(),
            new Cmds.CheckBlacklist(),
            new Cmds.FindPerson(),
            new Cmds.ManualVerifyMain(),
            new Cmds.ManualVerifySection(),
            new Cmds.AddOrChangeName(),
            new Cmds.RemoveName(),
            new Cmds.ParseRaidVc(),
            new Cmds.YoinkVC(),
            new Cmds.Poll(),
            new Cmds.Purge()
        ]);

        Bot.Commands.set("Configuration", [
            new Cmds.ConfigureChannels(),
            new Cmds.ConfigureRoles(),
            new Cmds.ConfigureSections(),
            new Cmds.ConfigureDungeons(),
            new Cmds.ConfigureReactionsImages(),
            new Cmds.ConfigureQuotas(),
            new Cmds.ConfigureVerification(),
            new Cmds.ConfigureAfkCheck()
        ]);

        Bot.Commands.set("Punishments", [
            new Cmds.SuspendMember(),
            new Cmds.SectionSuspendMember(),
            new Cmds.BlacklistMember(),
            new Cmds.WarnMember(),
            new Cmds.MuteMember(),
            new Cmds.UnmuteMember(),
            new Cmds.UnblacklistMember(),
            new Cmds.UnsuspendMember(),
            new Cmds.UnsuspendFromSection()
        ]);

        Bot.Commands.set("Bot Owner", [
            new Cmds.SendAnnouncement()
        ]);

        Bot.Commands.set("Raid Leaders", [
            new Cmds.StartAfkCheck(),
            new Cmds.StartHeadcount()
        ]);

        Bot.Commands.set("Logging", [
            new Cmds.LogLedRun(),
            new Cmds.LogKeyPop(),
            new Cmds.LogParse(),
            new Cmds.GivePoints()
        ]);

        Bot.Commands.set("Modmail", [
            new Cmds.ReplyToThread(),
            new Cmds.ArchiveThread()
        ]);

        Bot.JsonCommands = [];
        Bot.NameCommands = new Collection<string, Cmds.BaseCommand>();
        Bot.Rest = new REST({version: "9"}).setToken(config.tokens.botToken);
        for (const command of Array.from(Bot.Commands.values()).flat()) {
            Bot.JsonCommands.push(command.data.toJSON() as RESTPostAPIApplicationCommandsJSONBody);

            if (command.data.name !== command.commandInfo.botCommandName)
                throw new Error(`Names not matched: "${command.data.name}" - "${command.commandInfo.botCommandName}"`);

            if (Bot.NameCommands.has(command.data.name))
                throw new Error(`Duplicate command "${command.data.name}" registered.`);

            Bot.NameCommands.set(command.data.name, command);
        }

        // If length is 0, register globally
        (async () => {
            if (config.slash.guildIds.length === 0) {
                await Bot.Rest.put(
                    Routes.applicationCommands(config.slash.clientId),
                    {body: Bot.JsonCommands}
                );
            }
            else {
                await Promise.all(
                    config.slash.guildIds.map(async guildId => {
                        await Bot.Rest.put(
                            Routes.applicationGuildCommands(config.slash.clientId, guildId),
                            {body: Bot.JsonCommands}
                        );
                    })
                );
            }
        })();
    }

    /**
     * Defines all necessary events for the bot to work.
     */
    public startAllEvents(): void {
        if (this._eventsIsStarted)
            return;

        this._logger.info("Starting all events");

        this._bot.on("ready", async () => onReadyEvent());
        this._bot.on("interactionCreate", async (i: Interaction) => onInteractionEvent(i));
        this._bot.on("guildCreate", async (g: Guild) => onGuildCreateEvent(g));
        this._bot.on("voiceStateUpdate", async (o: VoiceState, n: VoiceState) => onVoiceStateEvent(o, n));
        this._bot.on("messageCreate", async (m: Message) => onMessageEvent(m));
        this._bot.on("error", async (e: Error) => onErrorEvent(e));
        this._bot.on("threadUpdate", async (o: ThreadChannel, n: ThreadChannel) => onThreadArchiveEvent(o, n));
        this._bot.on("channelDelete", async (c: DMChannel | GuildChannel) => onChannelDeleteEvent(c));
        this._bot.on("messageDelete", async (m: Message | PartialMessage) => onMessageDeleteEvent(m));
        this._bot.on("guildMemberAdd", async (m: GuildMember) => onGuildMemberAdd(m));
        this._eventsIsStarted = true;
    }

    /**
     * Logs into the bot and connects to the database.
     */
    public async login(): Promise<void> {
        if (!this._eventsIsStarted)
            this.startAllEvents();

        // connects to the database
        this._logger.info("Connecting bot to database");
        await MongoManager.connect({
            dbUrl: this._config.database.connectionString,
            dbName: this._config.database.dbName,
            guildColName: this._config.database.collectionNames.guildCollection,
            userColName: this._config.database.collectionNames.userCollection,
            botColName: this._config.database.collectionNames.botCollection,
            idNameColName: this.config.database.collectionNames.idNameCollection,
            unclaimedBlName: this.config.database.collectionNames.unclaimedBlCollection
        });

        // logs into the bot
        this._logger.info("Logging in bot");
        await this._bot.login(this._config.tokens.botToken);
    }

    /***
     * Initializes all optional services. These are normally timers or intervals.
     *
     * @returns {boolean} Whether the services all started successfully.
     */
    public initServices(): boolean {
        // MuteManager + SuspensionManager started in ready event.
        this._logger.info("Starting Quota Service");
        QuotaService.startService().then();
        return true;
    }

    /**
     * Returns the Discord client.
     *
     * @returns {Client} The client.
     */
    public get client(): Client {
        return this._bot;
    }

    /**
     * Returns the Configuration object.
     *
     * @returns {IConfiguration} The configuration object.
     */
    public get config(): IConfiguration {
        return this._config;
    }

    /**
     * Returns the date and time for which this instance was started.
     * @return {Date} The date.
     */
    public get instanceStarted(): Date {
        return this._instanceStarted;
    }
}