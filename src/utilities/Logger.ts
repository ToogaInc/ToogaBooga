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
    public info(...args: any[]): void {
        console.info("[INFO]", Logger.getCurrentTime(), this.formattedPath, args);
    }

    /**
     * Logs debug information to the console with the time and file information.
     * @param {*} s the message to log to the console.
     */
     public debug(...args: any[]): void {
        if(!this.outputDebug) return;
        console.debug("[DEBUG]", Logger.getCurrentTime(), this.formattedPath, args);
    }

    /**
     * Logs a warning to the console with the time and file information.
     * @param {*} s the message to log to the console.
     */
    public warn(...args: any[]): void {
        console.warn("[WARN]", Logger.getCurrentTime(), this.formattedPath, args);
    }

    /**
     * Logs error message to console with time and file information
     * @param {*} s the error message to log to the console
     */
    public error(...args: any[]): void {
        console.error("[ERROR]", Logger.getCurrentTime(), this.formattedPath, args);
    }

    /**
     * Decides if logger should output DEBUG messages or not
     * @param {*} bool true if DEBUG output desired, false otherwise
     */
    public setDebugOutput(bool: boolean){
        this.outputDebug = bool;
    }
}