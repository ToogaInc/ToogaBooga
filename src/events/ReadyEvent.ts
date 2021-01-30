import {OneRealmBot} from "../OneRealmBot";
import {MongoFunctions} from "../common/MongoFunctions";
import {IBotInfo} from "../definitions/major/IBotInfo";
import {StringBuilder} from "../utilities/StringBuilder";
import {MiscUtils} from "../utilities/MiscUtils";
import {PunishmentFunctions} from "../common/PunishmentFunctions";

export async function onReadyEvent(): Promise<void> {
    const botUser = OneRealmBot.BotInstance.client.user;

    // This should theoretically never hit.
    if (!botUser) {
        console.error("Bot user not instantiated.");
        process.exit(1);
    }

    // If mongo isn't connected, then we can't really use the bot.
    if (!MongoFunctions.isConnected()) {
        console.error("Mongo isn't connected! Unable to use bot. Shutting down.");
        process.exit(1);
    }

    // If the bot doc isn't in the database, then we add it.
    const thisBotCollection = await MongoFunctions.getBotCollection()
        .findOne({clientId: botUser.id});

    if (!thisBotCollection) {
        const newCollectionObj: IBotInfo = {
            activeEvents: [],
            clientId: botUser.id
        };

        await MongoFunctions.getBotCollection().insertOne(newCollectionObj);
    }

    // Now, we want to add any guild docs to the database <=> the guild isn't in the database.
    const botGuilds = OneRealmBot.BotInstance.client.guilds.cache;
    const guildDocs = await MongoFunctions.getGuildCollection().find({}).toArray();
    for await (const [id] of botGuilds) {
        if (guildDocs.find(x => x.guildId === id) || OneRealmBot.BotInstance.config.ids.exemptGuilds.includes(id))
            continue;

        await MongoFunctions.getGuildCollection().insertOne(MongoFunctions.getDefaultGuildConfig(id));
    }

    // Delete guild documents corresponding to guilds that the bot is no longer in.
    // Also add suspended people to the timer system
    for await (const doc of guildDocs) {
        const associatedGuild = botGuilds.find(x => x.id === doc.guildId);
        if (associatedGuild) {
            doc.moderation.suspendedUsers.forEach(x => {
                if (PunishmentFunctions.isInSuspensionTimer(x.discordId, associatedGuild))
                    return;
                PunishmentFunctions.addToSuspensionTimer(x, associatedGuild, x.oldRoles);
            });

            doc.guildSections.forEach(section => {
                section.properties.sectionSuspended.forEach(x => {
                    if (PunishmentFunctions.isInSectionSuspensionTimer(x.discordId, section))
                        return;
                    PunishmentFunctions.addToSectionSuspensionTimer(x, associatedGuild, section);
                });
            });
            continue;
        }

        await MongoFunctions.getGuildCollection().deleteOne({guildId: doc.guildId});
    }

    PunishmentFunctions.startChecker();

    const readyLog = new StringBuilder()
        .append(`${botUser.tag} has started successfully.`)
        .appendLine()
        .append(`Time: ${MiscUtils.getTime()}`);

    console.info(readyLog.toString());
}