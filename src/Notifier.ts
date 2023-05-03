import TelegramBot from "node-telegram-bot-api";
import { connectToDatabase, collections } from "./database.service";

class Notifier {
    private bot: TelegramBot;
    constructor(bot: TelegramBot) {
        this.bot = bot;
        connectToDatabase();
    }

    async notifyAdmins(text: string, options?: TelegramBot.SendMessageOptions, photo?: string) {
        const admins = collections.admins?.find();
        console.log("notifying admins...")
        /*admins?.map(admin => {
            if(photo)
                this.bot.sendPhoto(admin.id, photo, {...options, caption: text});
            else
                this.bot.sendMessage(admin.id, text, options);
        }) */
        admins?.forEach(admin => {
            if(photo)
            this.bot.sendPhoto(admin.id, photo, {...options, caption: text});
        else
            this.bot.sendMessage(admin.id, text, options);
        })      
    }
}

export default Notifier;