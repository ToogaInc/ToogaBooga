import {OneLifeBot} from "./OneLifeBot";
import {IConfiguration} from "./definitions";
import * as fs from "fs";
import * as path from "path";
import {StringBuilder} from "./utilities/StringBuilder";
import {TimeUtilities} from "./utilities/TimeUtilities";

(async () => {
    const content = fs.readFileSync(path.join(__dirname, "..", "config.production.json"));
    const config: IConfiguration = JSON.parse(content.toString());
    const bot = new OneLifeBot(config);
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