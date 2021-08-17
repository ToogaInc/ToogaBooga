import {Guild} from "discord.js";
import {MongoManager} from "../managers/MongoManager";

export async function onGuildCreateEvent(guild: Guild): Promise<void> {
    await MongoManager.getOrCreateGuildDoc(guild.id, false);
}