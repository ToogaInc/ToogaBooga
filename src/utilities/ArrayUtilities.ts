export namespace ArrayUtilities {
    /**
     * Gets a random element from an array.
     *
     * @typedef {T} The element type.
     * @param {T[]} array The array.
     * @returns {T} A random element.
     */
    export function getRandomElement<T>(array: T[]): T {
        return array[Math.floor(Math.random() * array.length)];
    }

    /**
     * Shuffles an array.
     *
     * @typedef {T} The element type.
     * @param {T[]} array The array to shuffle.
     * @returns {T[]} The shuffled array.
     */
    export function shuffle<T>(array: T[]): T[] {
        let j: number;
        let x: T;
        let i: number;
        for (i = array.length - 1; i > 0; i--) {
            j = Math.floor(Math.random() * (i + 1));
            x = array[i];
            array[i] = array[j];
            array[j] = x;
        }
        return array;
    }

    /**
     * Removes duplicate entries from an array.
     *
     * @typedef {T} The element type.
     * @param {T[]} array The array to remove duplicates from.
     * @returns {T[]} The shuffled array.
     */
    export function removeDuplicates<T>(array: T[]): T[] {
        return array.filter((item, index) => array.indexOf(item) === index);
    }

    /**
     * Returns the index of the last element in the array where predicate is true, and -1
     * otherwise.
     *
     * @typedef {T} The element type.
     * @param {T[]} array The source array to search in
     * @param {Function} predicate find calls predicate once for each element of the array, in
     *     descending order, until it finds one where predicate returns true. If such an element is
     *     found, findLastIndex immediately returns that element index. Otherwise, findLastIndex
     *     returns -1.
     *
     * @returns {number} The last index, if any. -1 otherwise.
     */
    export function findLastIndex<T>(array: T[], predicate: (value: T, index: number,
                                                             obj: T[]) => boolean): number {
        let l: number = array.length;
        while (l >= 0) {
            if (predicate(array[l], l, array))
                return l;
            l--;
        }
        return -1;
    }

    /**
     * Breaks up an array of elements into an array of human-readable string content with a
     * specific length restriction per element. Note that you will have to check and make sure the
     * number of elements in this array doesn't exceed 25.
     *
     * @typedef {T} The element type.
     * @param {T[]} array The array of elements.
     * @param {Function} func The function to convert an element into a string.
     * @param {number} [maxLenPerElement = 1016] The maximum length of a string per element in the
     *     fields array. This should be greater than 300.
     * @returns {Array<string>} An array that represents the given array.
     */
    export function arrayToStringFields<T>(
        array: T[],
        func: (i: number, element: T) => string,
        maxLenPerElement: number = 1016
    ): string[] {
        if (maxLenPerElement < 300) maxLenPerElement = 300;

        const returnArr: string[] = [];
        let str: string = "";

        for (let i = 0; i < array.length; i++) {
            const tempString: string = func(i, array[i]);
            // max elements you can have is 25
            if (returnArr.length <= 24) {
                if (str.length + tempString.length > maxLenPerElement) {
                    returnArr.push(str);
                    str = tempString;
                }
                else {
                    str += tempString;
                }
            }
        }

        if (str.length !== 0 && str !== "") {
            returnArr.push(str);
        }

        return returnArr;
    }

    /**
     * Generates a leaderboard array (a 2D array with the first element being the place and the second being the value).
     * @param {T[]} data The data.
     * @param {Function} func The function that decides what data will be sorted.
     * @param {Function} compareFn How to compare each element.
     * @returns The leaderboard array.
     */
    export function generateLeaderboardArray<T>(
        data: T[],
        func: (val: T) => number,
        compareFn: ((a: T, b: T) => number) = (x, y) => func(y) - func(x)
    ): [number, T][] {
        data.sort(compareFn);
        let place: number = 1;
        let diff: number = 0;
        let lastIndexOfData: number = 0;
        const returnData: [number, T][] = [];

        for (let i = 0; i < data.length; i++) {
            if (i === 0) {
                returnData.push([place, data[i]]);
                continue;
            }

            const val: number = func(data[i]);

            if (val === func(returnData[lastIndexOfData][1])) {
                returnData.push([place, data[i]]);
                diff++;
            }
            else {
                place += diff + 1;
                diff = 0;
                returnData.push([place, data[i]]);
            }
            lastIndexOfData++;
        }

        return returnData;
    }

    /**
     * Breaks an array into subsets, each with size at most specified by `size`.
     * @param {T[]} arr The array.
     * @param {number} size The size of each array subset.
     * @return {T[][]} The array of subsets of array.
     */
    export function breakArrayIntoSubsets<T>(arr: T[], size: number): T[][] {
        if(!arr){
            const ret : T[][] = [];
            return ret;
        }
        const numSubset = Math.ceil(arr.length / size);
        const subsets: T[][] = [];

        let offset = 0;
        for (let i = 0; i < numSubset; i++) {
            const subset: T[] = [];
            for (let j = 0; j < size && j + offset < arr.length; j++) {
                subset.push(arr[offset + j]);
            }

            offset += size;
            subsets.push(subset);
        }

        return subsets;
    }
}