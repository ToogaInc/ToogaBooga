import {IConfiguration} from "./definitions/major/IConfiguration";
import {Client, Message, MessageReaction, PartialUser, User} from "discord.js";
import {onReadyEvent} from "./events/ReadyEvent";
import {onMessageEvent} from "./events/MessageEvent";
import {MongoFunctions} from "./common/MongoFunctions";
import * as assert from "assert";
import {onMessageReactionAdd} from "./events/MessageReactionAdd";

export class OneRealmBot {
    private readonly _config: IConfiguration;
    private readonly _bot: Client;
    private _eventsIsStarted: boolean = false;

    public static BotInstance: OneRealmBot;

    /**
     * Constructs a new Discord bot.
     *
     * @param {IConfiguration} config The configuration file.
     */
    public constructor(config: IConfiguration) {
        this._config = config;
        this._bot = new Client({
            partials: [
                "MESSAGE",
                "CHANNEL",
                "REACTION"
            ],
            restTimeOffset: 350
        });

        OneRealmBot.BotInstance = this;
    }

    /**
     * Defines all necessary events for the bot to work.
     */
    public startAllEvents(): void {
        this._bot.on("ready", async () => onReadyEvent());
        this._bot.on("message", async (m: Message) => onMessageEvent(m));
        this._bot.on("messageReactionAdd",
            async (r: MessageReaction, u: User | PartialUser) => onMessageReactionAdd(r, u));
        this._eventsIsStarted = true;
    }

    /**
     * Logs into the bot and connects to the database.
     */
    public async login(): Promise<void> {
        if (!this._eventsIsStarted)
            this.startAllEvents();

        // connects to the database
        await MongoFunctions.connect({
            dbUrl: this._config.database.dbUrl,
            dbName: this._config.database.dbName,
            guildColName: this._config.database.collectionNames.guildCollection,
            userColName: this._config.database.collectionNames.userCollection,
            botColName: this._config.database.collectionNames.botCollection
        });
        // make sure the database is connected
        assert(MongoFunctions.isConnected());
        // logs into the bot
        await this._bot.login(this._config.token);
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
}