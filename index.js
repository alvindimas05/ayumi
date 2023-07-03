const { WAWebJS, openai, client, db, fs } = require("./config");
const NUMBERS = process.env.NUMBERS.split(",");
const PROMPT = fs.readFileSync("prompt.txt", "utf-8");
const CRUSH_NUMBER = process.env.CRUSH_NUMBER;
const CRUSH_NAME = process.env.CRUSH_NAME;
let TODAY_CHAT = false;

function IsInRange(start, end){
    start = parseInt(start);
    end = parseInt(end);
    const d = new Date(), hours = d.getHours();
    let isInRange = false;
    console.log(hours);

    if (start < end) isInRange = hours >= start && hours < end;
    else isInRange = hours >= start || hours < end;
    
    return isInRange;
}
function ExecuteAfterHour(hour, func){
    hour = parseInt(hour);
    const checkInterval = 1000;
    const checkHour = () => {
        const d = new Date();
        if(hour === d.getHours()) func();
        else setTimeout(checkHour, checkInterval);
    };
    checkHour();
}
async function SetStatus(){
    const response = await openai.createCompletion({
        model: "text-davinci-003",
        prompt: "Generate a random quote",
        max_tokens: 25,
        temperature: 0
    });
    const quote = response.data.choices[0].text;
    await client.setStatus(quote);
}
async function ResetChats(){
    await db.read();
    db.data.chats = [];
    await db.write();
}
// async function StartChat(){
//     await ResetChats();
//     await db.read();
//     try {
//         let completion = await openai.createChatCompletion({
//             model: "gpt-3.5-turbo-16k",
//             max_tokens: 256,
//             temperature: 1,
//             top_p: 1,
//             frequency_penalty: 0,
//             presence_penalty: 0,
//             messages: [{ role: "system", content: PROMPT + ` You are currently having conversation with ${CRUSH_NAME} and you has crush on him. You start the conversation.`}]
//         });
//         let result = completion.data.choices[0].message.content;
//         client.sendMessage(CRUSH_NUMBER + "@c.us", result);

//         db.data.chats.push({
//             number: CRUSH_NUMBER,
//             isUser: false,
//             message: result
//         });
//         await db.write();
//     } catch(e){
//         try {
//             const err = e.toJSON().message;
//             console.error(err);
//         } catch(er){
//             console.error(e);
//         }
//     }
// }
ExecuteAfterHour(process.env.STATUS_TIME, () => setInterval(SetStatus, parseInt(process.env.STATUS_DELAY) * 24 * 60 * 60 * 1000));
ExecuteAfterHour(process.env.SLEEP_START, () => setInterval(ResetChats, 24 * 60 * 60 * 1000));
// ExecuteAfterHour(process.env.CHAT_MIN, () => {
//     const range = parseInt(process.env.CHAT_MAX) - parseInt(process.env.CHAT_MIN);
//     setTimeout(StartChat, Math.floor(Math.random() * range) * 60 * 60 * 1000);
// });
class Ayumi {
    /** 
     * @param {WAWebJS.Message} msg 
     * @param {WAWebJS.Contact} contact 
     * */
    constructor(msg, contact){
        this.msg = msg;
        this.contact = contact;
        this.crush = process.env.CRUSH_NUMBER;
        this.prompt = PROMPT;
        this.number = contact.id.user;

        this.BeforeReply();
    }
    async BeforeReply(){
        if(this.CheckIfSleeping()) return this.msg.reply("Ayumi is sleeping right now, try to chat again later.");
        if(this.CheckIfWorking()) return this.msg.reply("Ayumi is working right now, try to chat again later.");
        this.Reply();
    }
    CheckIfSleeping(){
        return IsInRange(process.env.SLEEP_START, process.env.SLEEP_END);
    }
    CheckIfWorking(){
        return IsInRange(process.env.WORKING_START, process.env.WORKING_END);
    }
    async Reply(){
        await db.read();
        this.prompt += " You are currently having conversation with someone named {name}";
        if(this.number == this.crush){
            this.prompt.replace("{name}", CRUSH_NAME);
            this.prompt += " and he is your crush.";
        } else this.prompt.replace("{name}", this.contact.name);
        
        try {
            let chats = db.data.chats.filter(ch => ch.number == this.number)
                .map(ch => ({ role: ch.isUser ? "user" : "assistant", content: ch.message }));
            let completion = await openai.createChatCompletion({
                model: "gpt-3.5-turbo-16k",
                max_tokens: 256,
                temperature: 1,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
                messages: [{ role: "system", content: this.prompt },
                ...chats, { role: "user", content: this.msg.body }]
            });
            let result = completion.data.choices[0].message.content;
            await this.msg.reply(result);

            db.data.chats.push({
                number: this.number,
                isUser: true,
                message: this.msg.body
            }, {
                number: this.number,
                isUser: false,
                message: result
            });
            await db.write();
        } catch(e){
            try {
                const err = e.toJSON().message;
                message.reply("Ayumi's connection is having an error, try to chat again later.\nError message : " + err);
            } catch(er){
                console.error(e);
            }
        }
    }
}

client.on("message", async msg => {
    const contact = await msg.getContact();
    const number = contact.id.user;
    if(!NUMBERS.includes(number)) return;

    new Ayumi(msg, contact);
});
client.initialize();