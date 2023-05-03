import ngrok from 'ngrok';
import dotenv from 'dotenv';
import TelegramBot, { ParseMode } from 'node-telegram-bot-api';
import { collections, connectToDatabase } from './database.service';

dotenv.config();

const bot = new TelegramBot(process.env.TOKEN as string, { webHook: { port: process.env.PORT as number | undefined } });

if(!process.env.RENDER) {
    ngrok.connect(8080).then(url => {
        bot.setWebHook(`${url}/bot${process.env.TOKEN}`);
        console.log("Bot started (dev)")
        console.log(url);
    });
} else {
    bot.setWebHook(`${process.env.RENDER_EXTERNAL_URL}/bot${process.env.TOKEN}`);
}

connectToDatabase().then(res => console.log(res));

bot.setMyCommands([
    {command: '/start', description: 'Start the bot'},
]);

bot.onText(/\/addMeAsAdmin/, async msg => {
    const admins = collections.admins;
    admins?.updateOne({id: msg.from?.id}, {$set: msg.from}, {upsert: true}).then(() => {
        bot.sendMessage(msg.chat.id, "Вы теперь администратор");
    });
})

bot.onText(/\/start/, async msg => {
    const whiteList = collections.users;
    const admins = collections.admins;
    const user = await whiteList?.findOne({id: msg.from?.id});
    const admin = await admins?.findOne({id: msg.from?.id});
    if(admin) {
        bot.sendMessage(msg.chat.id, "Здравствуйте, админ!");
        return;
    }
    if(!user) {
        bot.sendMessage(msg.chat.id, "Ваша заявка принята, ожидайте ответа");
        const admins = collections.admins?.find() ?? [];
        admins.forEach(admin => {
            bot.sendMessage(admin.id, `@${msg.from?.username} мечтает стать попрошайкой`, {
                parse_mode: 'MarkdownV2' as ParseMode,
                reply_markup: {
                    inline_keyboard: [
                        [
                            {text: 'Одобрить ✅', callback_data: JSON.stringify({ type: 'acceptWorker', username: msg.from?.username, id: msg.from?.id })},
                            {text: 'Отклонить ❌', callback_data: JSON.stringify({ type: 'declineWorker', username: msg.from?.username, id: msg.from?.id })},
                        ]
                    ]
                }
            });
        });
        return;
    }

    bot.sendMessage(msg.chat.id, "Нажмите кнопку ниже чтобы отметится", {
        parse_mode: 'MarkdownV2' as ParseMode,
        reply_markup: {
            inline_keyboard: [
                [
                {text: 'Начал работу 👍', callback_data: JSON.stringify({ type: 'startWork', id: msg.from?.id })},
                {text: 'Закончил работу 💤', callback_data: JSON.stringify({ type: 'finishWork', id: msg.from?.id })}
                ],
                [
                {text: 'Выслать отчет ✏️', callback_data: JSON.stringify({ type: 'sendReport', id: msg.from?.id })},
                {text: 'Заполнить форму 📋', callback_data: JSON.stringify({ type: 'fillForm' })},
                ]
            ]
        }
    })
});

bot.on('callback_query', async query => {
    if(!query.data) {
        bot.answerCallbackQuery(query.id, {text: 'Invalid callback data'})
        return;
    }

    const data = JSON.parse(query.data);
    switch(data.type) {
        case 'startWork': {
            const admins = collections.admins?.find() ?? [];
            const user = await collections.users?.findOne({id: data.id});
            const startTime = new Date();
            const startTimeStr = `${startTime.getHours()}:${startTime.getMinutes().toString().padStart(2, '0')}`;
            admins.forEach(admin => {
                bot.sendMessage(admin.id, `@${user?.username} начал работу в ${startTimeStr}`);
                collections.users?.updateOne({id: data.id}, { $set: { workStarted: Date.now(), workedToday: true }});
            });
            bot.sendMessage(data.id, "Хороших сборов!");
            break;
        }
        case 'finishWork': {
            const admins = collections.admins?.find() ?? [];
            const user = await collections.users?.findOne({id: data.id});
            if(!user?.workStarted) {
                bot.sendMessage(user?.id, `Нельзя закончить работу не начав ее :/`);
                break;
            }
            admins.forEach(admin => {
                const finishTime = new Date();
                const workDuration = finishTime.getTime() - user?.workStarted as number;
                const hours = Math.floor(workDuration / (1000 * 60 * 60));
                const minutes = Math.floor((workDuration / (1000 * 60)) % 60);
                const durationStr = `${hours} ч. ${minutes} мин.`;
                bot.sendMessage(admin.id, `@${user?.username} закончил работу проработав ${durationStr}`);
                collections.users?.updateOne({id: data.id}, { $set: {workStarted: null }});
            });
            bot.sendMessage(data.id, `Отлично, теперь пора в офис, и не забудь заполнить форму по ссылке: *ссылка*`, {
                parse_mode: 'MarkdownV2' as ParseMode,
                reply_markup: {
                    inline_keyboard: [
                        [{text: 'Подтвердить форму 📋', callback_data: JSON.stringify({ type: 'confirmForm', id: query.from.id })}]
                    ]
                }
            });
            break;
        }
        case 'acceptWorker': {
            collections.users?.updateOne({id: data.id}, {$set: {username: data.username}}, {upsert: true})
            bot.sendMessage(query.from.id, `@${data.username} записан в попрошайки`);
            bot.sendMessage(data.id, "Поздравляем, вы приняты");
            break;
        }
        case 'declineWorker': {
            collections.users?.deleteOne({id: data.id});
            bot.sendMessage(query.from.id, `@${data.username} уволен`);
            bot.sendMessage(data.id, "Извините, ваша заявка отклонена");
            if(query.message)
                bot.deleteMessage(query.from.id, query.message?.message_id);
            break;
        }

        case 'confirmForm': {
            bot.sendMessage(data.id, "Спасибо за заполнение формы");
            const admins = collections.admins?.find() ?? [];
            const user = await collections.users?.findOne({id: data.id});
            admins.forEach(admin => {
                bot.sendMessage(admin.id, `@${user?.username} только что заполнил форму`);
                collections.users?.updateOne({id: data.id}, {$set: {formFilled: true}});
            });
            break;
        }

        case 'sendReport': {
            bot.sendMessage(data.id, "Вышлите отчет (фотографию)");
            bot.once('photo', async (msg) => {
                if (msg.photo) {
                    const admins = collections.admins?.find() ?? [];
                    const user = await collections.users?.findOne({id: data.id});
                    admins.forEach(admin => {
                        bot.sendPhoto(admin.id, msg.photo![0].file_id, { caption: `@${user?.username} выслал отчет` });
                    });
                    bot.sendMessage(data.id, "Отчет успешно отправлен!");
                } else {
                    bot.sendMessage(data.id, "Вы не отправили фотографию :(");
                }
            });

            setTimeout(async () => {
                if (!photoSent) {
                    const admins = collections.admins?.find() ?? [];
                    const user = await collections.users?.findOne({id: data.id});
                    admins.forEach(admin => {
                        bot.sendMessage(admin.id, `@${user?.username} не отправил свой отчет вовремя`);
                    });
                }
            }, 10 * 60 * 1000); 

            let photoSent = false;
  
            const handlePhotoSent = () => {
                photoSent = true;
            };
            
            bot.on('message', handlePhotoSent);
            break;
        }
    }
    bot.answerCallbackQuery(query.id)
})

bot.on('webhook_error', (error) => {
    console.error('Webhook Error:', error);
});

const doSomethingAt10PM = async () => {
    const currentTime = new Date();

    if (currentTime.getHours() === 22) {
        const users = await collections.users?.find() ?? [];
        users.forEach(user => {
            if(user.workedToday && !user.formFilled) {
                bot.sendMessage(user.id, "Не забудьте заполнить форму");
            }
            collections.users?.updateOne({id: user.id}, {$set: {workedToday: false, formFilled: null}});
        });
    }
};
  
setInterval(doSomethingAt10PM, 60 * 1000);