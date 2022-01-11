import {Bot} from "./Bot";
import {IConfiguration} from "./definitions";
import * as fs from "fs";
import * as path from "path";
import {StringBuilder} from "./utilities/StringBuilder";
import {TimeUtilities} from "./utilities/TimeUtilities";
import {DUNGEON_DATA} from "./constants/dungeons/DungeonData";
import {MAPPED_AFK_CHECK_REACTIONS} from "./constants/dungeons/MappedAfkCheckReactions";

(async () => {
    const allEmojis = DUNGEON_DATA.flatMap(x => x.keyReactions.concat(x.otherReactions));
    for (const {mapKey} of allEmojis) {
        if (mapKey in MAPPED_AFK_CHECK_REACTIONS) {
            continue;
        }

        console.error(`[!] ${mapKey} not valid`);
    }

    const content = fs.readFileSync(path.join(__dirname, "..", "config.json"));
    const config: IConfiguration = JSON.parse(content.toString());
    const bot = new Bot(config);
    bot.startAllEvents();
    await bot.login();
    bot.initServices();
})();

process.on("rejectionHandled", e => {
    console.error(
        new StringBuilder()
            .append(`[${TimeUtilities.getDateTime()}]`)
            .appendLine(2)
            .append(e)
            .appendLine()
            .append("=====================================")
            .toString()
    );
});