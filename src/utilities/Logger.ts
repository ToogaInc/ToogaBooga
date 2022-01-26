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
     * @param {boolean} debug Whether to output DEBUG messages, default = false
     */
    public constructor(fileName: string, debug = false) {
        this.path = require("path").basename(fileName);
        this.formattedPath = `[${this.path}]`;
        this.outputDebug = debug;
    }

    /**
     * Gets the current time.
     * @returns The current time, formatted to EST.
     */
    private static getCurrentTime(): string {
        return `[${TimeUtilities.getDateTime(Date.now(), "America/New_York")}]`;
    }

    /**
     * Logs information to console with time and file information
     * @param {*} s the message to log to the console
     */
    public info(s: any): void {
        console.info("[INFO]", Logger.getCurrentTime(), this.formattedPath, s);
    }

    /**
     * Logs debug information to the console with the time and file information.
     * @param {*} s the message to log to the console.
     */
     public debug(s: any): void {
        console.warn("[DEBUG]", Logger.getCurrentTime(), this.formattedPath, s);
    }

    /**
     * Logs a warning to the console with the time and file information.
     * @param {*} s the message to log to the console.
     */
    public warn(s: any): void {
        console.warn("[WARN]", Logger.getCurrentTime(), this.formattedPath, s);
    }

    /**
     * Logs error message to console with time and file information
     * @param {*} s the error message to log to the console
     */
    public error(s: any): void {
        console.error("[ERROR]", Logger.getCurrentTime(), this.formattedPath, s);
    }

    /**
     * Decides if logger should output DEBUG messages or not
     * @param {*} bool true if DEBUG output desired, false otherwise
     */
    public setDebugOutput(bool: boolean){
        this.outputDebug = bool;
    }
}