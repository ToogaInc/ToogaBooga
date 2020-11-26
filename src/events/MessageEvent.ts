import { Message } from "discord.js";

export async function onMessage(msg: Message): Promise<void> {
    if (msg.type !== "DEFAULT" || msg.author.bot) {
        return;
    }

    if (msg.guild !== null) {
        
    }
}