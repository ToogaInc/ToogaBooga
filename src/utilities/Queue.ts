export class Queue<T> {
    private _storage: T[];

    /**
     * Creates a new `Queue<T>`.
     * @param {T[]} initArr The initial array.
     * @template T
     */
    public constructor(initArr?: T[]) {
        this._storage = initArr ?? [];
    }

    /**
     * Adds an item to the `Queue<T>`.
     * @param {T} item The item to add.
     * @template T
     */
    public enqueue(item: T): void {
        this._storage.push(item);
    }

    /**
     * Removes the first item from the `Queue<T>`.
     * @return {T} The item that was removed.
     * @template T
     * @throws {Error} If the queue is empty.
     */
    public dequeue(): T {
        if (this._storage.length === 0)
            throw new Error("Queue is empty.");

        return this._storage.shift() as T;
    }

    /**
     * Gets the first item from the `Queue<T>` without removing it.
     * @return {T} The item that was removed.
     * @template T
     * @throws {Error} If the queue is empty.
     */
    public peek(): T {
        if (this._storage.length === 0)
            throw new Error("Queue is empty.");

        return this._storage[0];
    }

    /**
     * Gets the size of this `Queue<T>`.
     * @return {number} The size of this `Queue<T>`.
     */
    public size(): number {
        return this._storage.length;
    }

    /**
     * Checks whether a specified item is in the `Queue<T>`.
     * @param {T} item The item to check.
     * @return {boolean} Whether the item was in the queue.
     * @template T
     */
    public contains(item: T): boolean {
        return this._storage.includes(item);
    }

    /**
     * Clears the `Queue<T>`, removing all elements.
     */
    public clear(): void {
        this._storage = [];
    }
}