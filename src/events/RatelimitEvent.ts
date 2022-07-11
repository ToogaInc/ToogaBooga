import { StringBuilder } from "../utilities/StringBuilder";
import { Logger } from "../utilities/Logger";
import { RateLimitData } from "discord.js";

const LOGGER: Logger = new Logger(__filename, false);

// {https://discord.js.org/#/docs/discord.js/stable/typedef/RateLimitData}
export async function onRatelimitEvent(ratelimitData: RateLimitData): Promise<void> {
    LOGGER.debug(
        new StringBuilder()
            .append(`Ratelimit hit: ${ratelimitData.path}/${ratelimitData.route}`)
            .appendLine()
            .append(`\tTimeout until next allowed request: ${ratelimitData.timeout}`)
            .appendLine()
            .append(`\tMaximum number of requests: ${ratelimitData.limit}`)
            .appendLine()
            .append(`\tGlobal ratelimit: ${ratelimitData.global}`)
            .appendLine()
            .append("=====================================")
            .toString()
    );
}