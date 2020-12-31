import {Message} from "discord.js";
import {IGuildInfo} from "../definitions/major/IGuildInfo";

export abstract class BaseCommand {
    protected abstract run(msg: Message, args: Array<string>, guildDb: IGuildInfo): Promise<void>;
}