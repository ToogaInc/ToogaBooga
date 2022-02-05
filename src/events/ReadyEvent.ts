import {Bot} from "../Bot";
import {MongoManager} from "../managers/MongoManager";
import {StringBuilder} from "../utilities/StringBuilder";
import {IBotInfo} from "../definitions";
import {MuteManager, SuspensionManager} from "../managers/PunishmentManager";
import {TimeUtilities} from "../utilities/TimeUtilities";
import {RaidInstance} from "../instances/RaidInstance";
import getMongoClient = MongoManager.getMongoClient;
import {HeadcountInstance} from "../instances/HeadcountInstance";
import {Logger} from "../utilities/Logger";

const LOGGER: Logger = new Logger(__filename, false);

export async function onReadyEvent(): Promise<void> {
    const botUser = Bot.BotInstance.client.user;

    // This should theoretically never hit.
    if (!botUser) {
        LOGGER.error("Bot user not instantiated.");
        process.exit(1);
    }

    // This will throw an error if something went wrong when trying to connect.
    LOGGER.info("Getting the MongoDB Client.");
    getMongoClient();

    // If the bot doc isn't in the database, then we add it.
    LOGGER.info("Ensuring bot is in the database.");
    const thisBotCollection = await MongoManager.getBotCollection()
        .findOne({clientId: botUser.id});

    if (!thisBotCollection) {
        LOGGER.info("Bot not found in database, adding to database collection.");
        const newCollectionObj: IBotInfo = {
            activeEvents: [],
            clientId: botUser.id
        };

        await MongoManager.getBotCollection().insertOne(newCollectionObj);
    }

    // Now, we want to add any guild docs to the database <=> the guild isn't in the database.
    LOGGER.info("Ensuring each guild is in the database.");
    await Promise.all(Bot.BotInstance.client.guilds.cache.map(async x => {
        if (Bot.BotInstance.config.ids.exemptGuilds.includes(x.id))
            return null;
        await MongoManager.getOrCreateGuildDoc(x.id, false);
    }));

    LOGGER.info("Resuming any interrupted instances.");
    const guildDocs = await MongoManager.getGuildCollection().find({}).toArray();
    await Promise.all([
        MuteManager.startChecker(guildDocs),
        SuspensionManager.startChecker(guildDocs),
        ...guildDocs.filter(x => Bot.BotInstance.client.guilds.cache.has(x.guildId)).map(guildDoc => {
            if (guildDoc.activeHeadcounts) {
                guildDoc.activeHeadcounts.forEach(async hc => {
                    await HeadcountInstance.createNewLivingInstance(guildDoc, hc);
                });
            }

            guildDoc.activeRaids.forEach(async raid => {
                await RaidInstance.createNewLivingInstance(guildDoc, raid);
            });
        })
    ]);

    LOGGER.info(`${botUser.tag} events have started successfully.`);
}