import {Message} from "discord.js";
import {ModmailManager} from "../managers/ModmailManager";

export async function onMessageEvent(msg: Message): Promise<void> {
    // We do not support messages in guilds; they must only be in DMs
    if (msg.guild) {
        return;
    }

    await ModmailManager.initiateModmailContact(msg.author, msg);
}