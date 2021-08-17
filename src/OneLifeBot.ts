import {IConfiguration} from "./definitions";
import {
    Client,
    Collection, Guild,
    Interaction,
    Message
} from "discord.js";
import {MongoManager} from "./managers/MongoManager";
import * as assert from "assert";
import axios, {AxiosInstance} from "axios";
import {BaseCommand} from "./commands";
import {onGuildCreateEvent, onInteractionEvent, onMessageEvent, onReadyEvent} from "./events";

export class OneLifeBot {
    private readonly _config: IConfiguration;
    private readonly _bot: Client;
    private _eventsIsStarted: boolean = false;

    public static BotInstance: OneLifeBot;
    public static AxiosClient: AxiosInstance = axios.create();
    public static Commands: Collection<string, BaseCommand[]>;

    /**
     * Constructs a new Discord bot.
     *
     * @param {IConfiguration} config The configuration file.
     */
    public constructor(config: IConfiguration | null) {
        if (!config)
            throw new Error("No config file given.");

        this._config = config;
        this._bot = new Client({
            partials: [
                "MESSAGE",
                "CHANNEL"
            ],
            intents: [
                "GUILDS",
                "GUILD_MEMBERS",
                "GUILD_MESSAGES",
                "GUILD_MESSAGE_REACTIONS",
                "DIRECT_MESSAGES"
            ]
        });

        OneLifeBot.BotInstance = this;
        OneLifeBot.Commands = new Collection<string, BaseCommand[]>();
    }

    /**
     * Defines all necessary events for the bot to work.
     */
    public startAllEvents(): void {
        this._bot.on("ready", async () => onReadyEvent());
        this._bot.on("messageCreate", async (m: Message) => onMessageEvent(m));
        this._bot.on("interactionCreate", async (i: Interaction) => onInteractionEvent(i));
        this._bot.on("guildCreate", async (g: Guild) => onGuildCreateEvent(g));
        this._eventsIsStarted = true;
    }

    /**
     * Logs into the bot and connects to the database.
     */
    public async login(): Promise<void> {
        if (!this._eventsIsStarted)
            this.startAllEvents();

        // connects to the database
        await MongoManager.connect({
            dbUrl: this._config.database.connectionString,
            dbName: this._config.database.dbName,
            guildColName: this._config.database.collectionNames.guildCollection,
            userColName: this._config.database.collectionNames.userCollection,
            botColName: this._config.database.collectionNames.botCollection,
            idNameColName: this.config.database.collectionNames.idNameCollection,
            unclaimedBlName: this.config.database.collectionNames.unclaimedBlCollection
        });
        // make sure the database is connected
        assert(MongoManager.isConnected());
        // logs into the bot
        await this._bot.login(this._config.botToken);
    }

    /***
     * Initializes all optional services. These are normally timers or intervals.
     *
     * @returns {boolean} Whether the services all started successfully.
     */
    public initServices(): boolean {
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
}