import {OneRealmBot} from "../OneRealmBot";
import {MongoManager} from "../managers/MongoManager";
import {IBotInfo} from "../definitions/major/IBotInfo";
import {StringBuilder} from "../utilities/StringBuilder";
import {MiscUtilities} from "../utilities/MiscUtilities";
import {PunishmentManager} from "../managers/PunishmentManager";

export async function onReadyEvent(): Promise<void> {
    const botUser = OneRealmBot.BotInstance.client.user;

    // This should theoretically never hit.
    if (!botUser) {
        console.error("Bot user not instantiated.");
        process.exit(1);
    }

    // If mongo isn't connected, then we can't really use the bot.
    if (!MongoManager.isConnected()) {
        console.error("Mongo isn't connected! Unable to use bot. Shutting down.");
        process.exit(1);
    }

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
    const botGuilds = OneRealmBot.BotInstance.client.guilds.cache;
    const guildDocs = await MongoManager.getGuildCollection().find({}).toArray();
    for await (const [id] of botGuilds) {
        if (guildDocs.find(x => x.guildId === id) || OneRealmBot.BotInstance.config.ids.exemptGuilds.includes(id))
            continue;

        await MongoManager.getGuildCollection().insertOne(MongoManager.getDefaultGuildConfig(id));
    }

    // Delete guild documents corresponding to guilds that the bot is no longer in.
    // Also add suspended people to the timer system
    for await (const doc of guildDocs) {
        const associatedGuild = botGuilds.find(x => x.id === doc.guildId);
        if (associatedGuild) {
            doc.moderation.suspendedUsers.forEach(x => {
                if (PunishmentManager.isInSuspensionTimer(x.discordId, associatedGuild))
                    return;
                PunishmentManager.addToSuspensionTimer(x, associatedGuild, x.oldRoles);
            });

            doc.guildSections.forEach(section => {
                section.properties.sectionSuspended.forEach(x => {
                    if (PunishmentManager.isInSectionSuspensionTimer(x.discordId, section))
                        return;
                    PunishmentManager.addToSectionSuspensionTimer(x, associatedGuild, section);
                });
            });
            continue;
        }

        await MongoManager.getGuildCollection().deleteOne({guildId: doc.guildId});
    }

    PunishmentManager.startChecker();

    const readyLog = new StringBuilder()
        .append(`${botUser.tag} has started successfully.`)
        .appendLine()
        .append(`Time: ${MiscUtilities.getTime()}`);

    console.info(readyLog.toString());
}