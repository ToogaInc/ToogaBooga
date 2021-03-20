import {CommonRegex} from "../constants/CommonRegex";

export namespace UserManager {

    /**
     * Gets all names from a raw name. This will automatically remove any symbols.
     * @returns {string[]} All names.
     */
    export function getAllNames(rawName: string): string[] {
        const parsedNames: string[] = [];
        const allNames = rawName.split("|")
            .map(x => x.trim())
            .filter(x => x.length !== 0);

        for (const n of allNames) {
            const nameSplit = n.split("");
            while (nameSplit.length > 0) {
                // is letter
                if (nameSplit[0].toLowerCase() !== nameSplit[0].toUpperCase())
                    break;
                nameSplit.shift();
            }

            const nameJoined = nameSplit.join("");
            if (CommonRegex.OnlyLetters.test(nameJoined))
                parsedNames.push(nameJoined);
        }

        return parsedNames;
    }


    /**
     * Whether the given name is valid or not.
     *
     * @param {string} name The name to check.
     * @returns {boolean} Whether the name is valid.
     */
    export function isValidRealmName(name: string): boolean {
        if (name.length > 14 || name.length === 0)
            return false;

        // only letters
        return /^[a-zA-Z]*$/.test(name);
    }
}