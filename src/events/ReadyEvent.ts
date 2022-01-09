import {OneLifeBot} from "../OneLifeBot";
import {MongoManager} from "../managers/MongoManager";
import {StringBuilder} from "../utilities/StringBuilder";
import {IBotInfo} from "../definitions";
import {MuteManager, SuspensionManager} from "../managers/PunishmentManager";
import {TimeUtilities} from "../utilities/TimeUtilities";
import {RaidInstance} from "../instances/RaidInstance";
import getMongoClient = MongoManager.getMongoClient;
import {HeadcountInstance} from "../instances/HeadcountInstance";

export async function onReadyEvent(): Promise<void> {
    const botUser = OneLifeBot.BotInstance.client.user;

    // This should theoretically never hit.
    if (!botUser) {
        console.error("Bot user not instantiated.");
        process.exit(1);
    }

    // This will throw an error if something went wrong when trying to connect.
    getMongoClient();

    // If the bot doc isn't in the database, then we add it.
    const thisBotCollection = await MongoManager.getBotCollection()
        .findOne({clientId: botUser.id});

    if (!thisBotCollection) {
        const newCollectionObj: IBotInfo = {
            activeEvents: [],
            clientId: botUser.id
        };

        await MongoManager.getBotCollection().insertOne(newCollectionObj);
    }

    // Now, we want to add any guild docs to the database <=> the guild isn't in the database.
    await Promise.all(OneLifeBot.BotInstance.client.guilds.cache.map(async x => {
        if (OneLifeBot.BotInstance.config.ids.exemptGuilds.includes(x.id))
            return null;
        await MongoManager.getOrCreateGuildDoc(x.id, false);
    }));

    const guildDocs = await MongoManager.getGuildCollection().find({}).toArray();
    await Promise.all([
        MuteManager.startChecker(guildDocs),
        SuspensionManager.startChecker(guildDocs),
        ...guildDocs.filter(x => OneLifeBot.BotInstance.client.guilds.cache.has(x.guildId)).map(guildDoc => {
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

    const readyLog = new StringBuilder()
        .append(`${botUser.tag} has started successfully.`)
        .appendLine()
        .append(`Time: ${TimeUtilities.getDateTime()}`);

    console.info(readyLog.toString());
}