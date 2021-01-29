export interface IBotInfo {
    activeEvents: {
        issuedTime: number;
        issuedBy: string;
        subject: string;
        details: string;
    }[];
}