import {OneLifeBot} from "./OneLifeBot";
import {IConfiguration} from "./definitions";
import * as fs from "fs";
import * as path from "path";

(async () => {
    const content = fs.readFileSync(path.join(".", "..", "config.json"));
    const config: IConfiguration = JSON.parse(content.toString());
    const bot = new OneLifeBot(config);
    bot.startAllEvents();
    await bot.login();
    bot.initServices();
})();