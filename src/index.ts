import {OneRealmBot} from "./OneRealmBot";

async function main(): Promise<void> {
    const bot: OneRealmBot = new OneRealmBot(null);
    bot.startAllEvents();
    await bot.login();
    await bot.initServices();
}

main();