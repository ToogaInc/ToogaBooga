import {Message} from "discord.js";

export async function onMessageEvent(msg: Message): Promise<void> {
    // We do not support messages in guilds; they must only be in DMs
    if (msg.guild) {
        return;
    }
}