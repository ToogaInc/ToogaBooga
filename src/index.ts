import {OneRealmBot} from "./OneRealmBot";
import {IConfiguration} from "./definitions/major/IConfiguration";
import * as fs from "fs";
import * as path from "path";

async function main(): Promise<void> {
    const content = await fs.readFileSync(path.join(".", "..", "config.json"));
    const config: IConfiguration = JSON.parse(content.toString());
    const bot = new OneRealmBot(config);
    bot.startAllEvents();
    await bot.login();
    await bot.initServices();
}

main().then();