import { DungeonShortcuts } from "../definitions/Types";
export namespace GeneralConstants {
    export const ZERO_WIDTH_SPACE: string = "\u200b";

    export const ALL_CHARACTERS: string[] = [
        ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""),
        ..."abcdefghijklmnopqrstuvwxyz".split(""),
        ..."0123456789".split("")
    ];

    export const DUNGEON_SHORTCUTS: DungeonShortcuts[] = [
        { name: "o3", value: "ORYX_3" },
        { name: "shatts", value: "SHATTERS" },
        { name: "moonlight", value: "MOONLIGHT_VILLAGE" },
        { name: "nest", value: "NEST" },
        { name: "fungal", value: "FUNGAL_CAVERN" },
        { name: "steamworks", value: "STEAMWORKS" },
        { name: "cult", value: "CULTIST_HIDEOUT" },
        { name: "void", value: "THE_VOID" },
        { name: "lost halls", value: "LOST_HALLS" },
        { name: "exalt", value: "EXALT_DUNGEON" },
        { name: "misc", value: "MISCELLANEOUS_DUNGEON"}
    ];

    export const GITHUB_URL: string = "https://github.com/ewang2002/ToogaBooga";
    export const BOT_BANNER: string = "https://raw.githubusercontent.com/ewang2002/ToogaBooga/bug_fixes/assets/"
        + "banner.png";
}