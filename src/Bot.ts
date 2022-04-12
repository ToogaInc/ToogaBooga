import {IConfiguration} from "./definitions";
import {
    Client,
    Collection,
    DMChannel,
    Guild,
    GuildChannel,
    GuildMember,
    Interaction,
    Message, PartialGuildMember,
    PartialMessage,
    ThreadChannel,
    VoiceState
} from "discord.js";
import {MongoManager} from "./managers/MongoManager";
import axios, {AxiosInstance} from "axios";
import * as Cmds from "./commands";
import {
    onChannelDeleteEvent,
    onErrorEvent,
    onGuildCreateEvent,
    onGuildMemberAdd, 
    onGuildMemberUpdate,
    onInteractionEvent,
    onMessageDeleteEvent,
    onMessageEvent,
    onReadyEvent,
    onThreadArchiveEvent,
    onVoiceStateEvent
} from "./events";
import {QuotaService} from "./managers/QuotaManager";
import {REST} from "@discordjs/rest";
import {RESTPostAPIApplicationCommandsJSONBody, Routes} from "discord-api-types/v10";
import {Logger} from "./utilities/Logger";

const LOGGER: Logger = new Logger(__filename, false);

export class Bot {

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
    private readonly _config: IConfiguration;
    private readonly _bot: Client;
    private _eventsIsStarted: boolean = false;
    private readonly _instanceStarted: Date;

    /**
     * Constructs a new Discord bot.
     *
     * @param {IConfiguration} config The configuration file.
     * @throws {Error} If a command name was registered twice or if `data.name` is not equal to `botCommandName`.
     */
    public constructor(config: IConfiguration | null) {

        if (!config) {
            LOGGER.error("No config file given.");
            throw new Error("No config file given.");
        }

        this._instanceStarted = new Date();
        this._config = config;
        this._bot = new Client({
            partials: [
                "MESSAGE",
                "CHANNEL",
                "GUILD_MEMBER",
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
        LOGGER.info(`Starting Bot`);

        LOGGER.info(`Configuring commands`);
        Bot.Commands = new Collection<string, Cmds.BaseCommand[]>();

        Bot.Commands.set("Bot Information", [
            new Cmds.Ping(),
            new Cmds.BotInfo(),
            new Cmds.Help()
        ]);

        Bot.Commands.set("General", [
            new Cmds.Stats()
        ]);

        Bot.Commands.set("Moderator", [
            new Cmds.ForceSync(),
            new Cmds.LoggingSync()
        ]);

        Bot.Commands.set("Staff", [
            new Cmds.Find(),
            new Cmds.FindPunishment(),
            new Cmds.Leaderboard(),
            new Cmds.ListAll(),
            new Cmds.Yoink(),
            new Cmds.Clean(),
            new Cmds.Purge(),
            new Cmds.Poll(),
            new Cmds.Parse(),
            new Cmds.EditName(),
            new Cmds.RemoveName(),
            new Cmds.CheckBlacklist(),
            new Cmds.ManualVerifyMain(),
            new Cmds.ManualVerifySection(),
            new Cmds.RemovePunishment()
        ]);

        Bot.Commands.set("Configuration", [
            new Cmds.ConfigChannels(),
            new Cmds.ConfigRoles(),
            new Cmds.ConfigSections(),
            new Cmds.ConfigDungeons(),
            new Cmds.ConfigReactionsImages(),
            new Cmds.ConfigQuotas(),
            new Cmds.ConfigVerification(),
            new Cmds.ConfigAfkCheck(),
            new Cmds.ConfigEarlyLocRoles()
        ]);

        Bot.Commands.set("Punishments", [
            new Cmds.Warn(),
            new Cmds.Suspend(),
            new Cmds.Unsuspend(),
            new Cmds.SectionSuspend(),
            new Cmds.SectionUnsuspend(),
            new Cmds.Blacklist(),
            new Cmds.Unblacklist(),
            new Cmds.Mute(),
            new Cmds.Unmute(),
            new Cmds.ModmailBlacklist(),
            new Cmds.ModmailUnblacklist()
        ]);

        Bot.Commands.set("Bot Owner", [
            new Cmds.SendAnnouncement(),
            new Cmds.SetStatus()
        ]);

        Bot.Commands.set("Raid Leaders", [
            new Cmds.StartHeadcount(),
            new Cmds.StartAfkCheck()
        ]);

        Bot.Commands.set("Logging", [
            new Cmds.LogRun(),
            new Cmds.LogKey(),
            new Cmds.LogParse(),
            new Cmds.GivePoints()
        ]);

        Bot.Commands.set("Modmail", [
            new Cmds.Reply(),
            new Cmds.Archive()
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

    /**
     * Defines all necessary events for the bot to work.
     */
    public startAllEvents(): void {
        if (this._eventsIsStarted)
            return;

        LOGGER.info("Starting all events");

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
        this._bot.on("guildMemberUpdate", async (
            o: GuildMember | PartialGuildMember,
            n: GuildMember | PartialGuildMember
        ) => onGuildMemberUpdate(o, n));
        this._eventsIsStarted = true;
    }

    /**
     * Logs into the bot and connects to the database.
     */
    public async login(): Promise<void> {
        if (!this._eventsIsStarted)
            this.startAllEvents();

        // connects to the database
        LOGGER.info("Connecting bot to database");
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
        LOGGER.info("Logging in bot");
        await this._bot.login(this._config.tokens.botToken);
    }

    /***
     * Initializes all optional services. These are normally timers or intervals.
     *
     * @returns {boolean} Whether the services all started successfully.
     */
    public initServices(): boolean {
        // MuteManager + SuspensionManager started in ready event.
        LOGGER.info("Starting Quota Service");
        QuotaService.startService().then();

        LOGGER.info("Caching Members of Each Guild");
        const guilds = this.client.guilds;
        guilds.cache.forEach(guild => { 
            guild.members.fetch();
        })
        return true;
    }
}