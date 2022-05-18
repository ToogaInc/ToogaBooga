import { StringBuilder } from "../utilities/StringBuilder";
import { TimeUtilities } from "../utilities/TimeUtilities";
import { Logger } from "../utilities/Logger";

const LOGGER: Logger = new Logger(__filename, false);

export async function onErrorEvent(error: Error): Promise<void> {
    LOGGER.error(
        new StringBuilder()
            .append(`${error.name}`)
            .appendLine(2)
            .append(`\t${error.message}`)
            .appendLine(2)
            .append(`\t${error.stack}`)
            .appendLine()
            .append("=====================================")
            .toString()
    );
}