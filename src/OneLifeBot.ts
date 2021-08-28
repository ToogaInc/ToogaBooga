import {IConfiguration} from "./definitions";
import {
    Client,
    Collection, Guild,
    Interaction,
    VoiceState
} from "discord.js";
import {MongoManager} from "./managers/MongoManager";
import * as assert from "assert";
import axios, {AxiosInstance} from "axios";
import {BaseCommand} from "./commands";
import {onGuildCreateEvent, onInteractionEvent, onReadyEvent, onVoiceStateEvent} from "./events";
import {QuotaService} from "./managers/QuotaManager";
import {REST} from "@discordjs/rest";
import {APIApplicationCommandOption, Routes} from "discord-api-types";

export class OneLifeBot {
    private readonly _config: IConfiguration;
    private readonly _bot: Client;
    private _eventsIsStarted: boolean = false;

    public static BotInstance: OneLifeBot;
    public static AxiosClient: AxiosInstance = axios.create();

    public static Commands: BaseCommand[];
    public static AllCommands: Collection<string, BaseCommand>;
    public static JsonCommands: {
        name: string;
        description: string;
        options: APIApplicationCommandOption[];
        default_permission: boolean | undefined;
    }[];

    public static Rest: REST;

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
        OneLifeBot.Commands = [];

        // add commands to Commands collection

        OneLifeBot.AllCommands = new Collection<string, BaseCommand>();
        OneLifeBot.JsonCommands = [];
        OneLifeBot.Rest = new REST({version: "9"}).setToken(config.botToken);
        for (const command of OneLifeBot.Commands) {
            OneLifeBot.AllCommands.set(command.data.name, command);
            OneLifeBot.JsonCommands.push(command.data.toJSON());
        }

        // If length is 0, register globally
        (async () => {
            if (config.slash.guildIds.length === 0) {
                await OneLifeBot.Rest.put(
                    Routes.applicationCommands(config.slash.clientId),
                    { body: OneLifeBot.JsonCommands }
                );
            }
            else {
                await Promise.all(
                    config.slash.guildIds.map(async guildId => {
                        await OneLifeBot.Rest.put(
                            Routes.applicationGuildCommands(config.slash.clientId, guildId),
                            { body: OneLifeBot.JsonCommands }
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
        this._bot.on("ready", async () => onReadyEvent());
        this._bot.on("interactionCreate", async (i: Interaction) => onInteractionEvent(i));
        this._bot.on("guildCreate", async (g: Guild) => onGuildCreateEvent(g));
        this._bot.on("voiceStateUpdate", async (o: VoiceState, n: VoiceState) => onVoiceStateEvent(o, n));
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
        // MuteManager + SuspensionManager started in ready event.
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
}