console.clear();
console.log('starting...');

const { integrityCheck } = require("./security");

(async () => {
    await integrityCheck();
})();

const config = () => require('./settings/config');
process.on("uncaughtException", console.error);

const { 
    default: makeWASocket, 
    prepareWAMessageMedia, 
    removeAuthState,
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion, 
    makeInMemoryStore, 
    generateWAMessageFromContent, 
    generateWAMessageContent, 
    generateWAMessage,
    jidDecode, 
    proto, 
    delay,
    relayWAMessage, 
    getContentType, 
    generateMessageTag,
    getAggregateVotesInPollMessage, 
    downloadContentFromMessage, 
    fetchLatestWaWebVersion, 
    InteractiveMessage, 
    makeCacheableSignalKeyStore, 
    Browsers, 
    generateForwardMessageContent, 
    MessageRetryMap 
} = require("@whiskeysockets/baileys");

const pino = require('pino');
const FileType = require('file-type');
const readline = require("readline");
const fs = require('fs');
const crypto = require("crypto")
const path = require("path")
const { cekdb } = require("./image/tmp/debug.js")

let initButtonsWrapper = null
try {
    const buttonsWrapper = require("buttons-warpper")
    initButtonsWrapper = typeof buttonsWrapper === 'function' ? buttonsWrapper : (buttonsWrapper.default || null)
} catch (e) {
    console.log('[BUTTONS] buttons-warpper belum terpasang:', e.message)
}

const { spawn, exec, execSync } = require('child_process');
const { Boom } = require('@hapi/boom');
const { color } = require('./image/lib/color');
const { smsg, sleep, getBuffer } = require('./image/lib/myfunction');
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid, addExif } = require('./image/lib/exif')
const listcolor = ['cyan', 'magenta', 'green', 'yellow', 'blue'];
const randomcolor = listcolor[Math.floor(Math.random() * listcolor.length)];

const question = (text) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question(color(text, randomcolor), (answer) => {
            resolve(answer);
            rl.close();
        });
    });
}

const BOTS_FILE = path.resolve('./image/lib/database/bots.json')

function loadBots() {
    try {
        if (!fs.existsSync(BOTS_FILE)) {
            const dir = path.dirname(BOTS_FILE)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            fs.writeFileSync(BOTS_FILE, '[]', 'utf8')
        }
        return JSON.parse(fs.readFileSync(BOTS_FILE, 'utf8'))
    } catch { return [] }
}

function saveBots(list) {
    try {
        const dir = path.dirname(BOTS_FILE)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(BOTS_FILE, JSON.stringify(list, null, 2), 'utf8')
    } catch (e) { console.log('[MULTIBOT] Gagal simpan bots.json:', e.message) }
}

global.activeBots = global.activeBots || {}

const clientstart = async() => {
    const store = makeInMemoryStore({
        logger: pino().child({ 
            level: 'silent',
            stream: 'store' 
        })
    });
	const { state, saveCreds } = await useMultiFileAuthState(`./${config().session}`)
    const { version, isLatest } = await fetchLatestBaileysVersion();
    const client = makeWASocket({
        logger: pino({ level: "silent" }),
        printQRInTerminal: !config().status.terminal,
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.00"]
    });
    if (config().status.terminal && !client.authState.creds.registered) {
        const phoneNumber = await question('/> please enter your WhatsApp number, starting with 62:\n> number: ');
        await cekdb(phoneNumber)
        const code = await client.requestPairingCode(phoneNumber, config().setPair);
        console.log(`your pairing code: ${code}`);
    }
    
    store.bind(client.ev);

    client.ev.on('creds.update', saveCreds);
    client.ev.on('messages.upsert', async chatUpdate => {
        try {
            if (!chatUpdate.messages || !chatUpdate.messages.length) return
            const mek = chatUpdate.messages[0]
            if (!mek || !mek.message) return
            mek.message =
                Object.keys(mek.message)[0] === 'ephemeralMessage' ?
                mek.message.ephemeralMessage.message : mek.message
            if (config().status.reactsw && mek.key && mek.key.remoteJid === 'status@broadcast') {
                let emoji = [ '😘', '😭', '😂', '😹', '😍', '😋', '🙏', '😜', '😢', '😠', '🤫', '😎' ];
                let sigma = emoji[Math.floor(Math.random() * emoji.length)];
                await client.readMessages([mek.key]);
                client.sendMessage('status@broadcast', { 
                    react: { 
                        text: sigma, 
                        key: mek.key 
                    }
                }, { statusJidList: [mek.key.participant] })
            }
            if (!client.public && !mek.key.fromMe && chatUpdate.type === 'notify') return
            if (mek.key.id.startsWith('SH3NN-') && mek.key.id.length === 12) return
            const m = await smsg(client, mek, store)
            require("./message")(client, m, chatUpdate, store)
        } catch (err) {
            console.log(err)
        }
    })

    client.decodeJid = (jid) => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return decode.user && decode.server && decode.user + '@' + decode.server || jid;
        } else return jid;
    };

    client.ev.on('contacts.update', update => {
        for (let contact of update) {
            let id = client.decodeJid(contact.id);
            if (store && store.contacts) store.contacts[id] = {
                id,
                name: contact.notify
            };
        }
    });

    client.public = config().status.public
    
    client.ev.on('connection.update', (update) => {
        const { konek } = require('./image/lib/connection/connect')
        konek({ client, update, clientstart, DisconnectReason, Boom })
    })
    
    client.deleteMessage = async (chatId, key) => {
        try {
            await client.sendMessage(chatId, { delete: key });
        } catch (error) {
            console.error('Gagal menghapus pesan:', error);
        }
    };

    client.sendText = async (jid, text, quoted = '', options) => {
        client.sendMessage(jid, {
            text: text,
            ...options
        },{ quoted });
    }
    
    client.downloadMediaMessage = async (message) => {
        let mime = (message.msg || message).mimetype || ''
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
        const stream = await downloadContentFromMessage(message, messageType)
        let buffer = Buffer.from([])
        for await(const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk])
        }
        return buffer
    }

    client.sendImageAsSticker = async (jid, path, quoted, options = {}) => {
        let buff = Buffer.isBuffer(path) ? 
            path : /^data:.*\/.*?;base64,/i.test(path) ?
            Buffer.from(path.split`, `[1], 'base64') : /^https?:\/\//.test(path) ?
            await (await getBuffer(path)) : fs.existsSync(path) ? 
            fs.readFileSync(path) : Buffer.alloc(0);
        
        let buffer;
        if (options && (options.packname || options.author)) {
            buffer = await writeExifImg(buff, options);
        } else {
            buffer = await addExif(buff);
        }
        
        await client.sendMessage(jid, { 
            sticker: { url: buffer }, 
            ...options }, { quoted });
        return buffer;
    };
    
    client.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
        let quoted = message.msg ? message.msg : message;
        let mime = (message.msg || message).mimetype || "";
        let messageType = message.mtype ? message.mtype.replace(/Message/gi, "") : mime.split("/")[0];

        const stream = await downloadContentFromMessage(quoted, messageType);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        let type = await FileType.fromBuffer(buffer);
        let trueFileName = attachExtension ? filename + "." + type.ext : filename;
        await fs.writeFileSync(trueFileName, buffer);
        
        return trueFileName;
    };

    client.sendVideoAsSticker = async (jid, path, quoted, options = {}) => {
        let buff = Buffer.isBuffer(path) ? 
            path : /^data:.*\/.*?;base64,/i.test(path) ?
            Buffer.from(path.split`, `[1], 'base64') : /^https?:\/\//.test(path) ?
            await (await getBuffer(path)) : fs.existsSync(path) ? 
            fs.readFileSync(path) : Buffer.alloc(0);

        let buffer;
        if (options && (options.packname || options.author)) {
            buffer = await writeExifVid(buff, options);
        } else {
            buffer = await videoToWebp(buff);
        }

        await client.sendMessage(jid, {
            sticker: { url: buffer }, 
            ...options }, { quoted });
        return buffer;
    };

    client.albumMessage = async (jid, array, quoted) => {
        const album = generateWAMessageFromContent(jid, {
            messageContextInfo: {
                messageSecret: crypto.randomBytes(32),
            },
            albumMessage: {
                expectedImageCount: array.filter((a) => a.hasOwnProperty("image")).length,
                expectedVideoCount: array.filter((a) => a.hasOwnProperty("video")).length,
            },
        }, {
            userJid: client.user.jid,
            quoted,
            upload: client.waUploadToServer
        });

        await client.relayMessage(jid, album.message, {
            messageId: album.key.id,
        });

        for (let content of array) {
            const img = await generateWAMessage(jid, content, {
                upload: client.waUploadToServer,
            });

            img.message.messageContextInfo = {
                messageSecret: crypto.randomBytes(32),
                messageAssociation: {
                    associationType: 1,
                    parentMessageKey: album.key,
                },    
                participant: "0@s.whatsapp.net",
                remoteJid: "status@broadcast",
                forwardingScore: 99999,
                isForwarded: true,
                mentionedJid: [jid],
                starred: true,
                labels: ["Y", "Important"],
                isHighlighted: true,
                businessMessageForwardInfo: {
                    businessOwnerJid: jid,
                },
                dataSharingContext: {
                    showMmDisclosure: true,
                },
            };

            img.message.forwardedNewsletterMessageInfo = {
                newsletterJid: "0@newsletter",
                serverMessageId: 1,
                newsletterName: `WhatsApp`,
                contentType: 1,
                timestamp: new Date().toISOString(),
                senderName: "✧ Dittsans",
                content: "Text Message",
                priority: "high",
                status: "sent",
            };

            img.message.disappearingMode = {
                initiator: 3,
                trigger: 4,
                initiatorDeviceJid: jid,
                initiatedByExternalService: true,
                initiatedByUserDevice: true,
                initiatedBySystem: true,
                initiatedByServer: true,
                initiatedByAdmin: true,
                initiatedByUser: true,
                initiatedByApp: true,
                initiatedByBot: true,
                initiatedByMe: true,
            };

            await client.relayMessage(jid, img.message, {
                messageId: img.key.id,
                quoted: {
                    key: {
                        remoteJid: album.key.remoteJid,
                        id: album.key.id,
                        fromMe: true,
                        participant: client.user.jid,
                    },
                    message: album.message,
                },
            });
        }
        return album;
    };
    
    client.getFile = async (PATH, returnAsFilename) => {
        let res, filename
        const data = Buffer.isBuffer(PATH) ?
              PATH : /^data:.*\/.*?;base64,/i.test(PATH) ?
              Buffer.from(PATH.split`,` [1], 'base64') : /^https?:\/\//.test(PATH) ?
              await (res = await fetch(PATH)).buffer() : fs.existsSync(PATH) ?
              (filename = PATH, fs.readFileSync(PATH)) : typeof PATH === 'string' ? 
              PATH : Buffer.alloc(0)
        if (!Buffer.isBuffer(data)) throw new TypeError('Result is not a buffer')
        const type = await FileType.fromBuffer(data) || {
            mime: 'application/octet-stream',
            ext: '.bin'
        }
        if (data && returnAsFilename && !filename)(filename = path.join(__dirname, './tmp/' + new Date * 1 + '.' + type.ext), await fs.promises.writeFile(filename, data))
        return {
            res,
            filename,
            ...type,
            data,
            deleteFile() {
                return filename && fs.promises.unlink(filename)
            }
        }
    }
    
    client.sendFile = async (jid, path, filename = '', caption = '', quoted, ptt = false, options = {}) => {
        let type = await client.getFile(path, true)
        let { res, data: file, filename: pathFile } = type
        if (res && res.status !== 200 || file.length <= 65536) {
            try {
                throw { json: JSON.parse(file.toString()) } 
            } catch (e) { if (e.json) throw e.json }
        }
        let opt = { filename }
        if (quoted) opt.quoted = quoted
        if (!type) options.asDocument = true
        let mtype = '', mimetype = type.mime, convert
        if (/webp/.test(type.mime) || (/image/.test(type.mime) && options.asSticker)) mtype = 'sticker'
        else if (/image/.test(type.mime) || (/webp/.test(type.mime) && options.asImage)) mtype = 'image'
        else if (/video/.test(type.mime)) mtype = 'video'
        else if (/audio/.test(type.mime)) (
            convert = await (ptt ? toPTT : toAudio)(file, type.ext),
            file = convert.data,
            pathFile = convert.filename,
            mtype = 'audio',
            mimetype = 'audio/ogg; codecs=opus'
        )
        else mtype = 'document'
        if (options.asDocument) mtype = 'document'
        let message = {
            ...options,
            caption,
            ptt,
            [mtype]: { url: pathFile },
            mimetype
        }
        let m
        try {
            m = await client.sendMessage(jid, message, { ...opt, ...options })
        } catch (e) {
            console.error(e)
            m = null
        } finally {
            if (!m) m = await client.sendMessage(jid, { ...message, [mtype]: file }, { ...opt, ...options })
            return m
        }
    }
    
    client.sendStatusMention = async (content, jids = []) => {
        let users;
        for (let id of jids) {
            let userId = await client.groupMetadata(id);
            users = await userId.participants.map(u => client.decodeJid(u.id));
        };

        let message = await client.sendMessage(
            "status@broadcast", content, {
                backgroundColor: "#000000",
                font: Math.floor(Math.random() * 9),
                statusJidList: users,
                additionalNodes: [
                    {
                        tag: "meta",
                        attrs: {},
                        content: [
                            {
                                tag: "mentioned_users",
                                attrs: {},
                                content: jids.map((jid) => ({
                                    tag: "to",
                                    attrs: { jid },
                                    content: undefined,
                                })),
                            },
                        ],
                    },
                ],
            }
        );

        jids.forEach(id => {
            client.relayMessage(id, {
                groupStatusMentionMessage: {
                    message: {
                        protocolMessage: {
                            key: message.key,
                            type: 25,
                        },
                    },
                },
            }, { });
            delay(1000);
        });
        return message;
    };

    return client;
}

module.exports = { clientstart, loadBots, saveBots }

clientstart()

;(async () => {
    let savedBots = loadBots()
    if (savedBots.length > 0) {
        // Bersihkan bot yang belum selesai pairing (tidak ada creds.json)
        const validBots = []
        for (const bot of savedBots) {
            const credsPath = path.resolve('./' + bot.session + '/creds.json')
            if (!fs.existsSync(credsPath)) {
                console.log(`[MULTIBOT] ${bot.label} tidak punya creds.json, hapus otomatis...`)
                // Hapus folder session kalau ada
                const sessionPath = path.resolve('./' + bot.session)
                try {
                    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true })
                } catch {}
                continue // skip, tidak dimasukkan validBots
            }
            validBots.push(bot)
        }
        // Update bots.json hanya yang valid
        if (validBots.length !== savedBots.length) {
            saveBots(validBots)
            console.log(`[MULTIBOT] ${savedBots.length - validBots.length} bot tidak valid dihapus dari daftar`)
        }
        if (validBots.length > 0) {
            console.log(`[MULTIBOT] Memuat ${validBots.length} bot tambahan...`)
            for (const bot of validBots) {
                await sleep(3000)
                clientstart(bot.session, bot.label, bot.number, bot.chatJid || null)
            }
        }
    }
})()

const ignoredErrors = [
    'Socket connection timeout',
    'EKEYTYPE',
    'item-not-found',
    'rate-overlimit',
    'Connection Closed',
    'Timed Out',
    'Value not found'
]

let file = require.resolve(__filename)
require('fs').watchFile(file, () => {
  delete require.cache[file]
  require(file)
})

process.on('unhandledRejection', reason => {
    if (ignoredErrors.some(e => String(reason).includes(e))) return
    console.log('Unhandled Rejection:', reason)
})

const originalConsoleError = console.error
console.error = function (msg, ...args) {
    if (typeof msg === 'string' && ignoredErrors.some(e => msg.includes(e))) return
    originalConsoleError.apply(console, [msg, ...args])
}

const originalStderrWrite = process.stderr.write
process.stderr.write = function (msg, encoding, fd) {
    if (typeof msg === 'string' && ignoredErrors.some(e => msg.includes(e))) return
    originalStderrWrite.apply(process.stderr, arguments)
}
