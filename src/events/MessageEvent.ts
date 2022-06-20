import { Message } from "discord.js";
import { InteractivityManager } from "../managers/InteractivityManager";
import { ModmailManager } from "../managers/ModmailManager";
import { MessageUtilities } from "../utilities/MessageUtilities";
import { EmojiConstants } from "../constants/EmojiConstants";

export async function onMessageEvent(msg: Message): Promise<void> {
    // We do not support messages in guilds; they must only be in DMs
    if (msg.guild || msg.author.bot) {
        return;
    }

    if (InteractivityManager.ACTIVE_DIRECT_MESSAGES.has(msg.author.id)) {
        return;
    }

    const guildSelected = await ModmailManager.selectGuild(msg.author);
    if (!guildSelected) {
        return;
    }

    const res = await ModmailManager.sendMessageToThread(msg, guildSelected);
    if (!res) {
        return;
    }

    await MessageUtilities.tryReact(msg, EmojiConstants.MAIL_EMOJI);
}