const qrcode = require("qrcode-terminal");
const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios").default;
const express = require("express");
require("dotenv").config();
process.env.TZ = "Asia/Jakarta";

// const { Configuration, OpenAIApi } = require("openai");
// const OpenAIConfig = new Configuration({
//     apiKey: process.env.OPENAI_API_KEY
// });
// const openai = new OpenAIApi(OpenAIConfig);
const app = express();
app.use("/images", express.static("images"));

const WAWebJS = require("whatsapp-web.js");
const { Client, LocalAuth } = WAWebJS;
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ["--no-sandbox"] }
});
client.on("qr", qr => qrcode.generate(qr, { small: true }));
client.on("ready", () => console.log("Client is ready!"));

const { Low, JSONFile } = require("@commonify/lowdb");
const adapter = new JSONFile(__dirname + "/db.json");

const db = new Low(adapter);
(async () => {
    await db.read();
    db.data ||= {
        chats: [],
        wakeUp: [],
        dailyChat: false
    };
    await db.write();
})();
if(!fs.existsSync("./images")) fs.mkdirSync("./images");

module.exports = { WAWebJS, axios, client, db, fs, app, crypto };