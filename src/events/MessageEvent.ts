import { Message } from "discord.js";

export async function onMessageEvent(msg: Message): Promise<void> {
    if (msg.type !== "DEFAULT" || msg.author.bot) {
        return;
    }

    // Command handler

}