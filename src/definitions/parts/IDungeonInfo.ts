import {ColorResolvable} from "discord.js";
import {IReactionProps} from "./IReactionProps";

export interface IDungeonInfo {
    codeName: string;
    dungeonName: string;
    portalEmojiId: string;
    keyData: IReactionProps[];
    reactions: IReactionProps[];
    portalLink: string;
    bossLinks: string[];
    dungeonColors: ColorResolvable[];
    dungeonCategory: ""
        | "Basic Dungeons"
        | "Godland Dungeons"
        | "Endgame Dungeons"
        | "Event Dungeons"
        | "Mini Dungeons"
        | "Heroic Dungeons"
        | "Epic Dungeons";
}