export class StringBuilder {
    private _str: string;

    /**
     * Creates a new basic StringBuilder object.
     *
     * @param {string?} str The string object to begin with.
     */
    public constructor(str?: string) {
        this._str = str ? str : "";
    }

    /**
     * Returns the length of the `StringBuilder`.
     *
     * @returns {number} The length of this StringBuilder.
     */
    public length(): number {
        return this._str.length;
    }

    /**
     * Appends something to the `StringBuilder`.
     *
     * @param {string} content The content to append.
     * @returns {StringBuilder} This object.
     */
    public append(content: any): this {
        this._str += content;
        return this;
    }

    /**
     * Appends a new line to the `StringBuilder`.
     *
     * @returns {StringBuilder} This object.
     */
    public appendLine(): this {
        this._str += "\n";
        return this;
    }

    /**
     * Builds the `StringBuilder` object.
     *
     * @returns {StringBuilder} This object.
     */
    public toString(): string {
        return this._str;
    }

    /**
     * Reverses the `StringBuilder` object.
     *
     * @returns {StringBuilder} This object.
     */
    public reverse(): this {
        let newStr = "";
        for (let i = this._str.length - 1; i >= 0; i--) {
            newStr += this._str[i];
        }
        this._str = newStr;
        return this;
    }

    /**
     * Deletes a portion of the `StringBuilder`.
     *
     * @param {number} start The starting index, inclusive.
     * @param {number} end The end index, exclusive.
     * @returns {StringBuilder} This object.
     */
    public delete(start: number, end: number): this {
        this._str = this._str.replace(this._str.substring(start, end), "");
        return this;
    }
}