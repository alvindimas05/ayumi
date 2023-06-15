const { WAWebJS, openai, client, db, fs } = require("./config");
const prefix = process.env.PREFIX;
/**
 * 
 * @param {WAWebJS.Message} message 
 */
async function onMessage(message){
    let contact = await message.getContact();
    await db.read();
    if(db.data.banned.findIndex(ban => contact.number.includes(ban)) !== -1) return
    if(message.body.charAt(0) === prefix){
        let splitted = message.body.split(" ");
        let command = splitted[0].replace(prefix, "");
        splitted.shift();
        let body = splitted.join(" ");

        switch(command){
            case "character":
                cmdCharacter(message, body);
                break;
            case "ban":
                cmdBan(message);
                break;
            case "unban":
                cmdUnBan(message);
                break;
            default:
                defaultMessage(message)
                let userIndex = db.data.users.findIndex(usr => usr.user_id == contact.number);
                let user = db.data.users[userIndex];

                if(userIndex < 0 || user.character == null){
                    registerUser(contact.number);
                    defaultMessage(message);
                    return;
                }
        }
        return;
    }

    let chat = await message.getChat();
    let quoted = await message.getQuotedMessage();
    if(chat.isGroup){
        let isQuoted = quoted != undefined && quoted.fromMe;
        let mention = message.body.charAt(0) === "@" && message.mentionedIds.findIndex(men => men.includes(process.env.NUMBER)) !== -1;
        if(!isQuoted && !mention) return;
        replyAi(message, !isQuoted);
    } else {
        replyAi(message);
    }
}
async function cmdBan(message){
    let contact = await message.getContact();
    if(!contact.number.includes(process.env.OWNER_NUMBER)) return message.reply("You are not my owner!");

    await db.read();
    let mentioned = message.mentionedIds.map(men => men.replaceAll("@c.us", "")).filter(men => !db.data.banned.includes(men));
    mentioned.forEach(men => db.data.banned.push(men));
    await db.write();
    message.reply("Success ban!")
}
async function cmdUnBan(message){
    let contact = await message.getContact();
    if(!contact.number.includes(process.env.OWNER_NUMBER)) return message.reply("You are not my owner!");

    await db.read();
    let mentioned = message.mentionedIds.map(men => men.replaceAll("@c.us", ""))
    let banned = db.data.banned.filter(ban => !mentioned.includes(ban));
    db.data.banned = banned;
    await db.write();
    message.reply("Success unban!");
}
async function cmdCharacter(message, body){
    await db.read();
    let contact = await message.getContact();
    let userIndex = db.data.users.findIndex(usr => usr.user_id == contact.number);
    let user = db.data.users[userIndex];
    
    if(userIndex < 0){
        registerUser(contact.number);
        defaultMessage(message);
        return;
    }

    let index = parseInt(body);
    if(isNaN(index)) return message.reply("Character not valid!");

    let character = db.data.characters[parseInt(body) - 1];
    if(character == undefined) return message.reply("Character not found!");

    let hasCharacter = user.character != null;
    if(hasCharacter){
        db.data.chats = db.data.chats.filter(chat => chat.user_id != contact.number);
    }
    db.data.users[userIndex].character = character.name;
    await db.write();

    message.reply((hasCharacter ? "Your chats has been reset" : "Good") + ", you can start your conversation now");
}
async function replyAi(message, isQuoted = false){
    if(isQuoted){
        let body = message.body.split(" ");
        body.shift();
        message.body = body.join(" ");
    }

    await db.read();
    let contact = await message.getContact();
    let userIndex = db.data.users.findIndex(usr => usr.user_id == contact.number);
    let user = db.data.users[userIndex];

    if(userIndex < 0 || user.character == null){
        registerUser(contact.number);
        defaultMessage(message);
        return;
    }
    
    try {
        let character = db.data.characters.find(chr => chr.name == user.character);
        let chats = db.data.chats.filter(cht => cht.user_id == contact.number)
            .map(cht => ({ role: cht.fromMe ? "user" : "assistant", content: cht.message }));
        let completion = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            max_tokens: 50,
            temperature: 1,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
            messages: [{ role: "system", content: character.description },
            ...chats, { role: "user", content: message.body }]
        });
        let result = completion.data.choices[0].message;
        message.reply(result.content);

        db.data.chats.push({ user_id: contact.number, fromMe: true, message: message.body });
        db.data.chats.push({ user_id: contact.number, fromMe: false, message: result.content });
    } catch (e){
        try {
            console.error(e.data.error.message);
            message.reply(e.data.error.message);
        } catch (err){
            console.error(err);
            message.reply("An error occured!");
        }
    }
    await db.write();
}
async function registerUser(number){
    await db.read();
    db.data.users.push({
        user_id: number,
        character: null
    });
    await db.write();
}
async function defaultMessage(message){
    let msg = fs.readFileSync("./default.txt", "utf-8");
    msg = msg.replaceAll("{prefix}", prefix);
    
    await db.read();
    db.data.characters.forEach((char, i) => msg += `\n${i + 1}. ${char.name}`);
    message.reply(msg);
}   

client.on("message", onMessage);
client.initialize();