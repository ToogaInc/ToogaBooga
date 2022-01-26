import { TimeUtilities } from "./TimeUtilities";

/**
 * Custom Logger class
 */
export class Logger {
    private path: string;
    private formattedPath: string;
    private outputDebug: boolean;

    /**
     * Creates a new `Logger` object.
     * @param {string} filePath The file using the logger. Use `__filename`.
     */
    public constructor(fileName: string) {
        this.path = require("path").basename(fileName);
        this.formattedPath = `[${this.path}]`;
        this.outputDebug = false;
    }

    /**
     * Gets the current time.
     * @returns The current time, formatted.
     */
    private static getCurrentTime(): string {
        return `[${TimeUtilities.getDateTime(Date.now(), "America/Los_Angeles")}]`;
    }

    /**
     * Logs information to console with time and file information
     * @param {*} s the message to log to the console
     */
    public info(s: any): void {
        console.info("[INFO]", this.formattedPath, Logger.getCurrentTime(), s);
    }

    /**
     * Logs debug information to the console with the time and file information.
     * @param {*} s the message to log to the console.
     */
     public debug(s: any): void {
        console.warn("[DEBUG]", this.formattedPath, Logger.getCurrentTime(), s);
    }

    /**
     * Logs a warning to the console with the time and file information.
     * @param {*} s the message to log to the console.
     */
    public warn(s: any): void {
        console.warn("[WARN]", this.formattedPath, Logger.getCurrentTime(), s);
    }

    /**
     * Logs error message to console with time and file information
     * @param {*} s the error message to log to the console
     */
    public error(s: any): void {
        console.error("[ERROR]", this.formattedPath, Logger.getCurrentTime(), s);
    }

    /**
     * Decides if logger should output DEBUG messages or not
     * @param {*} bool true if DEBUG output desired, false otherwise
     */
    public setDebugOutput(bool: boolean){
        this.outputDebug = bool;
    }
}