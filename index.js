const { WAWebJS, axios, client, db, fs, app, crypto } = require("./config");
const { MessageMedia } = WAWebJS;
const NUMBERS = process.env.NUMBERS.split(",");
const PROMPT = fs.readFileSync("prompt.txt", "utf-8");
const CRUSH_NUMBER = process.env.CRUSH_NUMBER;
const CRUSH_NAME = process.env.CRUSH_NAME;

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
async function PredictImage(filename){
    let res = await axios.post("https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-base",
    `${process.env.EXPRESS_URL}images/${filename}`);
    return res.data[0].generated_text;
}

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
        return wakeUp ? false : d.getHours == end && d.getMinutes <= 10;
    }
    async Reply(){
        await db.read();
        this.prompt += " You are currently having conversation with someone named {name}";
        if(this.number == this.crush){
            this.prompt = this.prompt.replace("{name}", CRUSH_NAME);
            this.prompt += " and you have a crush on him";
        } else this.prompt = this.prompt.replace("{name}", this.contact.name);
        this.prompt += ".";
        
        if(await this.CheckIfWakeUp()) this.prompt += " You just wake up a few minutes ago.";
        if(this.msg.hasMedia){
            let media = await this.msg.downloadMedia();
            if(media !== undefined && media.mimetype == "image/jpeg"){
                const filename = crypto.randomBytes(20).toString("hex") + ".png";
                await fs.promises.writeFile("./images/" + filename, media.data, "base64");
                
                let predict = await PredictImage(filename);
                this.msg.body += "\n*shows an image about " + predict;
                fs.unlinkSync("./images/" + filename);
            }
        }

        try {
            let chats = db.data.chats.filter(ch => ch.number == this.number)
                .map(ch => ({ role: ch.isUser ? "user" : "assistant", content: ch.message }));
            let messages = [{ role: "system", content: this.prompt },
            ...chats, { role: "user", content: this.msg.body }]
            let result = (await axios.post(process.env.OPENAI_URL, { messages })).data;
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
        wakeUp: [],
        dailyChat: false
    };
    await db.write();
}
async function StartChat(number){
    await ResetChats();
    await db.read();
    let prompt = PROMPT + ` You are currently having conversation with {name}.`;
    if(number == CRUSH_NUMBER) prompt = prompt.replace("{name}", CRUSH_NAME + "  and you have a crush on him");
    else {
        let contacts = await client.getContacts();
        let con = contacts.find(ct => ct.id.user == number);
        prompt = prompt.replace("{name}", con.name);
    }
    let withPainting = Math.random() < .5;
    if(withPainting){
        try {
            let messages = [{ role: "user", content: process.env.PAINTING_PROMPT }];
            let prompt = (await axios.post(process.env.OPENAI_URL, { messages })).data;
            
            let res = await axios.post("https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1", prompt,
            { responseType: "arraybuffer" });
    
            let buffer = Buffer.from(res.data, 'binary').toString("base64");
            await fs.promises.writeFile("./images/painting.png", buffer, "base64");
            
            let predict = await PredictImage("painting.png");
            prompt += " You showed your painting about " + predict + ".";
        } catch(err){
            console.error(err);
            withPainting = false;
        }
    }
    prompt += "You start the conversation.";
    try {
        let messages = [{ role: "system", content: prompt }]
        let result = (await axios.post(process.env.OPENAI_URL, { messages })).data;

        if(withPainting) result = result.split("\n")[0].replaceAll('"', "");
        let media = withPainting ? MessageMedia.fromFilePath("./images/painting.png") : null;
        client.sendMessage(number + "@c.us", result, withPainting ? { media } : undefined);

        db.data.chats.push({
            number: number,
            isUser: false,
            message: result
        });
        await db.write();
    } catch(e){
        try {
            const err = e.toJSON().message;
            console.error(err);
        } catch(er){
            console.error(e);
        }
    }
}
// ExecuteAfterHour(process.env.STATUS_TIME, () => setInterval(SetStatus, parseInt(process.env.STATUS_DELAY) * 24 * 60 * 60 * 1000));
ExecuteAfterHour(process.env.SLEEP_START, () => setInterval(ResetChats, 24 * 60 * 60 * 1000));
// Chat all numbers on random hours except sleep or working time
async function DailyChat(){
    await db.read();
    if(db.data.dailyChat) return;
    let work = parseInt(process.env.WORKING_START), start = (new Date()).getHours(),
    h = Math.floor(Math.random() * work) + start;

    console.log(`Daily chat at ${h}:00`);
    db.data.dailyChat = true;
    await db.write();
    NUMBERS.forEach(async nm => await ExecuteAfterHour(h, () => StartChat(nm)));
}
DailyChat();
setInterval(DailyChat, 60 * 1000);

client.on("message", async msg => {
    const contact = await msg.getContact();
    const number = contact.id.user;
    if(!NUMBERS.includes(number)) return;
    if(!["image", "chat"].includes(msg.type)) return;

    new Ayumi(msg, contact).BeforeReply();
});
client.initialize();
app.listen(parseInt(process.env.EXPRESS_PORT), process.env.EXPRESS_HOST, () => console.log("Server is ready!"));