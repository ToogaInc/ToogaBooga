import {TimeUtilities} from "./TimeUtilities";

/**
 * Custom Logger class
 */
export class Logger{
    private path: String;
    /**
     * Creates a new `Logger` object
     * @param {String} filePath The basename of the file using the logger.
     */
    public constructor(filePath: String){
        this.path = filePath;
    }

    /**
     * Logs information to console with time and file information
     * @param {String} s the message to log to the console
     */
    public info(s: String){
        const path = `[${this.path}]`
        const date = `[${TimeUtilities.getDateTime(Date.now(), "America/Los_Angeles")}]`;        
        console.info("[INFO]", path, date, s);
    }

    /**
     * Logs error message to console with time and file information
     * @param {String} s the error message to log to the console
     */
    public error(s: String){
        const path = `[${this.path}]`
        const date = `[${TimeUtilities.getDateTime(Date.now(), "America/Los_Angeles")}]`;        
        console.info("[ERROR]", path, date, s);
    }
}
