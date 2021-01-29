import {OneRealmBot} from "../OneRealmBot";
import {PrivateApiDefinitions as PAD} from "./PrivateApiDefinitions";

export namespace RealmSharperWrapper {
    export async function isOnline(): Promise<boolean> {
        const config = OneRealmBot.BotInstance.config;
        const url = config.privateApiLinks.baseApi + "/" + config.privateApiLinks.pingOnline;
        const resp = await OneRealmBot.AxiosClient.get<PAD.IApiStatus>(url);
        return resp.data.online;
    }

    export async function getNameHistory(name: string): Promise<PAD.INameHistory> {
        const config = OneRealmBot.BotInstance.config;
        const url = config.privateApiLinks.baseApi + "/" + config.privateApiLinks.realmEye.nameHistory + "/" + name;
        const resp = await OneRealmBot.AxiosClient.get<PAD.INameHistory>(url);
        return resp.data;
    }

    export async function getRankHistory(name: string): Promise<PAD.IRankHistory> {
        const config = OneRealmBot.BotInstance.config;
        const url = config.privateApiLinks.baseApi + "/" + config.privateApiLinks.realmEye.rankHistory + "/" + name;
        const resp = await OneRealmBot.AxiosClient.get<PAD.IRankHistory>(url);
        return resp.data;
    }
}