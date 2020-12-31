import {ColorResolvable, EmojiResolvable} from "discord.js";
import {IReactionProps} from "./IReactionProps";

export interface IDungeonInfo {
    codeName: string;
    dungeonName: string;
    portalEmojiId: string;
    keyData: Array<IReactionProps>;
    reactions: Array<IReactionProps>;
    portalLink: string;
    bossLinks: Array<string>;
    dungeonColors: Array<ColorResolvable>;
    dungeonCategory: ""
        | "Basic Dungeons"
        | "Godland Dungeons"
        | "Endgame Dungeons"
        | "Event Dungeons"
        | "Special Event Dungeons"
        | "Mini Dungeons"
        | "Heroic Dungeons";
}