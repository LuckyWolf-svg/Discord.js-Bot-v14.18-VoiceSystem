import { REST, Routes, EmbedBuilder, Client, Events, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { CHANNEL_IDS } from '../server_ids.js';
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

export function registerVoiceChatClear(client) {
    const messageQueue = new Set();

    client.on('messageCreate', message => {
        if (message.channel.id === CHANNEL_IDS.VOICE_CREATE && message.author.id != CHANNEL_IDS.BOT_ID) {
            messageQueue.add(message);
        }
    });

    setInterval(async () => {
        for (const message of messageQueue) {
            try {
                await message.delete();
            } 
            catch {}
        }
        messageQueue.clear();}, 3000);
}
