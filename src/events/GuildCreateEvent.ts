import {Guild} from "discord.js";
import {MongoManager} from "../managers/MongoManager";

export async function onGuildCreateEvent(guild: Guild): Promise<void> {
    const guildDoc = await MongoManager.getOrCreateGuildDoc(guild.id);
    MongoManager.CachedGuildCollection.set(guild.id, guildDoc);
}