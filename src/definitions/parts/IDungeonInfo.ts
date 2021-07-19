import {ColorResolvable} from "discord.js";
import {IAfkCheckButtonInfo} from "./IAfkCheckButtonInfo";

export interface IDungeonInfo {
    codeName: string;
    dungeonName: string;
    portalEmojiId: string;
    keyData: IAfkCheckButtonInfo[];
    otherButtons: IAfkCheckButtonInfo[];
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