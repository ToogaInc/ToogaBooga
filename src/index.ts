import {OneLifeBot} from "./OneLifeBot";
import {IConfiguration} from "./definitions/ConfigurationInterfaces";
import * as fs from "fs";
import * as path from "path";

async function main(): Promise<void> {
    const content = await fs.readFileSync(path.join(__dirname, "..", "config.json"));
    const config: IConfiguration = JSON.parse(content.toString());
    const bot = new OneLifeBot(config);
    bot.startAllEvents();
    await bot.login();
    await bot.initServices();
}

main().then();