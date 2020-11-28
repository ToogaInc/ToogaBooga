import {ColorResolvable, EmojiResolvable} from "discord.js";

export interface IDungeonInfo {
    id: number;
    dungeonName: string;
    portalEmojiId: string;
    keyData: Array<{ keyEmojiId: EmojiResolvable; keyEmojiName: string; }>;
    reactions: Array<EmojiResolvable>;
    portalLink: string;
    bossLinks: Array<string>;
    dungeonColors: Array<ColorResolvable>;
}