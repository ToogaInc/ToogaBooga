import {ColorResolvable} from "discord.js";
import {IAfkCheckOptionData} from "./IAfkCheckOptionData";

export interface IDungeonInfo {
    codeName: string;
    dungeonName: string;
    portalEmojiId: string;
    keyData: IAfkCheckOptionData[];
    otherData: IAfkCheckOptionData[];
    includeEarlyLoc?: boolean;
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