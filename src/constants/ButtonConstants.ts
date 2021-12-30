import {MessageActionRow, MessageButton} from "discord.js";
import {EmojiConstants} from "./EmojiConstants";
import {AdvancedCollector} from "../utilities/collectors/AdvancedCollector";

export namespace ButtonConstants {
    export const CANCEL_ID: string = "cancel";
    export const CANCEL_BUTTON: Readonly<MessageButton> = new MessageButton()
        .setLabel("Cancel")
        .setCustomId(CANCEL_ID)
        .setEmoji(EmojiConstants.X_EMOJI)
        .setStyle("DANGER");

    export const QUIT_ID: string = "quit";
    export const QUIT_BUTTON: Readonly<MessageButton> = new MessageButton()
        .setLabel("Quit")
        .setCustomId(QUIT_ID)
        .setEmoji(EmojiConstants.X_EMOJI)
        .setStyle("DANGER");

    export const SAVE_ID: string = "save";
    export const SAVE_BUTTON: Readonly<MessageButton> = new MessageButton()
        .setLabel("Save")
        .setCustomId(SAVE_ID)
        .setEmoji(EmojiConstants.GREEN_CHECK_EMOJI)
        .setStyle("SUCCESS");

    export const CANCEL_LOGGING_ID: string = "cancel_logging_id";
    export const CANCEL_LOGGING_BUTTON: Readonly<MessageButton> = new MessageButton()
        .setCustomId(CANCEL_LOGGING_ID)
        .setEmoji(EmojiConstants.WASTEBIN_EMOJI)
        .setLabel("Cancel Logging")
        .setStyle("DANGER");

    export const BACK_ID: string = "back";
    export const BACK_BUTTON: Readonly<MessageButton> = new MessageButton()
        .setLabel("Go Back")
        .setStyle("DANGER")
        .setCustomId(BACK_ID)
        .setEmoji(EmojiConstants.LONG_LEFT_ARROW_EMOJI);

    export const YES_ID: string = "yes";
    export const YES_BUTTON: Readonly<MessageButton> = new MessageButton()
        .setCustomId(YES_ID)
        .setStyle("SUCCESS")
        .setEmoji(EmojiConstants.GREEN_CHECK_EMOJI)
        .setLabel("Yes");

    export const NO_ID: string = "no";
    export const NO_BUTTON: Readonly<MessageButton> = new MessageButton()
        .setCustomId(NO_ID)
        .setStyle("DANGER")
        .setEmoji(EmojiConstants.X_EMOJI)
        .setLabel("No");

    export const YES_NO_ACTION_BUTTONS: MessageActionRow[] = AdvancedCollector.getActionRowsFromComponents([
        YES_BUTTON, NO_BUTTON
    ]);

    export const EDIT_ID: string = "edit";
    export const EDIT_BUTTON: Readonly<MessageButton> = new MessageButton()
        .setLabel("Edit")
        .setCustomId(EDIT_ID)
        .setEmoji(EmojiConstants.PENCIL_EMOJI)
        .setStyle("PRIMARY");

    export const ADD_ID: string = "add";
    export const ADD_BUTTON: Readonly<MessageButton> = new MessageButton()
        .setLabel("Add")
        .setEmoji(EmojiConstants.PLUS_EMOJI)
        .setCustomId(ADD_ID)
        .setStyle("PRIMARY");

    export const REMOVE_ID: string = "remove";
    export const REMOVE_BUTTON: Readonly<MessageButton> = new MessageButton()
        .setLabel("Remove")
        .setEmoji(EmojiConstants.WASTEBIN_EMOJI)
        .setCustomId(REMOVE_ID)
        .setStyle("DANGER");

    export const PREVIOUS_ID: string = "previous";
    export const PREVIOUS_BUTTON: Readonly<MessageButton> = new MessageButton()
        .setLabel("Previous")
        .setCustomId(PREVIOUS_ID)
        .setStyle("PRIMARY")
        .setEmoji(EmojiConstants.LONG_LEFT_ARROW_EMOJI);

    export const NEXT_ID: string = "next";
    export const NEXT_BUTTON: Readonly<MessageButton> = new MessageButton()
        .setLabel("Next")
        .setCustomId(NEXT_ID)
        .setStyle("PRIMARY")
        .setEmoji(EmojiConstants.LONG_RIGHT_TRIANGLE_EMOJI);

    export const UP_ID: string = "up";
    export const UP_BUTTON: Readonly<MessageButton> = new MessageButton()
        .setLabel("Up")
        .setEmoji(EmojiConstants.UP_TRIANGLE_EMOJI)
        .setCustomId(UP_ID)
        .setStyle("PRIMARY");

    export const DOWN_ID: string = "down";
    export const DOWN_BUTTON: Readonly<MessageButton> = new MessageButton()
        .setLabel("Down")
        .setEmoji(EmojiConstants.DOWN_TRIANGLE_EMOJI)
        .setCustomId(DOWN_ID)
        .setStyle("PRIMARY");

    export const RESET_ID: string = "reset";
    export const RESET_BUTTON: Readonly<MessageButton> = new MessageButton()
        .setLabel("Reset")
        .setEmoji(EmojiConstants.WASTEBIN_EMOJI)
        .setCustomId(RESET_ID)
        .setStyle("PRIMARY");

    export const STOP_ID: string = "stop";
    export const STOP_BUTTON: Readonly<MessageButton> = new MessageButton()
        .setStyle("DANGER")
        .setEmoji(EmojiConstants.STOP_SIGN_EMOJI)
        .setLabel("Stop")
        .setCustomId(STOP_ID);
}