const { WAWebJS, axios, client, db, fs, app, crypto } = require("./config");
const { MessageMedia } = WAWebJS;
const NUMBERS = process.env.NUMBERS.split(",");
const PROMPT = fs.readFileSync("prompt.txt", "utf-8");
const CRUSH_NUMBER = process.env.CRUSH_NUMBER;
const CRUSH_NAME = process.env.CRUSH_NAME;
const NODE_ENV = process.env.NODE_ENV.trim();

async function generateChatCompletion(messages){
    return await new Promise((resolve, reject) => {
        const {spawn} = require("child_process");
        spawn("python3", ["gpt.py", JSON.stringify(messages)]).stdout.on("data", data => resolve(data.toString().trim()))
    });
}
function IsInRange(start, end, hours = null){
    start = parseInt(start);
    end = parseInt(end);
    const d = new Date();
    hours ||= d.getHours();
    let isInRange = false;

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
// async function PredictImage(filename){
//     let res = await axios.post("https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large",
//     { wait_for_model: true, inputs: `${process.env.EXPRESS_URL}images/${filename}` },
//         { headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` } });
//     return res.data[0].generated_text;
// }

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
        this.number = contact ? contact.id.user : null;
    }
    async BeforeReply(){
        if(this.CheckIfSleeping()) return this.msg.reply("Ayumi is sleeping right now, try to chat again later.");
        if(this.CheckIfWorking()) return this.msg.reply("Ayumi is working right now, try to chat again later.");
        this.Reply();
    }
    async SendRandomSticker(){
        const sendSticker = Math.random() < .5;
        if(!sendSticker) return false;

        const stickers = await fs.promises.readdir("./stickers");
        const i = Math.floor(Math.random() * stickers.length);
        const media = MessageMedia.fromFilePath("./stickers/" + stickers[i]);
        await client.sendMessage(this.number + "@c.us", media, { sendMediaAsSticker: true });
        return true;
    }
    CheckIfSleeping(hours = null){
        return IsInRange(process.env.SLEEP_START, process.env.SLEEP_END, hours);
    }
    CheckIfWorking(hours = null){
        return IsInRange(process.env.WORKING_START, process.env.WORKING_END, hours);
    }
    async CheckIfWakeUp(){
        const d = new Date(), end = parseInt(process.env.SLEEP_END), wakeUp = db.data.wakeUp.includes(this.number);
        if(!wakeUp){
            await db.read();
            db.data.wakeUp.push(this.number);
            await db.write();
        }
        return wakeUp ? false : d.getHours === end && d.getMinutes <= 10;
    }
    async Reply(){
        await db.read();
        this.prompt += " You are currently having conversation with someone named {name}";
        if(this.number === this.crush){
            this.prompt = this.prompt.replace("{name}", CRUSH_NAME);
            this.prompt += " and you have a crush on him";
        } else this.prompt = this.prompt.replace("{name}", this.contact.name);
        this.prompt += ".";
        
        if(await this.CheckIfWakeUp()) this.prompt += " You just wake up a few minutes ago.";
        let filename = null;
        if(this.msg.hasMedia){
            let media = await this.msg.downloadMedia();
            if(media !== undefined && media.mimetype === "image/jpeg"){
                try {
                    filename = crypto.randomBytes(20).toString("hex") + ".png";
                    await fs.promises.writeFile("./images/" + filename, media.data, "base64");
                    
                    // let predict = await PredictImage(filename);
                    this.msg.body += `\n${process.env.EXPRESS_URL}images/${filename}`;
                    // fs.unlinkSync("./images/" + filename);
                } catch(err){
                    console.log(err);
                    return this.msg.reply("There was an error when processing your image!");
                }
            }
        }

        try {
            let chats = db.data.chats.filter(ch => ch.number === this.number)
                .map(ch => ({ role: ch.isUser ? "user" : "assistant", content: ch.message }));
            let messages = [{ role: "system", content: this.prompt },
            ...chats, { role: "user", content: this.msg.body }]
            let result = await generateChatCompletion(messages);
            if(this.msg.hasMedia) fs.unlinkSync("./images/" + filename);

            await this.msg.reply(result);
            await this.SendRandomSticker();
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
        } catch(err){
            await this.msg.reply("There was an error with Ayumi's connection. Please chat again next time.");
            console.error(err);
        }
    }
}
// async function SetStatus(){
//     const response = await openai.createCompletion({
//         model: "text-davinci-003",
//         prompt: "Generate a random quote",
//         max_tokens: 25,
//         temperature: 0
//     });
//     const quote = response.data.choices[0].text;
//     await client.setStatus(quote);
// }
async function ResetChats(){
    await db.read();
    db.data = {
        chats: [],
        wakeUp: []
    };
    await db.write();
}
// async function ResetDaily(){
//     await db.read();
//     db.data.dailyChat = false;
//     await db.write();
// }
// async function StartChat(number){
//     await ResetChats();
//     await db.read();
//     let prompt = PROMPT + ` You are currently having conversation with {name}.`;
//     if(number === CRUSH_NUMBER) prompt = prompt.replace("{name}", CRUSH_NAME + "  and you have a crush on him");
//     else {
//         let contacts = await client.getContacts();
//         let con = contacts.find(ct => ct.id.user === number);
//         prompt = prompt.replace("{name}", con.name);
//     }
//     prompt += " Initiate the conversation with random topic that you like.";
//     try {
//         let messages = [{ role: "system", content: prompt }]
//         let result = (await axios.post(process.env.OPENAI_URL, { messages })).data;
//
//         result = result.split("\n")[0].replaceAll('"', "").replaceAll("Ayumi: ", "");
//         client.sendMessage(number + "@c.us", result);
//
//         db.data.chats.push({
//             number: number,
//             isUser: false,
//             message: result
//         });
//         await db.write();
//     } catch(err){
//         console.error(err);
//     }
// }
// ExecuteAfterHour(process.env.STATUS_TIME, () => setInterval(SetStatus, parseInt(process.env.STATUS_DELAY) * 24 * 60 * 60 * 1000));
ExecuteAfterHour(process.env.SLEEP_START, () => setInterval(() => {
    ResetChats();
    // ResetDaily();
}, 24 * 60 * 60 * 1000));
// Chat all numbers on random hours except sleep or working time
// function getRandomRange(min, max) {
//     min = Math.ceil(min);
//     max = Math.floor(max);
//     return Math.floor(Math.random() * (max - min + 1)) + min;
// }
// async function DailyChat(){
//     await db.read();
//     if(db.data.dailyChat) return;
//     db.data.dailyChat = true;
//
//     let work = parseInt(process.env.WORKING_START), start = (new Date()).getHours();
//     const ayumi = new Ayumi();
//     if(ayumi.CheckIfSleeping(start) || ayumi.CheckIfWorking(start)){
//         start = parseInt(process.env.SLEEP_END);
//     }
//
//     const h = getRandomRange(start, work);
//     console.log(`Daily chat at ${h}:00`);
//
//     await db.write();
//     NUMBERS.forEach(nm => ExecuteAfterHour(h, () => StartChat(nm)));
// }

client.on("message", async msg => {
    const contact = await msg.getContact();
    const number = contact.id.user;
    if(!NUMBERS.includes(number)) return;
    if(!["image", "chat"].includes(msg.type)) return;

    await new Ayumi(msg, contact).BeforeReply();
});
client.on("ready", () => {
    // DailyChat();
    // setInterval(DailyChat, 60 * 1000);
    console.log("Client is ready!");
});
client.initialize();

if(NODE_ENV === 'production'){
    const http = require("http");
    const https = require("https");
    const key = fs.readFileSync(process.env.PRIVKEY_PATH, 'utf-8');
    const cert = fs.readFileSync(process.env.CERT_PATH, 'utf-8');

    http.createServer(app).listen(80);
    https.createServer({ key, cert }, app).listen(443);
    console.log("Running on production mode...");
} else
    app.listen(parseInt(process.env.EXPRESS_PORT), process.env.EXPRESS_HOST, () => console.log("Server is ready!"));