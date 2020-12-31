export interface IBotInfo {
    activeEvents: Array<{
        issuedTime: number;
        issuedBy: string;
        subject: string;
        details: string;
    }>;
}